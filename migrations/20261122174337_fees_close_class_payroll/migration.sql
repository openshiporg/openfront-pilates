-- AlterTable
ALTER TABLE "ClassBooking" ADD COLUMN     "checkedInAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ClassInstance" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedBy" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "method" TEXT DEFAULT 'stripe',
ADD COLUMN     "purpose" TEXT,
ADD COLUMN     "recordedBy" TEXT;

-- CreateTable
CREATE TABLE "Fee" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "member" TEXT NOT NULL,
    "booking" TEXT,
    "appointment" TEXT,
    "feeKey" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'assessed',
    "payment" TEXT,
    "providerPaymentIntentId" TEXT NOT NULL DEFAULT '',
    "failureMessage" TEXT NOT NULL DEFAULT '',
    "waivedBy" TEXT,
    "waivedReason" TEXT NOT NULL DEFAULT '',
    "waivedBasis" TEXT NOT NULL DEFAULT '',
    "refundedAt" TIMESTAMP(3),
    "history" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayRate" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "instructor" TEXT NOT NULL,
    "classBase" INTEGER NOT NULL DEFAULT 0,
    "perHeadBonus" INTEGER NOT NULL DEFAULT 0,
    "bonusAbove" INTEGER NOT NULL DEFAULT 0,
    "floor" INTEGER NOT NULL DEFAULT 0,
    "privateAmount" INTEGER NOT NULL DEFAULT 0,
    "duetAmount" INTEGER NOT NULL DEFAULT 0,
    "trioAmount" INTEGER NOT NULL DEFAULT 0,
    "hourlyAmount" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayLine" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "instructor" TEXT NOT NULL,
    "lineKey" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "classInstance" TEXT,
    "appointment" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "headcount" INTEGER DEFAULT 0,
    "hours" INTEGER DEFAULT 0,
    "amount" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "rule" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'accrued',
    "run" TEXT,
    "payRate" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "total" INTEGER DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "payouts" JSONB DEFAULT '[]',
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Fee_organization_idx" ON "Fee"("organization");

-- CreateIndex
CREATE INDEX "Fee_member_idx" ON "Fee"("member");

-- CreateIndex
CREATE INDEX "Fee_booking_idx" ON "Fee"("booking");

-- CreateIndex
CREATE INDEX "Fee_appointment_idx" ON "Fee"("appointment");

-- CreateIndex
CREATE INDEX "Fee_payment_idx" ON "Fee"("payment");

-- CreateIndex
CREATE INDEX "Fee_waivedBy_idx" ON "Fee"("waivedBy");

-- CreateIndex
CREATE UNIQUE INDEX "Fee_organization_feeKey_key" ON "Fee"("organization", "feeKey");

-- CreateIndex
CREATE INDEX "PayRate_organization_idx" ON "PayRate"("organization");

-- CreateIndex
CREATE INDEX "PayRate_instructor_idx" ON "PayRate"("instructor");

-- CreateIndex
CREATE INDEX "PayLine_organization_idx" ON "PayLine"("organization");

-- CreateIndex
CREATE INDEX "PayLine_instructor_idx" ON "PayLine"("instructor");

-- CreateIndex
CREATE INDEX "PayLine_classInstance_idx" ON "PayLine"("classInstance");

-- CreateIndex
CREATE INDEX "PayLine_appointment_idx" ON "PayLine"("appointment");

-- CreateIndex
CREATE INDEX "PayLine_run_idx" ON "PayLine"("run");

-- CreateIndex
CREATE INDEX "PayLine_payRate_idx" ON "PayLine"("payRate");

-- CreateIndex
CREATE INDEX "PayLine_createdBy_idx" ON "PayLine"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "PayLine_organization_lineKey_key" ON "PayLine"("organization", "lineKey");

-- CreateIndex
CREATE INDEX "PayrollRun_organization_idx" ON "PayrollRun"("organization");

-- CreateIndex
CREATE INDEX "PayrollRun_lockedBy_idx" ON "PayrollRun"("lockedBy");

-- CreateIndex
CREATE INDEX "ClassInstance_closedBy_idx" ON "ClassInstance"("closedBy");

-- CreateIndex
CREATE INDEX "Payment_recordedBy_idx" ON "Payment"("recordedBy");

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_member_fkey" FOREIGN KEY ("member") REFERENCES "Member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_booking_fkey" FOREIGN KEY ("booking") REFERENCES "ClassBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_waivedBy_fkey" FOREIGN KEY ("waivedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRate" ADD CONSTRAINT "PayRate_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayRate" ADD CONSTRAINT "PayRate_instructor_fkey" FOREIGN KEY ("instructor") REFERENCES "Instructor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLine" ADD CONSTRAINT "PayLine_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLine" ADD CONSTRAINT "PayLine_instructor_fkey" FOREIGN KEY ("instructor") REFERENCES "Instructor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLine" ADD CONSTRAINT "PayLine_classInstance_fkey" FOREIGN KEY ("classInstance") REFERENCES "ClassInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLine" ADD CONSTRAINT "PayLine_appointment_fkey" FOREIGN KEY ("appointment") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLine" ADD CONSTRAINT "PayLine_run_fkey" FOREIGN KEY ("run") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLine" ADD CONSTRAINT "PayLine_payRate_fkey" FOREIGN KEY ("payRate") REFERENCES "PayRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayLine" ADD CONSTRAINT "PayLine_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_lockedBy_fkey" FOREIGN KEY ("lockedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassInstance" ADD CONSTRAINT "ClassInstance_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Fees (4.6) and pay (4.9): statuses are known values; money is non-negative where it must be.
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_status_known" CHECK ("status" IN ('assessed', 'charged', 'owed', 'waived', 'refunded', 'void'));
ALTER TABLE "Fee" ADD CONSTRAINT "Fee_amount_nonnegative" CHECK ("amount" >= 0);
ALTER TABLE "PayLine" ADD CONSTRAINT "PayLine_status_known" CHECK ("status" IN ('accrued', 'locked', 'paid', 'void'));
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_period_order" CHECK ("periodEnd" > "periodStart");
CREATE INDEX "Fee_owed_idx" ON "Fee"("organization", "member", "status");
-- A locked or paid pay line cannot change amount, instructor, class or run; corrections are new lines (4.9).
CREATE OR REPLACE FUNCTION "PayLine_locked_immutable"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IN ('locked', 'paid') AND (NEW."amount" <> OLD."amount" OR NEW."instructor" <> OLD."instructor" OR NEW."headcount" IS DISTINCT FROM OLD."headcount" OR NEW."run" IS DISTINCT FROM OLD."run" OR NEW."status" NOT IN ('locked', 'paid')) THEN
    RAISE EXCEPTION 'A locked pay line cannot change; add an adjustment line instead';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "PayLine_locked_immutable" BEFORE UPDATE ON "PayLine" FOR EACH ROW EXECUTE FUNCTION "PayLine_locked_immutable"();
