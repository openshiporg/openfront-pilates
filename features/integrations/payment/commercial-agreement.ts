import type { BillingCycle } from "./types";

/** Parse decimal USD catalog input exactly. Reject rounding and unsafe values. */
export function decimalToMinor(value: unknown): number {
  const raw = String(value ?? "");
  if (!/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(raw)) throw new Error("Membership prices must use at most two decimal places");
  const [whole, fraction = ""] = raw.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount) || amount > 2147483647) throw new Error("Membership price exceeds supported minor units");
  return amount;
}

export function tierAmountMinor(tier: any, cycle: BillingCycle): number {
  const stored = cycle === "annual" ? tier.annualPriceMinor : tier.monthlyPriceMinor;
  const legacy = decimalToMinor(cycle === "annual" ? tier.annualPrice : tier.monthlyPrice);
  // Null permits a separately reviewed backfill of existing catalogs. Never
  // silently accept drift between compatibility display fields and money truth.
  if (stored == null) return legacy;
  if (!Number.isSafeInteger(stored) || stored < 0 || stored !== legacy) throw new Error("Membership catalog amount requires reconciliation");
  return stored;
}

export function membershipTierChangeCurrency(
  agreementSnapshot: unknown,
  organizationDefaultCurrency: unknown,
  studioSettingsCurrency: unknown,
): "USD" {
  const currency = (value: unknown) => typeof value === "string" ? value.trim().toUpperCase() : "";
  const contractCurrency = currency((agreementSnapshot as any)?.currencyCode);
  const organizationCurrency = currency(organizationDefaultCurrency);
  const settingsCurrency = currency(studioSettingsCurrency);
  if (contractCurrency !== "USD") {
    throw new Error("This membership agreement has no supported USD contract currency; reconcile its commercial evidence before changing tiers.");
  }
  if (organizationCurrency !== contractCurrency || settingsCurrency !== contractCurrency) {
    throw new Error("Currency settings do not match this membership agreement; reconcile Organization and Store Settings before changing tiers.");
  }
  return contractCurrency;
}

export function snapshotMembershipAgreement(
  tier: any,
  billingCycle: BillingCycle,
  currencyCode: string,
  options: { initialCreditLedger?: boolean; providerPriceId?: string | null; providerProductId?: string | null } = {},
) {
  return {
    version: 1, acceptedAt: new Date().toISOString(), tierId: tier.id, tierName: tier.name,
    billingCycle, currencyCode, amount: tierAmountMinor(tier, billingCycle),
    // The exact provider price/product the member accepted; later catalog edits don't change it.
    ...(options.providerPriceId ? { providerPriceId: options.providerPriceId, providerProductId: options.providerProductId || null } : {}),
    monthlyPriceMinor: tierAmountMinor(tier, "monthly"), annualPriceMinor: tierAmountMinor(tier, "annual"),
    classCreditsPerMonth: tier.classCreditsPerMonth,
    ...(options.initialCreditLedger ? { creditLedgerPolicy: "monthly-grant-v1" } : {}),
    freezeAllowed: Boolean(tier.freezeAllowed),
    contractLength: tier.contractLength ?? 0, cancellationPolicy: "paid_period_end",
    guestPasses: tier.guestPasses ?? 0, maxClassBookings: tier.maxClassBookings ?? 0, personalTrainingSessions: tier.personalTrainingSessions ?? 0,
    // D10 rules fixed at joining, so a founding rate and its terms stay while the membership is active.
    billingPeriod: tier.billingPeriod ?? "month", maxBookingsPerDay: tier.maxBookingsPerDay ?? 0, maxBookingsPerMonth: tier.maxBookingsPerMonth ?? 0,
    cancelNoticeDays: tier.cancelNoticeDays ?? 30, freezeMinDays: tier.freezeMinDays ?? 7, freezeMaxDays: tier.freezeMaxDays ?? 30,
    freezeDaysPerYear: tier.freezeDaysPerYear ?? 30, freezeFee: tier.freezeFee ?? 0, advanceBookingDays: tier.advanceBookingDays ?? 14,
    offPeakOnly: Boolean(tier.offPeakOnly), offPeakWindows: tier.offPeakWindows ?? [], rolloverPeriods: tier.rolloverPeriods ?? 0,
  };
}

export type AcceptedProviderPrice = { priceId: string; productId: string | null; amount: number | null; basis: "agreement" | "checkout" | "catalog" };

/**
 * The provider price a membership's accepted agreement bills. Agreements accepted before the
 * price was recorded fall back to the accepting checkout's price, then to the plan's configured
 * price for the accepted cycle; the basis says which, so a mismatch is reported, never trusted.
 */
export function acceptedProviderPrice(agreement: any, fallbacks: { checkoutPriceId?: unknown; checkoutProductId?: unknown; tierPriceId?: unknown }): AcceptedProviderPrice | null {
  const amount = Number.isSafeInteger(agreement?.amount) ? agreement.amount : null;
  const text = (value: unknown) => typeof value === "string" && value ? value : null;
  if (text(agreement?.providerPriceId)) return { priceId: agreement.providerPriceId, productId: text(agreement.providerProductId), amount, basis: "agreement" };
  if (text(fallbacks.checkoutPriceId)) return { priceId: fallbacks.checkoutPriceId as string, productId: text(fallbacks.checkoutProductId), amount, basis: "checkout" };
  if (text(fallbacks.tierPriceId)) return { priceId: fallbacks.tierPriceId as string, productId: null, amount, basis: "catalog" };
  return null;
}

