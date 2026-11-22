import crypto from "node:crypto";
import type { Context } from ".keystone/types";
import { currentRoleActor } from "../access/currentRoleActor";
import { guardKeystonePrismaResults, requirePrismaAffectedCount, withKeystonePrismaTransaction } from "../lib/prisma-result";
import { lockActiveOrganization } from "../lib/current-actor";
import { publicAppUrl } from "../lib/internal-origin";
import { adjustGrant, creditSummary, issueGrant } from "../lib/credits";
import { assertSingleMerchantCheckout } from "../../integrations/payment/membership-checkout-core";
import { installedPaymentProviderWhere } from "../lib/stripe-environment-provider";
import { getAdapterForProvider } from "../utils/paymentProviderAdapter";
import { lockTransactionKey } from "./classCapacity";

/**
 * Class packs and intro offers (dissertation D4, D9, W8). Pack checkout copies the drop-in checkout
 * shape: a local PaymentSession, a Stripe Checkout in payment mode, and one idempotent fulfil
 * function shared by the return page and the checkout.session.completed webhook.
 */
export const PACK_SOURCE = "openfront-pilates-pack";
const PROVIDER_CODE = "pp_stripe";
const CHECKOUT_MINUTES = 30;
const DAY = 86_400_000;

export const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();
/** Digits only, without a leading country 1 for 11-digit North American numbers. */
export function normalizePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D+/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/**
 * Intro eligibility (D9): an intro pack is sold once per client, matched on account, normalised
 * email and normalised phone. firstTimersOnly also refuses anyone with any past booking.
 */
export async function assertPackEligible(txIn: any, organizationId: string, member: { id: string; email?: string | null; phone?: string | null; userId?: string | null }, pack: any) {
  const tx = guardKeystonePrismaResults(txIn);
  if (!pack?.isActive) throw new Error("This pack is not on sale");
  if (!pack.introOnly && !pack.firstTimersOnly) return;
  const email = normalizeEmail(member.email);
  const phone = normalizePhone(member.phone);
  const people = await tx.member.findMany({ where: { organizationId }, select: { id: true, email: true, phone: true, user: { select: { email: true, phone: true } } }, take: 20000 });
  const same = people.filter((p: any) => p.id === member.id
    || (email && [normalizeEmail(p.email), normalizeEmail(p.user?.email)].includes(email))
    || (phone && phone.length >= 7 && [normalizePhone(p.phone), normalizePhone(p.user?.phone)].includes(phone)))
    .map((p: any) => p.id);
  if (pack.introOnly) {
    const prior = await tx.creditGrant.findFirst({ where: { organizationId, memberId: { in: same }, source: "intro", status: { not: "revoked" } }, select: { id: true } });
    if (prior) throw new Error("The intro offer is for new clients and has already been used on this account, email or phone number.");
  }
  if (pack.firstTimersOnly) {
    const booked = await tx.classBooking.findFirst({ where: { organizationId, memberId: { in: same }, status: { in: ["confirmed", "attended", "no_show", "late_cancelled"] } }, select: { id: true } });
    if (booked) throw new Error("This offer is for first-time clients only.");
  }
}

/** Grants a bought pack's credits once for its payment (sourceKey). Caller holds the member lock. */
export async function grantPack(tx: any, input: { organizationId: string; memberId: string; pack: any; sourceKey: string; paymentId?: string | null; actorId?: string | null; note?: string }) {
  const now = new Date();
  const activatesLater = input.pack.activatesOn === "first_booking";
  return issueGrant(tx, {
    organizationId: input.organizationId, memberId: input.memberId,
    source: input.pack.introOnly ? "intro" : "pack", sourceKey: input.sourceKey, kind: input.pack.kind,
    quantity: input.pack.quantity, validFrom: now, expiresAt: activatesLater ? null : new Date(now.getTime() + input.pack.validDays * DAY),
    validDays: input.pack.validDays, classPackId: input.pack.id, paymentId: input.paymentId ?? null, actorId: input.actorId ?? null,
    priceSnapshot: { packId: input.pack.id, name: input.pack.name, price: input.pack.price, quantity: input.pack.quantity, validDays: input.pack.validDays },
    note: input.note ?? input.pack.name,
  });
}

