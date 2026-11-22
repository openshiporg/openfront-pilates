import { guardKeystonePrismaResults } from "./prisma-result";

/**
 * Cancellation policy and fees (dissertation D5, §4.6). The policy is the studio's settings with
 * the class type's overrides on top. A pack or limited-membership client who cancels late loses
 * the credit; an unlimited member is charged the fee instead. The waiver allowance waives the first
 * late cancel in 30 days for an unlimited member.
 */

export type Policy = { windowHours: number; lateCancelFee: number; noShowFee: number; waiversPer30Days: number; currencyCode: string };

export async function classPolicy(txIn: any, organizationId: string, classType: any | null): Promise<Policy> {
  const tx = guardKeystonePrismaResults(txIn);
  const settings = await tx.studioSettings.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "asc" }], select: { lateCancelHours: true, lateCancelFee: true, noShowFee: true, lateCancelWaiversPer30Days: true, currencyCode: true } });
  const pick = (override: unknown, fallback: unknown, def: number) => (Number.isInteger(override) ? (override as number) : Number.isInteger(fallback) ? (fallback as number) : def);
  return {
    windowHours: Math.min(pick(classType?.cancelWindowHoursOverride, settings?.lateCancelHours, 12), 72),
    lateCancelFee: pick(classType?.lateCancelFeeOverride, settings?.lateCancelFee, 1500),
    noShowFee: pick(classType?.noShowFeeOverride, settings?.noShowFee, 2000),
    waiversPer30Days: pick(null, settings?.lateCancelWaiversPer30Days, 1),
    currencyCode: String(settings?.currencyCode || "USD").toUpperCase(),
  };
}

/** How the booking was paid: "unlimited", "credit" (pack or limited membership) or "drop_in". */
export async function bookingFunding(txIn: any, booking: any): Promise<"unlimited" | "credit" | "drop_in" | "none"> {
  const tx = guardKeystonePrismaResults(txIn);
  if (booking?.serviceSnapshot?.credit?.basis === "drop_in_paid") return "drop_in";
  const debit = await tx.creditEntry.findFirst({ where: { organizationId: booking.organizationId, eventKey: `${booking.id}:debit` }, include: { grant: { select: { quantity: true } } } });
  if (!debit) return "none";
  return debit.grant?.quantity === -1 ? "unlimited" : "credit";
}

/** Waivers already used: late-cancel fees in the 30 days before `at` that the allowance waived or that were assessed. */
export async function waiverAllowanceLeft(txIn: any, organizationId: string, memberId: string, policy: Policy, at: Date) {
  const tx = guardKeystonePrismaResults(txIn);
  if (policy.waiversPer30Days <= 0) return 0;
  const since = new Date(at.getTime() - 30 * 86_400_000);
  const used = await tx.fee.count({ where: { organizationId, memberId, kind: "late_cancel", createdAt: { gte: since }, status: { not: "void" } } });
  return Math.max(policy.waiversPer30Days - used, 0);
}

export type Quote = { late: boolean; windowHours: number; consequence: "free" | "credit_kept" | "fee" | "fee_waived" | "drop_in_kept" | "waitlist_free"; feeAmount: number; currencyCode: string; message: string };

