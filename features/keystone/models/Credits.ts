import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { checkbox, integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { isSignedIn, permissions } from "../access";
import { canManageTenant, tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { compoundUniqueDb, requiredRelationshipDb } from "./tenantRelationships";

export const CREDIT_KINDS = ["group", "private", "duet"] as const;
export type CreditKind = (typeof CREDIT_KINDS)[number];
const kindOptions = [{ label: "Group class", value: "group" }, { label: "Private", value: "private" }, { label: "Duet or trio", value: "duet" }];

/** A client reads their own credits; staff read the studio's. */
const ownOrStaff = ({ session }: any) => tenantFilter({ session }, canManageTenant({ session }, "canManageAllRecords" as any) || session?.data?.role?.canManageCheckIns
  ? undefined : { member: { user: { id: { equals: session?.itemId } } } });

/**
 * A product a client buys: N classes valid for some days (dissertation D4, D9, §5.3). An intro
 * offer is a pack with introOnly; firstTimersOnly also refuses anyone with a past booking.
 */
export const ClassPack = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name") },
  access: {
    operation: { query: () => true, create: permissions.canManageAllRecords, update: permissions.canManageAllRecords, delete: denyAll },
    filter: { query: ({ session }: any) => (session?.data?.role?.canManageAllRecords ? tenantFilter({ session }) : { isActive: { equals: true } }), update: tenantFilter },
  },
  ui: { listView: { initialColumns: ["name", "kind", "quantity", "price", "validDays", "introOnly", "isActive"] } },
  fields: {
    organization: relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    name: text({ validation: { isRequired: true } }),
    description: text({ ui: { displayMode: "textarea" } }),
    kind: select({ type: "string", options: kindOptions, defaultValue: "group", validation: { isRequired: true } }),
    quantity: integer({ validation: { isRequired: true, min: 1, max: 500 } }),
    price: integer({ validation: { isRequired: true, min: 0, max: 10_000_000 }, ui: { description: "Price in cents" } }),
    validDays: integer({ validation: { isRequired: true, min: 1, max: 3650 } }),
    introOnly: checkbox({ defaultValue: false, ui: { description: "Intro offer: one purchase per client, matched on account, email and phone" } }),
    firstTimersOnly: checkbox({ defaultValue: false, ui: { description: "Also refuse anyone who has booked a class before" } }),
    activatesOn: select({ type: "string", options: [{ label: "On purchase", value: "purchase" }, { label: "On first booking", value: "first_booking" }], defaultValue: "purchase", validation: { isRequired: true } }),
    locations: relationship({ ref: "Location", many: true, ui: { description: "Empty means every location" } }),
    sortOrder: integer({ defaultValue: 0 }),
    isActive: checkbox({ defaultValue: true }),
    ...trackingFields,
  },
});

/**
 * Credits a client holds from one source (§4.3). quantity -1 is unlimited. Balance = remaining,
 * kept equal to the sum of its CreditEntry rows; the database refuses a negative balance.
 * Expiry is computed on read (expiresAt), never by a timer.
 */
export const CreditGrant = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, sourceKey") },
  access: { operation: { query: isSignedIn, create: denyAll, update: denyAll, delete: denyAll }, filter: { query: ownOrStaff } },
  ui: { listView: { initialColumns: ["member", "source", "kind", "quantity", "remaining", "expiresAt", "status"] } },
  fields: {
    organization: relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    member: relationship({ ref: "Member", db: { extendPrismaSchema: requiredRelationshipDb("member") } }),
    source: select({ type: "string", options: ["membership_period", "pack", "intro", "comp", "import"].map((value) => ({ label: value, value })), validation: { isRequired: true } }),
    /** Unique per organization: the payment, desk sale or import row that created this grant. */
    sourceKey: text({ validation: { isRequired: true } }),
    kind: select({ type: "string", options: kindOptions, defaultValue: "group", validation: { isRequired: true } }),
    classPack: relationship({ ref: "ClassPack" }),
    membership: relationship({ ref: "Membership" }),
    payment: relationship({ ref: "Payment" }),
    quantity: integer({ validation: { isRequired: true, min: -1 } }),
    remaining: integer({ validation: { isRequired: true, min: -1 } }),
    validFrom: timestamp({ validation: { isRequired: true } }),
    /** Null until first booking for packs that activate on first booking. */
    expiresAt: timestamp(),
    validDays: integer({ validation: { min: 1 } }),
    status: select({ type: "string", options: ["active", "refunded", "revoked"].map((value) => ({ label: value, value })), defaultValue: "active", validation: { isRequired: true } }),
    priceSnapshot: json({ defaultValue: {} }),
    note: text(),
    ...trackingFields,
  },
});

/** Every change to a grant (§4.3): grant, debit, restore, expire, refund, adjust. */
export const CreditEntry = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, eventKey") },
  access: { operation: { query: isSignedIn, create: denyAll, update: denyAll, delete: denyAll }, filter: { query: ownOrStaff } },
  fields: {
    organization: relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    member: relationship({ ref: "Member", db: { extendPrismaSchema: requiredRelationshipDb("member") } }),
    grant: relationship({ ref: "CreditGrant", db: { extendPrismaSchema: requiredRelationshipDb("grant") } }),
    eventKey: text({ validation: { isRequired: true } }),
    kind: select({ type: "string", options: ["grant", "debit", "restore", "expire", "refund", "adjust"].map((value) => ({ label: value, value })), validation: { isRequired: true } }),
    delta: integer({ validation: { isRequired: true } }),
    balanceAfter: integer({ validation: { isRequired: true, min: -1 } }),
    booking: relationship({ ref: "ClassBooking" }),
    appointment: relationship({ ref: "Appointment" }),
    actor: relationship({ ref: "User" }),
    reason: text(),
    ...trackingFields,
  },
});
