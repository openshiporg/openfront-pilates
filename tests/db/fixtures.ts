/**
 * Builds a real studio in the test database: an organization with settings, a location, a room
 * with numbered reformers, a class type, a schedule and one upcoming class. Rows go through Prisma
 * directly because the list API refuses writes to booking, credit and status fields by design.
 */
import { keystoneContext, uid } from "./harness";

export async function studio(options: { spots?: number; capacityMode?: "pick_a_spot" | "first_come"; startsInHours?: number; declaredCapacity?: number; settings?: Record<string, unknown> } = {}) {
  const ctx = await keystoneContext();
  const prisma = ctx.prisma;
  const key = uid("s");
  const org = await prisma.organization.create({ data: { name: `Studio ${key}`, slug: key, status: "active", defaultCurrency: "USD", timezone: "America/Chicago" } });
  await prisma.studioSettings.create({ data: { organizationId: org.id, name: `Studio ${key}`, currencyCode: "USD", ...(options.settings ?? {}) } });
  const location = await prisma.location.create({ data: { organizationId: org.id, name: "Eastside", isActive: true } });
  const spotCount = options.spots ?? 3;
  const room = await prisma.room.create({ data: { organizationId: org.id, locationId: location.id, name: "Reformer Room", capacity: Math.max(spotCount, 1), layout: { width: 8, height: 2 } } });
  const spots = [];
  for (let n = 1; n <= spotCount; n++) spots.push(await prisma.spot.create({ data: { organizationId: org.id, roomId: room.id, number: n, label: `Reformer ${n}`, apparatus: "reformer", x: (n - 1) % 8, y: Math.floor((n - 1) / 8) } }));
  const classType = await prisma.classType.create({ data: { organizationId: org.id, name: "Reformer Flow", capacityMode: options.capacityMode ?? "pick_a_spot", apparatus: options.capacityMode === "first_come" ? "mat" : "reformer" } });
  const schedule = await prisma.classSchedule.create({ data: { organizationId: org.id, name: "Reformer Flow", dayOfWeek: "monday", startTime: "07:00", endTime: "07:50", maxCapacity: options.declaredCapacity ?? 20, isActive: true, locationId: location.id, resourceId: room.id, classTypeId: classType.id } });
  const date = new Date(Date.now() + (options.startsInHours ?? 48) * 3_600_000);
  const instance = await prisma.classInstance.create({ data: { organizationId: org.id, classScheduleId: schedule.id, date, endsAt: new Date(date.getTime() + 50 * 60_000), locationId: location.id, resourceId: room.id } });
  const staffRole = await prisma.role.create({ data: { name: `Owner ${key}`, organizationId: org.id, canManageAllRecords: true, canManageCheckIns: true, canManageFacilities: true, canAccessDashboard: true, canManagePayroll: true, canSeeOtherPeople: true, canManagePeople: true } });
  const owner = await prisma.user.create({ data: { name: "Owner", email: `${key}-owner@studio.test`, password: "x".repeat(60), organizationId: org.id, roleId: staffRole.id } });
  return { ctx, prisma, org, location, room, spots, classType, schedule, instance, owner, key };
}

export type Studio = Awaited<ReturnType<typeof studio>>;

/** A client with an active membership of `credits` classes this period (-1 = unlimited). */
export async function client(s: Studio, options: { credits?: number; name?: string } = {}) {
  const key = uid("c");
  const user = await s.prisma.user.create({ data: { name: options.name ?? `Client ${key}`, email: `${key}@client.test`, password: "x".repeat(60), organizationId: s.org.id } });
  const member = await s.prisma.member.create({ data: { organizationId: s.org.id, name: user.name, email: user.email, status: "active", userId: user.id } });
  const credits = options.credits ?? 4;
  const tier = await s.prisma.membershipTier.create({ data: { organizationId: s.org.id, name: `Tier ${key}`, monthlyPrice: 139, annualPrice: 0, classCreditsPerMonth: credits } });
  const start = new Date(Date.now() - 86_400_000);
  const end = new Date(Date.now() + 29 * 86_400_000);
  const membership = await s.prisma.membership.create({ data: {
    organizationId: s.org.id, memberId: user.id, tierId: tier.id, status: "active", startDate: start,
    creditPeriodStart: start, creditPeriodEnd: end, nextBillingDate: end, billingCycle: "monthly",
    agreementSnapshot: { version: 1, classCreditsPerMonth: credits, creditLedgerPolicy: "monthly-grant-v1" },
  } });
  return { user, member, membership, tier };
}

/** A Keystone context signed in as this user, the way the GraphQL API sees them. */
export async function as(s: Studio, user: { id: string }) {
  const row = await s.prisma.user.findUnique({ where: { id: user.id }, include: { role: true } });
  return s.ctx.withSession({ itemId: user.id, listKey: "User", data: { id: user.id, name: row.name, email: row.email, organization: { id: s.org.id }, role: row.role ?? null } });
}

export const gql = async (context: any, query: string, variables: Record<string, unknown> = {}) => {
  const result = await context.graphql.raw({ query, variables });
  if (result.errors?.length) throw new Error(result.errors.map((e: any) => e.message).join("; "));
  return result.data;
};
