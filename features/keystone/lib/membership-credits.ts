import { guardKeystonePrismaResults } from "./prisma-result";

import { issueGrant, restoreCredit, spendCredit } from "./credits";

const DAY = 86_400_000;

/**
 * The service period that contains `at`, inside the paid period [creditPeriodStart, creditPeriodEnd).
 * Weekly, fortnightly and 4-weekly plans (D10) step by 7, 14 or 28 days from the paid start; monthly
 * and annual plans step by calendar months. Called only inside the caller's member-locked transaction.
 */
export function monthlyServicePeriod(membership: any, at: Date) {
  const start = new Date(membership.creditPeriodStart || membership.startDate);
  const end = new Date(membership.creditPeriodEnd || membership.nextBillingDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || at < start || at >= end) {
    throw new Error("Service is outside the paid membership period");
  }
  const period = membership.agreementSnapshot?.billingPeriod;
  const stepDays = period === "week" ? 7 : period === "fortnight" ? 14 : period === "four_weeks" ? 28 : 0;
  if (stepDays && membership.billingCycle !== "annual") {
    const index = Math.floor((at.getTime() - start.getTime()) / (stepDays * DAY));
    const periodStart = new Date(start.getTime() + index * stepDays * DAY);
    const next = new Date(periodStart.getTime() + stepDays * DAY);
    return { periodStart, periodEnd: next < end ? next : end };
  }
  const monthAt = (offset: number) => {
    const result = new Date(start);
    result.setUTCDate(1);
    result.setUTCMonth(start.getUTCMonth() + offset);
    const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(start.getUTCDate(), lastDay));
    return result;
  };
  let offset = (at.getUTCFullYear() - start.getUTCFullYear()) * 12 + at.getUTCMonth() - start.getUTCMonth();
  if (monthAt(offset) > at) offset -= 1;
  const periodStart = monthAt(offset);
  const next = monthAt(offset + 1);
  const periodEnd = next < end ? next : end;
  return { periodStart, periodEnd };
}

export function assertMembershipServiceEligibility(membership: any, at: Date) {
  if (!membership || membership.status !== "active") throw new Error("Membership is not active");
  monthlyServicePeriod(membership, at);
  if (membership.freezeStartDate && at >= new Date(membership.freezeStartDate) &&
      (!membership.freezeEndDate || at < new Date(membership.freezeEndDate))) {
    throw new Error("Membership is frozen for this service date");
  }
}

export async function assertNoPendingMembershipFreeze(tx: any, organizationId: string, membershipId: string) {
  tx = guardKeystonePrismaResults(tx);
  const attempt = await tx.membershipBillingAttempt.findFirst({
    where: { organizationId, membershipId, operation: "freeze", status: "processing" },
    select: { id: true },
  });
  if (attempt instanceof Error) throw attempt;
  if (attempt) throw new Error("Membership freeze is being finalized; participation is temporarily unavailable");
}

async function memberIdForMembership(tx: any, membership: any) {
  const member = await tx.member.findFirst({ where: { organizationId: membership.organizationId, userId: membership.memberId }, select: { id: true } });
  if (!member) throw new Error("Membership has no member profile");
  return member.id as string;
}

/**
 * The CreditGrant for the service period containing `at`: one per membership and period, created on
 * first need (booking, renewal webhook, refresh) and found again on every replay. Returned in the
 * shape callers used for the former monthly grant: { id, allowance, remaining, periodStart, periodEnd }.
 */
export async function ensureMonthlyCreditGrant(tx: any, membership: any, at: Date) {
  tx = guardKeystonePrismaResults(tx);
  assertMembershipServiceEligibility(membership, at);
  const { periodStart, periodEnd } = monthlyServicePeriod(membership, at);
  const allowance = membership.agreementSnapshot?.classCreditsPerMonth ?? membership.tier?.classCreditsPerMonth;
  if (!Number.isInteger(allowance) || allowance < -1) throw new Error("Membership credit allowance requires review");
  const memberId = await memberIdForMembership(tx, membership);
  const sourceKey = `membership:${membership.id}:${periodStart.toISOString()}`;
  let quantity = allowance;
  if (allowance > 0 && Number(membership.agreementSnapshot?.rolloverPeriods ?? 0) >= 1) {
    // Unused credits of the period just before roll over one period (D10), never more.
    const previous = await tx.creditGrant.findFirst({ where: { organizationId: membership.organizationId, membershipId: membership.id, source: "membership_period", expiresAt: { lte: periodStart } }, orderBy: [{ expiresAt: "desc" }] });
    const carried = previous && previous.remaining > 0 && previous.expiresAt.getTime() === periodStart.getTime() && !(previous.priceSnapshot as any)?.rolledOver ? Math.min(previous.remaining, allowance) : 0;
    quantity = allowance + carried;
  }
  if (allowance === 0) return { id: null, allowance: 0, remaining: 0, periodStart, periodEnd };
  const { grant } = await issueGrant(tx, {
    organizationId: membership.organizationId, memberId, source: "membership_period", sourceKey, kind: "group",
    quantity, validFrom: periodStart, expiresAt: periodEnd, membershipId: membership.id,
    priceSnapshot: { tierId: membership.tierId ?? null, amount: membership.agreementSnapshot?.amount ?? null, billingPeriod: membership.agreementSnapshot?.billingPeriod ?? "month" },
  });
  return { ...grant, allowance: grant.quantity, periodStart, periodEnd };
}

