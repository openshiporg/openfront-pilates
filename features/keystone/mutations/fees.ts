import type { Context } from ".keystone/types";
import { currentRoleActor } from "../access/currentRoleActor";
import { guardKeystonePrismaResults, withKeystonePrismaTransaction } from "../lib/prisma-result";
import { assessFee, bookingFunding, classPolicy, quoteBookingCancellation, voidFeesForBooking } from "../lib/fees";
import { appendHistory, historyEntry } from "../lib/spots";
import { getAdapterForProvider } from "../utils/paymentProviderAdapter";
import { lockTransactionKey } from "./classCapacity";

/**
 * Fees and Close class (dissertation D5, D11, §4.6, W4, W5). No timer runs anything: a late-cancel
 * fee is charged on the cancel request, no-show fees when staff press Close class. A failed or
 * impossible charge leaves the fee owed, which blocks new bookings until the client pays.
 */

const PROVIDER_CODE = "pp_stripe";

function feeHistory(fee: any, action: string, extra: Record<string, unknown> = {}) {
  return [...((fee.history as any[]) ?? []).slice(-49), { action, at: new Date().toISOString(), ...extra }];
}

/**
 * Charges an assessed fee to the client's saved card, off-session. Without a card, a Stripe key or
 * a provider, the fee is owed (the working default for desk-only studios: the client pays at the desk).
 */
export async function chargeAssessedFee(context: Context, feeId: string) {
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const fee = await prisma.fee.findUnique({ where: { id: feeId }, include: { member: { include: { user: { select: { id: true, stripeCustomerId: true } } } } } });
  if (!fee || fee.status !== "assessed") return fee;
  const customerId = fee.member?.user?.stripeCustomerId || "";
  let outcome: { status: "succeeded" | "failed" | "pending"; paymentIntentId: string | null; failureMessage?: string | null } = { status: "failed", paymentIntentId: null, failureMessage: "No saved card" };
  let providerId: string | null = null;
  if (customerId) {
    try {
      const { adapter, provider } = await getAdapterForProvider(context, PROVIDER_CODE, fee.organizationId, "charge");
      providerId = provider.id;
      if (adapter.chargeSavedPaymentMethod) {
        outcome = await adapter.chargeSavedPaymentMethod({
          customerId, amount: fee.amount, currencyCode: fee.currencyCode,
          description: fee.kind === "no_show" ? "No-show fee" : "Late-cancel fee",
          metadata: { source: "openfront-pilates-fee", organizationId: fee.organizationId, feeId: fee.id },
          idempotencyKey: `fee-charge:${fee.id}`,
        });
      }
    } catch (error) {
      outcome = { status: "failed", paymentIntentId: null, failureMessage: error instanceof Error ? error.message.slice(0, 300) : "Card payments are not set up" };
    }
  }
  return withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `fee:${fee.id}`);
    const current = await tx.fee.findUnique({ where: { id: fee.id } });
    if (current.status !== "assessed") return current;
    if (outcome.status === "succeeded") {
      const payment = await tx.payment.create({ data: {
        organizationId: fee.organizationId, memberId: fee.memberId, paymentProviderId: providerId, amount: fee.amount, currencyCode: fee.currencyCode,
        status: "succeeded", purpose: "fee", method: "stripe", paymentDate: new Date(), stripePaymentIntentId: outcome.paymentIntentId,
        receiptNumber: `FEE-${fee.id.slice(-10)}`, description: fee.kind === "no_show" ? "No-show fee" : "Late-cancel fee", metadata: { feeId: fee.id },
      } });
      return tx.fee.update({ where: { id: fee.id }, data: { status: "charged", paymentId: payment.id, providerPaymentIntentId: outcome.paymentIntentId ?? "", history: feeHistory(current, "charged") } });
    }
    // Pending stays assessed until the provider says (never guessed); a failure is owed.
    if (outcome.status === "pending") return tx.fee.update({ where: { id: fee.id }, data: { providerPaymentIntentId: outcome.paymentIntentId ?? "", history: feeHistory(current, "charge_pending") } });
    return tx.fee.update({ where: { id: fee.id }, data: { status: "owed", providerPaymentIntentId: outcome.paymentIntentId ?? "", failureMessage: (outcome.failureMessage ?? "").slice(0, 500), history: feeHistory(current, "owed", { reason: outcome.failureMessage ?? "" }) } });
  });
}

