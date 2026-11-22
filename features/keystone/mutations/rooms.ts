import { currentRoleActor } from "../access/currentRoleActor";
import { guardKeystonePrismaResults } from "../lib/prisma-result";
import { lockParticipationPolicy } from "../lib/operational-policy";
import { appendHistory, bookableSpots, classCapacity, classCapacityMode, classRoomId, historyEntry, spotInService, takenSpots } from "../lib/spots";
import { APPARATUS } from "../models/Spot";
import { createCapacityControlledBooking, effectiveSessionCapacity, fillReleasedSeats, lockTransactionKey } from "./classCapacity";
import { cancelCapacityControlledBooking } from "./studioLifecycle";

/**
 * Rooms, machines and the room map (dissertation D3, §4.2, §5.2). Layout writes take the room lock;
 * booking writes take the class lock; a spot change in a class takes the class lock too.
 */

const INSTANCE_INCLUDE = {
  resource: { select: { id: true, name: true, layout: true, isActive: true, capacity: true } },
  location: { select: { id: true, name: true } },
  classSchedule: { select: { id: true, name: true, maxCapacity: true, resourceId: true, startTime: true, endTime: true, isActive: true, resource: { select: { id: true, name: true, layout: true, isActive: true, capacity: true } }, classType: { select: { id: true, name: true, capacityMode: true, apparatus: true } } } },
} as const;

/** Room map and spot states for one class. A visitor sees which spots are taken, never who (§5.8). */
export async function classAvailability(_root: unknown, args: { classInstanceId: string }, context: any) {
  const prisma = guardKeystonePrismaResults(context.prisma);
  const session = context.session as any;
  let organizationId: string | null = session?.data?.organization?.id ?? null;
  if (!organizationId) {
    const { configuredStorefrontOrganization } = await import("../queries/publicStudio");
    organizationId = (await configuredStorefrontOrganization(context))?.id ?? null;
  }
  if (!organizationId) throw new Error("Class not found");
  const instance = await prisma.classInstance.findFirst({ where: { id: args.classInstanceId, organizationId }, include: INSTANCE_INCLUDE });
  if (!instance) throw new Error("Class not found");
  const room = instance.resource ?? instance.classSchedule?.resource ?? null;
  const { mode, capacity, spots } = await classCapacity(prisma, instance, effectiveSessionCapacity(instance));
  const { taken, confirmed } = await takenSpots(prisma, instance);
  const waitlistCount = await prisma.classBooking.count({ where: { classInstanceId: instance.id, organizationId, status: "waitlisted" } });
  const allSpots = room ? await prisma.spot.findMany({ where: { roomId: room.id, organizationId, retiredAt: null }, orderBy: [{ number: "asc" }], take: 500 }) : [];
  const bookable = new Set(spots.map((spot: any) => spot.id));
  // The signed-in client may see which spot is theirs; nobody sees anyone else's name here.
  let mine: { bookingId: string; spotId: string | null; status: string; waitlistPosition: number | null } | null = null;
  if (session?.itemId) {
    const member = await prisma.member.findFirst({ where: { organizationId, userId: session.itemId }, select: { id: true } });
    if (member) {
      const own = await prisma.classBooking.findFirst({ where: { classInstanceId: instance.id, organizationId, memberId: member.id, status: { in: ["confirmed", "waitlisted"] } }, select: { id: true, spotId: true, status: true, waitlistPosition: true } });
      if (own) mine = { bookingId: own.id, spotId: own.spotId, status: own.status, waitlistPosition: own.waitlistPosition };
    }
  }
  const started = instance.date.getTime() <= Date.now();
  const open = !instance.isCancelled && !started && instance.classSchedule?.isActive !== false;
  return {
    classInstanceId: instance.id,
    startsAt: instance.date.toISOString(),
    capacityMode: mode,
    capacity,
    confirmed,
    spotsRemaining: Math.max(capacity - confirmed, 0),
    waitlistCount,
    state: !open ? (instance.isCancelled ? "cancelled" : "closed") : confirmed >= capacity ? "full" : "open",
    room: room ? { id: room.id, name: room.name, layout: normalizeLayout(room.layout) } : null,
    spots: allSpots.map((spot: any) => ({
      id: spot.id, number: spot.number, label: spot.label, apparatus: spot.apparatus, x: spot.x, y: spot.y,
      state: !bookable.has(spot.id) ? "out_of_service" : taken.has(spot.id) ? (mine?.spotId === spot.id ? "yours" : "taken") : "free",
    })),
    mine,
  };
}

