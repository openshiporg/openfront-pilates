// §10 tests 4, 5, 12, 13, 14, 15, 16, 17: credit ledger, packs, intro offers, membership tier rules.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { disconnect, skipDb, uid } from "./harness";
import { as, client, gql, studio, type Studio } from "./fixtures";
import { issueGrant } from "../../features/keystone/lib/credits";
import { assertPackEligible, fulfillPackCheckout, grantPack } from "../../features/keystone/mutations/packs";
import { ensureMonthlyCreditGrant } from "../../features/keystone/lib/membership-credits";
import { cancellationEndDate, frozenDaysInLastYear, freezeRule } from "../../features/keystone/mutations/stripeSubscription";

after(disconnect);

const DAY = 86_400_000;
const BOOK = `mutation($c: ID!) { bookClass(classInstanceId: $c) { bookingId status } }`;
const CANCEL = `mutation($b: ID!) { cancelClassBooking(bookingId: $b) { promoted message } }`;

/** A client with no membership. */
async function walkIn(s: Studio, options: { email?: string; phone?: string } = {}) {
  const key = uid("w");
  const user = await s.prisma.user.create({ data: { name: `Walk ${key}`, email: options.email ?? `${key}@client.test`, phone: options.phone ?? "", password: "x".repeat(60), organizationId: s.org.id } });
  const member = await s.prisma.member.create({ data: { organizationId: s.org.id, name: user.name, email: user.email, phone: options.phone ?? "", status: "active", userId: user.id } });
  return { user, member };
}

async function packGrant(s: Studio, memberId: string, quantity: number, expiresInDays: number, key = uid("g")) {
  return (await s.prisma.$transaction((tx: any) => issueGrant(tx, { organizationId: s.org.id, memberId, source: "pack", sourceKey: key, kind: "group", quantity, validFrom: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + expiresInDays * DAY) }))).grant;
}

async function extraClass(s: Studio, hoursAhead: number) {
  return s.prisma.classInstance.create({ data: { organizationId: s.org.id, classScheduleId: s.schedule.id, date: new Date(Date.now() + hoursAhead * 3_600_000), resourceId: s.room.id, locationId: s.location.id } });
}

test("4. the soonest-expiring grant is spent first; an expired grant never; balance never negative under 20 parallel bookings", { skip: skipDb }, async () => {
  const s = await studio({ spots: 30 });
  const c = await walkIn(s);
  const later = await packGrant(s, c.member.id, 5, 60);
  const sooner = await packGrant(s, c.member.id, 2, 10);
  const expired = await s.prisma.creditGrant.create({ data: { organizationId: s.org.id, memberId: c.member.id, source: "pack", sourceKey: uid("x"), kind: "group", quantity: 5, remaining: 5, validFrom: new Date(Date.now() - 90 * DAY), expiresAt: new Date(Date.now() - DAY), status: "active" } });
  const ctx = await as(s, c.user);
  const first = await gql(ctx, BOOK, { c: s.instance.id });
  const debit = await s.prisma.creditEntry.findFirst({ where: { eventKey: `${first.bookClass.bookingId}:debit` } });
  assert.equal(debit.grantId, sooner.id, "soonest expiry first");

  // 20 classes at once with 6 credits left (1 sooner + 5 later): exactly 6 confirm, nothing goes negative.
  const classes = await Promise.all(Array.from({ length: 20 }, (_, i) => extraClass(s, 50 + i)));
  const results = await Promise.allSettled(classes.map((k: any) => gql(ctx, BOOK, { c: k.id })));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 6);
  const grants = await s.prisma.creditGrant.findMany({ where: { memberId: c.member.id } });
  assert.ok(grants.every((g: any) => g.remaining >= 0));
  assert.equal(grants.find((g: any) => g.id === expired.id).remaining, 5, "expired grant never spent");
  assert.equal(grants.find((g: any) => g.id === later.id).remaining, 0);
  // The database itself refuses a negative balance.
  await assert.rejects(s.prisma.$executeRawUnsafe(`UPDATE "CreditGrant" SET "remaining" = -2 WHERE "id" = '${later.id}'`), /CreditGrant_balance_range|Failing row contains/);
});