/** quoteCancellation(bookingId): what cancelling now costs, shown before the client confirms. */
export async function quoteCancellation(_root: unknown, { bookingId }: { bookingId: string }, context: Context) {
  const actor = await currentRoleActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const booking = await prisma.classBooking.findFirst({ where: { id: bookingId, organizationId: actor.organizationId }, include: { member: { select: { userId: true } }, classInstance: { include: { classSchedule: { include: { classType: true } } } } } });
  if (!booking) throw new Error("Booking not found");
  if (booking.member?.userId !== actor.userId && !actor.canManageAllRecords && !actor.canManageCheckIns) throw new Error("Booking not found");
  return quoteBookingCancellation(prisma, booking, new Date(), false);
}

async function feeForActor(context: Context, feeId: string, staffOnly: boolean) {
  const actor = await currentRoleActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const fee = await prisma.fee.findFirst({ where: { id: feeId, organizationId: actor.organizationId }, include: { member: { select: { userId: true } } } });
  if (!fee) throw new Error("Fee not found");
  const own = fee.member?.userId === actor.userId;
  if (staffOnly ? !actor.canManageAllRecords && !actor.canManageCheckIns : !own && !actor.canManageAllRecords && !actor.canManageCheckIns) throw new Error("Fee not found");
  return { actor, prisma, fee };
}

/**
 * payFee: the client pays an owed fee with their saved card (Pay now, A6), or staff record a desk
 * payment for it (terminal, cash, bank transfer).
 */
export async function payFee(_root: unknown, args: { feeId: string; method?: string | null; reference?: string | null }, context: Context) {
  const { actor, fee } = await feeForActor(context, args.feeId, false);
  if (!["owed", "assessed"].includes(fee.status)) {
    if (fee.status === "charged") return fee;
    throw new Error(`This fee is ${fee.status}`);
  }
  const method = String(args.method || "stripe");
  if (method !== "stripe") {
    if (!actor.canManageAllRecords && !actor.canManageCheckIns) throw new Error("Only the front desk can record a desk payment");
    if (!["terminal", "cash", "bank_transfer"].includes(method)) throw new Error("Desk payments are terminal, cash or bank transfer");
    return withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
      await lockTransactionKey(tx, `fee:${fee.id}`);
      const current = await tx.fee.findUnique({ where: { id: fee.id } });
      if (current.status === "charged") return current;
      const payment = await tx.payment.create({ data: {
        organizationId: fee.organizationId, memberId: fee.memberId, amount: fee.amount, currencyCode: fee.currencyCode, status: "succeeded",
        purpose: "fee", method, recordedById: actor.userId, paymentDate: new Date(), receiptNumber: `FEE-${fee.id.slice(-10)}`,
        description: fee.kind === "no_show" ? "No-show fee" : "Late-cancel fee", metadata: { feeId: fee.id, reference: String(args.reference || "").slice(0, 200) },
      } });
      return tx.fee.update({ where: { id: fee.id }, data: { status: "charged", paymentId: payment.id, history: feeHistory(current, "paid_at_desk", { method, by: actor.userId }) } });
    });
  }
  // Card: set the fee back to assessed and charge it now.
  await withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `fee:${fee.id}`);
    const current = await tx.fee.findUnique({ where: { id: fee.id } });
    if (current.status === "owed") await tx.fee.update({ where: { id: fee.id }, data: { status: "assessed", history: feeHistory(current, "retry", { by: actor.userId }) } });
  });
  const result = await chargeAssessedFee(context, fee.id);
  if (result?.status !== "charged") throw new Error(result?.failureMessage ? `The card was not charged: ${result.failureMessage}. Update your card or pay at the front desk.` : "The card was not charged. Update your card or pay at the front desk.");
  return result;
}

/** waiveFee: staff waive an assessed or owed fee; a reason is required. */
export async function waiveFee(_root: unknown, args: { feeId: string; reason: string }, context: Context) {
  const { actor, fee } = await feeForActor(context, args.feeId, true);
  const reason = String(args.reason || "").trim();
  if (reason.length < 3 || reason.length > 500) throw new Error("A reason is required to waive a fee");
  if (!["assessed", "owed"].includes(fee.status)) throw new Error(fee.status === "charged" ? "This fee was charged; refund it instead" : `This fee is ${fee.status}`);
  return withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `fee:${fee.id}`);
    const current = await tx.fee.findUnique({ where: { id: fee.id } });
    if (!["assessed", "owed"].includes(current.status)) return current;
    return tx.fee.update({ where: { id: fee.id }, data: { status: "waived", waivedById: actor.userId, waivedReason: reason, waivedBasis: "staff", history: feeHistory(current, "waived", { by: actor.userId, reason }) } });
  });
}

