import { lockParticipationPolicy } from "../lib/operational-policy";
import { businessTimeZone } from "../lib/business-time-zone";
import type { Context } from ".keystone/types";
import { lockTransactionKey } from "./classCapacity";
import { trainingActorFromContext, appointmentProjection } from "./appointment";
import { recordSettledTrainingPackage, recordTrainingPackageRefund } from "./trainingPackages";
import { assertTrainerAvailable, assertTrainingActor, assertTrainingTenant, minutesOfDay, trainingInteger, trainingText, unusedPackageRefundAmount, type TrainingActor } from "./trainingPolicy";
import { counterAttemptsForWorkspace, startTrainingCardRefund, startTrainingCardSale } from "./counterPayments";
import { hashAppointmentRequest } from "./appointmentEvidence";
import { allowedAppointmentTransitions } from "./appointmentPolicy";
import { confirmedIntentResult, recordIntentResult } from "./staffIntents";
import { enqueueOperationalNotice } from "../lib/operational-notices";
import { guardKeystonePrismaResults } from "../lib/prisma-result";

export async function getTrainingWorkspace(
  _root: unknown,
  { skip = 0, cardSkip = 0, availabilitySkip = 0, memberQuery }: { skip?: number; cardSkip?: number; availabilitySkip?: number; memberQuery?: string | null },
  context: Context,
) {
  const actor = trainingActorFromContext(context);
  for (const value of [skip, cardSkip, availabilitySkip]) if (!Number.isInteger(value) || value < 0 || value > 100_000) throw new Error("Invalid page");
  const tx = guardKeystonePrismaResults(context.prisma as any);
  const member = await tx.member.findFirst({ where: { organizationId: actor.organizationId, userId: actor.userId }, select: { id: true } });
  const where = { organizationId: actor.organizationId };
  const memberScope = { ...where, ...(actor.canManageAppointments ? {} : { memberId: member?.id || "__no_member__" }) };
  // The signed-in coach's own active profile, looked up exactly (never derived from a page of options).
  const ownInstructor = actor.isInstructor ? await tx.instructor.findFirst({ where: { ...where, userId: actor.userId, isActive: true }, select: { id: true, userId: true, user: { select: { name: true } } } }) : null;
  const search = String(memberQuery || "").trim().slice(0, 100);
  const memberSearch = search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } : {};
  const [packages, appointments, instructorRows, locationRows, resourceRows, availabilityRows, memberRows, timeZone] = await Promise.all([
    tx.trainingPackage.findMany({ where: memberScope, orderBy: [{ purchasedAt: "desc" }, { id: "asc" }], take: 51, skip, select: { id: true, memberId: true, locationId: true, serviceName: true, durationMinutes: true, totalCredits: true, creditsRemaining: true, amount: true, currencyCode: true, expiresAt: true, status: true, terms: true, refundAmount: true } }),
    tx.appointment.findMany({ where: { ...where, ...(actor.canManageAppointments ? {} : { OR: [{ memberId: member?.id || "__no_member__" }, ...(actor.isInstructor ? [{ instructor: { userId: actor.userId, isActive: true } }] : [])] }) }, orderBy: [{ startTime: "desc" }, { id: "asc" }], take: 51, skip, include: { instructor: { select: { userId: true } } } }),
    tx.instructor.findMany({ where: { ...where, isActive: true }, take: 501, orderBy: { id: "asc" }, select: { id: true, userId: true, user: { select: { name: true } } } }),
    tx.location.findMany({ where: { ...where, isActive: true }, take: 501, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } }),
    tx.room.findMany({ where: { ...where, isActive: true }, take: 501, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, locationId: true } }),
    tx.instructorAvailability.findMany({ where, skip: availabilitySkip, take: 201, orderBy: [{ instructorId: "asc" }, { id: "asc" }], select: { id: true, instructorId: true, locationId: true, type: true, date: true, dayOfWeek: true, startTime: true, endTime: true, effectiveFrom: true, effectiveTo: true, isAvailable: true, reason: true } }),
    // Managers search the directory; a coach chooses only from members they already train.
    actor.canManageAppointments || actor.canManagePrograms || actor.canManagePeople
      ? tx.member.findMany({ where: { ...where, ...memberSearch }, take: 201, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, email: true } })
      : ownInstructor
        ? tx.member.findMany({ where: { ...where, ...memberSearch, status: "active", appointments: { some: { instructorId: ownInstructor.id, status: { in: ["confirmed", "checked_in", "completed"] } } } }, take: 201, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, email: true } })
        : [],
    businessTimeZone(tx, actor.organizationId),
  ]);
  const cardPayments = actor.canManageAppointments ? await counterAttemptsForWorkspace(tx, actor.organizationId, "training", cardSkip) : { rows: [], hasMore: false, skip: 0 };
  const instructors = instructorRows.slice(0, 500);
  // The own profile is always selectable for the coach, even past the first page of coaches.
  if (ownInstructor && !instructors.some((row: any) => row.id === ownInstructor.id)) instructors.push(ownInstructor);
  const locations = locationRows.slice(0, 500), resources = resourceRows.slice(0, 500);
  const availability = availabilityRows.slice(0, 200), members = memberRows.slice(0, 200);
  // Staff see who each appointment and package belongs to (their own rows only for coaches).
  const peopleIds = [...new Set([...appointments.map((row: any) => row.memberId), ...packages.map((row: any) => row.memberId)].filter(Boolean))];
  const people = peopleIds.length && (actor.canManageAppointments || actor.isInstructor)
    ? await tx.member.findMany({ where: { ...where, id: { in: peopleIds } }, select: { id: true, name: true } })
    : [];
  const personName = new Map(people.map((row: any) => [row.id, row.name]));
  const ownCoach = new Map(instructors.map((row: any) => [row.id, row.id === ownInstructor?.id]));
  const hasMore = appointments.length > 50 || packages.length > 50;
  return {
    memberId: member?.id, canManageAppointments: actor.canManageAppointments, canManagePrograms: actor.canManagePrograms, canManagePeople: actor.canManagePeople, isInstructor: actor.isInstructor,
    ownInstructorId: ownInstructor?.id ?? null,
    timeZone, skip, hasMore,
    optionsTruncated: { instructors: instructorRows.length > 500, locations: locationRows.length > 500, resources: resourceRows.length > 500 },
    availabilitySkip, availabilityHasMore: availabilityRows.length > 200,
    memberQuery: search, membersHasMore: memberRows.length > 200,
    cardPaymentsHasMore: cardPayments.hasMore, cardSkip: cardPayments.skip,
    packages: packages.slice(0, 50).map((row: any) => ({ ...row, memberName: personName.get(row.memberId) ?? null })),
    appointments: appointments.slice(0, 50).map((row: any) => ({
      ...appointmentProjection(row),
      memberName: personName.get(row.memberId) ?? null,
      allowedTransitions: allowedAppointmentTransitions(row.status, { canManage: actor.canManageAppointments, isOwnCoach: Boolean(actor.isInstructor && ownCoach.get(row.instructorId)), isOwnMember: row.memberId === member?.id }),
    })),
    instructors: instructors.map((row: any) => ({ id: row.id, name: row.user?.name || "Instructor" })),
    locations, resources, availability,
    members: members.map((row: any) => ({ id: row.id, name: row.name, email: row.email })),
    cardPayments: cardPayments.rows,
  };
}