/** What cancelling this booking now costs (quoteCancellation, W4.2). */
export async function quoteBookingCancellation(txIn: any, booking: any, now = new Date(), actorIsStaff = false): Promise<Quote> {
  const tx = guardKeystonePrismaResults(txIn);
  const instance = booking.classInstance;
  const classType = instance?.classSchedule?.classType ?? null;
  const policy = await classPolicy(tx, booking.organizationId, classType);
  const money = (cents: number) => `${policy.currencyCode === "USD" ? "$" : ""}${(cents / 100).toFixed(2)}${policy.currencyCode === "USD" ? "" : ` ${policy.currencyCode}`}`;
  if (booking.status === "waitlisted") return { late: false, windowHours: policy.windowHours, consequence: "waitlist_free", feeAmount: 0, currencyCode: policy.currencyCode, message: "Leaving the waitlist is free." };
  const start = new Date(instance.date);
  const late = !actorIsStaff && policy.windowHours > 0 && start.getTime() - now.getTime() < policy.windowHours * 3_600_000;
  if (!late) return { late: false, windowHours: policy.windowHours, consequence: "free", feeAmount: 0, currencyCode: policy.currencyCode, message: "Free to cancel: your credit or payment comes back." };
  const funding = await bookingFunding(tx, booking);
  if (funding === "drop_in") return { late: true, windowHours: policy.windowHours, consequence: "drop_in_kept", feeAmount: 0, currencyCode: policy.currencyCode, message: `Inside ${policy.windowHours} hours of class: your drop-in payment isn't refunded.` };
  if (funding === "unlimited") {
    const left = await waiverAllowanceLeft(tx, booking.organizationId, booking.memberId, policy, now);
    if (left > 0 || policy.lateCancelFee === 0) return { late: true, windowHours: policy.windowHours, consequence: "fee_waived", feeAmount: 0, currencyCode: policy.currencyCode, message: `Inside ${policy.windowHours} hours of class. Your first late cancel in 30 days is free; the next costs ${money(policy.lateCancelFee)}.` };
    return { late: true, windowHours: policy.windowHours, consequence: "fee", feeAmount: policy.lateCancelFee, currencyCode: policy.currencyCode, message: `Inside ${policy.windowHours} hours of class: a ${money(policy.lateCancelFee)} late-cancel fee is charged to your saved card.` };
  }
  return { late: true, windowHours: policy.windowHours, consequence: "credit_kept", feeAmount: 0, currencyCode: policy.currencyCode, message: `Inside ${policy.windowHours} hours of class: the class credit isn't returned.` };
}

/**
 * Writes the fee for a late cancel or no-show, once per booking and kind. Caller holds the class
 * and member locks. Returns the fee (status `assessed` or `waived`); charging happens after commit.
 */
export async function assessFee(txIn: any, input: { organizationId: string; memberId: string; bookingId?: string | null; appointmentId?: string | null; kind: "late_cancel" | "no_show"; amount: number; currencyCode: string; waivedBasis?: string | null; note?: string }) {
  const tx = guardKeystonePrismaResults(txIn);
  const feeKey = `${input.kind}:${input.bookingId ?? input.appointmentId}`;
  const existing = await tx.fee.findFirst({ where: { organizationId: input.organizationId, feeKey } });
  if (existing) {
    if (existing.status !== "void") return existing;
    // A fee voided by an undo is assessed again if the booking lands in the same state again.
    return tx.fee.update({ where: { id: existing.id }, data: { status: input.waivedBasis ? "waived" : "assessed", amount: input.amount, waivedBasis: input.waivedBasis ?? "", history: [...((existing.history as any[]) ?? []), { action: "reassessed", at: new Date().toISOString() }] } });
  }
  return tx.fee.create({ data: {
    organizationId: input.organizationId, memberId: input.memberId, bookingId: input.bookingId ?? null, appointmentId: input.appointmentId ?? null,
    feeKey, kind: input.kind, amount: input.amount, currencyCode: input.currencyCode,
    status: input.waivedBasis ? "waived" : input.amount > 0 ? "assessed" : "waived", waivedBasis: input.waivedBasis ?? (input.amount > 0 ? "" : "zero"),
    waivedReason: input.waivedBasis === "allowance" ? "First late cancel in 30 days" : "",
    history: [{ action: "assessed", at: new Date().toISOString(), note: input.note ?? "" }],
  } });
}

export async function voidFeesForBooking(txIn: any, organizationId: string, bookingId: string, note: string) {
  const tx = guardKeystonePrismaResults(txIn);
  const fees = await tx.fee.findMany({ where: { organizationId, bookingId, status: { in: ["assessed", "owed", "waived"] } } });
  for (const fee of fees) await tx.fee.update({ where: { id: fee.id }, data: { status: "void", history: [...((fee.history as any[]) ?? []), { action: "void", at: new Date().toISOString(), note }] } });
  return fees.length;
}