test("5. a cancel before the window restores the credit to the same grant with the same expiry", { skip: skipDb }, async () => {
  const s = await studio({ spots: 3, startsInHours: 48 });
  const c = await walkIn(s);
  const grant = await packGrant(s, c.member.id, 3, 30);
  const ctx = await as(s, c.user);
  const booked = await gql(ctx, BOOK, { c: s.instance.id });
  assert.equal((await s.prisma.creditGrant.findUnique({ where: { id: grant.id } })).remaining, 2);
  await gql(ctx, CANCEL, { b: booked.bookClass.bookingId });
  const after = await s.prisma.creditGrant.findUnique({ where: { id: grant.id } });
  assert.equal(after.remaining, 3);
  assert.equal(after.expiresAt.getTime(), grant.expiresAt.getTime());
  const restore = await s.prisma.creditEntry.findFirst({ where: { eventKey: `${booked.bookClass.bookingId}:restore` } });
  assert.equal(restore.grantId, grant.id);
  // The drop-in refund on cancel is exercised against Stripe in tests/db/stripe.db.test.ts.
});

test("12. intro offer: a second purchase is refused, matched on account, email case and phone format; firstTimersOnly refuses a past booker", { skip: skipDb }, async () => {
  const s = await studio();
  const intro = await s.prisma.classPack.create({ data: { organizationId: s.org.id, name: "Intro 3 for $59", kind: "group", quantity: 3, price: 5900, validDays: 14, introOnly: true, firstTimersOnly: true, isActive: true } });
  const a = await walkIn(s, { email: "Mara.Lee@Example.com", phone: "+1 (512) 555-0134" });
  await s.prisma.$transaction(async (tx: any) => { await assertPackEligible(tx, s.org.id, a.member, intro); await grantPack(tx, { organizationId: s.org.id, memberId: a.member.id, pack: intro, sourceKey: uid("p") }); });
  await assert.rejects(assertPackEligible(s.prisma, s.org.id, a.member, intro), /already been used/);
  const sameEmail = await walkIn(s, { email: "mara.lee@example.COM " });
  await assert.rejects(assertPackEligible(s.prisma, s.org.id, sameEmail.member, intro), /already been used/);
  const samePhone = await walkIn(s, { phone: "512.555.0134" });
  await assert.rejects(assertPackEligible(s.prisma, s.org.id, samePhone.member, intro), /already been used/);
  const booker = await client(s);
  await gql(await as(s, booker.user), BOOK, { c: s.instance.id });
  const firstOnly = await s.prisma.classPack.create({ data: { organizationId: s.org.id, name: "First class free", kind: "group", quantity: 1, price: 0, validDays: 14, firstTimersOnly: true, isActive: true } });
  await assert.rejects(assertPackEligible(s.prisma, s.org.id, { ...booker.member, email: booker.user.email }, firstOnly), /first-time clients only/);
  const fresh = await walkIn(s);
  await assertPackEligible(s.prisma, s.org.id, fresh.member, intro);
});

async function setTerms(s: Studio, membershipId: string, terms: Record<string, unknown>) {
  const row = await s.prisma.membership.findUnique({ where: { id: membershipId } });
  await s.prisma.membership.update({ where: { id: membershipId }, data: { agreementSnapshot: { ...(row.agreementSnapshot as any), ...terms } } });
}

test("13. caps: a second booking on one day is refused at maxBookingsPerDay 1; the monthly cap counts attended and upcoming", { skip: skipDb }, async () => {
  const s = await studio({ spots: 5, startsInHours: 48 });
  const c = await client(s, { credits: -1 });
  await setTerms(s, c.membership.id, { maxBookingsPerDay: 1 });
  const ctx = await as(s, c.user);
  await gql(ctx, BOOK, { c: s.instance.id });
  const sameDay = await extraClass(s, 49);
  await assert.rejects(gql(ctx, BOOK, { c: sameDay.id }), /1 class a day/);

  const m = await studio({ spots: 5, startsInHours: 24 * 3 });
  const member = await client(m, { credits: -1 });
  await setTerms(m, member.membership.id, { maxBookingsPerMonth: 2 });
  const mctx = await as(m, member.user);
  // One past attended class this month counts too.
  const past = await m.prisma.classInstance.create({ data: { organizationId: m.org.id, classScheduleId: m.schedule.id, date: new Date(Date.now() - 2 * 3_600_000), resourceId: m.room.id, locationId: m.location.id } });
  await m.prisma.classBooking.create({ data: { organizationId: m.org.id, classInstanceId: past.id, memberId: member.member.id, status: "attended", bookedAt: new Date(), memberName: "x" } });
  const sameMonth = (hours: number) => {
    const at = new Date(Date.now() + hours * 3_600_000);
    return at.getUTCMonth() === new Date(Date.now() - 2 * 3_600_000).getUTCMonth();
  };
  if (sameMonth(72) && sameMonth(96)) {
    await gql(mctx, BOOK, { c: m.instance.id });
    const another = await extraClass(m, 96);
    await assert.rejects(gql(mctx, BOOK, { c: another.id }), /2 classes a month/);
  } else {
    // Month boundary inside the window: the cap still counts in the class's own month.
    await gql(mctx, BOOK, { c: m.instance.id });
  }
});

