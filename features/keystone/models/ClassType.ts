import { list } from "@keystone-6/core";
import { allOperations, denyAll } from "@keystone-6/core/access";
import {
  text,
  integer,
  checkbox,
  select,
  multiselect,
} from "@keystone-6/core/fields";
import { document } from "@keystone-6/fields-document";

import { isSignedIn, permissions } from "../access";
import { tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { relationship } from "@keystone-6/core/fields";
import { guardKeystonePrismaResults } from "../lib/prisma-result";
import { compoundUniqueDb, requiredRelationshipDb, validateTenantOwnership } from "./tenantRelationships";

export const ClassType = list({
  db: { extendPrismaSchema: compoundUniqueDb("organizationId, name") },
  hooks: {
    validateInput: validateTenantOwnership([]),
    // Every schedule needs a class type (saveClassSchedule refuses one without), so a type in use stays.
    async validateDelete({ item, context, addValidationError }: any) {
      const schedules = await guardKeystonePrismaResults(context.prisma as any).classSchedule.count({ where: { classTypeId: item.id } });
      if (schedules) addValidationError(`${schedules} class ${schedules === 1 ? "schedule uses" : "schedules use"} this class type. Move ${schedules === 1 ? "it" : "them"} to another class type before deleting it.`);
    },
  },
  access: {
    operation: {
      query: isSignedIn,
      create: permissions.canManageAllRecords,
      update: permissions.canManageAllRecords,
      delete: permissions.canManageAllRecords,
    },
    filter: {
      query: tenantFilter,
      update: tenantFilter,
      delete: tenantFilter,
    },
  },
  ui: {
    listView: {
      initialColumns: ["name", "difficulty", "duration", "caloriesBurn"],
    },
  },
  fields: {
    organization: relationship({
      ref: "Organization.classTypes",
      access: { update: () => false },
      graphql: { isNonNull: { read: true } },
      db: { extendPrismaSchema: requiredRelationshipDb("organization") },
    }),
    name: text({
      validation: { isRequired: true },
      ui: {
        description: "e.g., Yoga, Spin, HIIT, Boxing",
      },
    }),

    description: document({
      formatting: true,
      links: true,
    }),

    difficulty: select({
      type: "string",
      options: [
        { label: "Beginner", value: "beginner" },
        { label: "Intermediate", value: "intermediate" },
        { label: "Advanced", value: "advanced" },
        { label: "All Levels", value: "all-levels" },
      ],
      defaultValue: "all-levels",
      validation: { isRequired: true },
    }),

    duration: integer({
      validation: { isRequired: true, min: 1, max: 1440 },
      defaultValue: 60,
      ui: {
        description: "Typical duration in minutes",
      },
    }),

    equipmentNeeded: multiselect({
      type: "string",
      options: [
        { label: "Mat", value: "mat" },
        { label: "Weights", value: "weights" },
        { label: "Resistance Bands", value: "resistance_bands" },
        { label: "Jump Rope", value: "jump_rope" },
        { label: "Boxing Gloves", value: "boxing_gloves" },
        { label: "Cycling Shoes", value: "cycling_shoes" },
        { label: "Kettlebells", value: "kettlebells" },
        { label: "Medicine Ball", value: "medicine_ball" },
        { label: "None", value: "none" },
      ],
      defaultValue: [],
    }),

    caloriesBurn: integer({
      validation: { min: 0 },
      ui: {
        description: "Estimated calories burned per session",
      },
    }),

    apparatus: select({
      type: "string",
      options: ["reformer", "tower", "chair", "cadillac", "barrel", "mat", "other"].map((value) => ({ label: value[0].toUpperCase() + value.slice(1), value })),
      defaultValue: "reformer",
      validation: { isRequired: true },
    }),
    creditKind: select({
      type: "string",
      options: [{ label: "Group class", value: "group" }, { label: "Private", value: "private" }, { label: "Duet or trio", value: "duet" }],
      defaultValue: "group",
      validation: { isRequired: true },
    }),
    capacityMode: select({
      type: "string",
      options: [{ label: "Client picks a machine", value: "pick_a_spot" }, { label: "First come (capacity only)", value: "first_come" }],
      defaultValue: "pick_a_spot",
      validation: { isRequired: true },
      ui: { description: "Pick a spot: the client chooses a numbered machine on the room map. First come: a mat class capped by capacity." },
    }),
    requiresIntro: checkbox({ defaultValue: false, ui: { description: "Clients must have attended an intro class before booking this one" } }),
    isIntroClass: checkbox({ defaultValue: false, ui: { description: "Attending this class satisfies 'requires intro' on other class types" } }),
    cancelWindowHoursOverride: integer({ validation: { min: 0, max: 72 }, ui: { description: "Overrides the studio's free-cancel window for this class type (hours); empty uses the studio default" } }),
    lateCancelFeeOverride: integer({ validation: { min: 0, max: 100000 }, ui: { description: "Overrides the studio's late-cancel fee (cents); empty uses the studio default" } }),
    noShowFeeOverride: integer({ validation: { min: 0, max: 100000 }, ui: { description: "Overrides the studio's no-show fee (cents); empty uses the studio default" } }),
    schedules: relationship({
      ref: "ClassSchedule.classType",
      many: true,
      access: { create: denyAll, update: denyAll },
    }),

    ...trackingFields,
  },
});