const providerId = (value: any) => typeof value === "string" ? value : value?.id || null;
/** Stripe interval and count for a billed period (D10: weekly, fortnightly, 4-weekly, monthly; or annual). */
export function periodInterval(billingCycle: string, billingPeriod?: string | null): { interval: "week" | "month" | "year"; count: number; days: [number, number] } {
  if (billingCycle === "annual") return { interval: "year", count: 1, days: [364, 367] };
  if (billingPeriod === "week") return { interval: "week", count: 1, days: [6.5, 7.5] };
  if (billingPeriod === "fortnight") return { interval: "week", count: 2, days: [13.5, 14.5] };
  if (billingPeriod === "four_weeks") return { interval: "week", count: 4, days: [27.5, 28.5] };
  return { interval: "month", count: 1, days: [27, 32] };
}

function priceProblem(price: any, quantity: unknown, accepted: AcceptedProviderPrice, billingCycle: string, billingPeriod?: string | null) {
  if (price?.id !== accepted.priceId) return `bills price ${price?.id || "none"} instead of the accepted ${accepted.priceId}`;
  if (accepted.productId && providerId(price?.product) && providerId(price.product) !== accepted.productId) return "bills a different product";
  if ((quantity ?? 1) !== 1) return `bills quantity ${quantity}`;
  if (String(price?.currency || "").toUpperCase() !== "USD") return "bills a currency other than USD";
  const expected = periodInterval(billingCycle, billingPeriod);
  if (price?.recurring && (price.recurring.interval !== expected.interval || (price.recurring.interval_count ?? 1) !== expected.count)) return `bills every ${price.recurring.interval_count ?? 1} ${price.recurring.interval} instead of the accepted ${billingPeriod || billingCycle} period`;
  if (accepted.amount !== null && Number.isSafeInteger(price?.unit_amount) && price.unit_amount !== accepted.amount) return "bills a different amount than the accepted agreement";
  return null;
}

/** Why a provider subscription's items aren't exactly the accepted agreement, or null. */
export function subscriptionItemsProblem(subscription: any, accepted: AcceptedProviderPrice | null, billingCycle: string, billingPeriod?: string | null) {
  if (!accepted) return "no accepted provider price is recorded for this membership";
  const items = subscription?.items?.data || [];
  if (items.length !== 1) return `has ${items.length} billed items instead of one`;
  return priceProblem(items[0].price, items[0].quantity, accepted, billingCycle, billingPeriod);
}

/** Why a paid invoice's service lines don't establish the accepted agreement's period, or null. */
export function invoiceServiceProblem(invoice: any, accepted: AcceptedProviderPrice | null, billingCycle: string, billingPeriod?: string | null) {
  if (!accepted) return "no accepted provider price is recorded for this membership";
  const lines = (invoice?.lines?.data || []).filter((line: any) => line.type === "subscription" && !line.proration);
  if (lines.length !== 1) return `has ${lines.length} recurring service lines instead of one`;
  const line = lines[0];
  const problem = priceProblem(line.price, line.quantity, accepted, billingCycle, billingPeriod);
  if (problem) return problem;
  if (!Number.isSafeInteger(line.amount) || line.amount <= 0) return "has no positive amount for its service line";
  const start = line.period?.start, end = line.period?.end;
  if (!Number.isInteger(start) || !Number.isInteger(end) || end <= start) return "has an invalid service period";
  const days = (end - start) / 86_400;
  const span = periodInterval(billingCycle, billingPeriod).days;
  if (days < span[0] || days > span[1]) return `covers ${Math.round(days)} days, not one ${billingPeriod && billingCycle !== "annual" ? billingPeriod.replace("_", " ") : billingCycle === "annual" ? "year" : "month"}`;
  return null;
}

export function assertCheckoutCorrelation(local: any, session: any, organizationId: string) {
  if (!local || local.organization?.id !== organizationId) throw new Error("Local payment session not found in organization");
  const metadata = session.metadata || {};
  const legacyAttemptKey = `${local.idempotencyKey}:attempt:${local.data?.checkoutAttempt}`;
  if (metadata.paymentSessionKey !== local.idempotencyKey && metadata.paymentSessionKey !== legacyAttemptKey) throw new Error("Checkout attempt does not match local payment session");
  if (local.providerSessionId && local.providerSessionId !== session.id) throw new Error("Provider checkout session does not match local attempt");
  if (local.user?.id !== metadata.userId || local.membershipTier?.id !== metadata.tierId || local.billingCycle !== metadata.billingCycle) throw new Error("Checkout ownership or commercial metadata does not match");
  if (Number(metadata.amount) !== local.amount || String(metadata.currencyCode).toUpperCase() !== local.currencyCode || String(session.currency).toUpperCase() !== local.currencyCode) throw new Error("Checkout amount or currency does not match local agreement");
  // A complete session can still be unpaid for asynchronous collection.
  if (session.status !== "complete" || !["paid", "no_payment_required"].includes(session.payment_status)) throw new Error("Checkout payment is not settled");
}