function normalizeLayout(layout: any) {
  const width = Number.isInteger(layout?.width) ? Math.min(Math.max(layout.width, 1), 40) : 8;
  const height = Number.isInteger(layout?.height) ? Math.min(Math.max(layout.height, 1), 40) : 4;
  const point = (value: any) => (value && Number.isInteger(value.x) && Number.isInteger(value.y) ? { x: value.x, y: value.y } : null);
  return { width, height, instructor: point(layout?.instructor), door: point(layout?.door) };
}

async function memberForActor(tx: any, organizationId: string, userId: string) {
  const member = await tx.member.findFirst({ where: { organizationId, userId }, select: { id: true } });
  if (!member) throw new Error("Sign in as a client to book");
  return member.id as string;
}

/** bookClass(classInstanceId, spotId, memberId?, idempotencyKey?) (§5.9). */
export async function bookClassWithSpot(_root: unknown, args: { classInstanceId: string; spotId?: string | null; memberId?: string | null; idempotencyKey?: string | null }, context: any) {
  const actor = await currentRoleActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma);
  const memberId = args.memberId || await memberForActor(prisma, actor.organizationId, actor.userId);
  if (args.idempotencyKey) {
    // A replay of the same request returns the booking it made.
    const replay = await prisma.classBooking.findFirst({ where: { organizationId: actor.organizationId, classInstanceId: args.classInstanceId, memberId, status: { in: ["confirmed", "waitlisted"] } }, include: { spot: true } });
    if (replay && Array.isArray(replay.history) && replay.history.some((entry: any) => entry?.idempotencyKey === args.idempotencyKey)) {
      return bookingResult(prisma, replay.id, null);
    }
  }
  const result = await createCapacityControlledBooking(context.prisma, {
    classInstanceId: args.classInstanceId,
    memberId,
    spotId: args.spotId ?? null,
    actorUserId: actor.userId,
    actorOrganizationId: actor.organizationId,
    actorCanManageAllRecords: actor.canManageAllRecords,
    capacityMode: "waitlist",
  });
  if (args.idempotencyKey) {
    const row = await prisma.classBooking.findUnique({ where: { id: result.bookingId }, select: { history: true } });
    const history = Array.isArray(row?.history) ? row.history : [];
    if (history[0]) history[0] = { ...history[0], idempotencyKey: args.idempotencyKey };
    await prisma.classBooking.update({ where: { id: result.bookingId }, data: { history } });
  }
  return bookingResult(prisma, result.bookingId, result.creditsRemaining);
}

async function bookingResult(prisma: any, bookingId: string, creditsRemaining: number | null) {
  const booking = await prisma.classBooking.findUnique({ where: { id: bookingId }, include: { spot: { select: { id: true, number: true, label: true } } } });
  return {
    bookingId: booking.id,
    status: booking.status,
    spot: booking.spot ? { id: booking.spot.id, number: booking.spot.number, label: booking.spot.label } : null,
    waitlistPosition: booking.waitlistPosition ?? null,
    creditsRemaining: creditsRemaining ?? 0,
  };
}

/** Join the waitlist of a full class; nothing is spent (§4.2). */
export async function joinWaitlist(root: unknown, args: { classInstanceId: string; memberId?: string | null }, context: any) {
  const result = await bookClassWithSpot(root, { classInstanceId: args.classInstanceId, memberId: args.memberId ?? null, spotId: null }, context);
  if (result.status !== "waitlisted") return { ...result, message: "A machine was free, so you are booked." };
  return { ...result, message: `You are number ${result.waitlistPosition} on the waitlist.` };
}

/** Leave the waitlist at no cost. Positions are not renumbered. */
export async function leaveWaitlist(_root: unknown, args: { bookingId: string }, context: any) {
  const actor = await currentRoleActor(context);
  const booking = await guardKeystonePrismaResults(context.prisma).classBooking.findFirst({ where: { id: args.bookingId, organizationId: actor.organizationId }, select: { status: true } });
  if (!booking) throw new Error("Booking not found");
  if (booking.status !== "waitlisted") throw new Error("This booking is not on a waitlist");
  const result = await cancelCapacityControlledBooking(context.prisma, { bookingId: args.bookingId, actor: actor as any });
  return { bookingId: args.bookingId, left: Boolean(result.cancelled) };
}