export async function saveInstructorAvailabilityAtomic(prisma: any, data: any, actor: TrainingActor) {
  prisma = guardKeystonePrismaResults(prisma);
  assertTrainingActor(actor);
  if (!actor.canManageAppointments) throw new Error("Privates management permission required");
  const startTime = trainingText(data.startTime, "Start time", 5), endTime = trainingText(data.endTime, "End time", 5);
  if (minutesOfDay(startTime) >= minutesOfDay(endTime)) throw new Error("Availability must end after it starts on the same local day");
  if (!["recurring", "one_time", "time_off"].includes(data.type)) throw new Error("Invalid availability type");
  if (data.type === "recurring" && (typeof data.dayOfWeek !== "number" || !Number.isInteger(data.dayOfWeek) || data.dayOfWeek < 0 || data.dayOfWeek > 6)) throw new Error("Choose the weekday for recurring availability");
  const date = data.date ? new Date(data.date) : null;
  if (data.type !== "recurring" && (!date || !Number.isFinite(date.getTime()))) throw new Error("A dated availability needs a date");
  // Effective bounds limit a recurring pattern; omitted bounds keep what is saved.
  const bound = (value: unknown, label: string) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const parsed = new Date(String(value));
    if (!Number.isFinite(parsed.getTime())) throw new Error(`${label} is not a valid date`);
    return parsed;
  };
  const effectiveFrom = bound(data.effectiveFrom, "Effective from");
  const effectiveTo = bound(data.effectiveTo, "Effective until");
  const values: Record<string, unknown> = { instructorId: data.instructorId, locationId: data.locationId, type: data.type, dayOfWeek: data.type === "recurring" ? data.dayOfWeek : null, date, startTime, endTime, isAvailable: data.type !== "time_off" && data.isAvailable !== false, reason: trainingText(data.reason || "", "Reason", 1000, false),
    ...(effectiveFrom !== undefined ? { effectiveFrom } : {}), ...(effectiveTo !== undefined ? { effectiveTo } : {}) };
  return prisma.$transaction(async (tx: any) => {
    await lockParticipationPolicy(tx, actor.organizationId);
    await lockTransactionKey(tx, `studio-scheduling:${actor.organizationId}`);
    // The form's request key makes a retried save the same save: a confirmed one is replayed.
    const confirmed = await confirmedIntentResult(tx, actor.organizationId, data.requestKey);
    if (confirmed?.availabilityId) return { id: confirmed.availabilityId, reused: true };
    const instructor = await tx.instructor.findUnique({ where: { id: data.instructorId } });
    const location = await tx.location.findUnique({ where: { id: data.locationId } });
    assertTrainingTenant(instructor, actor, "Instructor"); assertTrainingTenant(location, actor, "Location");
    if (data.id) {
      const row = await tx.instructorAvailability.findUnique({ where: { id: data.id } }); assertTrainingTenant(row, actor, "Availability");
      if (row.instructorId !== instructor.id || row.locationId !== location.id) throw new Error("Availability owner and location cannot be changed");
      if (values.effectiveFrom === undefined) values.effectiveFrom = row.effectiveFrom;
      if (values.effectiveTo === undefined) values.effectiveTo = row.effectiveTo;
    }
    if (values.effectiveFrom && values.effectiveTo && (values.effectiveTo as Date) <= (values.effectiveFrom as Date)) throw new Error("Effective until must be after effective from");
    const rows = await tx.instructorAvailability.findMany({ where: { organizationId: actor.organizationId, instructorId: instructor.id, locationId: location.id }, take: 500 });
    if (rows.length >= 500) throw new Error("Availability limit reached");
    const next = [...rows.filter((row: any) => row.id !== data.id), values];
    const appointments = await tx.appointment.findMany({ where: { organizationId: actor.organizationId, instructorId: instructor.id, locationId: location.id, endTime: { gt: new Date() }, status: { in: ["scheduled", "confirmed", "checked_in"] } }, take: 1000 });
    if (appointments.length >= 1000) throw new Error("Upcoming appointments require review before availability changes");
    const timeZone = await businessTimeZone(tx, actor.organizationId);
    for (const appointment of appointments) assertTrainerAvailable(next, new Date(appointment.startTime), new Date(appointment.endTime), timeZone);
    const row = data.id ? await tx.instructorAvailability.update({ where: { id: data.id }, data: values }) : await tx.instructorAvailability.create({ data: { ...values, organizationId: actor.organizationId } });
    await recordIntentResult(tx, actor.organizationId, data.requestKey, { availabilityId: row.id });
    return { id: row.id };
  });
}

