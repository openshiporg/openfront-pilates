import { guardKeystonePrismaResults } from "./prisma-result";
import { usableGrants } from "./credits";
import { ensureMonthlyCreditGrant, assertMembershipServiceEligibility, assertNoPendingMembershipFreeze } from "./membership-credits";

/**
 * Every rule a group-class booking must pass (dissertation W2, D9, D10, D14), checked inside the
 * class- and member-locked booking transaction: past due, fees owed, requiresIntro, the booking
 * window, daily and monthly caps, off-peak, and a usable credit. Used by booking and by waitlist
 * promotion, so a promoted client is held to the same rules.
 */

const DAY = 86_400_000;
const LIVE = ["confirmed", "attended", "no_show", "late_cancelled"] as const;

export type BookingFunding = {
  membership: any | null;
  /** The usable grant that would be spent now (null: nothing usable). */
  grant: any | null;
  unlimited: boolean;
  remaining: number;
};

/** Time-of-day and ISO weekday of `at` in the studio's time zone. */
export function localClock(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, weekday: "short", hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { weekday, time: `${hour}:${get("minute")}`, day: `${get("year")}-${get("month")}-${get("day")}`, month: `${get("year")}-${get("month")}` };
}

export function insideOffPeak(at: Date, timeZone: string, windows: any) {
  const clock = localClock(at, timeZone);
  return (Array.isArray(windows) ? windows : []).some((w: any) => Array.isArray(w?.days) && w.days.includes(clock.weekday) && typeof w.from === "string" && typeof w.to === "string" && clock.time >= w.from && clock.time < w.to);
}

async function studioTimeZone(tx: any, organizationId: string) {
  const settings = await tx.studioSettings.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "asc" }], select: { timezone: true, bookingHorizonDays: true } });
  const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
  return { timeZone: settings?.timezone || org?.timezone || "UTC", horizonDays: Number(settings?.bookingHorizonDays ?? 14) || 14 };
}

/** Has this client attended (or been checked into) an intro class? (D14 requiresIntro) */
export async function hasAttendedIntro(tx: any, organizationId: string, memberId: string) {
  const attended = await tx.classBooking.findFirst({ where: { organizationId, memberId, status: "attended", classInstance: { classSchedule: { classType: { isIntroClass: true } } } }, select: { id: true } });
  if (attended) return true;
  const marked = await tx.attendanceRecord.findFirst({ where: { organizationId, memberId, attended: true, booking: { classInstance: { classSchedule: { classType: { isIntroClass: true } } } } }, select: { id: true } });
  return Boolean(marked);
}

/**
 * Checks the rules and returns how the booking would be funded. With `requireCredit` false (joining
 * a waitlist) a missing credit is allowed: nothing is spent until promotion.
 */
