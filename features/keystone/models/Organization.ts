import { list } from "@keystone-6/core";
import { checkbox, relationship, select, text } from "@keystone-6/core/fields";
import { denyAll } from "@keystone-6/core/access";
import { isSignedIn, permissions } from "../access";
import { getTenantId } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";

const ownOrganization = ({ session, item }: any) => getTenantId(session) === item?.id;
const ownOrganizationFilter = ({ session }: any) => {
  const organizationId = getTenantId(session);
  return organizationId ? { id: { equals: organizationId } } : false;
};
const ownedRecords = (ref: string) => relationship({
  ref,
  many: true,
  access: { create: denyAll, update: denyAll },
});

export const Organization = list({
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageOnboarding,
      update: permissions.canManageSettings,
      delete: () => false,
    },
    filter: { query: ownOrganizationFilter },
    item: { update: ownOrganization },
  },
  hooks: {
    validateInput({ resolvedData }: any) {
      if (resolvedData.defaultCurrency !== undefined && resolvedData.defaultCurrency !== "USD") {
        throw new Error("Organization currency is fixed to USD until multi-currency membership contracts are supported");
      }
    },
  },
  ui: {
    labelField: "name",
    hideDelete: true,
    listView: { initialColumns: ["name", "slug", "status", "timezone"] },
  },
  fields: {
    name: text({ validation: { isRequired: true } }),
    slug: text({ isIndexed: "unique", validation: { isRequired: true } }),
    status: select({
      type: "enum",
      options: [
        { label: "Active", value: "active" },
        { label: "Suspended", value: "suspended" },
      ],
      defaultValue: "active",
      validation: { isRequired: true },
    }),
    defaultCurrency: text({ defaultValue: "USD", validation: { isRequired: true } }),
    timezone: text({ defaultValue: "America/Los_Angeles", validation: { isRequired: true } }),
    isMultiLocation: checkbox({ defaultValue: true }),
    users: ownedRecords("User.organization"),
    roles: ownedRecords("Role.organization"),
    members: ownedRecords("Member.organization"),
    instructors: ownedRecords("Instructor.organization"),
    locations: ownedRecords("Location.organization"),
    resources: ownedRecords("Room.organization"),
    instructorAvailability: ownedRecords("InstructorAvailability.organization"),
    appointments: ownedRecords("Appointment.organization"),
    membershipTiers: ownedRecords("MembershipTier.organization"),
    memberships: ownedRecords("Membership.organization"),
    membershipPayments: ownedRecords("MembershipPayment.organization"),
    subscriptions: ownedRecords("Subscription.organization"),
    payments: ownedRecords("Payment.organization"),
    paymentMethods: ownedRecords("PaymentMethod.organization"),
    paymentProviders: ownedRecords("PaymentProvider.organization"),
    paymentSessions: ownedRecords("PaymentSession.organization"),
    paymentEvents: ownedRecords("PaymentEvent.organization"),
    checkIns: ownedRecords("CheckIn.organization"),
    attendanceRecords: ownedRecords("AttendanceRecord.organization"),
    classTypes: ownedRecords("ClassType.organization"),
    classSchedules: ownedRecords("ClassSchedule.organization"),
    classBookings: ownedRecords("ClassBooking.organization"),
    classInstances: ownedRecords("ClassInstance.organization"),
    studioSettings: ownedRecords("StudioSettings.organization"),
    onboardingRuns: ownedRecords("OnboardingRun.organization"),
    refundAttempts: ownedRecords("RefundAttempt.organization"),
    membershipBillingAttempts: ownedRecords("MembershipBillingAttempt.organization"),
    ...trackingFields,
  },
});