export const trainingWorkspaceTypeDefs = `
  extend type Query { trainingWorkspace(skip: Int = 0, cardSkip: Int = 0, availabilitySkip: Int = 0, memberQuery: String): JSON! }
  extend type Mutation {
    bookAppointment(data: JSON!): JSON!
    rescheduleAppointment(data: JSON!): JSON!
    transitionAppointment(appointmentId: ID!, status: String!, reason: String): JSON!
    recordTrainingPackage(data: JSON!): JSON!
    refundTrainingPackage(data: JSON!): JSON!
    saveInstructorAvailability(data: JSON!): JSON!
  }
`;
export async function recordTrainingPackage(_r: unknown, { data }: any, ctx: Context) {
  const actor = trainingActorFromContext(ctx);
  // Card packages are issued from their reserved, provider-verified counter checkout only.
  if (data?.mode === "startCard") return startTrainingCardSale(ctx, actor, data);
  if (data?.tender === "card") throw new Error("Card packages are recorded from their card checkout");
  return recordSettledTrainingPackage(ctx.prisma, { ...data, cardPayment: false }, actor);
}

/** Card-paid packages reserve their unused credits, then refund them to the original card. */
export async function refundTrainingPackage(_r: unknown, { data }: any, ctx: Context) {
  const actor = trainingActorFromContext(ctx);
  const prisma = guardKeystonePrismaResults(ctx.prisma as any);
  const pack = await prisma.trainingPackage.findUnique({ where: { id: String(data?.packageId || "") } });
  if (pack && pack.organizationId === actor.organizationId && pack.terms?.tender === "card" && pack.status === "active") return startTrainingCardRefund(ctx, actor, data);
  return recordTrainingPackageRefund(ctx.prisma, data, actor);
}
export async function saveInstructorAvailability(_r: unknown, { data }: any, ctx: Context) { return saveInstructorAvailabilityAtomic(ctx.prisma, data, trainingActorFromContext(ctx)); }