test("14. booking window: a member with advanceBookingDays 21 books day 20; a pack client cannot book beyond the horizon", { skip: skipDb }, async () => {
  const s = await studio({ spots: 5, startsInHours: 24 * 20 });
  const member = await client(s, { credits: -1 });
  const start = new Date(Date.now() - DAY); const end = new Date(Date.now() + 40 * DAY);
  await s.prisma.membership.update({ where: { id: member.membership.id }, data: { creditPeriodStart: start, creditPeriodEnd: end, nextBillingDate: end } });
  await setTerms(s, member.membership.id, { advanceBookingDays: 21 });
  assert.equal((await gql(await as(s, member.user), BOOK, { c: s.instance.id })).bookClass.status, "confirmed");
  const pack = await walkIn(s);
  await packGrant(s, pack.member.id, 5, 60);
  await assert.rejects(gql(await as(s, pack.user), BOOK, { c: s.instance.id }), /14 days ahead/);
});

test("15. requiresIntro: refused until an intro class is attended", { skip: skipDb }, async () => {
  const s = await studio({ spots: 5 });
  await s.prisma.classType.update({ where: { id: s.classType.id }, data: { requiresIntro: true } });
  const c = await client(s);
  const ctx = await as(s, c.user);
  await assert.rejects(gql(ctx, BOOK, { c: s.instance.id }), /intro class first/);
  const introType = await s.prisma.classType.create({ data: { organizationId: s.org.id, name: "Reformer Foundations", isIntroClass: true } });
  const introSchedule = await s.prisma.classSchedule.create({ data: { organizationId: s.org.id, name: "Foundations", dayOfWeek: "tuesday", startTime: "08:00", endTime: "08:50", maxCapacity: 10, isActive: true, classTypeId: introType.id, resourceId: s.room.id, locationId: s.location.id } });
  const introClass = await s.prisma.classInstance.create({ data: { organizationId: s.org.id, classScheduleId: introSchedule.id, date: new Date(Date.now() - 3 * DAY), resourceId: s.room.id } });
  await s.prisma.classBooking.create({ data: { organizationId: s.org.id, classInstanceId: introClass.id, memberId: c.member.id, status: "attended", bookedAt: new Date(), memberName: "x" } });
  assert.equal((await gql(ctx, BOOK, { c: s.instance.id })).bookClass.status, "confirmed");
});