/** refundFee: a charged fee goes back through the provider (or as a recorded desk refund). */
export async function refundFee(_root: unknown, args: { feeId: string; reason: string }, context: Context) {
  const { actor, fee } = await feeForActor(context, args.feeId, true);
  if (!actor.canManageAllRecords) throw new Error("Refund permission required");
  const reason = String(args.reason || "").trim();
  if (reason.length < 3) throw new Error("A reason is required");
  if (fee.status !== "charged") throw new Error(`This fee is ${fee.status}`);
  const payment = fee.paymentId ? await guardKeystonePrismaResults(context.prisma as any).payment.findUnique({ where: { id: fee.paymentId } }) : null;
  if (payment?.method === "stripe" && payment.stripePaymentIntentId) {
    const { adapter } = await getAdapterForProvider(context, PROVIDER_CODE, fee.organizationId, "reconcile");
    await adapter.refundPayment(payment.stripePaymentIntentId, undefined, `fee-refund:${fee.id}`);
  }
  return withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `fee:${fee.id}`);
    const current = await tx.fee.findUnique({ where: { id: fee.id } });
    if (current.status !== "charged") return current;
    if (payment) await tx.payment.update({ where: { id: payment.id }, data: { status: "refunded", refundAmount: payment.amount, refundedAt: new Date(), refundReason: reason } });
    return tx.fee.update({ where: { id: fee.id }, data: { status: "refunded", refundedAt: new Date(), history: feeHistory(current, "refunded", { by: actor.userId, reason }) } });
  });
}

type PayLineHook = (tx: any, input: { organizationId: string; classInstanceId: string; actorId: string }) => Promise<unknown>;
let writeClassPayLine: PayLineHook | null = null;
let voidClassPayLine: PayLineHook | null = null;
/** Instructor pay (D8) registers how Close class writes and Reopen voids the class's pay line. */
export function registerClassPayLineHooks(write: PayLineHook, voidLine: PayLineHook) { writeClassPayLine = write; voidClassPayLine = voidLine; }

/**
 * Close class (W5.5): every confirmed booking checked in becomes attended, every other one no_show
 * (once). No-show fees are assessed for unlimited members, then charged after commit. The class is
 * marked closed and the instructor's pay line is written. Pressing it twice changes nothing.
 */
export async function closeClass(_root: unknown, { classInstanceId }: { classInstanceId: string }, context: Context) {
  const actor = await currentRoleActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const instance = await prisma.classInstance.findFirst({ where: { id: classInstanceId, organizationId: actor.organizationId }, include: { instructor: { include: { user: { select: { id: true } } } }, classSchedule: { include: { classType: true, instructor: { include: { user: { select: { id: true } } } } } } } });
  if (!instance) throw new Error("Class not found");
  const teacher = instance.instructor ?? instance.classSchedule?.instructor;
  if (!actor.canManageAllRecords && !actor.canManageCheckIns && !(actor.isInstructor && teacher?.user?.id === actor.userId)) throw new Error("Only staff or the class's instructor can close it");
  if (instance.isCancelled) throw new Error("This class was cancelled");
  if (instance.date.getTime() > Date.now()) throw new Error("A class can be closed once it has started");
  const result = await withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `class-instance:${instance.id}`);
    const current = await tx.classInstance.findUnique({ where: { id: instance.id } });
    if (current.closedAt) return { alreadyClosed: true, attended: 0, noShows: 0, feeIds: [] as string[] };
    const policy = await classPolicy(tx, actor.organizationId, instance.classSchedule?.classType ?? null);
    const bookings = await tx.classBooking.findMany({ where: { classInstanceId: instance.id, organizationId: actor.organizationId, status: "confirmed" }, take: 1000 });
    const marks = await tx.attendanceRecord.findMany({ where: { organizationId: actor.organizationId, bookingId: { in: bookings.map((b: any) => b.id) } }, select: { bookingId: true, attended: true } });
    const attendedIds = new Set(marks.filter((m: any) => m.attended).map((m: any) => m.bookingId));
    const feeIds: string[] = [];
    let attended = 0, noShows = 0;
    for (const booking of bookings) {
      await lockTransactionKey(tx, `member:${booking.memberId}`);
      const wasThere = attendedIds.has(booking.id) || Boolean(booking.checkedInAt);
      await tx.classBooking.update({ where: { id: booking.id }, data: { status: wasThere ? "attended" : "no_show", history: appendHistory(booking.history, historyEntry(wasThere ? "attended" : "no_show", { by: actor.userId, closed: true })) } });
      if (wasThere) { attended += 1; continue; }
      noShows += 1;
      // The credit stays spent; an unlimited member pays the no-show fee instead (D5).
      if ((await bookingFunding(tx, booking)) === "unlimited" && policy.noShowFee > 0) {
        const fee = await assessFee(tx, { organizationId: actor.organizationId, memberId: booking.memberId, bookingId: booking.id, kind: "no_show", amount: policy.noShowFee, currencyCode: policy.currencyCode });
        if (fee.status === "assessed") feeIds.push(fee.id);
      }
    }
    await tx.classInstance.update({ where: { id: instance.id }, data: { closedAt: new Date(), closedById: actor.userId } });
    if (writeClassPayLine) await writeClassPayLine(tx, { organizationId: actor.organizationId, classInstanceId: instance.id, actorId: actor.userId });
    return { alreadyClosed: false, attended, noShows, feeIds };
  });
  for (const feeId of result.feeIds) await chargeAssessedFee(context, feeId);
  return { classInstanceId: instance.id, ...result };
}

