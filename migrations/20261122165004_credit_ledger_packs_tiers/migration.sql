-- DropForeignKey
ALTER TABLE "MembershipCreditEntry" DROP CONSTRAINT "MembershipCreditEntry_booking_fkey";

-- DropForeignKey
ALTER TABLE "MembershipCreditEntry" DROP CONSTRAINT "MembershipCreditEntry_grant_fkey";

-- DropForeignKey
ALTER TABLE "MembershipCreditEntry" DROP CONSTRAINT "MembershipCreditEntry_organization_fkey";

-- DropForeignKey
ALTER TABLE "MembershipCreditGrant" DROP CONSTRAINT "MembershipCreditGrant_membership_fkey";

-- DropForeignKey
ALTER TABLE "MembershipCreditGrant" DROP CONSTRAINT "MembershipCreditGrant_organization_fkey";

-- AlterTable
ALTER TABLE "MembershipTier" ADD COLUMN     "advanceBookingDays" INTEGER DEFAULT 14,
ADD COLUMN     "billingPeriod" TEXT NOT NULL DEFAULT 'month',
ADD COLUMN     "cancelNoticeDays" INTEGER DEFAULT 30,
ADD COLUMN     "freezeDaysPerYear" INTEGER DEFAULT 30,
ADD COLUMN     "freezeFee" INTEGER DEFAULT 0,
ADD COLUMN     "freezeMaxDays" INTEGER DEFAULT 30,
ADD COLUMN     "freezeMinDays" INTEGER DEFAULT 7,
ADD COLUMN     "maxBookingsPerDay" INTEGER DEFAULT 0,
ADD COLUMN     "maxBookingsPerMonth" INTEGER DEFAULT 0,
ADD COLUMN     "offPeakOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offPeakWindows" JSONB DEFAULT '[{"days":[1,2,3,4,5],"from":"09:00","to":"16:00"},{"days":[6,7],"from":"12:00","to":"21:00"}]',
ADD COLUMN     "rolloverPeriods" INTEGER DEFAULT 0;

-- DropTable
DROP TABLE "MembershipCreditEntry";

-- DropTable
DROP TABLE "MembershipCreditGrant";

-- CreateTable
CREATE TABLE "ClassPack" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'group',
    "quantity" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "validDays" INTEGER NOT NULL,
    "introOnly" BOOLEAN NOT NULL DEFAULT false,
    "firstTimersOnly" BOOLEAN NOT NULL DEFAULT false,
    "activatesOn" TEXT NOT NULL DEFAULT 'purchase',
    "sortOrder" INTEGER DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditGrant" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'group',
    "classPack" TEXT,
    "membership" TEXT,
    "payment" TEXT,
    "quantity" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "validDays" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "priceSnapshot" JSONB DEFAULT '{}',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditEntry" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT NOT NULL,
    "grant" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "booking" TEXT,
    "appointment" TEXT,
    "actor" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ClassPack_locations" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ClassPack_locations_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "ClassPack_organization_idx" ON "ClassPack"("organization");

-- CreateIndex
CREATE UNIQUE INDEX "ClassPack_organization_name_key" ON "ClassPack"("organization", "name");

-- CreateIndex
CREATE INDEX "CreditGrant_organization_idx" ON "CreditGrant"("organization");

-- CreateIndex
CREATE INDEX "CreditGrant_member_idx" ON "CreditGrant"("member");

-- CreateIndex
CREATE INDEX "CreditGrant_classPack_idx" ON "CreditGrant"("classPack");

-- CreateIndex
CREATE INDEX "CreditGrant_membership_idx" ON "CreditGrant"("membership");

-- CreateIndex
CREATE INDEX "CreditGrant_payment_idx" ON "CreditGrant"("payment");

-- CreateIndex
CREATE UNIQUE INDEX "CreditGrant_organization_sourceKey_key" ON "CreditGrant"("organization", "sourceKey");

-- CreateIndex
CREATE INDEX "CreditEntry_organization_idx" ON "CreditEntry"("organization");

-- CreateIndex
CREATE INDEX "CreditEntry_member_idx" ON "CreditEntry"("member");

-- CreateIndex
CREATE INDEX "CreditEntry_grant_idx" ON "CreditEntry"("grant");

-- CreateIndex
CREATE INDEX "CreditEntry_booking_idx" ON "CreditEntry"("booking");

-- CreateIndex
CREATE INDEX "CreditEntry_appointment_idx" ON "CreditEntry"("appointment");

-- CreateIndex
CREATE INDEX "CreditEntry_actor_idx" ON "CreditEntry"("actor");

-- CreateIndex
CREATE UNIQUE INDEX "CreditEntry_organization_eventKey_key" ON "CreditEntry"("organization", "eventKey");

-- CreateIndex
CREATE INDEX "_ClassPack_locations_B_index" ON "_ClassPack_locations"("B");

-- AddForeignKey
ALTER TABLE "ClassPack" ADD CONSTRAINT "ClassPack_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_classPack_fkey" FOREIGN KEY ("classPack") REFERENCES "ClassPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_membership_fkey" FOREIGN KEY ("membership") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_grant_fkey" FOREIGN KEY ("grant") REFERENCES "CreditGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_booking_fkey" FOREIGN KEY ("booking") REFERENCES "ClassBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClassPack_locations" ADD CONSTRAINT "_ClassPack_locations_A_fkey" FOREIGN KEY ("A") REFERENCES "ClassPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClassPack_locations" ADD CONSTRAINT "_ClassPack_locations_B_fkey" FOREIGN KEY ("B") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The ledger refuses a negative balance (§4.3): remaining is -1 (unlimited) or 0..quantity.
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_balance_range" CHECK (("quantity" = -1 AND "remaining" = -1) OR ("quantity" >= 1 AND "remaining" BETWEEN 0 AND "quantity"));
ALTER TABLE "CreditGrant" ADD CONSTRAINT "CreditGrant_period_order" CHECK ("expiresAt" IS NULL OR "expiresAt" > "validFrom");
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_balance_nonnegative" CHECK ("balanceAfter" >= -1);
ALTER TABLE "ClassPack" ADD CONSTRAINT "ClassPack_terms_range" CHECK ("quantity" >= 1 AND "price" >= 0 AND "validDays" >= 1);
CREATE INDEX "CreditGrant_spend_idx" ON "CreditGrant"("organization", "member", "kind", "status", "expiresAt");