/** Move a confirmed booking to another free machine in the same class, under the class lock. */
export async function changeBookingSpot(_root: unknown, args: { bookingId: string; spotId: string }, context: any) {
  const actor = await currentRoleActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma);
  return prisma.$transaction(async (tx: any) => {
    const identity = await tx.classBooking.findFirst({ where: { id: args.bookingId, organizationId: actor.organizationId }, select: { classInstanceId: true } });
    if (!identity?.classInstanceId) throw new Error("Booking not found");
    await lockParticipationPolicy(tx, actor.organizationId);
    await lockTransactionKey(tx, `class-instance:${identity.classInstanceId}`);
    const booking = await tx.classBooking.findFirst({ where: { id: args.bookingId, organizationId: actor.organizationId }, include: { member: { select: { userId: true } }, classInstance: { include: INSTANCE_INCLUDE } } });
    if (!booking) throw new Error("Booking not found");
    if (booking.member?.userId !== actor.userId && !actor.canManageAllRecords && !actor.canManageCheckIns) throw new Error("You cannot change another client's machine");
    if (booking.status !== "confirmed") throw new Error("Only a confirmed booking can change machine");
    const instance = booking.classInstance;
    if (instance.isCancelled) throw new Error("This class was cancelled");
    // Clients change up to class start; staff may move a client during class day (W5).
    if (instance.date.getTime() <= Date.now() && !actor.canManageAllRecords && !actor.canManageCheckIns) throw new Error("The class has started; ask the front desk to move you");
    if (classCapacityMode(instance) !== "pick_a_spot") throw new Error("This class does not use numbered machines");
    if (booking.spotId === args.spotId) return { bookingId: booking.id, spotId: booking.spotId, changed: false };
    const spots = await bookableSpots(tx, instance);
    const { taken } = await takenSpots(tx, instance);
    const spot = spots.find((candidate: any) => candidate.id === args.spotId);
    if (!spot) throw new Error("That machine is not available for this class");
    if (taken.has(spot.id)) throw new Error(`${spot.label} is taken. Choose another machine.`);
    await tx.classBooking.update({ where: { id: booking.id }, data: {
      spotId: spot.id, activeSpotKey: "active",
      history: appendHistory(booking.history, historyEntry("spot_changed", { by: actor.userId, from: booking.spotId, to: spot.id, spotLabel: spot.label })),
    } });
    return { bookingId: booking.id, spotId: spot.id, changed: true };
  });
}

function canManageRooms(actor: any) {
  if (!actor.canManageAllRecords && !actor.canManageFacilities) throw new Error("Room management permission required");
}

type LayoutSpotInput = { id?: string | null; number: number; label?: string | null; apparatus: string; x: number; y: number; isBookable?: boolean | null; notes?: string | null };

/**
 * Save a room's grid and machines in one write (§7 Rooms). Spots missing from the input are
 * retired (kept for booking history). A spot with an upcoming confirmed booking cannot be
 * retired; mark it out of service instead and move the clients.
 */
