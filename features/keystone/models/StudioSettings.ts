import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { text, integer, decimal, json, relationship, checkbox } from "@keystone-6/core/fields";

import { isSignedIn } from "../access";
import { tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { requiredRelationshipDb } from "./tenantRelationships";
import { sanitizeStudioLogoSvg } from "../utils/studioLogo";
import {
  DEFAULT_STUDIO_LOGO_COLOR,
  DEFAULT_STOREFRONT_HUE,
  isStudioLogoColor,
  normalizeStudioLogoColor,
  normalizeStorefrontHue,
} from "../lib/storefront-branding";

export const StudioSettings = list({
  access: {
    operation: {
      query: isSignedIn,
      create: denyAll,
      update: denyAll,
      delete: denyAll,
    },
    filter: { query: tenantFilter },
  },
  db: {
    extendPrismaSchema(schema) {
      return schema.replace(
        /\n}/,
        '\n  @@unique([organizationId], map: "StudioSettings_organization_key")\n}'
      );
    },
  },
  graphql: {
    plural: "studioSettingsItems",
  },
  ui: {
    listView: {
      initialColumns: ["name", "tagline", "phone"],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.studioSettings",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    name: text({
      validation: { isRequired: true },
      ui: { description: "Public studio/storefront name" },
    }),

    tagline: text({
      defaultValue: "",
      ui: { description: "Short brand tagline" },
    }),

    logoIcon: text({
      ui: {
        displayMode: "textarea",
        description: "Optional inline SVG logo; executable and external content is rejected",
      },
      hooks: {
        resolveInput: ({ resolvedData, fieldKey }) => {
          const value = resolvedData[fieldKey];
          if (value === undefined || value === null || value === "") return value;
          return sanitizeStudioLogoSvg(value);
        },
        validate: ({ inputData, resolvedData, fieldKey, addValidationError }) => {
          const submitted = inputData?.[fieldKey];
          if (typeof submitted === "string" && submitted.trim() && !resolvedData?.[fieldKey]) {
            addValidationError("Logo must be a valid, safe SVG document");
          }
        },
      },
    }),

    logoColor: text({
      defaultValue: DEFAULT_STUDIO_LOGO_COLOR,
      ui: { description: "Logo color as a hue rotation in degrees; the storefront accent follows it" },
      hooks: {
        resolveInput: ({ resolvedData, fieldKey }) => {
          const value = resolvedData[fieldKey];
          return value === undefined ? value : normalizeStudioLogoColor(value);
        },
        validate: ({ inputData, fieldKey, addValidationError }) => {
          const submitted = inputData?.[fieldKey];
          if (submitted !== undefined && !isStudioLogoColor(submitted)) {
            addValidationError("Logo color must be a hue rotation in degrees");
          }
        },
      },
    }),

    brandHue: integer({
      defaultValue: DEFAULT_STOREFRONT_HUE,
      validation: { isRequired: true, min: 0, max: 359 },
      // Kept for existing tenants' data; the storefront accent now follows the logo color.
      ui: { description: "Legacy accent hue (no longer used; the accent follows the logo color)", itemView: { fieldMode: "read" } },
      hooks: {
        resolveInput: ({ resolvedData, fieldKey }) => {
          const value = resolvedData[fieldKey];
          return value === undefined ? value : normalizeStorefrontHue(value);
        },
      },
    }),

    description: text({
      ui: {
        displayMode: "textarea",
        description: "Short public business description",
      },
    }),

    address: text({
      ui: { description: "Primary public address" },
    }),

    phone: text({
      ui: { description: "Primary public phone" },
    }),

    email: text({
      ui: { description: "Primary public email" },
    }),

    currencyCode: text({
      defaultValue: "USD",
    }),

    // One paid class without a membership (Mindbody "drop-in" pricing option), in minor units.
    // 0 turns online drop-ins off; the storefront then points visitors to the front desk.
    dropInPrice: integer({
      defaultValue: 2500,
      validation: { isRequired: true, min: 0, max: 100000 },
      ui: { description: "Drop-in class price in cents; 0 turns online drop-ins off" },
    }),

    // Members who cancel a confirmed class this close to the start forfeit its credit (Mindbody late-cancel window).
    // A late-cancelled paid drop-in is not refunded. Staff cancellations are always treated as waived. 0 turns it off.
    privateCancelWindowHours: integer({ defaultValue: 24, validation: { isRequired: true, min: 0, max: 168 }, ui: { description: "Free-cancel window for privates, duets and trios (hours)" } }),
    lateCancelFee: integer({ defaultValue: 1500, validation: { isRequired: true, min: 0, max: 100000 }, ui: { description: "Late-cancel fee for unlimited members (cents)" } }),
    noShowFee: integer({ defaultValue: 2000, validation: { isRequired: true, min: 0, max: 100000 }, ui: { description: "No-show fee for unlimited members (cents)" } }),
    lateCancelWaiversPer30Days: integer({ defaultValue: 1, validation: { isRequired: true, min: 0, max: 10 }, ui: { description: "Late cancels an unlimited member may make in 30 days before a fee applies" } }),
    waitlistCutoffMinutes: integer({ defaultValue: 120, validation: { isRequired: true, min: 0, max: 1440 }, ui: { description: "No waitlist promotion inside this many minutes before class; the freed machine is open to book" } }),
    bookingHorizonDays: integer({ defaultValue: 14, validation: { isRequired: true, min: 1, max: 90 }, ui: { description: "How many days ahead a client without a membership can book" } }),
    requireWaiver: checkbox({ defaultValue: true }),
    gripSocksRequired: checkbox({ defaultValue: true }),
    arriveEarlyMinutes: integer({ defaultValue: 10, validation: { isRequired: true, min: 0, max: 60 } }),
    lateCancelHours: integer({
      defaultValue: 12,
      validation: { isRequired: true, min: 0, max: 72 },
      ui: { description: "Late-cancel window in hours before class; 0 turns it off" },
    }),

    locale: text({
      defaultValue: "en-US",
    }),

    timezone: text({
      defaultValue: "America/New_York",
    }),

    countryCode: text({
      defaultValue: "US",
    }),

    hours: json({
      defaultValue: {},
      ui: { description: "Operating hours by day" },
    }),

    heroEyebrow: text({ defaultValue: "" }),

    heroHeadline: text({ defaultValue: "" }),

    heroSubheadline: text({ defaultValue: "" }),

    heroImageUrl: text({
      ui: { description: "Storefront hero image URL or local asset path" },
    }),

    heroPrimaryCtaLabel: text({ defaultValue: "" }),

    heroPrimaryCtaHref: text({ defaultValue: "" }),

    heroSecondaryCtaLabel: text({ defaultValue: "" }),

    heroSecondaryCtaHref: text({ defaultValue: "" }),

    promoBanner: text({ defaultValue: "" }),

    footerTagline: text({ defaultValue: "" }),

    copyrightName: text({ defaultValue: "" }),

    facilityHeadline: text({ defaultValue: "" }),

    facilityDescription: text({ defaultValue: "" }),

    facilityHighlights: json({
      defaultValue: [],
      ui: { description: "Public facility cards/sections" },
    }),

    heroStats: json({
      defaultValue: [],
      ui: { description: "Hero stat cards" },
    }),

    contactTopics: json({
      defaultValue: [],
      ui: { description: "Contact page topics/cards" },
    }),

    // Owner-pasted participation terms. Saving changed text through Store Settings
    // publishes a new ParticipationPolicy version that members accept.
    participationTerms: text({
      defaultValue: "",
      ui: { displayMode: "textarea", description: "Participation waiver / terms shown at /waiver. Edit in Store Settings so a new version is published." },
    }),

    rating: decimal({
      precision: 2,
      scale: 1,
      defaultValue: "4.8",
    }),

    reviewCount: integer({
      defaultValue: 0,
    }),

    ...trackingFields,
  },
});
