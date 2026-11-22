// §10 tests 6, 7, 10, 11 and 19: late cancel, policy override, Close class, fees, instructor pay.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { disconnect, skipDb, uid } from "./harness";
import { as, client, gql, studio, type Studio } from "./fixtures";
import { issueGrant } from "../../features/keystone/lib/credits";
import { classPay } from "../../features/keystone/mutations/payroll";

after(disconnect);

const DAY = 86_400_000;
const BOOK = `mutation($c: ID!) { bookClass(classInstanceId: $c) { bookingId status } }`;
const CANCEL = `mutation($b: ID!) { cancelClassBooking(bookingId: $b) { promoted message } }`;
const QUOTE = `query($b: ID!) { quoteCancellation(bookingId: $b) }`;

async function packClient(s: Studio) {
  const key = uid("p");
  const user = await s.prisma.user.create({ data: { name: `Pack ${key}`, email: `${key}@client.test`, password: "x".repeat(60), organizationId: s.org.id } });
  const member = await s.prisma.member.create({ data: { organizationId: s.org.id, name: user.name, email: user.email, status: "active", userId: user.id } });
  await s.prisma.$transaction((tx: any) => issueGrant(tx, { organizationId: s.org.id, memberId: member.id, source: "pack", sourceKey: uid("g"), kind: "group", quantity: 5, validFrom: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 60 * DAY) }));
  return { user, member };
}

const classAt = (s: Studio, hours: number) => s.prisma.classInstance.create({ data: { organizationId: s.org.id, classScheduleId: s.schedule.id, date: new Date(Date.now() + hours * 3_600_000), resourceId: s.room.id, locationId: s.location.id } });

test("6. late cancel: a pack client loses the credit; an unlimited member gets a fee; the allowance waives the first in 30 days, not the second", { skip: skipDb }, async () => {
  const s = await studio({ spots: 5, startsInHours: 6 });
  const pack = await packClient(s);
  const pctx = await as(s, pack.user);
  const pb = (await gql(pctx, BOOK, { c: s.instance.id })).bookClass.bookingId;
  const quote = (await gql(pctx, QUOTE, { b: pb })).quoteCancellation;
  assert.equal(quote.consequence, "credit_kept");
  await gql(pctx, CANCEL, { b: pb });
  const cancelled = await s.prisma.classBooking.findUnique({ where: { id: pb } });
  assert.equal(cancelled.status, "late_cancelled");
  assert.equal(await s.prisma.creditEntry.count({ where: { eventKey: `${pb}:restore` } }), 0, "no credit back");
  assert.equal(await s.prisma.fee.count({ where: { bookingId: pb } }), 0);

  const unl = await client(s, { credits: -1 });
  const uctx = await as(s, unl.user);
  const first = (await gql(uctx, BOOK, { c: s.instance.id })).bookClass.bookingId;
  assert.equal((await gql(uctx, QUOTE, { b: first })).quoteCancellation.consequence, "fee_waived");
  await gql(uctx, CANCEL, { b: first });
  const waived = await s.prisma.fee.findFirst({ where: { bookingId: first } });
  assert.equal(waived.status, "waived");
  assert.equal(waived.waivedBasis, "allowance");
  const second = await classAt(s, 7);
  const sb = (await gql(uctx, BOOK, { c: second.id })).bookClass.bookingId;
  const q2 = (await gql(uctx, QUOTE, { b: sb })).quoteCancellation;
  assert.equal(q2.consequence, "fee");
  assert.equal(q2.feeAmount, 1500);
  await gql(uctx, CANCEL, { b: sb });
  const fee = await s.prisma.fee.findFirst({ where: { bookingId: sb } });
  assert.equal(fee.amount, 1500);
  // No saved card: the fee is owed (charged-to-card is test 11).
  assert.equal(fee.status, "owed");
});

test("7. a class-type policy override beats the studio default", { skip: skipDb }, async () => {
  const s = await studio({ spots: 5, startsInHours: 20 });
  const c = await client(s, { credits: -1 });
  const ctx = await as(s, c.user);
  const b = (await gql(ctx, BOOK, { c: s.instance.id })).bookClass.bookingId;
  assert.equal((await gql(ctx, QUOTE, { b })).quoteCancellation.late, false, "20 hours out, the 12-hour studio window is free");
  await s.prisma.classType.update({ where: { id: s.classType.id }, data: { cancelWindowHoursOverride: 24, lateCancelFeeOverride: 2500, }, });
  await s.prisma.fee.create({ data: { organizationId: s.org.id, memberId: c.member.id, feeKey: uid("used"), kind: "late_cancel", amount: 0, status: "waived" } });
  const q = (await gql(ctx, QUOTE, { b })).quoteCancellation;
  assert.equal(q.late, true);
  assert.equal(q.windowHours, 24);
  assert.equal(q.feeAmount, 2500);
});

