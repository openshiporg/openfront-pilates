import { Context } from '.keystone/types';
import { currentRoleActor } from "../access/currentRoleActor";
import { promoteCapacityControlledWaitlistBooking } from './classCapacity';

/**
 * Check class availability and handle booking logic
 * - Count existing bookings for class instance
 * - If at capacity, add to waitlist
 * - Auto-promote from waitlist when spot opens
 * - Check member credit balance (class pack vs unlimited)
 */
export async function checkClassAvailability(
  root: any,
  args: { classInstanceId: string },
  context: Context
) {
  const { classInstanceId } = args;

  const session = context.session as any;
  if (!session?.itemId || !session.data?.organization?.id) throw new Error('Authentication required');
  const organizationId = session.data.organization.id;
  const [classInstance] = await context.sudo().query.ClassInstance.findMany({
    where: {
      AND: [
        { id: { equals: classInstanceId } },
        { organization: { id: { equals: organizationId } } },
      ],
    },
    take: 1,
    query: 'id date maxCapacity isCancelled organization { id } classSchedule { maxCapacity }',
  });

  if (!classInstance) {
    throw new Error('Class instance not found');
  }

  if (classInstance.isCancelled || new Date(classInstance.date).getTime() <= Date.now()) {
    return {
      available: false,
      spotsRemaining: 0,
      waitlistPosition: null,
      reason: classInstance.isCancelled ? 'Class has been cancelled' : 'Class has already started',
    };
  }

  const capacity = classInstance.maxCapacity || classInstance.classSchedule?.maxCapacity || 20;

  const existingBookings = await context.sudo().query.ClassBooking.count({
    where: {
      classInstance: { id: { equals: classInstanceId } },
      organization: { id: { equals: organizationId } },
      status: { equals: 'confirmed' },
    },
  });

  const spotsRemaining = capacity - existingBookings;
  const available = spotsRemaining > 0;

  let waitlistPosition = null;
  if (!available) {
    const waitlistCount = await context.sudo().query.ClassBooking.count({
      where: {
        classInstance: { id: { equals: classInstanceId } },
        organization: { id: { equals: organizationId } },
        status: { equals: 'waitlisted' },
      },
    });
    waitlistPosition = waitlistCount + 1;
  }

  return {
    available,
    spotsRemaining: Math.max(0, spotsRemaining),
    waitlistPosition,
    reason: available ? null : 'Class is at capacity',
  };
}

async function currentOperatorActor(context: Context) {
  const actor = await currentRoleActor(context);
  if (!actor.canManageAllRecords) throw new Error('Operator access required');
  return actor;
}

/**
 * Book a class (§5.9): bookClass(classInstanceId, spotId, memberId, idempotencyKey). memberId is
 * the Member record id and is only needed when staff book for a client.
 */
export async function bookClass(
  root: any,
  args: { classInstanceId: string; spotId?: string | null; memberId?: string | null; idempotencyKey?: string | null },
  context: Context
) {
  const { bookClassWithSpot } = await import("./rooms");
  const result = await bookClassWithSpot(root, args, context);
  const booking = await context.sudo().query.ClassBooking.findOne({
    where: { id: result.bookingId },
    query: 'id status waitlistPosition bookedAt',
  });
  return { ...result, booking };
}

export async function promoteFromWaitlist(
  root: any,
  args: { classInstanceId: string },
  context: Context
) {
  const actor = await currentOperatorActor(context);
  const organizationId = actor.organizationId;
  const result = await promoteCapacityControlledWaitlistBooking(
    context.prisma,
    args.classInstanceId,
    organizationId
  );
  if (!result.promoted || !result.bookingId) return result;

  const booking = await context.sudo().query.ClassBooking.findOne({
    where: { id: result.bookingId },
    query: 'id status member { id name email }',
  });
  return { ...result, booking };
}
