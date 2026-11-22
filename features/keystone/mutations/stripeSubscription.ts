import type { Context } from ".keystone/types";
import { currentRoleActor } from "../access/currentRoleActor";
import { getAdapterForProvider } from "../utils/paymentProviderAdapter";
import { guardKeystonePrismaResults } from "../lib/prisma-result";
import { lockTransactionKey } from "./classCapacity";
import { releaseFutureBookingsForEndedMembership } from "./studioLifecycle";
import type { PaymentProviderPurpose } from "../utils/paymentProviderAdapter";
import { applyPlanAllowanceToCurrentGrant } from "../lib/membership-credits";
import {
  adoptPendingMembershipBillingKey,
  claimMembershipBillingAttempt,
  failMembershipBillingAttempt,
  finishMembershipBillingAttempt,
  isCompletedMembershipBillingAttempt,
  membershipBillingRequestHash,
  type MembershipBillingOperation,
} from "./membershipBillingAttempts";

import { membershipTierChangeCurrency, snapshotMembershipAgreement, tierAmountMinor } from "../../integrations/payment/commercial-agreement";
import { mapStripeStatusToMembership } from "../../integrations/payment/lifecycle";

const PROVIDER_CODE = "pp_stripe";

type CurrentRoleActor = Awaited<ReturnType<typeof currentRoleActor>>;

function assertUserSessionAccess(actor: CurrentRoleActor, userId: string) {
  if (actor.userId === userId || actor.canManageAllRecords) return;
  throw new Error("You cannot manage another member's billing");
}

