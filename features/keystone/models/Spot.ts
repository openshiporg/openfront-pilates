import { list } from "@keystone-6/core";
import { denyAll } from "@keystone-6/core/access";
import { checkbox, integer, relationship, select, text, timestamp } from "@keystone-6/core/fields";
import { isSignedIn } from "../access";
import { tenantFilter } from "../access/tenantPolicy";
import { trackingFields } from "./trackingFields";
import { compoundUniqueDb, requiredRelationshipDb } from "./tenantRelationships";

export const APPARATUS = ["reformer", "tower", "chair", "cadillac", "barrel", "mat", "other"] as const;
export type Apparatus = (typeof APPARATUS)[number];

/**
 * One numbered machine (or mat place) in a room. Written only by saveRoomLayout and
 * setSpotOutOfService so the layout, numbering and out-of-service windows change under the
 * room lock that bookings also take.
 */
export const Spot = list({
  db: { extendPrismaSchema: compoundUniqueDb("roomId, number") },
  access: {
    operation: { query: isSignedIn, create: denyAll, update: denyAll, delete: denyAll },
    filter: { query: tenantFilter },
  },
  ui: { labelField: "label", listView: { initialColumns: ["room", "number", "label", "apparatus", "isBookable"] } },
  fields: {
    organization: relationship({ ref: "Organization", db: { extendPrismaSchema: requiredRelationshipDb("organization") } }),
    room: relationship({ ref: "Room.spots", db: { extendPrismaSchema: requiredRelationshipDb("room") } }),
    number: integer({ validation: { isRequired: true, min: 1, max: 500 } }),
    label: text({ validation: { isRequired: true } }),
    apparatus: select({ type: "string", options: APPARATUS.map((value) => ({ label: value[0].toUpperCase() + value.slice(1), value })), defaultValue: "reformer", validation: { isRequired: true } }),
    x: integer({ defaultValue: 0, validation: { isRequired: true, min: 0, max: 99 } }),
    y: integer({ defaultValue: 0, validation: { isRequired: true, min: 0, max: 99 } }),
    isBookable: checkbox({ defaultValue: true }),
    outOfServiceFrom: timestamp(),
    outOfServiceUntil: timestamp(),
    /** Set when the spot is removed from the layout; kept for booking history. */
    retiredAt: timestamp(),
    notes: text(),
    ...trackingFields,
  },
});
