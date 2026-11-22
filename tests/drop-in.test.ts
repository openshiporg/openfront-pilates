import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeStudioSettingsInput } from "../features/keystone/mutations/studioSettingsLifecycle";

const source = (path: string) => readFileSync(path, "utf8");

test("the drop-in price is cents between $0.50 and $1,000, or 0 to sell drop-ins at the front desk only", () => {
  assert.deepEqual(normalizeStudioSettingsInput({ dropInPrice: 2500 }), { dropInPrice: 2500 });
  assert.deepEqual(normalizeStudioSettingsInput({ dropInPrice: 0 }), { dropInPrice: 0 });
  assert.throws(() => normalizeStudioSettingsInput({ dropInPrice: 25 }), /at least \$0.50/);
  assert.throws(() => normalizeStudioSettingsInput({ dropInPrice: 12.5 }), /between \$0 and \$1,000/);
  assert.throws(() => normalizeStudioSettingsInput({ dropInPrice: 100_001 }), /between \$0 and \$1,000/);
});

test("a paid drop-in books through the shared capacity path without a membership or credit, and never waitlists", () => {
  const capacity = source("features/keystone/mutations/classCapacity.ts");
  assert.match(capacity, /if \(!dropIn && !membership\) throw new Error\("No active membership found"\)/);
  assert.match(capacity, /if \(atCapacity && dropIn\) throw new Error\(DROP_IN_CLASS_FULL\)/);
  assert.match(capacity, /status === "confirmed" && membership\) await debitBookingCredit/);
  assert.match(capacity, /basis: "drop_in_paid"/);
});

test("the booking is written only after the provider reports the checkout paid, once, with an automatic refund if the class can't take it", () => {
  const dropIn = source("features/keystone/mutations/dropIn.ts");
  assert.match(dropIn, /session\.status !== "complete" \|\| session\.payment_status !== "paid"/);
  assert.match(dropIn, /if \(current\.status === "completed"\) return/);
  assert.match(dropIn, /SAVEPOINT drop_in_booking/);
  assert.match(dropIn, /refundPayment\(paymentIntentId, undefined, `drop-in-refund:\$\{local\.id\}`\)/);
  const webhook = source("features/keystone/mutations/paymentWebhook.ts");
  assert.match(webhook, /session\.metadata\?\.source === DROP_IN_SOURCE\) \{\s*await fulfillDropInCheckout/);
});

test("cancelling a drop-in (by the visitor outside the late-cancel window, or by the club) refunds it and never touches membership credit", () => {
  const lifecycle = source("features/keystone/mutations/studioLifecycle.ts");
  assert.match(lifecycle, /booking\.status === "confirmed" && !late && !isDropInBooking\(booking\)\) await restoreBookingCredit/);
  assert.match(lifecycle, /if \(!isDropInBooking\(booking\)\) try \{/);
  const resolvers = source("features/keystone/mutations/studioLifecycleResolvers.ts");
  assert.equal((resolvers.match(/await refundCancelledDropIns\(/g) || []).length, 2);
});