export async function saveRoomLayout(_root: unknown, args: { roomId: string; layout: any; spots: LayoutSpotInput[] }, context: any) {
  const actor = await currentRoleActor(context);
  canManageRooms(actor);
  const prisma = guardKeystonePrismaResults(context.prisma);
  const layout = normalizeLayout(args.layout);
  const input = Array.isArray(args.spots) ? args.spots : [];
  if (input.length > 200) throw new Error("A room can hold at most 200 machines");
  const numbers = new Set<number>();
  const cells = new Set<string>();
  for (const spot of input) {
    if (!Number.isInteger(spot.number) || spot.number < 1 || spot.number > 500) throw new Error("Machine numbers are whole numbers from 1 to 500");
    if (numbers.has(spot.number)) throw new Error(`Machine number ${spot.number} is used twice`);
    numbers.add(spot.number);
    if (!(APPARATUS as readonly string[]).includes(spot.apparatus)) throw new Error(`Unknown apparatus ${spot.apparatus}`);
    if (!Number.isInteger(spot.x) || !Number.isInteger(spot.y) || spot.x < 0 || spot.y < 0 || spot.x >= layout.width || spot.y >= layout.height) throw new Error(`Machine ${spot.number} is outside the room grid`);
    const cell = `${spot.x}:${spot.y}`;
    if (cells.has(cell)) throw new Error(`Two machines share the cell ${spot.x + 1},${spot.y + 1}`);
    cells.add(cell);
  }
  return prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `room:${args.roomId}`);
    const room = await tx.room.findFirst({ where: { id: args.roomId, organizationId: actor.organizationId } });
    if (!room) throw new Error("Room not found");
    const existing = await tx.spot.findMany({ where: { roomId: room.id, organizationId: actor.organizationId, retiredAt: null }, take: 500 });
    const keep = new Set(input.map((spot) => spot.id).filter(Boolean));
    const retiring = existing.filter((spot: any) => !keep.has(spot.id));
    if (retiring.length) {
      const held = await tx.classBooking.count({ where: { organizationId: actor.organizationId, spotId: { in: retiring.map((spot: any) => spot.id) }, status: "confirmed", classInstance: { date: { gt: new Date() } } } });
      if (held) throw new Error(`${held} upcoming booking${held === 1 ? " holds" : "s hold"} a machine you removed. Mark it out of service and move the clients first.`);
    }
    const now = new Date();
    // Free the numbers first so renumbering inside one save never collides with the unique key.
    for (const spot of retiring) await tx.spot.update({ where: { id: spot.id }, data: { retiredAt: now, number: 1000 + Math.floor(Math.random() * 1e6) } });
    for (const spot of existing.filter((s: any) => keep.has(s.id))) await tx.spot.update({ where: { id: spot.id }, data: { number: 2_000_000 + spot.number } });
    const saved: any[] = [];
    for (const spot of input) {
      const data = { number: spot.number, label: (spot.label || `${spot.apparatus[0].toUpperCase()}${spot.apparatus.slice(1)} ${spot.number}`).slice(0, 60), apparatus: spot.apparatus, x: spot.x, y: spot.y, isBookable: spot.isBookable !== false, notes: (spot.notes || "").slice(0, 500) };
      if (spot.id) {
        if (!existing.some((row: any) => row.id === spot.id)) throw new Error("A machine in the layout belongs to another room");
        saved.push(await tx.spot.update({ where: { id: spot.id }, data }));
      } else saved.push(await tx.spot.create({ data: { ...data, organizationId: actor.organizationId, roomId: room.id } }));
    }
    const bookable = saved.filter((spot) => spot.isBookable).length;
    await tx.room.update({ where: { id: room.id }, data: { layout, capacity: Math.max(bookable, 1) } });
    return { roomId: room.id, spots: saved.length, bookable, retired: retiring.length };
  }, { timeout: 30_000 });
}

/**
 * Mark a machine out of service from now (or a given time) until a time, or bring it back.
 * Upcoming bookings on it inside the window are moved to a free machine of the same class
 * where one exists; the rest are listed for staff to resolve (W5).
 */
export async function setSpotOutOfService(_root: unknown, args: { spotId: string; outOfService: boolean; from?: string | null; until?: string | null; notes?: string | null }, context: any) {
  const actor = await currentRoleActor(context);
  canManageRooms(actor);
  const prisma = guardKeystonePrismaResults(context.prisma);
  const from = args.from ? new Date(args.from) : new Date();
  const until = args.until ? new Date(args.until) : null;
  if (!Number.isFinite(from.getTime()) || (until && (!Number.isFinite(until.getTime()) || until <= from))) throw new Error("The out-of-service window is invalid");
  const spot = await prisma.spot.findFirst({ where: { id: args.spotId, organizationId: actor.organizationId } });
  if (!spot) throw new Error("Machine not found");
  await prisma.$transaction(async (tx: any) => {
    await lockTransactionKey(tx, `room:${spot.roomId}`);
    await tx.spot.update({ where: { id: spot.id }, data: args.outOfService
      ? { outOfServiceFrom: from, outOfServiceUntil: until, notes: (args.notes ?? spot.notes ?? "").slice(0, 500) }
      : { outOfServiceFrom: null, outOfServiceUntil: null } });
  });
  if (!args.outOfService) return { spotId: spot.id, outOfService: false, moved: 0, unresolved: [] };
  const affected = await prisma.classBooking.findMany({ where: { organizationId: actor.organizationId, spotId: spot.id, status: "confirmed", classInstance: { isCancelled: false, date: { gte: from, ...(until ? { lt: until } : {}) } } }, select: { id: true, classInstanceId: true }, take: 500 });
  let moved = 0;
  const unresolved: string[] = [];
  for (const booking of affected) {
    const outcome = await prisma.$transaction(async (tx: any) => {
      await lockTransactionKey(tx, `class-instance:${booking.classInstanceId}`);
      const instance = await tx.classInstance.findFirst({ where: { id: booking.classInstanceId }, include: INSTANCE_INCLUDE });
      const spots = await bookableSpots(tx, instance);
      const { taken } = await takenSpots(tx, instance);
      const free = spots.find((candidate: any) => !taken.has(candidate.id));
      if (!free) return false;
      const row = await tx.classBooking.findUnique({ where: { id: booking.id }, select: { history: true } });
      await tx.classBooking.update({ where: { id: booking.id }, data: { spotId: free.id, activeSpotKey: "active", history: appendHistory(row?.history, historyEntry("spot_changed", { by: actor.userId, from: spot.id, to: free.id, reason: "machine out of service" })) } });
      return true;
    });
    if (outcome) moved += 1; else unresolved.push(booking.id);
  }
  return { spotId: spot.id, outOfService: true, moved, unresolved };
}