function requireSession(context: Context) {
  const session = context.session as any;
  if (!session?.itemId) throw new Error("Sign in to buy a pack");
  const organizationId = session.data?.organization?.id;
  if (!organizationId) throw new Error("Account is not assigned to a studio");
  return { userId: String(session.itemId), organizationId: String(organizationId) };
}

async function packAdapter(context: Context, organizationId: string, purpose: "charge" | "reconcile") {
  const { provider, adapter } = await getAdapterForProvider(context, PROVIDER_CODE, organizationId, purpose);
  if (purpose === "charge" && provider.adapterKey === "stripe") {
    const merchants = await context.sudo().query.PaymentProvider.findMany({
      where: { AND: [{ code: { equals: PROVIDER_CODE } }, { adapterKey: { equals: "stripe" } }, installedPaymentProviderWhere()] },
      take: 2, query: "id providerAccountId organization { id }",
    });
    assertSingleMerchantCheckout(merchants, organizationId);
  }
  if (!adapter.createCounterCheckout || !adapter.retrieveCounterCheckout) throw new Error("Card checkout is not available for this payment provider");
  return { provider, adapter: adapter as typeof adapter & Required<Pick<typeof adapter, "createCounterCheckout" | "retrieveCounterCheckout">> };
}

async function ensureClientProfile(tx: any, organizationId: string, user: any) {
  const existing = await tx.member.findFirst({ where: { organizationId, userId: user.id }, select: { id: true, status: true, email: true, phone: true } });
  if (existing) {
    if (existing.status !== "active") throw new Error("Your studio profile isn't active. Contact the front desk.");
    return existing;
  }
  return tx.member.create({ data: { organizationId, userId: user.id, name: user.name || user.email, email: user.email, phone: user.phone || "", status: "active", joinDate: new Date() }, select: { id: true, status: true, email: true, phone: true } });
}

