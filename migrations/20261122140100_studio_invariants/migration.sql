-- The first administrator is created inside this organization (features/keystone/index.ts
-- initFirstItem). Onboarding renames it to the studio's own name.
INSERT INTO "Organization" ("id", "name", "slug", "status", "defaultCurrency", "timezone", "isMultiLocation", "updatedAt")
VALUES ('studio_default_organization', 'Studio', 'studio', 'active', 'USD', 'America/Los_Angeles', true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Fails closed on existing violations; nothing is silently rewritten.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "GiftCard" WHERE "balance" < 0 OR "initialValue" < 0 OR "balance" > "initialValue") THEN RAISE EXCEPTION 'Gift card balances outside 0..initial value require manual remediation'; END IF;
  IF EXISTS (SELECT 1 FROM "Payment" WHERE "amount" < 0 OR coalesce("refundAmount", 0) < 0 OR coalesce("refundAmount", 0) > "amount") THEN RAISE EXCEPTION 'Payment refunds above the paid amount require manual remediation'; END IF;
END $$;

-- Database backstops for invariants every writer already checks under a lock. A writer that
-- forgets a check is refused here instead of corrupting a balance.
ALTER TABLE "StudioSettings" ADD CONSTRAINT "StudioSettings_brandHue_range" CHECK ("brandHue" >= 0 AND "brandHue" <= 359);
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_balance_range" CHECK ("initialValue" >= 0 AND "balance" >= 0 AND "balance" <= "initialValue");
ALTER TABLE "TrainingPackage" ADD CONSTRAINT "TrainingPackage_credit_range" CHECK ("totalCredits" >= 1 AND "creditsRemaining" >= 0 AND "creditsRemaining" <= "totalCredits");
ALTER TABLE "TrainingPackage" ADD CONSTRAINT "TrainingPackage_refund_range" CHECK ("amount" >= 0 AND coalesce("refundAmount", 0) BETWEEN 0 AND "amount");
ALTER TABLE "RetailItem" ADD CONSTRAINT "RetailItem_stock_price_nonnegative" CHECK (coalesce("stockOnHand", 0) >= 0 AND "unitAmount" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refund_range" CHECK ("amount" >= 0 AND coalesce("refundAmount", 0) BETWEEN 0 AND "amount");
ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_refund_range" CHECK ("amount" >= 0 AND coalesce("refundAmount", 0) BETWEEN 0 AND "amount");
ALTER TABLE "MembershipCreditGrant" ADD CONSTRAINT "MembershipCreditGrant_remaining_range" CHECK (("allowance" = -1 AND "remaining" = -1) OR ("allowance" >= 0 AND "remaining" BETWEEN 0 AND "allowance"));
ALTER TABLE "MembershipCreditGrant" ADD CONSTRAINT "MembershipCreditGrant_period_order" CHECK ("periodEnd" > "periodStart");
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_time_order" CHECK ("endTime" > "startTime");
ALTER TABLE "ClassInstance" ADD CONSTRAINT "ClassInstance_time_order" CHECK ("endsAt" IS NULL OR "endsAt" > "date");
ALTER TABLE "RetailClose" ADD CONSTRAINT "RetailClose_period_order" CHECK ("periodEnd" > "periodStart");

-- One local payment per card payment: a concurrent second create fails instead of double-counting.
CREATE UNIQUE INDEX "Payment_organization_paymentIntent_key" ON "Payment"("organization", "stripePaymentIntentId")
  WHERE "stripePaymentIntentId" IS NOT NULL AND "stripePaymentIntentId" <> '';