/** Staff promote a chosen waitlisted client into a chosen free machine (W3.4). */
export async function promoteWaitlistBooking(_root: unknown, args: { bookingId: string; spotId?: string | null }, context: any) {
  const actor = await currentRoleActor(context);
  if (!actor.canManageAllRecords && !actor.canManageCheckIns) throw new Error("Waitlist management permission required");
  const prisma = guardKeystonePrismaResults(context.prisma);
  const booking = await prisma.classBooking.findFirst({ where: { id: args.bookingId, organizationId: actor.organizationId }, select: { classInstanceId: true, status: true } });
  if (!booking?.classInstanceId) throw new Error("Booking not found");
  if (booking.status !== "waitlisted") throw new Error("This booking is not on the waitlist");
  const { promoteCapacityControlledWaitlistBooking } = await import("./classCapacity");
  return promoteCapacityControlledWaitlistBooking(context.prisma, booking.classInstanceId, actor.organizationId, { preferredSpotId: args.spotId ?? null, onlyBookingId: args.bookingId });
}

/** Rooms for the platform page, with their machines. */
export async function roomsWorkspace(_root: unknown, _args: unknown, context: any) {
  const actor = await currentRoleActor(context);
  canManageRooms(actor);
  const prisma = guardKeystonePrismaResults(context.prisma);
  const rooms = await prisma.room.findMany({ where: { organizationId: actor.organizationId }, orderBy: [{ name: "asc" }], include: { location: { select: { id: true, name: true } }, spots: { where: { retiredAt: null }, orderBy: [{ number: "asc" }] } }, take: 200 });
  const now = new Date();
  return rooms.map((room: any) => ({
    id: room.id, name: room.name, isActive: room.isActive, location: room.location, layout: normalizeLayout(room.layout),
    spots: room.spots.map((spot: any) => ({ id: spot.id, number: spot.number, label: spot.label, apparatus: spot.apparatus, x: spot.x, y: spot.y, isBookable: spot.isBookable, inService: spotInService(spot, now), outOfServiceFrom: spot.outOfServiceFrom, outOfServiceUntil: spot.outOfServiceUntil, notes: spot.notes })),
  }));
}

export const roomTypeDefs = `
  type BookedSpot { id: ID!, number: Int!, label: String! }
  type BookClassWithSpotResult { bookingId: ID!, status: String!, spot: BookedSpot, waitlistPosition: Int, creditsRemaining: Int!, message: String }
  extend type Query {
    classAvailability(classInstanceId: ID!): JSON!
    roomsWorkspace: JSON!
  }
  extend type Mutation {
    joinWaitlist(classInstanceId: ID!, memberId: ID): BookClassWithSpotResult!
    leaveWaitlist(bookingId: ID!): JSON!
    changeBookingSpot(bookingId: ID!, spotId: ID!): JSON!
    saveRoomLayout(roomId: ID!, layout: JSON!, spots: JSON!): JSON!
    setSpotOutOfService(spotId: ID!, outOfService: Boolean!, from: String, until: String, notes: String): JSON!
    promoteWaitlistBooking(bookingId: ID!, spotId: ID): JSON!
  }
`;

export { fillReleasedSeats, classRoomId };
