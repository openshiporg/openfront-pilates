// Stripe-backed parts of §10 tests 5 and 11, against Stripe's test mode (keys sk_test_…).
// Skipped with a message when STRIPE_SECRET_KEY is not a test key.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { disconnect, skipDb, uid } from "./harness";
import { as, client, gql, studio } from "./fixtures";

after(disconnect);

const key = process.env.STRIPE_SECRET_KEY || "";
const skip = skipDb || (/^sk_test_[A-Za-z0-9]{20,}$/.test(key) ? false : "STRIPE_SECRET_KEY is not a Stripe test key; the card-charge tests are skipped");

test("11. a late-cancel fee charges the saved card off-session → charged; a declining card → owed", { skip }, async () => {
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(key);
  const s = await studio({ spots: 5, startsInHours: 6 });
  await s.prisma.studioSettings.updateMany({ where: { organizationId: s.org.id }, data: { lateCancelWaiversPer30Days: 0 } });
  await s.prisma.paymentProvider.create({ data: { organizationId: s.org.id, name: "Stripe", code: "pp_stripe", adapterKey: "stripe", isInstalled: true } });

  const run = async (paymentMethod: string) => {
    const c = await client(s, { credits: -1 });
    const customer = await stripe.customers.create({ email: c.user.email, metadata: { test: "pilates-fee" } });
    const pm = await stripe.paymentMethods.attach(paymentMethod, { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
    await s.prisma.user.update({ where: { id: c.user.id }, data: { stripeCustomerId: customer.id } });
    const instance = await s.prisma.classInstance.create({ data: { organizationId: s.org.id, classScheduleId: s.schedule.id, date: new Date(Date.now() + 5 * 3_600_000 + Math.random() * 3_600_000), resourceId: s.room.id, locationId: s.location.id } });
    const ctx = await as(s, c.user);
    const b = (await gql(ctx, `mutation($c: ID!) { bookClass(classInstanceId: $c) { bookingId } }`, { c: instance.id })).bookClass.bookingId;
    await gql(ctx, `mutation($b: ID!) { cancelClassBooking(bookingId: $b) { message } }`, { b });
    return s.prisma.fee.findFirst({ where: { bookingId: b } });
  };

  const charged = await run("pm_card_visa");
  assert.equal(charged.status, "charged");
  assert.match(charged.providerPaymentIntentId, /^pi_/);
  const intent = await stripe.paymentIntents.retrieve(charged.providerPaymentIntentId);
  assert.equal(intent.status, "succeeded");
  assert.equal(intent.amount, 1500);

  const declined = await run("pm_card_chargeCustomerFail");
  assert.equal(declined.status, "owed");
  assert.ok(declined.failureMessage);
  void uid;
});