async function getAuthorizedMembership(context: Context, membershipId: string, currentActor?: CurrentRoleActor) {
  const actor = currentActor ?? await currentRoleActor(context);
  const organizationId = actor.organizationId;
  const memberships = await context.sudo().query.Membership.findMany({
    where: { AND: [{ id: { equals: membershipId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id startDate agreementSnapshot agreementHistory organization { id defaultCurrency } stripeSubscriptionId billingCycle status autoRenew nextBillingDate creditPeriodStart creditPeriodEnd member { id stripeCustomerId organization { id } } tier { id freezeAllowed contractLength organization { id } }",
  });
  const membership = memberships[0] as any;
  if (!membership || membership.organization?.id !== organizationId || membership.member?.organization?.id !== organizationId) {
    throw new Error("Membership not found");
  }
  assertUserSessionAccess(actor, membership.member?.id);
  return { membership, actor };
}

/** Plan changes and new payment methods are new charges; the rest manage an existing subscription. */
async function getAdapter(context: Context, organizationId: string, purpose: PaymentProviderPurpose = "reconcile") {
  return getAdapterForProvider(context, PROVIDER_CODE, organizationId, purpose);
}

function billingAttemptScope(
  organizationId: string,
  membershipId: string,
  operation: MembershipBillingOperation,
  idempotencyKey: string,
  evidence: Record<string, unknown>,
) {
  return {
    organizationId,
    membershipId,
    operation,
    idempotencyKey,
    requestHash: membershipBillingRequestHash(operation, evidence),
  };
}

export function freezeRule(membership: any) {
  const terms = membership.agreementSnapshot ?? {};
  const tier = membership.tier ?? {};
  return {
    minDays: Number(terms.freezeMinDays ?? tier.freezeMinDays ?? 7),
    maxDays: Number(terms.freezeMaxDays ?? tier.freezeMaxDays ?? 30),
    daysPerYear: Number(terms.freezeDaysPerYear ?? tier.freezeDaysPerYear ?? 30),
  };
}

/** Frozen days in the 365 days before `at`, from the agreement history and the current freeze. */
export function frozenDaysInLastYear(membership: any, at: Date) {
  const since = at.getTime() - 365 * 86_400_000;
  const periods: Array<{ start: number; end: number }> = [];
  for (const entry of Array.isArray(membership.agreementHistory) ? membership.agreementHistory : []) {
    if (entry?.kind === "freeze" && entry.start && entry.end) periods.push({ start: new Date(entry.start).getTime(), end: new Date(entry.end).getTime() });
  }
  if (membership.freezeStartDate && membership.freezeEndDate) periods.push({ start: new Date(membership.freezeStartDate).getTime(), end: new Date(membership.freezeEndDate).getTime() });
  const seen = new Set<string>();
  let total = 0;
  for (const p of periods) {
    const key = `${p.start}:${p.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    total += Math.max(0, Math.min(p.end, at.getTime()) - Math.max(p.start, since)) / 86_400_000;
  }
  return Math.ceil(total);
}

/**
 * When a cancel given now takes effect (D10, W7.6): the later of the notice date and the minimum
 * term end, rounded up to the end of the paid period it falls in.
 */
export function cancellationEndDate(membership: any, now = new Date()) {
  const noticeDays = Number(membership.agreementSnapshot?.cancelNoticeDays ?? membership.tier?.cancelNoticeDays ?? 0);
  const notice = new Date(now.getTime() + Math.max(noticeDays, 0) * 86_400_000);
  const term = minimumTermEnd(membership);
  const target = term && term > notice ? term : notice;
  const paidEnd = membership.nextBillingDate ? new Date(membership.nextBillingDate) : null;
  if (paidEnd && target <= paidEnd) return paidEnd;
  return target;
}

/**
 * The minimum term the member accepted (agreementSnapshot.contractLength, in months from the
 * start date). Renewal can't be cancelled inside it; staff can still end a membership now.
 */
export function minimumTermEnd(membership: { startDate?: string | Date | null; agreementSnapshot?: any; tier?: any }) {
  const months = Number(membership.agreementSnapshot?.contractLength ?? membership.tier?.contractLength ?? 0);
  if (!Number.isInteger(months) || months <= 0 || !membership.startDate) return null;
  const start = new Date(membership.startDate);
  if (!Number.isFinite(start.getTime())) return null;
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + months);
  return end;
}

export function minimumTermCancelProblem(membership: Parameters<typeof minimumTermEnd>[0], now = new Date()) {
  const end = minimumTermEnd(membership);
  if (!end || now >= end) return null;
  const months = Number(membership.agreementSnapshot?.contractLength ?? membership.tier?.contractLength);
  const date = end.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `This plan has a ${months}-month minimum term, so renewal can be cancelled from ${date}. Contact the front desk to end it sooner.`;
}

async function currentMembership(context: Context, membershipId: string) {
  return context.db.Membership.findOne({ where: { id: membershipId } });
}

export async function createStripeSetupIntent(
  root: unknown,
  { userId }: { userId: string },
  context: Context
) {
  const actor = await currentRoleActor(context);
  assertUserSessionAccess(actor, userId);
  const organizationId = actor.organizationId;
  const users = await context.sudo().query.User.findMany({
    where: { AND: [{ id: { equals: userId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id stripeCustomerId organization { id }",
  });
  const user = users[0] as any;
  if (!user?.stripeCustomerId || user.organization?.id !== organizationId) throw new Error("User not found or not a Stripe customer");

  const { adapter } = await getAdapter(context, organizationId, "charge");
  const intent = await adapter.createSetupIntent(user.stripeCustomerId);
  if (!intent.clientSecret) throw new Error("Payment provider did not return a setup client secret");
  return { clientSecret: intent.clientSecret, setupIntentId: intent.id };
}

export async function cancelMembership(
  root: unknown,
  { membershipId, reason, idempotencyKey }: { membershipId: string; reason?: string; idempotencyKey: string },
  context: Context
) {
  const { membership, actor } = await getAuthorizedMembership(context, membershipId);
  const organizationId = actor.organizationId;
  const normalizedReason = reason?.trim() || "";
  if (normalizedReason.length > 500) throw new Error("Cancellation reason must be 500 characters or fewer");
  const scope = await adoptPendingMembershipBillingKey(context, billingAttemptScope(organizationId, membershipId, "cancel", idempotencyKey, { reason: normalizedReason }));
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership renewal cancellation already completed" };
  }
  if (["cancelled", "expired"].includes(membership.status)) throw new Error(`Membership is already ${membership.status}`);
  if (!membership.autoRenew) throw new Error("Membership renewal is already cancelled");
  // Staff may waive the term; a member cancelling their own plan is held to it.
  // The minimum term is shown and honoured through the end date (D10), not refused.
  if (!membership.stripeSubscriptionId) throw new Error("Membership has no active Stripe subscription");
  const attempt = await claimMembershipBillingAttempt(context, scope, {
    status: membership.status,
    autoRenew: membership.autoRenew,
    stripeSubscriptionId: membership.stripeSubscriptionId,
  });
  if (attempt.replay) return { membership: await currentMembership(context, membershipId), message: "Membership cancellation already completed" };
  let providerExecutionStarted = false;
  try {
    const { adapter } = await getAdapter(context, organizationId);
    providerExecutionStarted = true;
    // Notice applies (W7.6): the membership ends on the later of the notice date and the term end.
    const endsOn = cancellationEndDate(membership);
    const paidEnd = membership.nextBillingDate ? new Date(membership.nextBillingDate) : null;
    const providerSubscription = await adapter.cancelSubscriptionAtPeriodEnd(
      membership.stripeSubscriptionId,
      attempt.providerIdempotencyKey,
      paidEnd && endsOn.getTime() === paidEnd.getTime() ? null : endsOn,
    );
    const providerPeriodEnd = (providerSubscription as any).cancel_at
      ? new Date((providerSubscription as any).cancel_at * 1000)
      : providerSubscription.current_period_end
        ? new Date(providerSubscription.current_period_end * 1000)
        : endsOn;
    await finishMembershipBillingAttempt(context, attempt, {
      autoRenew: false,
      nextBillingDate: providerPeriodEnd,
      cancelReason: normalizedReason,
      cancelledAt: null,
    });
    return { membership: await currentMembership(context, membershipId), message: `Membership ends on ${providerPeriodEnd.toISOString().slice(0, 10)}; classes can be booked until then` };
  } catch (error) {
    // After the provider call starts, a lost response does not prove failure: keep the attempt
    // pending so the same key reconciles it before any other billing change.
    await failMembershipBillingAttempt(context, attempt, error, providerExecutionStarted ? "unknown" : "definite");
    throw error;
  }
}

/** Ends the membership now. Stripe cancels immediately; no refund is created (refunds stay separate). */
export async function cancelMembershipNow(
  root: unknown,
  { membershipId, reason, idempotencyKey }: { membershipId: string; reason?: string; idempotencyKey: string },
  context: Context
) {
  // Ending a membership today is a front-desk decision (no refund, bookings released); members
  // cancel renewal instead. The dashboard is the only caller; the API enforces the same rule.
  const staff = await currentRoleActor(context);
  if (!staff.canManageAllRecords) throw new Error("Only the front desk can end a membership today. You can cancel renewal so it ends after the paid period.");
  const { membership, actor } = await getAuthorizedMembership(context, membershipId, staff);
  const organizationId = actor.organizationId;
  const normalizedReason = reason?.trim() || "";
  if (normalizedReason.length > 500) throw new Error("Cancellation reason must be 500 characters or fewer");
  const scope = await adoptPendingMembershipBillingKey(context, billingAttemptScope(organizationId, membershipId, "cancel-now", idempotencyKey, { reason: normalizedReason }));
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership cancellation already completed" };
  }
  // A membership already ended (here or by the Stripe webhook) is a no-op: Stripe is not called again.
  if (["cancelled", "expired"].includes(membership.status)) {
    await releaseFutureBookingsForEndedMembership(context.prisma, { organizationId, userId: membership.member.id, actorUserId: actor.userId });
    return { membership: await currentMembership(context, membershipId), message: "Membership is already cancelled" };
  }
  if (!membership.stripeSubscriptionId) throw new Error("Membership has no active Stripe subscription");
  const attempt = await claimMembershipBillingAttempt(context, scope, {
    status: membership.status,
    autoRenew: membership.autoRenew,
    stripeSubscriptionId: membership.stripeSubscriptionId,
  });
  if (attempt.replay) return { membership: await currentMembership(context, membershipId), message: "Membership cancellation already completed" };
  let providerExecutionStarted = false;
  try {
    const { adapter } = await getAdapter(context, organizationId);
    providerExecutionStarted = true;
    const providerSubscription = await adapter.cancelSubscriptionNow(
      membership.stripeSubscriptionId,
      attempt.providerIdempotencyKey,
    );
    if (providerSubscription?.id !== membership.stripeSubscriptionId) throw new Error("The provider returned a different subscription; reconcile it before cancelling");
    if (providerSubscription.status !== "canceled") throw new Error("The provider has not ended this subscription yet; check again before cancelling");
    const endedAt = new Date();
    await finishMembershipBillingAttempt(context, attempt, {
      status: "cancelled",
      autoRenew: false,
      cancelReason: normalizedReason,
      cancelledAt: endedAt,
      freezeStartDate: null,
      freezeEndDate: null,
    }, async (transaction: any) => {
      // The local subscription record follows; the later customer.subscription.deleted event re-applies the same state.
      await transaction.subscription.updateMany({
        where: { organizationId, stripeSubscriptionId: membership.stripeSubscriptionId },
        data: { status: "cancelled", cancelledAt: endedAt, pausedAt: null },
      });
    });
    const released = await releaseFutureBookingsForEndedMembership(context.prisma, {
      organizationId, userId: membership.member.id, actorUserId: actor.userId,
    });
    const bookingNote = released.released
      ? ` ${released.released} upcoming class booking${released.released === 1 ? " was" : "s were"} released.`
      : "";
    return { membership: await currentMembership(context, membershipId), message: `Membership cancelled now.${bookingNote} No refund was issued; refunds are separate.` };
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error, providerExecutionStarted ? "unknown" : "definite");
    throw error;
  }
}

export async function freezeMembership(
  root: unknown,
  { membershipId, endDate, idempotencyKey }: { membershipId: string; endDate: string; idempotencyKey: string },
  context: Context
) {
  const { membership, actor } = await getAuthorizedMembership(context, membershipId);
  const organizationId = actor.organizationId;
  const endsAt = new Date(endDate);
  if (Number.isNaN(endsAt.getTime())) throw new Error("Freeze end date must be in the future");
  const scope = await adoptPendingMembershipBillingKey(context, billingAttemptScope(organizationId, membershipId, "freeze", idempotencyKey, { endDate: endsAt.toISOString() }));
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership freeze already completed" };
  }
  if (membership.status !== "active") throw new Error("Only active memberships can be frozen");
  if (!membership.autoRenew) throw new Error("A membership ending after this paid period cannot be frozen");
  if (!(membership.agreementSnapshot?.freezeAllowed ?? membership.tier?.freezeAllowed)) throw new Error("This membership tier does not allow freezes");
  if (!membership.stripeSubscriptionId) throw new Error("Membership has no active Stripe subscription");
  const startsAt = new Date();
  if (endsAt <= startsAt) throw new Error("Freeze end date must be in the future");
  // D10 freeze rule from the accepted agreement: 7 to 30 days a time, at most N days a year.
  const rule = freezeRule(membership);
  const days = Math.ceil((endsAt.getTime() - startsAt.getTime()) / 86_400_000);
  if (days < rule.minDays || days > rule.maxDays) throw new Error(`A freeze is ${rule.minDays} to ${rule.maxDays} days`);
  const usedThisYear = frozenDaysInLastYear(membership, startsAt);
  if (usedThisYear + days > rule.daysPerYear) throw new Error(`Your plan allows ${rule.daysPerYear} frozen days a year; ${Math.max(rule.daysPerYear - usedThisYear, 0)} are left`);
  const attempt = await claimMembershipBillingAttempt(context, scope, {
    status: membership.status,
    autoRenew: membership.autoRenew,
    stripeSubscriptionId: membership.stripeSubscriptionId,
    tierId: membership.tier.id,
  });
  if (attempt.replay) return { membership: await currentMembership(context, membershipId), message: "Membership freeze already completed" };
  let adapter: Awaited<ReturnType<typeof getAdapter>>["adapter"];
  try {
    ({ adapter } = await getAdapter(context, organizationId));
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error);
    throw error;
  }
  // Once provider execution begins, a transport error is ambiguous: the remote
  // pause may have succeeded even if its response was lost. Preserve the pending
  // freeze fence and require same-key recovery after the lease.
  try {
    await adapter.pauseSubscription(membership.stripeSubscriptionId, endsAt, attempt.providerIdempotencyKey);
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error, "unknown");
    throw error;
  }
  const history = Array.isArray(membership.agreementHistory) ? membership.agreementHistory : [];
  await finishMembershipBillingAttempt(context, attempt, { status: "frozen", freezeStartDate: startsAt, freezeEndDate: endsAt, agreementHistory: [...history, { kind: "freeze", start: startsAt.toISOString(), end: endsAt.toISOString(), at: startsAt.toISOString() }] } as any);
  return { membership: await currentMembership(context, membershipId), message: "Membership frozen immediately" };
}

export async function unfreezeMembership(
  root: unknown,
  { membershipId, idempotencyKey }: { membershipId: string; idempotencyKey: string },
  context: Context
) {
  const { membership, actor } = await getAuthorizedMembership(context, membershipId);
  const organizationId = actor.organizationId;
  const scope = await adoptPendingMembershipBillingKey(context, billingAttemptScope(organizationId, membershipId, "unfreeze", idempotencyKey, {}));
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership resume already completed" };
  }
  if (membership.status !== "frozen") throw new Error("Only frozen memberships can be resumed");
  if (!membership.stripeSubscriptionId) throw new Error("Membership has no active Stripe subscription");
  const attempt = await claimMembershipBillingAttempt(context, scope, {
    status: membership.status,
    stripeSubscriptionId: membership.stripeSubscriptionId,
  });
  if (attempt.replay) return { membership: await currentMembership(context, membershipId), message: "Membership resume already completed" };
  let providerExecutionStarted = false;
  try {
    const { adapter } = await getAdapter(context, organizationId);
    providerExecutionStarted = true;
    const resumed = await adapter.resumeSubscription(membership.stripeSubscriptionId, attempt.providerIdempotencyKey);
    if (resumed?.id !== membership.stripeSubscriptionId) throw new Error("The provider returned a different subscription; reconcile it before resuming");
    // The same provider-state mapping the subscription webhook uses: only an active, unpaused
    // subscription can restore service. A response that is still paused is not a completed resume.
    const providerStatus = mapStripeStatusToMembership(resumed.status, Boolean(resumed.pause_collection));
    if (providerStatus === "frozen") throw new Error("The provider still reports this subscription as paused; check again before resuming");
    let restored = false;
    await finishMembershipBillingAttempt(context, attempt, (current) => {
      // Service returns only within the period a positive paid invoice covers, read under the fence.
      const now = new Date();
      const paidPeriodActive = Boolean(current?.creditPeriodStart && current.creditPeriodEnd &&
        new Date(current.creditPeriodStart) <= now && now < new Date(current.creditPeriodEnd));
      restored = providerStatus === "active" && paidPeriodActive;
      return { status: providerStatus === "active" ? (paidPeriodActive ? "active" : "past-due") : providerStatus, freezeStartDate: null, freezeEndDate: null };
    });
    return {
      membership: await currentMembership(context, membershipId),
      message: restored ? "Membership resumed successfully"
        : providerStatus === "active" || providerStatus === "past-due" ? "Membership resumed; access returns when the next payment succeeds"
        : "The provider reports this subscription as ended, so the membership was not reactivated",
    };
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error, providerExecutionStarted ? "unknown" : "definite");
    throw error;
  }
}

export async function changeMembershipTier(
  root: unknown,
  { membershipId, newTierId, idempotencyKey }: { membershipId: string; newTierId: string; idempotencyKey: string },
  context: Context
) {
  const actor = await currentRoleActor(context);
  if (!actor.canManageAllRecords) throw new Error("Contact the front desk to change membership tiers");
  const { membership, actor: authorizedActor } = await getAuthorizedMembership(context, membershipId, actor);
  const organizationId = authorizedActor.organizationId;
  const scope = await adoptPendingMembershipBillingKey(context, billingAttemptScope(organizationId, membershipId, "tier-change", idempotencyKey, { newTierId }));
  if (await isCompletedMembershipBillingAttempt(context, scope)) {
    return { membership: await currentMembership(context, membershipId), message: "Membership tier change already completed" };
  }
  if (["cancelled", "expired"].includes(membership.status)) throw new Error(`Cannot change a ${membership.status} membership`);
  if (membership.tier?.id === newTierId) throw new Error("Membership is already on this tier");
  if (!membership.autoRenew) throw new Error("A membership ending after this paid period cannot change tiers");
  if (!membership.stripeSubscriptionId) throw new Error("Membership has no active Stripe subscription");
  const settingsRows = await context.sudo().query.StudioSettings.findMany({
    where: { organization: { id: { equals: organizationId } } },
    take: 2,
    query: "currencyCode",
  });
  if (settingsRows.length > 1) throw new Error("Studio currency settings are ambiguous; reconcile them before changing tiers.");
  const contractCurrency = membershipTierChangeCurrency(
    membership.agreementSnapshot,
    membership.organization.defaultCurrency,
    settingsRows[0]?.currencyCode,
  );
  const newTiers = await context.sudo().query.MembershipTier.findMany({ where: { AND: [{ id: { equals: newTierId } }, { organization: { id: { equals: organizationId } } }] }, take: 1, query: "id name classCreditsPerMonth monthlyPrice annualPrice monthlyPriceMinor annualPriceMinor freezeAllowed contractLength guestPasses personalTrainingSessions maxClassBookings stripeMonthlyPriceId stripeAnnualPriceId stripeProductId organization { id }" });
  const newTier = newTiers[0] as any;
  if (!newTier) throw new Error("New membership tier not found");
  const newPriceId = membership.billingCycle === "monthly" ? newTier.stripeMonthlyPriceId : newTier.stripeAnnualPriceId;
  if (!newPriceId) throw new Error("Stripe price not configured for this tier");
  const planAmount = membership.billingCycle === "monthly" ? newTier.monthlyPrice : newTier.annualPrice;
  if (!Number.isFinite(planAmount) || planAmount < 0) throw new Error("Membership tier has an invalid price");
  // Preserve a new checkout's first-paid ledger policy across pre-payment tier changes;
  // legacy agreements remain unmarked and keep their scalar-balance reconciliation.
  const newAgreementSnapshot = snapshotMembershipAgreement(newTier, membership.billingCycle, contractCurrency, {
    initialCreditLedger: membership.agreementSnapshot?.creditLedgerPolicy === "monthly-grant-v1",
    providerPriceId: newPriceId, providerProductId: newTier.stripeProductId || null,
  });
  const attempt = await claimMembershipBillingAttempt(context, scope, {
    status: membership.status,
    autoRenew: membership.autoRenew,
    stripeSubscriptionId: membership.stripeSubscriptionId,
    tierId: membership.tier.id,
  });
  if (attempt.replay) return { membership: await currentMembership(context, membershipId), message: "Membership tier change already completed" };
  let providerExecutionStarted = false;
  try {
    const { adapter } = await getAdapter(context, organizationId, "charge");
    await adapter.validateMembershipPrice({
      priceId: newPriceId,
      productId: newTier.stripeProductId,
      amount: tierAmountMinor(newTier, membership.billingCycle),
      currencyCode: contractCurrency,
      billingCycle: membership.billingCycle === "annual" ? "annual" : "monthly",
      billingPeriod: membership.billingCycle === "annual" ? null : newTier.billingPeriod ?? "month",
    });
    providerExecutionStarted = true;
    await adapter.changeSubscriptionPrice(
      membership.stripeSubscriptionId,
      newPriceId,
      { tierId: newTierId, billingCycle: membership.billingCycle },
      attempt.providerIdempotencyKey,
    );
    await finishMembershipBillingAttempt(context, attempt, {
      tierId: newTierId,
      agreementSnapshot: newAgreementSnapshot,
      agreementHistory: [...(Array.isArray(membership.agreementHistory) ? membership.agreementHistory : []), membership.agreementSnapshot],
    }, async (transaction: any, updatedMembership: any) => {
      const memberUpdate = await transaction.member.updateMany({
        where: { organizationId, userId: membership.member.id },
        data: { membershipTierId: newTierId },
      });
      if (memberUpdate.count !== 1) throw new Error("Membership owner projection changed while finalizing the tier change");
      await applyPlanAllowanceToCurrentGrant(transaction, updatedMembership, new Date());
    });
    return { membership: await currentMembership(context, membershipId), message: "Plan changed. This month's class credits now match the new plan; Stripe adds the prorated difference to the next invoice." };
  } catch (error) {
    await failMembershipBillingAttempt(context, attempt, error, providerExecutionStarted ? "unknown" : "definite");
    throw error;
  }
}

function validateReturnUrl(returnUrl: string) {
  const configuredBaseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!configuredBaseUrl) throw new Error("Application base URL is not configured");

  const requested = new URL(returnUrl, configuredBaseUrl);
  const allowed = new URL(configuredBaseUrl);
  if (requested.origin !== allowed.origin) throw new Error("Billing portal return URL must use the Studio origin");
  return requested.toString();
}

export async function markPaymentRecoveryContacted(
  root: unknown,
  { membershipId }: { membershipId: string },
  context: Context
) {
  const actor = await currentRoleActor(context);
  if (!actor.canManageAllRecords) throw new Error("Payment recovery management permission required");
  const organizationId = actor.organizationId;
  const memberships = await context.sudo().query.Membership.findMany({
    where: { AND: [{ id: { equals: membershipId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id recoveryHistory organization { id }",
  });
  const membership = memberships[0] as any;
  if (!membership) throw new Error("Membership not found");
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  return prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `membership-recovery:${organizationId}:${membershipId}`);
    const current = await tx.membership.findFirst({ where: { id: membershipId, organizationId } });
    if (!current) throw new Error("Membership not found");
    return tx.membership.update({ where: { id: membershipId }, data: {
      recoveryHistory: [...(Array.isArray(current.recoveryHistory) ? current.recoveryHistory : []), { contactedAt: new Date().toISOString(), actorId: actor.userId }],
    } });
  });
}

export async function getStripeBillingPortal(
  root: unknown,
  { userId, returnUrl }: { userId: string; returnUrl: string },
  context: Context
) {
  const actor = await currentRoleActor(context);
  assertUserSessionAccess(actor, userId);
  const organizationId = actor.organizationId;
  const users = await context.sudo().query.User.findMany({
    where: { AND: [{ id: { equals: userId } }, { organization: { id: { equals: organizationId } } }] },
    take: 1,
    query: "id stripeCustomerId organization { id }",
  });
  const user = users[0] as any;
  if (!user?.stripeCustomerId || user.organization?.id !== organizationId) throw new Error("User not found or not a Stripe customer");

  const safeReturnUrl = validateReturnUrl(returnUrl);
  const { adapter } = await getAdapter(context, organizationId);
  return adapter.createBillingPortalSession(user.stripeCustomerId, safeReturnUrl);
}