/**
 * Undo Close class: attended and no-show bookings go back to confirmed, unpaid no-show fees are
 * voided (a charged one is refunded), and the pay line is voided. Refused once payroll locked it.
 */
export async function reopenClass(_root: unknown, { classInstanceId }: { classInstanceId: string }, context: Context) {
  const actor = await currentRoleActor(context);
  if (!actor.canManageAllRecords && !actor.canManageCheckIns) throw new Error("Only staff can reopen a class");
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const instance = await prisma.classInstance.findFirst({ where: { id: classInstanceId, organizationId: actor.organizationId } });
  if (!instance) throw new Error("Class not found");
  const chargedFees = await prisma.fee.findMany({ where: { organizationId: actor.organizationId, kind: "no_show", status: "charged", booking: { classInstanceId: instance.id } }, select: { id: true } });
  const out = await withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `class-instance:${instance.id}`);
    const current = await tx.classInstance.findUnique({ where: { id: instance.id } });
    if (!current.closedAt) return { reopened: false };
    const locked = await tx.payLine?.findFirst?.({ where: { organizationId: actor.organizationId, classInstanceId: instance.id, status: { in: ["locked", "paid"] } }, select: { id: true } });
    if (locked) throw new Error("This class's pay line is in a locked payroll run; it can no longer be reopened");
    const bookings = await tx.classBooking.findMany({ where: { classInstanceId: instance.id, organizationId: actor.organizationId, status: { in: ["attended", "no_show"] } }, take: 1000 });
    for (const booking of bookings) {
      await tx.classBooking.update({ where: { id: booking.id }, data: { status: "confirmed", history: appendHistory(booking.history, historyEntry("reopened", { by: actor.userId, from: booking.status })) } });
      await voidFeesForBooking(tx, actor.organizationId, booking.id, "Class reopened");
    }
    await tx.classInstance.update({ where: { id: instance.id }, data: { closedAt: null, closedById: null } });
    if (voidClassPayLine) await voidClassPayLine(tx, { organizationId: actor.organizationId, classInstanceId: instance.id, actorId: actor.userId });
    return { reopened: true, bookings: bookings.length };
  });
  for (const fee of chargedFees) await refundFee(null, { feeId: fee.id, reason: "Class reopened" }, context).catch(() => undefined);
  return out;
}

export const feeTypeDefs = `
  extend type Query {
    quoteCancellation(bookingId: ID!): JSON!
  }
  extend type Mutation {
    payFee(feeId: ID!, method: String, reference: String): JSON!
    waiveFee(feeId: ID!, reason: String!): JSON!
    refundFee(feeId: ID!, reason: String!): JSON!
    closeClass(classInstanceId: ID!): JSON!
    reopenClass(classInstanceId: ID!): JSON!
  }
`;