export async function startPackCheckout(_root: unknown, { classPackId }: { classPackId: string }, context: Context) {
  const { userId, organizationId } = requireSession(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const [user, pack, settings] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, organizationId }, select: { id: true, name: true, email: true, phone: true } }),
    prisma.classPack.findFirst({ where: { id: String(classPackId || ""), organizationId } }),
    prisma.studioSettings.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "asc" }], select: { currencyCode: true } }),
  ]);
  if (!user) throw new Error("Account not found");
  if (!pack || !pack.isActive) throw new Error("This pack is not on sale");
  if (pack.price < 50) throw new Error("This pack is sold at the front desk");
  const currencyCode = String(settings?.currencyCode || "USD").toUpperCase();
  const member = await prisma.member.findFirst({ where: { organizationId, userId }, select: { id: true, email: true, phone: true } });
  await assertPackEligible(prisma, organizationId, member ?? { id: "__new__", email: user.email, phone: user.phone, userId }, pack);
  const open = await prisma.paymentSession.findFirst({ where: { organizationId, userId, billingCycle: "pack", status: "requires_action", expiresAt: { gt: new Date() } }, orderBy: [{ createdAt: "desc" }] });
  if (open?.data?.classPackId === pack.id && open.checkoutUrl) return { id: open.id, checkoutUrl: open.checkoutUrl, amount: open.amount };

  const { provider, adapter } = await packAdapter(context, organizationId, "charge");
  const key = `pack:${organizationId}:${userId}:${pack.id}:${crypto.randomUUID()}`;
  const local = await withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockActiveOrganization(tx, organizationId);
    return tx.paymentSession.create({ data: {
      organizationId, userId, paymentProviderId: provider.id, status: "processing", billingCycle: "pack", amount: pack.price, currencyCode,
      idempotencyKey: key, data: { kind: "pack", classPackId: pack.id, packName: pack.name },
    } });
  });
  try {
    const checkout = await adapter.createCounterCheckout({
      amount: pack.price, currencyCode,
      description: pack.name.slice(0, 200),
      metadata: { source: PACK_SOURCE, organizationId, paymentSessionId: local.id, classPackId: pack.id, userId },
      successUrl: `${publicAppUrl("/order/confirmed?kind=pack")}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: publicAppUrl("/pricing"),
      expiresAt: new Date(Date.now() + CHECKOUT_MINUTES * 60_000 + 60_000),
      idempotencyKey: key,
      customerEmail: user.email || undefined,
    });
    const saved = await prisma.paymentSession.updateMany({ where: { id: local.id, status: "processing" }, data: { status: "requires_action", providerSessionId: checkout.providerSessionId, checkoutUrl: checkout.checkoutUrl, expiresAt: checkout.expiresAt ? new Date(checkout.expiresAt) : null } });
    requirePrismaAffectedCount(saved, 1, "Pack checkout finalization");
    return { id: local.id, checkoutUrl: checkout.checkoutUrl, amount: pack.price };
  } catch (error) {
    await prisma.paymentSession.updateMany({ where: { id: local.id, status: "processing" }, data: { status: "failed", failedAt: new Date(), lastError: error instanceof Error ? error.message.slice(0, 1000) : "Checkout failed" } });
    throw error;
  }
}

/**
 * Grants the pack exactly once for a paid provider session (§10 test 17). Shared by the return page
 * and the webhook; whichever arrives first grants, the other reads.
 */
export async function fulfillPackCheckout(context: Context, organizationId: string, providerSessionId: string, verified?: { session: any; providerId: string }) {
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const local = await prisma.paymentSession.findFirst({ where: { organizationId, providerSessionId, billingCycle: "pack" } });
  if (!local) throw new Error("Pack checkout not found");
  let session = verified?.session;
  let providerId = verified?.providerId;
  if (!session) {
    const { adapter, provider } = await packAdapter(context, organizationId, "reconcile");
    session = await adapter.retrieveCounterCheckout(providerSessionId);
    providerId = provider.id;
  }
  const metadata = session?.metadata || {};
  if (session?.id !== providerSessionId || metadata.source !== PACK_SOURCE || metadata.paymentSessionId !== local.id || metadata.organizationId !== organizationId) throw new Error("Checkout does not belong to this pack");
  if (session.amount_total !== local.amount || String(session.currency).toUpperCase() !== String(local.currencyCode).toUpperCase()) throw new Error("Pack amount does not match the checkout");
  if (session.status === "expired") {
    await prisma.paymentSession.updateMany({ where: { id: local.id, status: { in: ["requires_action", "processing"] } }, data: { status: "expired" } });
    return { state: "expired", grantId: null };
  }
  if (session.status !== "complete" || session.payment_status !== "paid") return { state: "pending", grantId: null };
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "";
  if (!paymentIntentId) throw new Error("Paid checkout has no payment reference");
  return withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `pack-checkout:${local.id}`);
    const current = await tx.paymentSession.findFirst({ where: { id: local.id } });
    if (current.status === "completed" && current.data?.grantId) return { state: "granted", grantId: current.data.grantId as string };
    const user = await tx.user.findFirst({ where: { id: local.userId, organizationId }, select: { id: true, name: true, email: true, phone: true } });
    if (!user) throw new Error("Pack account is missing");
    const member = await ensureClientProfile(tx, organizationId, user);
    await lockTransactionKey(tx, `member:${member.id}`);
    const pack = await tx.classPack.findFirst({ where: { id: local.data?.classPackId, organizationId } });
    if (!pack) throw new Error("Pack is missing");
    let payment = await tx.payment.findFirst({ where: { organizationId, stripePaymentIntentId: paymentIntentId } });
    if (!payment) payment = await tx.payment.create({ data: {
      organizationId, memberId: member.id, paymentProviderId: providerId, paymentSessionId: local.id, amount: local.amount, currencyCode: local.currencyCode, status: "succeeded",
      paymentDate: new Date(), stripePaymentIntentId: paymentIntentId, receiptNumber: `PACK-${providerSessionId.slice(-12)}`,
      description: pack.name, metadata: { kind: pack.introOnly ? "intro" : "pack", purpose: "pack", classPackId: pack.id, providerSessionId },
    } });
    // Eligibility was checked before payment; a paid intro is honoured even if a second checkout
    // raced it, and staff see the duplicate on the payment (refundable from Billing).
    const { grant } = await grantPack(tx, { organizationId, memberId: member.id, pack, sourceKey: `payment:${payment.id}`, paymentId: payment.id });
    await tx.paymentSession.update({ where: { id: local.id }, data: { status: "completed", completedAt: new Date(), data: { ...(local.data || {}), grantId: grant.id, paymentIntentId } } });
    return { state: "granted", grantId: grant.id as string };
  });
}

export async function completePackCheckout(_root: unknown, { providerSessionId }: { providerSessionId: string }, context: Context) {
  const { userId, organizationId } = requireSession(context);
  const id = String(providerSessionId || "").trim();
  if (!/^cs_[A-Za-z0-9_]{1,250}$/.test(id)) throw new Error("Checkout reference is invalid");
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const owned = await prisma.paymentSession.findFirst({ where: { organizationId, userId, providerSessionId: id, billingCycle: "pack" }, select: { id: true } });
  if (!owned) throw new Error("Checkout was not found for this account");
  return fulfillPackCheckout(context, organizationId, id);
}

/** A3: the signed-in client's credits by kind, each grant with its expiry, and the ledger. */
export async function myCredits(_root: unknown, args: { memberId?: string | null }, context: Context) {
  const actor = await currentRoleActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  let memberId = args.memberId || null;
  if (memberId && !actor.canManageAllRecords && !actor.canManageCheckIns) throw new Error("You can only read your own credits");
  if (!memberId) memberId = (await prisma.member.findFirst({ where: { organizationId: actor.organizationId, userId: actor.userId }, select: { id: true } }))?.id ?? null;
  if (!memberId) return { balances: {}, grants: [], ledger: [] };
  const summary = await creditSummary(prisma, actor.organizationId, memberId);
  const ledger = await prisma.creditEntry.findMany({ where: { organizationId: actor.organizationId, memberId }, orderBy: [{ createdAt: "desc" }], take: 100, select: { id: true, kind: true, delta: true, balanceAfter: true, createdAt: true, reason: true, grantId: true, bookingId: true } });
  return { ...summary, ledger };
}

/** Staff add or remove credits on a grant, or issue a comp grant, with a reason (§4.3 adjust). */
export async function adjustCredits(_root: unknown, args: { memberId: string; grantId?: string | null; delta: number; reason: string; kind?: string | null; validDays?: number | null; idempotencyKey: string }, context: Context) {
  const actor = await currentRoleActor(context);
  if (!actor.canManageAllRecords) throw new Error("Credit adjustment permission required");
  const reason = String(args.reason || "").trim();
  if (reason.length < 3 || reason.length > 500) throw new Error("A reason between 3 and 500 characters is required");
  const key = String(args.idempotencyKey || "").trim();
  if (key.length < 8 || key.length > 200) throw new Error("A request key is required");
  return withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    const member = await tx.member.findFirst({ where: { id: args.memberId, organizationId: actor.organizationId }, select: { id: true } });
    if (!member) throw new Error("Client not found");
    await lockTransactionKey(tx, `member:${member.id}`);
    if (args.grantId) {
      const replay = await tx.creditEntry.findFirst({ where: { organizationId: actor.organizationId, eventKey: `adjust:${key}` } });
      if (replay) return { grantId: replay.grantId, balance: replay.balanceAfter, replayed: true };
      const grant = await adjustGrant(tx, { organizationId: actor.organizationId, grantId: args.grantId, delta: args.delta, reason, actorId: actor.userId, eventKey: `adjust:${key}` });
      return { grantId: grant.id, balance: grant.remaining, replayed: false };
    }
    // No grant: a comp grant of `delta` credits.
    if (!Number.isInteger(args.delta) || args.delta < 1 || args.delta > 500) throw new Error("A comp grant needs 1 to 500 credits");
    const kind = ["group", "private", "duet"].includes(String(args.kind)) ? String(args.kind) : "group";
    const days = Number.isInteger(args.validDays) && (args.validDays as number) > 0 ? (args.validDays as number) : 60;
    const now = new Date();
    const { grant, created } = await issueGrant(tx, { organizationId: actor.organizationId, memberId: member.id, source: "comp", sourceKey: `comp:${key}`, kind: kind as any, quantity: args.delta, validFrom: now, expiresAt: new Date(now.getTime() + days * DAY), validDays: days, note: reason, actorId: actor.userId });
    return { grantId: grant.id, balance: grant.remaining, replayed: !created };
  });
}

export const packTypeDefs = `
  type PackCheckoutResult { id: ID!, checkoutUrl: String!, amount: Int! }
  type PackCompletionResult { state: String!, grantId: ID }
  extend type Query {
    myCredits(memberId: ID): JSON!
  }
  extend type Mutation {
    startPackCheckout(classPackId: ID!): PackCheckoutResult!
    completePackCheckout(providerSessionId: String!): PackCompletionResult!
    adjustCredits(memberId: ID!, grantId: ID, delta: Int!, reason: String!, kind: String, validDays: Int, idempotencyKey: String!): JSON!
  }
`;