/** Spends one group credit for a booking: soonest expiry first across membership periods and packs. */
export async function debitBookingCredit(tx: any, membership: any, bookingId: string, at: Date, options: { memberId?: string; locationId?: string | null } = {}) {
  tx = guardKeystonePrismaResults(tx);
  const booking = await tx.classBooking.findUnique({ where: { id: bookingId }, select: { organizationId: true, memberId: true } });
  if (!booking) throw new Error("Booking not found");
  if (membership) await ensureMonthlyCreditGrant(tx, membership, at);
  const grant = await spendCredit(tx, { organizationId: booking.organizationId, memberId: options.memberId ?? booking.memberId, kind: "group", at, eventKey: `${bookingId}:debit`, bookingId, locationId: options.locationId });
  if (membership) await updateCurrentCreditDisplay(tx, membership.id);
  return grant;
}

/** Restores a booking's credit to the grant it came from, with that grant's expiry. */
export async function restoreBookingCredit(tx: any, bookingId: string) {
  tx = guardKeystonePrismaResults(tx);
  const booking = await tx.classBooking.findUnique({ where: { id: bookingId }, select: { organizationId: true } });
  if (!booking) return false;
  const debit = await tx.creditEntry.findFirst({ where: { organizationId: booking.organizationId, eventKey: `${bookingId}:debit` } });
  if (!debit) {
    await tx.classBooking.update({ where: { id: bookingId }, data: { eligibilityReviewReason: "This booking has no credit record; staff must review any credit adjustment" } });
    return false;
  }
  const restored = await restoreCredit(tx, booking.organizationId, `${bookingId}:debit`, `${bookingId}:restore`);
  const grant = await tx.creditGrant.findUnique({ where: { id: debit.grantId }, select: { membershipId: true } });
  if (grant?.membershipId) await updateCurrentCreditDisplay(tx, grant.membershipId);
  return restored;
}

/** The grant a booking's credit came from (or null for a drop-in). */
export async function bookingDebit(tx: any, organizationId: string, bookingId: string) {
  tx = guardKeystonePrismaResults(tx);
  const debit = await tx.creditEntry.findFirst({ where: { organizationId, eventKey: `${bookingId}:debit` }, include: { grant: true } });
  return debit ?? null;
}

/**
 * Operator-reviewed plan change: the current period's grant takes the new allowance now (-1 is
 * unlimited). Later periods grant from the new agreement. Inside the member-locked transaction.
 */
export async function applyPlanAllowanceToCurrentGrant(tx: any, membership: any, at: Date) {
  tx = guardKeystonePrismaResults(tx);
  const allowance = membership.agreementSnapshot?.classCreditsPerMonth ?? membership.tier?.classCreditsPerMonth;
  if (!Number.isInteger(allowance) || allowance < -1) throw new Error("Membership credit allowance requires review");
  let period: { periodStart: Date; periodEnd: Date };
  try { period = monthlyServicePeriod(membership, at); } catch { return null; }
  const grant = await tx.creditGrant.findFirst({ where: { organizationId: membership.organizationId, sourceKey: `membership:${membership.id}:${period.periodStart.toISOString()}` } });
  if (!grant) return null;
  const used = grant.remaining === -1 || grant.quantity === -1 ? 0 : grant.quantity - grant.remaining;
  const remaining = allowance === -1 ? -1 : Math.max(allowance - used, 0);
  const updated = await tx.creditGrant.update({ where: { id: grant.id }, data: { quantity: allowance === -1 ? -1 : Math.max(allowance, used), remaining } });
  await tx.creditEntry.create({ data: { organizationId: grant.organizationId, memberId: grant.memberId, grantId: grant.id, eventKey: `${grant.id}:plan:${at.toISOString()}`, kind: "adjust", delta: remaining === -1 || grant.remaining === -1 ? 0 : remaining - grant.remaining, balanceAfter: remaining, reason: "Plan change" } });
  await updateCurrentCreditDisplay(tx, membership.id);
  return { ...updated, allowance: updated.quantity };
}