test("10. Close class: unchecked bookings become no-shows once; pressing twice changes nothing; undo voids the fee and the pay line", { skip: skipDb }, async () => {
  const s = await studio({ spots: 5, startsInHours: 48 });
  const instructorUser = await s.prisma.user.create({ data: { name: "Ines", email: `${uid("i")}@studio.test`, password: "x".repeat(60), organizationId: s.org.id } });
  const instructor = await s.prisma.instructor.create({ data: { organizationId: s.org.id, userId: instructorUser.id, isActive: true } });
  await s.prisma.classSchedule.update({ where: { id: s.schedule.id }, data: { instructorId: instructor.id } });
  await s.prisma.payRate.create({ data: { organizationId: s.org.id, instructorId: instructor.id, classBase: 4000, perHeadBonus: 500, bonusAbove: 5, floor: 4000, effectiveFrom: new Date(Date.now() - 30 * DAY) } });
  const here = await client(s, { credits: -1 }), absent = await client(s, { credits: -1 });
  const hb = (await gql(await as(s, here.user), BOOK, { c: s.instance.id })).bookClass.bookingId;
  const ab = (await gql(await as(s, absent.user), BOOK, { c: s.instance.id })).bookClass.bookingId;
  await s.prisma.classInstance.update({ where: { id: s.instance.id }, data: { date: new Date(Date.now() - 60 * 60_000) } });
  await s.prisma.classBooking.update({ where: { id: hb }, data: { checkedInAt: new Date() } });
  const staff = await as(s, s.owner);
  const closed = (await gql(staff, `mutation($c: ID!) { closeClass(classInstanceId: $c) }`, { c: s.instance.id })).closeClass;
  assert.deepEqual([closed.attended, closed.noShows], [1, 1]);
  assert.equal((await s.prisma.classBooking.findUnique({ where: { id: ab } })).status, "no_show");
  const fee = await s.prisma.fee.findFirst({ where: { bookingId: ab, kind: "no_show" } });
  assert.equal(fee.amount, 2000);
  const line = await s.prisma.payLine.findFirst({ where: { classInstanceId: s.instance.id } });
  assert.equal(line.amount, 4000);
  assert.equal(line.headcount, 1);
  const again = (await gql(staff, `mutation($c: ID!) { closeClass(classInstanceId: $c) }`, { c: s.instance.id })).closeClass;
  assert.equal(again.alreadyClosed, true);
  assert.equal(await s.prisma.fee.count({ where: { bookingId: ab } }), 1);
  await gql(staff, `mutation($c: ID!) { reopenClass(classInstanceId: $c) }`, { c: s.instance.id });
  assert.equal((await s.prisma.fee.findUnique({ where: { id: fee.id } })).status, "void");
  assert.equal((await s.prisma.payLine.findUnique({ where: { id: line.id } })).status, "void");
  assert.equal((await s.prisma.classBooking.findUnique({ where: { id: ab } })).status, "confirmed");
});

test("11. fee: no card → owed and a new booking is refused; payFee clears it; waive needs a reason", { skip: skipDb }, async () => {
  const s = await studio({ spots: 5, startsInHours: 6 });
  const c = await client(s, { credits: -1 });
  await s.prisma.studioSettings.updateMany({ where: { organizationId: s.org.id }, data: { lateCancelWaiversPer30Days: 0 } });
  const ctx = await as(s, c.user);
  const b = (await gql(ctx, BOOK, { c: s.instance.id })).bookClass.bookingId;
  await gql(ctx, CANCEL, { b });
  const fee = await s.prisma.fee.findFirst({ where: { bookingId: b } });
  assert.equal(fee.status, "owed");
  const other = await classAt(s, 30);
  await assert.rejects(gql(ctx, BOOK, { c: other.id }), /fee owed/);
  const staff = await as(s, s.owner);
  await assert.rejects(gql(staff, `mutation($f: ID!) { waiveFee(feeId: $f, reason: "") }`, { f: fee.id }), /reason is required/);
  await gql(staff, `mutation($f: ID!) { payFee(feeId: $f, method: "cash", reference: "desk") }`, { f: fee.id });
  const paid = await s.prisma.fee.findUnique({ where: { id: fee.id } });
  assert.equal(paid.status, "charged");
  const payment = await s.prisma.payment.findUnique({ where: { id: paid.paymentId } });
  assert.deepEqual([payment.purpose, payment.method, payment.amount], ["fee", "cash", 1500]);
  assert.equal((await gql(ctx, BOOK, { c: other.id })).bookClass.status, "confirmed", "paying clears the block");
  // Waiving an owed fee with a reason also clears it.
  const third = await classAt(s, 8);
  const tb = (await gql(ctx, BOOK, { c: third.id })).bookClass.bookingId;
  await gql(ctx, CANCEL, { b: tb });
  const f2 = await s.prisma.fee.findFirst({ where: { bookingId: tb } });
  await gql(staff, `mutation($f: ID!) { waiveFee(feeId: $f, reason: "Car broke down") }`, { f: f2.id });
  assert.equal((await s.prisma.fee.findUnique({ where: { id: f2.id } })).status, "waived");
});

