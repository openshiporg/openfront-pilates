import { gql } from "graphql-request";
import { studioClient } from "@/features/storefront/lib/config";
import { PUBLIC_PAGE_SIZE, collectPublicPages, publicCatalogPage } from "./pages";

export type MembershipTierData = {
  id: string;
  name: string;
  description: any;
  monthlyPrice: number;
  annualPrice: number;
  classCreditsPerMonth: number;
  guestPasses: number;
  personalTrainingSessions: number;
  freezeAllowed: boolean;
  contractLength: number;
  features: string[];
  monthlyCheckoutAvailable: boolean;
  annualCheckoutAvailable: boolean;
};

const FIELDS = gql`
  fragment StorefrontMembershipTier on PublicStudioMembershipTier {
    id name description monthlyPrice annualPrice classCreditsPerMonth
    guestPasses personalTrainingSessions freezeAllowed contractLength features
    monthlyCheckoutAvailable annualCheckoutAvailable
  }
`;

/** This storefront's published plans (its own organization; the argument is ignored). */
export async function getMembershipTiers(_organizationId?: string | null): Promise<MembershipTierData[]> {
  const { items } = await collectPublicPages(async (skip) => (await studioClient.request<{ publicStudioMembershipTiers: MembershipTierData[] }>(gql`
    ${FIELDS}
    query StorefrontMembershipTiers($skip: Int, $limit: Int) {
      publicStudioMembershipTiers(limit: $limit, skip: $skip) { ...StorefrontMembershipTier }
    }
  `, { skip, limit: PUBLIC_PAGE_SIZE })).publicStudioMembershipTiers);
  return items;
}

/** One page of published plans after `after` (keyset continuation, price order). */
export async function getMembershipTierPage(after?: string) {
  return publicCatalogPage(async (limit) => (await studioClient.request<{ publicStudioMembershipTiers: MembershipTierData[] }>(gql`
    ${FIELDS}
    query StorefrontMembershipTierPage($limit: Int, $after: ID) {
      publicStudioMembershipTiers(limit: $limit, after: $after) { ...StorefrontMembershipTier }
    }
  `, { limit, after: after || null })).publicStudioMembershipTiers);
}

export async function getMembershipTierById(id: string): Promise<MembershipTierData | null> {
  const result = await studioClient.request<{ publicStudioMembershipTier: MembershipTierData | null }>(gql`
    ${FIELDS}
    query StorefrontMembershipTier($id: ID!) {
      publicStudioMembershipTier(id: $id) { ...StorefrontMembershipTier }
    }
  `, { id });
  return result.publicStudioMembershipTier;
}
