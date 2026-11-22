import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { canManageTenant, tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { compoundUniqueDb, requiredRelationshipDb } from "./tenantRelationships";

/**
 * A late-cancel or no-show fee (dissertation D5, §4.6): assessed → charged | owed | waived;
 * owed → charged | waived; charged → refunded. An owed fee blocks new bookings. Written only by
 * the fee mutations; status and money are not writable through the list API.
 */
export const Fee = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, feeKey") },
  access: {
    operation: { query: isSignedIn, create: denyAll, update: denyAll, delete: denyAll },
    filter: { query: ({ session }: any) => tenantFilter({ session }, canManageTenant({ session }, "canManageAllRecords" as any) || session?.data?.role?.canManageCheckIns ? undefined : { member: { user: { id: { equals: session?.itemId } } } }) },
  },
  ui: { listView: { initialColumns: ["member", "kind", "amount", "status", "createdAt"] } },
  fields: {
    organization: relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    member: relationship({ ref: "Member", db: { extendPrismaSchema: requiredRelationshipDb("member") } }),
    booking: relationship({ ref: "ClassBooking" }),
    appointment: relationship({ ref: "Appointment" }),
    /** One fee per booking and kind: `late_cancel:<bookingId>` or `no_show:<bookingId>`. */
    feeKey: text({ validation: { isRequired: true } }),
    kind: select({ type: "string", options: [{ label: "Late cancel", value: "late_cancel" }, { label: "No show", value: "no_show" }], validation: { isRequired: true } }),
    amount: integer({ validation: { isRequired: true, min: 0 } }),
    currencyCode: text({ defaultValue: "USD", validation: { isRequired: true } }),
    status: select({ type: "string", options: ["assessed", "charged", "owed", "waived", "refunded", "void"].map((value) => ({ label: value, value })), defaultValue: "assessed", validation: { isRequired: true } }),
    payment: relationship({ ref: "Payment" }),
    providerPaymentIntentId: text(),
    failureMessage: text(),
    waivedBy: relationship({ ref: "User" }),
    waivedReason: text(),
    /** "allowance" when the waiver allowance waived it, "staff" when a person did. */
    waivedBasis: text(),
    refundedAt: timestamp(),
    history: json({ defaultValue: [] }),
    ...trackingFields,
  },
});
