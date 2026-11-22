import { graphql, list } from "@keystone-6/core";
import { allOperations, denyAll } from "@keystone-6/core/access";
import {
  text,
  integer,
  float,
  checkbox,
  select,
  json,
  relationship,
  virtual,
} from "@keystone-6/core/fields";
import { document } from "@keystone-6/fields-document";

import { isSignedIn, permissions } from "../access";
import { tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { compoundUniqueDb, requiredRelationshipDb, validateTenantOwnership } from "./tenantRelationships";

import { decimalToMinor } from "../../integrations/payment/commercial-agreement";
import { creditsLabel } from "../../../lib/list-labels";
import { guardKeystonePrismaResults } from "../lib/prisma-result";

const validateMembershipTierTenant = validateTenantOwnership([]);

export async function validateMembershipTierInput(args: any) {
  await validateMembershipTierTenant(args);
  const value = (field: string) =>
    args.resolvedData[field] === undefined ? args.item?.[field] : args.resolvedData[field];
  const monthlyPrice = Number(value("monthlyPrice"));
  const annualPrice = Number(value("annualPrice"));
  if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0 || !Number.isFinite(annualPrice) || annualPrice < 0) {
    args.addValidationError("Membership prices must be non-negative numbers");
  }
  try { decimalToMinor(value("monthlyPrice")); decimalToMinor(value("annualPrice")); }
  catch (error) { args.addValidationError((error as Error).message); }
  const credits = Number(value("classCreditsPerMonth"));
  if (!Number.isInteger(credits) || credits < -1) {
    args.addValidationError("Class credits must be -1 for unlimited or a non-negative whole number");
  }
  const monthlyPriceId = String(value("stripeMonthlyPriceId") || "").trim();
  const annualPriceId = String(value("stripeAnnualPriceId") || "").trim();
  const productId = String(value("stripeProductId") || "").trim();
  if (monthlyPriceId && !/^price_[A-Za-z0-9]+$/.test(monthlyPriceId)) {
    args.addValidationError("Monthly Stripe Price ID is invalid");
  }
  if (annualPriceId && !/^price_[A-Za-z0-9]+$/.test(annualPriceId)) {
    args.addValidationError("Annual Stripe Price ID is invalid");
  }
  if (productId && !/^prod_[A-Za-z0-9]+$/.test(productId)) {
    args.addValidationError("Stripe Product ID is invalid");
  }
  if ((monthlyPriceId || annualPriceId) && !productId) {
    args.addValidationError("A Stripe Product ID is required with checkout Price IDs");
  }
  // Online membership service starts only after a positive paid invoice, so a zero price can't
  // be published for checkout. Free plans stay drafts until there is a supported free policy.
  if (monthlyPriceId && Number.isFinite(monthlyPrice) && monthlyPrice <= 0) {
    args.addValidationError("A monthly price above zero is required to sell this plan online; set the price or remove the monthly Stripe Price ID");
  }
  if (annualPriceId && Number.isFinite(annualPrice) && annualPrice <= 0) {
    args.addValidationError("An annual price above zero is required to sell this plan online; set the price or remove the annual Stripe Price ID");
  }
  for (const [field, label, max] of [["guestPasses", "Guest passes", 1000], ["personalTrainingSessions", "Included private sessions", 1000], ["contractLength", "Contract length (months)", 120], ["maxClassBookings", "Maximum concurrent bookings", 1000]] as const) {
    const current = value(field);
    if (current == null) continue;
    if (!Number.isInteger(current) || current < 0 || current > max) args.addValidationError(`${label} must be a whole number from 0 to ${max}`);
  }
  const features = value("features");
  if (features != null && (!Array.isArray(features) || features.length > 12 || features.some((item: unknown) => typeof item !== "string" || !item.trim() || item.length > 120))) {
    args.addValidationError("Plan features must be a list of up to 12 short lines (120 characters each)");
  }
}

