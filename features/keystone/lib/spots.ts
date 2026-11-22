import { guardKeystonePrismaResults } from "./prisma-result";

/**
 * Machines and capacity for one class (dissertation D3, §4.2). Every function here runs inside
 * the caller's transaction while it holds the class lock (`class-instance:<id>`), so the
 * free-spot decision and the booking write cannot interleave with another booking.
 */

export type CapacityMode = "pick_a_spot" | "first_come";

export function classCapacityMode(instance: any): CapacityMode {
  const mode = instance?.classSchedule?.classType?.capacityMode;
  return mode === "first_come" ? "first_come" : "pick_a_spot";
}

/** The room the class uses: its own, else its template's. */
export function classRoomId(instance: any): string | null {
  return instance?.resourceId ?? instance?.resource?.id ?? instance?.classSchedule?.resourceId ?? instance?.classSchedule?.resource?.id ?? null;
}

export function spotInService(spot: any, at: Date) {
  if (!spot || spot.retiredAt || !spot.isBookable) return false;
  const from = spot.outOfServiceFrom ? new Date(spot.outOfServiceFrom) : null;
  const until = spot.outOfServiceUntil ? new Date(spot.outOfServiceUntil) : null;
  if (from && from <= at && (!until || until > at)) return false;
  return true;
}

/** Bookable, in-service spots of the class's room at the class start, in number order. */
export async function bookableSpots(tx: any, instance: any) {
  tx = guardKeystonePrismaResults(tx);
  const roomId = classRoomId(instance);
  if (!roomId) return [];
  const spots = await tx.spot.findMany({ where: { roomId, organizationId: instance.organizationId, retiredAt: null }, orderBy: [{ number: "asc" }, { id: "asc" }], take: 500 });
  const at = new Date(instance.date);
  return spots.filter((spot: any) => spotInService(spot, at));
}

/** Booking ids by spot id for the class's active (confirmed) bookings. */
export async function takenSpots(tx: any, instance: any) {
  tx = guardKeystonePrismaResults(tx);
  const rows = await tx.classBooking.findMany({ where: { classInstanceId: instance.id, organizationId: instance.organizationId, status: "confirmed" }, select: { id: true, spotId: true }, take: 1000 });
  const taken = new Map<string, string>();
  for (const row of rows) if (row.spotId) taken.set(row.spotId, row.id);
  return { taken, confirmed: rows.length };
}

/**
 * Capacity of a class. Pick a spot: the bookable in-service spots (bounded by a lower explicit
 * class capacity, if staff set one). First come: the declared capacity, bounded by the room.
 */
export async function classCapacity(tx: any, instance: any, declared: number) {
  if (classCapacityMode(instance) === "first_come") return { mode: "first_come" as const, capacity: declared, spots: [] as any[] };
  const spots = await bookableSpots(tx, instance);
  const explicit = instance?.maxCapacity;
  const capacity = Number.isInteger(explicit) && explicit > 0 ? Math.min(explicit, spots.length) : spots.length;
  return { mode: "pick_a_spot" as const, capacity, spots };
}

/**
 * Chooses the spot for a new confirmed booking: the requested one if it is bookable and free,
 * otherwise (no request) the lowest-numbered free spot. A requested spot that is taken is a
 * clear refusal; the client keeps the choice of another.
 */
export function chooseSpot(spots: any[], taken: Map<string, string>, requestedSpotId?: string | null) {
  if (requestedSpotId) {
    const spot = spots.find((candidate) => candidate.id === requestedSpotId);
    if (!spot) throw new Error("That machine is not available for this class. Choose another.");
    if (taken.has(spot.id)) throw new Error(`${spot.label} was just taken. Choose another machine.`);
    return spot;
  }
  return spots.find((candidate) => !taken.has(candidate.id)) ?? null;
}

export function historyEntry(action: string, extra: Record<string, unknown> = {}) {
  return { action, at: new Date().toISOString(), ...extra };
}

export function appendHistory(previous: unknown, entry: Record<string, unknown>) {
  const list = Array.isArray(previous) ? previous : [];
  return [...list.slice(-99), entry];
}

/** Waitlist promotion stops this many minutes before class (StudioSettings.waitlistCutoffMinutes). */
export async function waitlistCutoffMinutes(tx: any, organizationId: string) {
  tx = guardKeystonePrismaResults(tx);
  const settings = await tx.studioSettings.findFirst({ where: { organizationId }, orderBy: [{ createdAt: "asc" }], select: { waitlistCutoffMinutes: true } });
  const minutes = Number(settings?.waitlistCutoffMinutes ?? 120);
  return Number.isInteger(minutes) && minutes >= 0 ? minutes : 120;
}

export function insideWaitlistCutoff(classStart: Date, now: Date, cutoffMinutes: number) {
  return classStart.getTime() - now.getTime() < cutoffMinutes * 60_000;
}
