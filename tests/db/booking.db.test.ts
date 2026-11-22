// §10 tests 1, 2, 3, 8, 9: machine booking, capacity, waitlist and the promotion race.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { disconnect, skipDb } from "./harness";
import { as, client, gql, studio } from "./fixtures";

after(disconnect);

const BOOK = `mutation($c: ID!, $s: ID) { bookClass(classInstanceId: $c, spotId: $s) { bookingId status waitlistPosition spot { id label } } }`;
const CANCEL = `mutation($b: ID!) { cancelClassBooking(bookingId: $b) { promoted message } }`;
const book = async (s: any, user: any, spotId: string | null = null) => gql(await as(s, user), BOOK, { c: s.instance.id, s: spotId }).then((d) => d.bookClass);
const settle = (promises: Promise<any>[]) => Promise.allSettled(promises);

test("1. two clients racing for the last machine: one confirmed, never two on one spot", { skip: skipDb }, async () => {
  const s = await studio({ spots: 1 });
  const a = await client(s), b = await client(s);
  const results = await settle([book(s, a.user), book(s, b.user)]);
  const statuses = results.map((r) => (r.status === "fulfilled" ? r.value.status : "refused")).sort();
  assert.deepEqual(statuses, ["confirmed", "waitlisted"]);
  const holding = await s.prisma.classBooking.count({ where: { classInstanceId: s.instance.id, spotId: s.spots[0].id, status: "confirmed" } });
  assert.equal(holding, 1);
});

test("2. two clients pick the same machine with others free: one gets it, the other a clear refusal", { skip: skipDb }, async () => {
  const s = await studio({ spots: 3 });
  const a = await client(s), b = await client(s);
  const results = await settle([book(s, a.user, s.spots[1].id), book(s, b.user, s.spots[1].id)]);
  const won = results.filter((r) => r.status === "fulfilled");
  const lost = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  assert.equal(won.length, 1);
  assert.equal(won[0].status === "fulfilled" && won[0].value.spot.id, s.spots[1].id);
  assert.match(String(lost[0].reason?.message), /Reformer 2 was just taken\. Choose another machine/);
  // The refused client keeps the choice of another machine.
  const loser = (results[0].status === "rejected" ? a : b);
  const retry = await book(s, loser.user, s.spots[2].id);
  assert.equal(retry.status, "confirmed");
  assert.equal(retry.spot.id, s.spots[2].id);
});

test("3. capacity is the bookable in-service machines; an out-of-service machine cannot be booked", { skip: skipDb }, async () => {
  const s = await studio({ spots: 3, declaredCapacity: 20 });
  await s.prisma.spot.update({ where: { id: s.spots[0].id }, data: { outOfServiceFrom: new Date(Date.now() - 1000) } });
  await s.prisma.spot.update({ where: { id: s.spots[1].id }, data: { isBookable: false } });
  const a = await client(s), b = await client(s);
  await assert.rejects(book(s, a.user, s.spots[0].id), /not available for this class/);
  const first = await book(s, a.user);
  assert.equal(first.status, "confirmed");
  assert.equal(first.spot.id, s.spots[2].id);
  const second = await book(s, b.user);
  assert.equal(second.status, "waitlisted", "only one machine is in service, so the second client waits");
  const availability = await gql(await as(s, b.user), `query($c: ID!) { classAvailability(classInstanceId: $c) }`, { c: s.instance.id });
  assert.equal(availability.classAvailability.capacity, 1);
  assert.deepEqual(availability.classAvailability.spots.map((spot: any) => spot.state), ["out_of_service", "out_of_service", "taken"]);
});

test("8. a cancel before the cutoff promotes position 1 into the freed machine; no credit is skipped; after the cutoff nobody is promoted", { skip: skipDb }, async () => {
  const s = await studio({ spots: 1, startsInHours: 48 });
  const holder = await client(s), broke = await client(s, { credits: 1 }), next = await client(s);
  assert.equal((await book(s, holder.user)).status, "confirmed");
  // "broke" spends their only credit elsewhere: book and keep a second class.
  const other = await s.prisma.classInstance.create({ data: { organizationId: s.org.id, classScheduleId: s.schedule.id, date: new Date(Date.now() + 72 * 3_600_000), resourceId: s.room.id, locationId: s.location.id } });
  await gql(await as(s, broke.user), BOOK, { c: other.id, s: null });
  assert.equal((await book(s, broke.user)).waitlistPosition, 1);
  assert.equal((await book(s, next.user)).waitlistPosition, 2);
  const freed = await s.prisma.classBooking.findFirst({ where: { classInstanceId: s.instance.id, status: "confirmed" } });
  await gql(await as(s, holder.user), CANCEL, { b: freed.id });
  const promoted = await s.prisma.classBooking.findFirst({ where: { classInstanceId: s.instance.id, status: "confirmed" } });
  assert.equal(promoted.memberId, next.member.id, "the client with no usable credit is skipped");
  assert.equal(promoted.spotId, s.spots[0].id, "promoted into the freed machine");
  const debit = await s.prisma.creditEntry.findFirst({ where: { eventKey: `${promoted.id}:debit` } });
  assert.equal(debit?.delta, -1, "promotion spends a credit");
  const skipped = await s.prisma.classBooking.findFirst({ where: { classInstanceId: s.instance.id, memberId: broke.member.id } });
  assert.equal(skipped.status, "waitlisted");
  assert.ok((skipped.history as any[]).some((entry) => entry.action === "skipped"));

  // Inside the cutoff (class in 1 hour, cutoff 120 minutes): the freed machine is open to book.
  const late = await studio({ spots: 1, startsInHours: 1 });
  const h = await client(late), w = await client(late);
  await book(late, h.user); await book(late, w.user);
  const held = await late.prisma.classBooking.findFirst({ where: { classInstanceId: late.instance.id, status: "confirmed" } });
  await gql(await as(late, h.user), CANCEL, { b: held.id });
  const waiting = await late.prisma.classBooking.findFirst({ where: { classInstanceId: late.instance.id, memberId: w.member.id } });
  assert.equal(waiting.status, "waitlisted", "nobody is promoted inside the cutoff");
  const walkUp = await client(late);
  assert.equal((await book(late, walkUp.user)).status, "confirmed", "the machine is open to book");
});

test("9. promotion and a direct booking racing for the freed machine: exactly one wins it", { skip: skipDb }, async () => {
  for (let round = 0; round < 3; round++) {
    const s = await studio({ spots: 1, startsInHours: 48 });
    const holder = await client(s), waiting = await client(s), direct = await client(s);
    await book(s, holder.user); await book(s, waiting.user);
    const held = await s.prisma.classBooking.findFirst({ where: { classInstanceId: s.instance.id, status: "confirmed" } });
    await settle([gql(await as(s, holder.user), CANCEL, { b: held.id }), book(s, direct.user, s.spots[0].id)]);
    const confirmed = await s.prisma.classBooking.findMany({ where: { classInstanceId: s.instance.id, status: "confirmed" } });
    assert.equal(confirmed.length, 1);
    assert.equal(confirmed[0].spotId, s.spots[0].id);
  }
});