export const MembershipTier = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name") },
  hooks: {
    validateInput: validateMembershipTierInput,
    async validateDelete({ context, item, addValidationError }: any) {
      const prisma = guardKeystonePrismaResults(context.prisma as any);
      const [memberships, sessions] = await Promise.all([
        prisma.membership.count({ where: { tierId: item.id } }),
        prisma.paymentSession.count({ where: { membershipTierId: item.id } }),
      ]);
      if (memberships || sessions) addValidationError("A membership plan referenced by commercial records cannot be deleted");
    },
    resolveInput({ resolvedData, item }: any) {
      for (const [display, minor] of [["monthlyPrice", "monthlyPriceMinor"], ["annualPrice", "annualPriceMinor"]]) {
        const value = resolvedData[display] ?? item?.[display];
        if (value !== undefined) {
          try { resolvedData[minor] = decimalToMinor(value); } catch { /* validation reports error */ }
        }
      }
      return resolvedData;
    },
  },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords,
    },
    filter: { query: tenantFilter, update: tenantFilter, delete: tenantFilter },
  },
  ui: {
    listView: {
      initialColumns: ["name", "monthlyPrice", "annualPrice", "classCreditsLabel"],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.membershipTiers",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    name: text({
      validation: { isRequired: true },
      ui: {
        description: "e.g., Basic, Premium, Unlimited",
      },
    }),

    description: document({
      formatting: true,
      links: true,
    }),

    // Derived from the display prices in resolveInput; never entered directly.
    monthlyPriceMinor: integer({ access: { create: denyAll, update: denyAll }, db: { isNullable: true }, ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" }, description: "Set automatically from Monthly price" } }),
    annualPriceMinor: integer({ access: { create: denyAll, update: denyAll }, db: { isNullable: true }, ui: { createView: { fieldMode: "hidden" }, itemView: { fieldMode: "read" }, description: "Set automatically from Annual price" } }),

    monthlyPrice: float({
      validation: { isRequired: true },
      ui: {
        description: "Monthly subscription price",
      },
    }),

    annualPrice: float({
      validation: { isRequired: true },
      ui: {
        description: "Annual subscription price (with discount)",
      },
    }),

    classCreditsPerMonth: integer({
      validation: { isRequired: true },
      defaultValue: 0,
      ui: {
        description: "Number of class credits per month (-1 for unlimited)",
      },
    }),

    // List column: the stored -1 sentinel reads as "Unlimited", never "-1".
    classCreditsLabel: virtual({
      field: graphql.field({
        type: graphql.String,
        resolve: (item: any) => creditsLabel(item.classCreditsPerMonth),
      }),
      label: "Classes per month",
      ui: { itemView: { fieldMode: "hidden" }, createView: { fieldMode: "hidden" } },
    }),


    guestPasses: integer({
      defaultValue: 0,
      ui: {
        description: "Number of guest passes per month",
      },
    }),

    personalTrainingSessions: integer({
      defaultValue: 0,
      ui: {
        description: "Number of private sessions included",
      },
    }),

    freezeAllowed: checkbox({
      defaultValue: false,
      ui: {
        description: "Can member freeze their membership?",
      },
    }),

    contractLength: integer({
      defaultValue: 0,
      ui: {
        description: "Contract length in months (0 for month-to-month)",
      },
    }),

    // Stripe integration
    // Dissertation D10. The billed period of the recurring ("monthly") Stripe price: week, fortnight,
    // four weeks or calendar month. classCreditsPerMonth is the allowance per billed period (-1 unlimited).
    billingPeriod: select({
      type: "string",
      options: [{ label: "Weekly", value: "week" }, { label: "Fortnightly", value: "fortnight" }, { label: "Every 4 weeks", value: "four_weeks" }, { label: "Monthly", value: "month" }],
      defaultValue: "month",
      validation: { isRequired: true },
    }),
    maxBookingsPerDay: integer({ defaultValue: 0, validation: { min: 0, max: 20 }, ui: { description: "0 = no daily cap. 'Unlimited' is commonly 1 a day." } }),
    maxBookingsPerMonth: integer({ defaultValue: 0, validation: { min: 0, max: 1000 }, ui: { description: "0 = no monthly cap; counts attended and upcoming bookings in the calendar month" } }),
    cancelNoticeDays: integer({ defaultValue: 30, validation: { min: 0, max: 365 } }),
    freezeMinDays: integer({ defaultValue: 7, validation: { min: 1, max: 365 } }),
    freezeMaxDays: integer({ defaultValue: 30, validation: { min: 1, max: 365 } }),
    freezeDaysPerYear: integer({ defaultValue: 30, validation: { min: 0, max: 365 } }),
    freezeFee: integer({ defaultValue: 0, validation: { min: 0, max: 100000 }, ui: { description: "Cents, charged at the desk or on the next invoice" } }),
    advanceBookingDays: integer({ defaultValue: 14, validation: { min: 1, max: 90 }, ui: { description: "How many days ahead a member on this plan can book" } }),
    offPeakOnly: checkbox({ defaultValue: false }),
    /** Off-peak windows: [{ days: [1..7], from: "HH:MM", to: "HH:MM" }] in the studio's time zone. */
    offPeakWindows: json({ defaultValue: [{ days: [1, 2, 3, 4, 5], from: "09:00", to: "16:00" }, { days: [6, 7], from: "12:00", to: "21:00" }] }),
    rolloverPeriods: integer({ defaultValue: 0, validation: { min: 0, max: 1 }, ui: { description: "Unused credits roll over one period (0 or 1)" } }),
    stripeMonthlyPriceId: text({
      access: { read: permissions.canManageAllRecords },
      isFilterable: permissions.canManageAllRecords,
      isOrderable: permissions.canManageAllRecords,
      ui: {
        description: "Stripe Price ID for monthly billing",
      },
    }),

    stripeAnnualPriceId: text({
      access: { read: permissions.canManageAllRecords },
      isFilterable: permissions.canManageAllRecords,
      isOrderable: permissions.canManageAllRecords,
      ui: {
        description: "Stripe Price ID for annual billing",
      },
    }),

    stripeProductId: text({
      access: { read: permissions.canManageAllRecords },
      isFilterable: permissions.canManageAllRecords,
      isOrderable: permissions.canManageAllRecords,
      ui: {
        description: "Stripe Product ID",
      },
    }),

    // Additional fields from todo requirements
    price: integer({
      ui: {
        description: "Base price in cents (for backward compatibility)",
      },
    }),

    // Legacy display value: checkout sells the monthly and annual Stripe prices above, so this
    // field changes no billing and is kept only to preserve existing data.
    billingInterval: select({
      type: 'string',
      options: [
        { label: 'Monthly', value: 'monthly' },
        { label: 'Annual', value: 'annual' },
      ],
      defaultValue: 'monthly',
      ui: {
        createView: { fieldMode: 'hidden' },
        itemView: { fieldMode: 'hidden' },
        listView: { fieldMode: 'hidden' },
      },
    }),

    features: json({
      defaultValue: [],
      ui: {
        description: 'Up to 12 short lines shown on the public plan card, e.g. ["Open studio access", "2 guest passes a month"]',
      },
    }),

    maxClassBookings: integer({
      defaultValue: 0,
      ui: {
        description: 'Maximum number of concurrent class bookings allowed (0 = unlimited)',
      },
    }),

    // Not connected to admission or display (guest passes are the supported benefit); kept
    // only to preserve existing data.
    hasGuestPrivileges: checkbox({
      defaultValue: false,
      ui: {
        createView: { fieldMode: 'hidden' },
        itemView: { fieldMode: 'hidden' },
        listView: { fieldMode: 'hidden' },
      },
    }),


    paymentSessions: relationship({
      ref: 'PaymentSession.membershipTier',
      many: true,
      access: { create: denyAll, update: denyAll },
      ui: { createView: { fieldMode: 'hidden' }, itemView: { fieldMode: 'read' } },
    }),

    ...trackingFields,
  },
});
