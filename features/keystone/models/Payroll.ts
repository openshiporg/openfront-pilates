import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { integer, json, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { compoundUniqueDb, requiredRelationshipDb } from "./tenantRelationships";

/** Payroll staff read everything; an instructor reads only their own rate and lines (D13). */
const payrollFilter = ({ session }: any) => tenantFilter({ session }, session?.data?.role?.canManagePayroll ? undefined : { instructor: { user: { id: { equals: session?.itemId } } } });

/**
 * An instructor's pay rate (dissertation D8, §5.6): flat per class plus a per-head bonus above a
 * threshold, with a floor; per-session amounts for privates, duets and trios; an hourly amount.
 * The rate in force is the latest whose effectiveFrom is on or before the work date.
 */
export const PayRate = list({
  access: { operation: { query: isSignedIn, create: denyAll, update: denyAll, delete: denyAll }, filter: { query: payrollFilter } },
  ui: { listView: { initialColumns: ["instructor", "classBase", "perHeadBonus", "bonusAbove", "floor", "effectiveFrom"] } },
  fields: {
    organization: relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    instructor: relationship({ ref: "Instructor", db: { extendPrismaSchema: requiredRelationshipDb("instructor") } }),
    classBase: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    perHeadBonus: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    bonusAbove: integer({ defaultValue: 0, validation: { isRequired: true, min: 0, max: 500 } }),
    floor: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    privateAmount: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    duetAmount: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    trioAmount: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    hourlyAmount: integer({ defaultValue: 0, validation: { isRequired: true, min: 0 } }),
    currencyCode: text({ defaultValue: "USD" }),
    effectiveFrom: timestamp({ validation: { isRequired: true } }),
    ...trackingFields,
  },
});

/** One amount owed to an instructor (§4.9): accrued → locked → paid; accrued → void. */
export const PayLine = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, lineKey") },
  access: { operation: { query: isSignedIn, create: denyAll, update: denyAll, delete: denyAll }, filter: { query: payrollFilter } },
  ui: { listView: { initialColumns: ["instructor", "kind", "workDate", "headcount", "amount", "status"] } },
  fields: {
    organization: relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    instructor: relationship({ ref: "Instructor", db: { extendPrismaSchema: requiredRelationshipDb("instructor") } }),
    /** `class:<id>`, `appointment:<id>` or `manual:<key>`; a voided class line is re-accrued under the same key. */
    lineKey: text({ validation: { isRequired: true } }),
    kind: select({ type: "string", options: ["class", "appointment", "hourly", "adjustment"].map((value) => ({ label: value, value })), validation: { isRequired: true } }),
    classInstance: relationship({ ref: "ClassInstance" }),
    appointment: relationship({ ref: "Appointment" }),
    workDate: timestamp({ validation: { isRequired: true } }),
    headcount: integer({ defaultValue: 0 }),
    hours: integer({ defaultValue: 0, ui: { description: "Minutes, for hourly lines" } }),
    amount: integer({ validation: { isRequired: true } }),
    currencyCode: text({ defaultValue: "USD" }),
    rule: text({ ui: { description: "How the amount was computed" } }),
    note: text(),
    status: select({ type: "string", options: ["accrued", "locked", "paid", "void"].map((value) => ({ label: value, value })), defaultValue: "accrued", validation: { isRequired: true } }),
    run: relationship({ ref: "PayrollRun.lines" }),
    payRate: relationship({ ref: "PayRate" }),
    createdBy: relationship({ ref: "User" }),
    ...trackingFields,
  },
});

/** A pay period (§4.9): draft → locked → paid. Locking freezes its lines; corrections are new lines. */
export const PayrollRun = list({
  access: { operation: { query: isSignedIn, create: denyAll, update: denyAll, delete: denyAll }, filter: { query: ({ session }: any) => tenantFilter({ session }, session?.data?.role?.canManagePayroll ? undefined : { id: { equals: "__none__" } }) } },
  ui: { listView: { initialColumns: ["periodStart", "periodEnd", "status", "total"] } },
  fields: {
    organization: relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    periodStart: timestamp({ validation: { isRequired: true } }),
    periodEnd: timestamp({ validation: { isRequired: true } }),
    status: select({ type: "string", options: ["draft", "locked", "paid"].map((value) => ({ label: value, value })), defaultValue: "draft", validation: { isRequired: true } }),
    total: integer({ defaultValue: 0 }),
    currencyCode: text({ defaultValue: "USD" }),
    /** [{ instructorId, name, amount, method, reference, paidAt }] */
    payouts: json({ defaultValue: [] }),
    lines: relationship({ ref: "PayLine.run", many: true }),
    lockedAt: timestamp(),
    lockedBy: relationship({ ref: "User" }),
    paidAt: timestamp(),
    ...trackingFields,
  },
});