async function updateCurrentCreditDisplay(tx: any, membershipId: string) {
  tx = guardKeystonePrismaResults(tx);
  const now = new Date();
  const current = await tx.creditGrant.findFirst({ where: { membershipId, source: "membership_period", validFrom: { lte: now }, expiresAt: { gt: now } }, orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }] });
  if (current) await tx.membership.update({ where: { id: membershipId }, data: { classCreditsRemaining: current.remaining } });
}

/** Bounded operator/billing follow-up: preserve bookings and seats, flag review;
 * admission still independently rejects ineligible service. Never auto-resurrect. */
export async function reviewFutureMembershipBookings(tx: any, membership: any) {
  tx = guardKeystonePrismaResults(tx);
  const bookings = await tx.classBooking.findMany({ where: {
    organizationId: membership.organizationId, member: { userId: membership.memberId },
    status: { in: ["confirmed", "waitlisted"] }, classInstance: { date: { gt: new Date() } },
  }, include: { classInstance: true, member: { select: { status: true } } }, take: 1000 });
  for (const booking of bookings) {
    let reason = "";
    try {
      if (booking.member?.status !== "active") throw new Error(`Member account is ${booking.member?.status || "unavailable"}`);
      assertMembershipServiceEligibility(membership, booking.classInstance.date);
    }
    catch (error) { reason = error instanceof Error ? error.message : "Eligibility requires review"; }
    await tx.classBooking.update({ where: { id: booking.id }, data: { eligibilityReviewReason: reason } });
  }
  return bookings.length;
}

/** Owner/operator refresh uses the same local facts; never contacts a provider. */
export async function refreshMemberEntitlement(context: any, organizationId: string, userId: string) {
  const session = context.session;
  if (!session?.itemId || session.data?.organization?.id !== organizationId || (session.itemId !== userId && !session.data?.role?.canManageAllRecords)) throw new Error("Membership owner or manager permission required");
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const identity = await prisma.membership.findFirst({ where: { organizationId, memberId: userId }, select: { id: true } });
  if (!identity) return { refreshed: false, reason: "No membership" };
  return refreshScopedMembership(context.prisma, organizationId, identity.id);
}

export async function refreshScopedMembership(prisma: any, organizationId: string, membershipId: string) {
  prisma = guardKeystonePrismaResults(prisma);
  // Import lazily to keep pure period arithmetic independent of transport.
  const { lockParticipationPolicy } = await import("./operational-policy");
  const { lockTransactionKey } = await import("../mutations/classCapacity");
  return prisma.$transaction(async (tx: any) => {
    await lockParticipationPolicy(tx, organizationId);
    await lockTransactionKey(tx, `membership:${membershipId}`);
    let membership = await tx.membership.findFirst({ where: { id: membershipId, organizationId }, include: { tier: true } });
    if (!membership) throw new Error("Membership not found");
    const member = await tx.member.findFirst({ where: { organizationId, userId: membership.memberId } });
    if (!member) return { refreshed: false, reason: "Member record missing", membershipId };
    await lockTransactionKey(tx, `member:${member.id}`);
    membership = await tx.membership.findFirst({ where: { id: membershipId, organizationId }, include: { tier: true } });
    const now = new Date();
    const paidEnd = new Date(membership.creditPeriodEnd || membership.nextBillingDate);
    if (membership.status === "active" && Number.isFinite(paidEnd.getTime()) && paidEnd <= now) {
      membership = await tx.membership.update({ where: { id: membershipId }, data: { status: "expired" }, include: { tier: true } });
    }
    let refreshed = false, reason = "";
    if (membership.status === "active" && member.status === "active") {
      try { assertMembershipServiceEligibility(membership, now); }
      catch (error) { reason = error instanceof Error ? error.message : "Membership requires review"; }
      if (!reason) {
        const grant = await ensureMonthlyCreditGrant(tx, membership, now);
        await tx.membership.update({ where: { id: membershipId }, data: { classCreditsRemaining: grant.remaining } });
        refreshed = true;
      }
    } else reason = `Member ${member.status}; membership ${membership.status}`;
    const reviewed = await reviewFutureMembershipBookings(tx, membership);
    if (member.status !== "active") await tx.classBooking.updateMany({ where: { organizationId, memberId: member.id, status: { in: ["confirmed", "waitlisted"] }, classInstance: { date: { gt: now } } }, data: { eligibilityReviewReason: `Member account is ${member.status}` } });
    return { refreshed, reason, membershipId, reviewed, reviewLimitReached: reviewed >= 1000 };
  });
}
