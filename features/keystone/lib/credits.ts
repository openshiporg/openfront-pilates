import { guardKeystonePrismaResults } from "./prisma-result";

/**
 * The one credit ledger (dissertation D4, §4.3). Sources: membership_period, pack, intro, comp,
 * import. Kinds: group, private, duet. A grant's balance is `remaining` (-1 = unlimited); every
 * change writes a CreditEntry, and the database refuses a negative balance. Expiry is read from
 * expiresAt; nothing expires on a timer. All writers run inside the caller's member-locked
 * transaction (`member:<memberId>`).
 */

export type CreditKind = "group" | "private" | "duet";

const DAY = 86_400_000;

export function grantUsableAt(grant: any, at: Date, now = new Date()) {
  if (!grant || grant.status !== "active") return false;
  if (grant.remaining === 0) return false;
  if (new Date(grant.validFrom) > at) return false;
  // A pack that activates on first booking has no expiry yet: it would run validDays from now.
  const expires = grant.expiresAt ? new Date(grant.expiresAt) : new Date(now.getTime() + Number(grant.validDays || 0) * DAY);
  // The class must happen before the credit expires, and the credit must not have expired already.
  return expires > at && expires > now;
}

/** Soonest-expiring first; unlimited membership periods last among equals (they cost nothing to keep). */
export function orderForSpending(grants: any[], now = new Date()) {
  const expiry = (grant: any) => (grant.expiresAt ? new Date(grant.expiresAt).getTime() : now.getTime() + Number(grant.validDays || 0) * DAY);
  return [...grants].sort((a, b) => expiry(a) - expiry(b) || (a.remaining === -1 ? 1 : 0) - (b.remaining === -1 ? 1 : 0) || String(a.id).localeCompare(String(b.id)));
}