export async function assertBookingRules(txIn: any, input: { organizationId: string; member: any; instance: any; requireCredit: boolean; actorIsStaff: boolean; dropIn?: boolean }): Promise<BookingFunding> {
  const tx = guardKeystonePrismaResults(txIn);
  const { organizationId, member, instance } = input;
  const at = new Date(instance.date);
  const now = new Date();
  const classType = instance.classSchedule?.classType ?? null;

  const membership = member.user?.id ? await tx.membership.findFirst({ where: { memberId: member.user.id, organizationId }, include: { tier: true } }) : null;
  // Past due: existing bookings stand, new bookings are blocked (W7.3).
  if (membership && ["past-due", "past_due"].includes(membership.status)) throw new Error("Your membership payment failed. Update your card in your account before booking.");

  if (await tx.fee?.findFirst?.({ where: { organizationId, memberId: member.id, status: "owed" }, select: { id: true } })) {
    throw new Error("You have a fee owed. Pay it in your account before booking.");
  }

  if (classType?.requiresIntro && !(await hasAttendedIntro(tx, organizationId, member.id))) {
    throw new Error("This class needs a completed intro class first. Book a Foundations class to start.");
  }

  const activeMembership = membership && membership.status === "active" ? membership : null;
  if (activeMembership) await assertNoPendingMembershipFreeze(tx, organizationId, activeMembership.id);
  const terms = activeMembership?.agreementSnapshot ?? {};
  const { timeZone, horizonDays } = await studioTimeZone(tx, organizationId);

  // Booking window: a member books up to the tier's advanceBookingDays ahead, others up to the
  // studio horizon. Staff may book any open class.
  if (!input.actorIsStaff) {
    const windowDays = activeMembership ? Number(terms.advanceBookingDays ?? activeMembership.tier?.advanceBookingDays ?? horizonDays) : horizonDays;
    if (at.getTime() - now.getTime() > windowDays * DAY) throw new Error(`Classes open for booking ${windowDays} days ahead`);
  }

  if (input.dropIn) return { membership: null, grant: null, unlimited: false, remaining: 0 };

  // A membership period grant is created on first need, so the ledger can see it.
  let membershipCovers = false;
  if (activeMembership) {
    try {
      assertMembershipServiceEligibility(activeMembership, at);
      const offPeakOnly = Boolean(terms.offPeakOnly ?? activeMembership.tier?.offPeakOnly);
      if (offPeakOnly && !insideOffPeak(at, timeZone, terms.offPeakWindows ?? activeMembership.tier?.offPeakWindows)) throw new Error("Your off-peak membership doesn't cover this time");
      await ensureMonthlyCreditGrant(tx, activeMembership, at);
      membershipCovers = true;
    } catch (error) {
      if (!(error instanceof Error) || !/outside the paid membership period|frozen|off-peak/.test(error.message)) throw error;
      // The membership doesn't cover this date; a pack may still fund it.
      if (/off-peak/.test(error.message) && !(await usableGrants(tx, organizationId, member.id, "group", at)).some((g: any) => g.source !== "membership_period")) throw error;
    }
  }

  if (membershipCovers) {
    const perDay = Number(terms.maxBookingsPerDay ?? activeMembership.tier?.maxBookingsPerDay ?? 0);
    const perMonth = Number(terms.maxBookingsPerMonth ?? activeMembership.tier?.maxBookingsPerMonth ?? 0);
    if (perDay > 0 || perMonth > 0) {
      const clock = localClock(at, timeZone);
      const around = await tx.classBooking.findMany({
        where: { organizationId, memberId: member.id, status: { in: [...LIVE] }, classInstanceId: { not: instance.id }, classInstance: { isCancelled: false, date: { gte: new Date(at.getTime() - 32 * DAY), lt: new Date(at.getTime() + 32 * DAY) } } },
        select: { status: true, classInstance: { select: { date: true } } }, take: 2000,
      });
      // Caps count attended and upcoming bookings; a late cancel counted against the day it was for.
      const counted = around.filter((b: any) => b.status !== "late_cancelled").map((b: any) => localClock(new Date(b.classInstance.date), timeZone));
      if (perDay > 0 && counted.filter((c: any) => c.day === clock.day).length >= perDay) throw new Error(`Your plan allows ${perDay} class${perDay === 1 ? "" : "es"} a day`);
      if (perMonth > 0 && counted.filter((c: any) => c.month === clock.month).length >= perMonth) throw new Error(`Your plan allows ${perMonth} classes a month`);
    }
  }

  const kind = (classType?.creditKind as any) || "group";
  const grants = await usableGrants(tx, organizationId, member.id, kind, at, { locationId: instance.locationId ?? instance.classSchedule?.locationId ?? null });
  const grant = grants[0] ?? null;
  if (!grant && input.requireCredit) {
    if (!activeMembership && !grants.length) {
      const anyGrant = await tx.creditGrant.findFirst({ where: { organizationId, memberId: member.id }, select: { id: true } });
      throw new Error(anyGrant ? "No class credits remaining" : "Buy a class pack, intro offer or membership to book");
    }
    throw new Error("No class credits remaining");
  }
  return { membership: activeMembership, grant, unlimited: grant?.remaining === -1, remaining: grant ? grant.remaining : 0 };
}