test("16. membership: one period grant per period however often it is asked for; past_due blocks new bookings; freeze rule; cancel end date by notice", { skip: skipDb }, async () => {
  const s = await studio({ spots: 5 });
  const c = await client(s, { credits: 8 });
  const membership = await s.prisma.membership.findUnique({ where: { id: c.membership.id } });
  // The renewal webhook and the booking path both call this; replays and races produce one grant.
  await Promise.all(Array.from({ length: 5 }, () => s.prisma.$transaction((tx: any) => ensureMonthlyCreditGrant(tx, membership, new Date())).catch(() => null)));
  await s.prisma.$transaction((tx: any) => ensureMonthlyCreditGrant(tx, membership, new Date()));
  assert.equal(await s.prisma.creditGrant.count({ where: { membershipId: membership.id, source: "membership_period" } }), 1);

  // Weekly plans grant per 7-day period.
  const weekly = await client(s, { credits: 2 });
  await setTerms(s, weekly.membership.id, { billingPeriod: "week" });
  const wm = await s.prisma.membership.findUnique({ where: { id: weekly.membership.id } });
  const g1 = await s.prisma.$transaction((tx: any) => ensureMonthlyCreditGrant(tx, wm, new Date()));
  const g2 = await s.prisma.$transaction((tx: any) => ensureMonthlyCreditGrant(tx, wm, new Date(Date.now() + 8 * DAY)));
  assert.notEqual(g1.id, g2.id);
  assert.equal(Math.round((g1.periodEnd.getTime() - g1.periodStart.getTime()) / DAY), 7);

  await s.prisma.membership.update({ where: { id: c.membership.id }, data: { status: "past-due" } });
  await assert.rejects(gql(await as(s, c.user), BOOK, { c: s.instance.id }), /payment failed/);

  // Freeze rule (7 to 30 days, 30 a year) and the cancel end date (30 days notice, rounded to the paid period end).
  assert.deepEqual(freezeRule({ agreementSnapshot: { freezeMinDays: 7, freezeMaxDays: 30, freezeDaysPerYear: 30 } }), { minDays: 7, maxDays: 30, daysPerYear: 30 });
  const now = new Date("2026-11-22T12:00:00Z");
  assert.equal(frozenDaysInLastYear({ agreementHistory: [{ kind: "freeze", start: "2026-06-01T00:00:00Z", end: "2026-06-21T00:00:00Z" }] }, now), 20);
  const paidEnd = new Date("2026-12-10T00:00:00Z");
  const end = cancellationEndDate({ agreementSnapshot: { cancelNoticeDays: 30 }, nextBillingDate: paidEnd, startDate: "2026-01-01T00:00:00Z" }, now);
  assert.equal(end.toISOString().slice(0, 10), "2026-12-22", "30 days notice from today, past the paid period end");
  const insideTerm = cancellationEndDate({ agreementSnapshot: { cancelNoticeDays: 30, contractLength: 12 }, nextBillingDate: paidEnd, startDate: "2026-06-01T00:00:00Z" }, now);
  assert.equal(insideTerm.toISOString().slice(0, 10), "2027-06-01", "the minimum term holds");
});

test("17. pack checkout: the webhook and the return page both arriving produce one grant", { skip: skipDb }, async () => {
  const s = await studio();
  const c = await walkIn(s);
  const pack = await s.prisma.classPack.create({ data: { organizationId: s.org.id, name: "10 classes", kind: "group", quantity: 10, price: 36000, validDays: 90, isActive: true } });
  const provider = await s.prisma.paymentProvider.create({ data: { organizationId: s.org.id, name: "Stripe", code: "pp_stripe", adapterKey: "stripe", isInstalled: true } });
  const sessionId = `cs_test_${uid("ps")}`;
  const local = await s.prisma.paymentSession.create({ data: { organizationId: s.org.id, userId: c.user.id, paymentProviderId: provider.id, status: "requires_action", billingCycle: "pack", amount: 36000, currencyCode: "USD", idempotencyKey: uid("k"), providerSessionId: sessionId, data: { kind: "pack", classPackId: pack.id } } });
  // The checkout session exactly as Stripe reports it once paid.
  const paid = { id: sessionId, status: "complete", payment_status: "paid", amount_total: 36000, currency: "usd", payment_intent: `pi_${uid("pi")}`, metadata: { source: "openfront-pilates-pack", organizationId: s.org.id, paymentSessionId: local.id, classPackId: pack.id, userId: c.user.id } };
  const results = await Promise.all([
    fulfillPackCheckout(s.ctx as any, s.org.id, sessionId, { session: paid, providerId: provider.id }),
    fulfillPackCheckout(s.ctx as any, s.org.id, sessionId, { session: paid, providerId: provider.id }),
  ]);
  assert.equal(results[0].grantId, results[1].grantId);
  assert.equal(await s.prisma.creditGrant.count({ where: { memberId: c.member.id } }), 1);
  assert.equal(await s.prisma.payment.count({ where: { paymentSessionId: local.id } }), 1);
  const grant = await s.prisma.creditGrant.findFirst({ where: { memberId: c.member.id } });
  assert.equal(grant.remaining, 10);
  assert.equal(Math.round((grant.expiresAt.getTime() - Date.now()) / DAY), 90);
});