export async function usableGrants(tx: any, organizationId: string, memberId: string, kind: CreditKind, at: Date, options: { locationId?: string | null } = {}) {
  tx = guardKeystonePrismaResults(tx);
  const now = new Date();
  const rows = await tx.creditGrant.findMany({
    where: { organizationId, memberId, kind, status: "active", remaining: { not: 0 }, validFrom: { lte: at }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    include: { classPack: { select: { locations: { select: { id: true } } } } },
    take: 200,
  });
  const usable = rows.filter((grant: any) => {
    if (!grantUsableAt(grant, at, now)) return false;
    const locations = grant.classPack?.locations ?? [];
    return !options.locationId || !locations.length || locations.some((location: any) => location.id === options.locationId);
  });
  return orderForSpending(usable, now);
}

async function writeEntry(tx: any, grant: any, data: { eventKey: string; kind: string; delta: number; balanceAfter: number; bookingId?: string | null; appointmentId?: string | null; actorId?: string | null; reason?: string | null }) {
  return tx.creditEntry.create({ data: {
    organizationId: grant.organizationId, memberId: grant.memberId, grantId: grant.id,
    eventKey: data.eventKey, kind: data.kind, delta: data.delta, balanceAfter: data.balanceAfter,
    bookingId: data.bookingId ?? null, appointmentId: data.appointmentId ?? null, actorId: data.actorId ?? null, reason: (data.reason ?? "").slice(0, 1000),
  } });
}

/** Creates a grant once per sourceKey and writes its grant entry. Returns the existing grant on replay. */
export async function issueGrant(tx: any, input: {
  organizationId: string; memberId: string; source: string; sourceKey: string; kind: CreditKind; quantity: number;
  validFrom: Date; expiresAt: Date | null; validDays?: number | null; classPackId?: string | null; membershipId?: string | null; paymentId?: string | null;
  priceSnapshot?: Record<string, unknown>; note?: string; actorId?: string | null;
}) {
  tx = guardKeystonePrismaResults(tx);
  const existing = await tx.creditGrant.findFirst({ where: { organizationId: input.organizationId, sourceKey: input.sourceKey } });
  if (existing) return { grant: existing, created: false };
  if (!Number.isInteger(input.quantity) || input.quantity < -1 || input.quantity === 0) throw new Error("A credit grant needs a positive quantity or unlimited");
  const grant = await tx.creditGrant.create({ data: {
    organizationId: input.organizationId, memberId: input.memberId, source: input.source, sourceKey: input.sourceKey, kind: input.kind,
    quantity: input.quantity, remaining: input.quantity, validFrom: input.validFrom, expiresAt: input.expiresAt, validDays: input.validDays ?? null,
    classPackId: input.classPackId ?? null, membershipId: input.membershipId ?? null, paymentId: input.paymentId ?? null,
    priceSnapshot: input.priceSnapshot ?? {}, note: (input.note ?? "").slice(0, 500), status: "active",
  } });
  await writeEntry(tx, grant, { eventKey: `${grant.id}:grant`, kind: "grant", delta: input.quantity === -1 ? 0 : input.quantity, balanceAfter: input.quantity, actorId: input.actorId });
  return { grant, created: true };
}

/**
 * Spends one credit of `kind` for a booking or appointment (soonest expiry first). Unlimited grants
 * write a zero debit so caps can be counted. Idempotent on the event key.
 */
export async function spendCredit(tx: any, input: { organizationId: string; memberId: string; kind: CreditKind; at: Date; eventKey: string; bookingId?: string | null; appointmentId?: string | null; locationId?: string | null; preferGrantIds?: string[] }) {
  tx = guardKeystonePrismaResults(tx);
  const replay = await tx.creditEntry.findFirst({ where: { organizationId: input.organizationId, eventKey: input.eventKey } });
  if (replay) return tx.creditGrant.findUnique({ where: { id: replay.grantId } });
  let grants = await usableGrants(tx, input.organizationId, input.memberId, input.kind, input.at, { locationId: input.locationId });
  if (input.preferGrantIds?.length) grants = [...grants.filter((g: any) => input.preferGrantIds!.includes(g.id)), ...grants.filter((g: any) => !input.preferGrantIds!.includes(g.id))];
  const grant = grants[0];
  if (!grant) throw new Error(input.kind === "group" ? "No class credits remaining" : `No ${input.kind} credits remaining`);
  const now = new Date();
  const activation = !grant.expiresAt ? { expiresAt: new Date(now.getTime() + Number(grant.validDays || 0) * DAY) } : {};
  let updated = grant;
  if (grant.remaining === -1) {
    if (Object.keys(activation).length) updated = await tx.creditGrant.update({ where: { id: grant.id }, data: activation });
  } else {
    const result = await tx.creditGrant.updateMany({ where: { id: grant.id, remaining: { gte: 1 } }, data: { remaining: { decrement: 1 }, ...activation } });
    if (result.count !== 1) throw new Error("No class credits remaining");
    updated = await tx.creditGrant.findUnique({ where: { id: grant.id } });
  }
  await writeEntry(tx, updated, { eventKey: input.eventKey, kind: "debit", delta: grant.remaining === -1 ? 0 : -1, balanceAfter: updated.remaining, bookingId: input.bookingId, appointmentId: input.appointmentId });
  return updated;
}

/** Restores the credit a debit took, to the same grant with its original expiry. Idempotent. */
export async function restoreCredit(tx: any, organizationId: string, debitEventKey: string, restoreEventKey: string) {
  tx = guardKeystonePrismaResults(tx);
  const debit = await tx.creditEntry.findFirst({ where: { organizationId, eventKey: debitEventKey, kind: "debit" } });
  if (!debit) return false;
  if (await tx.creditEntry.findFirst({ where: { organizationId, eventKey: restoreEventKey } })) return false;
  const grant = await tx.creditGrant.findUnique({ where: { id: debit.grantId } });
  if (!grant) throw new Error("Credit source grant is missing");
  const restores = debit.delta < 0 && grant.remaining !== -1 && grant.status === "active";
  const updated = restores ? await tx.creditGrant.update({ where: { id: grant.id }, data: { remaining: Math.min(grant.quantity, grant.remaining - debit.delta) } }) : grant;
  await writeEntry(tx, updated, { eventKey: restoreEventKey, kind: "restore", delta: restores ? -debit.delta : 0, balanceAfter: updated.remaining, bookingId: debit.bookingId, appointmentId: debit.appointmentId });
  return restores;
}

/** Staff adjustment with a reason (§4.3 `adjust`). Positive adds, negative removes. */
export async function adjustGrant(tx: any, input: { organizationId: string; grantId: string; delta: number; reason: string; actorId: string; eventKey: string }) {
  tx = guardKeystonePrismaResults(tx);
  const grant = await tx.creditGrant.findFirst({ where: { id: input.grantId, organizationId: input.organizationId } });
  if (!grant) throw new Error("Credit grant not found");
  if (grant.remaining === -1) throw new Error("An unlimited grant cannot be adjusted");
  if (!Number.isInteger(input.delta) || input.delta === 0 || Math.abs(input.delta) > 500) throw new Error("Adjustment must be a whole number from -500 to 500, not 0");
  if (grant.remaining + input.delta < 0) throw new Error(`Only ${grant.remaining} credits are left on this grant`);
  const updated = await tx.creditGrant.update({ where: { id: grant.id }, data: { remaining: grant.remaining + input.delta, quantity: Math.max(grant.quantity, grant.remaining + input.delta) } });
  await writeEntry(tx, updated, { eventKey: input.eventKey, kind: "adjust", delta: input.delta, balanceAfter: updated.remaining, actorId: input.actorId, reason: input.reason });
  return updated;
}

/** Credits by kind with each grant's expiry, computed on read (A3, myCredits). */
export async function creditSummary(tx: any, organizationId: string, memberId: string) {
  tx = guardKeystonePrismaResults(tx);
  const now = new Date();
  const grants = await tx.creditGrant.findMany({ where: { organizationId, memberId }, include: { classPack: { select: { name: true } }, membership: { select: { tier: { select: { name: true } } } } }, orderBy: [{ validFrom: "desc" }], take: 200 });
  const rows = grants.map((grant: any) => {
    const expires = grant.expiresAt ? new Date(grant.expiresAt) : null;
    const expired = Boolean(expires && expires <= now);
    const state = grant.status !== "active" ? grant.status : expired ? "expired" : grant.remaining === 0 ? "exhausted" : "active";
    return {
      id: grant.id, source: grant.source, kind: grant.kind, quantity: grant.quantity, remaining: grant.remaining,
      validFrom: grant.validFrom, expiresAt: grant.expiresAt, activatesOnFirstBooking: !grant.expiresAt, state,
      name: grant.classPack?.name || grant.membership?.tier?.name || grant.note || grant.source,
    };
  });
  const balances: Record<string, { remaining: number; unlimited: boolean; nextExpiry: string | null }> = {};
  for (const kind of ["group", "private", "duet"]) {
    const active = orderForSpending(grants.filter((g: any) => g.kind === kind && grantUsableAt(g, now, now)), now);
    balances[kind] = {
      remaining: active.reduce((sum: number, g: any) => sum + (g.remaining === -1 ? 0 : g.remaining), 0),
      unlimited: active.some((g: any) => g.remaining === -1),
      nextExpiry: active[0]?.expiresAt ? new Date(active[0].expiresAt).toISOString() : null,
    };
  }
  return { balances, grants: rows };
}