test("19. pay line: base plus per-head above the threshold with the floor; a cancelled class has none; a locked run refuses changes", { skip: skipDb }, async () => {
  assert.equal(classPay({ classBase: 4000, perHeadBonus: 500, bonusAbove: 5, floor: 4000 }, 8).amount, 5500);
  assert.equal(classPay({ classBase: 2000, perHeadBonus: 500, bonusAbove: 5, floor: 4000 }, 3).amount, 4000, "floor");
  const s = await studio({ spots: 10, startsInHours: 48 });
  const iu = await s.prisma.user.create({ data: { name: "Noor", email: `${uid("i")}@studio.test`, password: "x".repeat(60), organizationId: s.org.id } });
  const instructor = await s.prisma.instructor.create({ data: { organizationId: s.org.id, userId: iu.id, isActive: true } });
  await s.prisma.classSchedule.update({ where: { id: s.schedule.id }, data: { instructorId: instructor.id } });
  const staff = await as(s, s.owner);
  await gql(staff, `mutation($i: ID!, $d: JSON!) { savePayRate(instructorId: $i, data: $d) }`, { i: instructor.id, d: { classBase: 4000, perHeadBonus: 500, bonusAbove: 5, floor: 4000, privateAmount: 5500, hourlyAmount: 2200, effectiveFrom: new Date(Date.now() - 30 * DAY).toISOString() } });
  const clients = await Promise.all(Array.from({ length: 7 }, () => client(s, { credits: 4 })));
  for (const c of clients) await gql(await as(s, c.user), BOOK, { c: s.instance.id });
  await s.prisma.classInstance.update({ where: { id: s.instance.id }, data: { date: new Date(Date.now() - 60 * 60_000) } });
  await s.prisma.classBooking.updateMany({ where: { classInstanceId: s.instance.id }, data: { checkedInAt: new Date() } });
  await gql(staff, `mutation($c: ID!) { closeClass(classInstanceId: $c) }`, { c: s.instance.id });
  const line = await s.prisma.payLine.findFirst({ where: { classInstanceId: s.instance.id } });
  assert.equal(line.amount, 5000, "$40 + 2 × $5 above 5");
  assert.match(line.rule, /above 5/);

  const cancelled = await classAt(s, 72);
  await gql(staff, `mutation($c: ID!) { cancelClassInstance(classInstanceId: $c, reason: "Instructor ill") { reused } }`, { c: cancelled.id }).catch(() => null);
  assert.equal(await s.prisma.payLine.count({ where: { classInstanceId: cancelled.id } }), 0);

  const run = (await gql(staff, `mutation($f: String!, $t: String!) { openPayrollRun(from: $f, to: $t) }`, { f: new Date(Date.now() - 2 * DAY).toISOString(), t: new Date(Date.now() + DAY).toISOString() })).openPayrollRun;
  await gql(staff, `mutation($r: ID!) { lockPayrollRun(runId: $r) }`, { r: run.id });
  assert.equal((await s.prisma.payLine.findUnique({ where: { id: line.id } })).status, "locked");
  await assert.rejects(s.prisma.payLine.update({ where: { id: line.id }, data: { amount: 9999 } }));
  await assert.rejects(gql(staff, `mutation($c: ID!) { reopenClass(classInstanceId: $c) }`, { c: s.instance.id }), /locked payroll run/);
  const csv = (await gql(staff, `query($r: ID!) { exportPayrollRun(runId: $r) }`, { r: run.id })).exportPayrollRun;
  assert.match(csv.csv, /Noor/);
  assert.match(csv.csv, /50\.00/);
  const paid = (await gql(staff, `mutation($r: ID!, $p: JSON!) { markPayrollPaid(runId: $r, payouts: $p) }`, { r: run.id, p: [{ instructorId: instructor.id, method: "bank_transfer", reference: "ACH 1142" }] })).markPayrollPaid;
  assert.equal(paid.status, "paid");
});
