-- AlterTable
ALTER TABLE "ClassBooking" ADD COLUMN     "activeSpotKey" TEXT,
ADD COLUMN     "history" JSONB DEFAULT '[]',
ADD COLUMN     "spot" TEXT;

-- AlterTable
ALTER TABLE "ClassType" ADD COLUMN     "apparatus" TEXT NOT NULL DEFAULT 'reformer',
ADD COLUMN     "cancelWindowHoursOverride" INTEGER,
ADD COLUMN     "capacityMode" TEXT NOT NULL DEFAULT 'pick_a_spot',
ADD COLUMN     "creditKind" TEXT NOT NULL DEFAULT 'group',
ADD COLUMN     "isIntroClass" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lateCancelFeeOverride" INTEGER,
ADD COLUMN     "noShowFeeOverride" INTEGER,
ADD COLUMN     "requiresIntro" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "layout" JSONB DEFAULT '{"width":8,"height":4}';

-- AlterTable
ALTER TABLE "StudioSettings" ADD COLUMN     "arriveEarlyMinutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "bookingHorizonDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "gripSocksRequired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lateCancelFee" INTEGER NOT NULL DEFAULT 1500,
ADD COLUMN     "lateCancelWaiversPer30Days" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "noShowFee" INTEGER NOT NULL DEFAULT 2000,
ADD COLUMN     "privateCancelWindowHours" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "requireWaiver" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "waitlistCutoffMinutes" INTEGER NOT NULL DEFAULT 120;

-- CreateTable
CREATE TABLE "Spot" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "apparatus" TEXT NOT NULL DEFAULT 'reformer',
    "x" INTEGER NOT NULL DEFAULT 0,
    "y" INTEGER NOT NULL DEFAULT 0,
    "isBookable" BOOLEAN NOT NULL DEFAULT true,
    "outOfServiceFrom" TIMESTAMP(3),
    "outOfServiceUntil" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Spot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Spot_organization_idx" ON "Spot"("organization");

-- CreateIndex
CREATE INDEX "Spot_room_idx" ON "Spot"("room");

-- CreateIndex
CREATE UNIQUE INDEX "Spot_room_number_key" ON "Spot"("room", "number");

-- CreateIndex
CREATE INDEX "ClassBooking_spot_idx" ON "ClassBooking"("spot");

-- CreateIndex
CREATE UNIQUE INDEX "ClassBooking_organization_classInstance_spot_activeSpotKey_key" ON "ClassBooking"("organization", "classInstance", "spot", "activeSpotKey");

-- AddForeignKey
ALTER TABLE "Spot" ADD CONSTRAINT "Spot_organization_fkey" FOREIGN KEY ("organization") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Spot" ADD CONSTRAINT "Spot_room_fkey" FOREIGN KEY ("room") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassBooking" ADD CONSTRAINT "ClassBooking_spot_fkey" FOREIGN KEY ("spot") REFERENCES "Spot"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Booking statuses (dissertation 4.2); the old waitlist value is renamed.
UPDATE "ClassBooking" SET "status" = 'waitlisted' WHERE "status" = 'waitlist';
ALTER TABLE "ClassBooking" ADD CONSTRAINT "ClassBooking_status_known" CHECK ("status" IN ('confirmed', 'waitlisted', 'cancelled', 'late_cancelled', 'attended', 'no_show'));
-- A booking that holds a machine is confirmed; a waitlisted one holds none.
ALTER TABLE "ClassBooking" ADD CONSTRAINT "ClassBooking_spot_hold_confirmed" CHECK ("activeSpotKey" IS NULL OR ("status" IN ('confirmed', 'attended', 'no_show') AND "spot" IS NOT NULL));
