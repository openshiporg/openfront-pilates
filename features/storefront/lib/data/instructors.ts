import { gql } from "graphql-request";
import { studioClient } from "@/features/storefront/lib/config";
import { PUBLIC_PAGE_SIZE, collectPublicPages, publicCatalogPage } from "./pages";
import { coachPhoto } from "@/features/storefront/lib/media";

export type InstructorData = {
  id: string;
  user: { name: string };
  bio: any;
  specialties: string[];
  certifications: string[];
  photo: string | null;
  isActive: boolean;
};

type PublicInstructor = {
  id: string;
  name: string;
  bio?: string | null;
  specialties: string[];
  certifications: string[];
  imagePath?: string | null;
};

function instructorShape(instructor: PublicInstructor): InstructorData {
  return {
    id: instructor.id,
    user: { name: instructor.name },
    bio: instructor.bio ?? null,
    specialties: instructor.specialties,
    certifications: instructor.certifications,
    photo: coachPhoto(instructor.imagePath, instructor.name),
    isActive: true,
  };
}

export async function getInstructors(): Promise<InstructorData[]> {
  const { items } = await collectPublicPages(async (skip) => (await studioClient.request<{ publicStudioInstructors: PublicInstructor[] }>(gql`
    query StorefrontInstructors($skip: Int, $limit: Int) {
      publicStudioInstructors(limit: $limit, skip: $skip) { id name bio specialties certifications imagePath }
    }
  `, { skip, limit: PUBLIC_PAGE_SIZE })).publicStudioInstructors);
  return items.map(instructorShape).sort((left, right) => left.user.name.localeCompare(right.user.name));
}

/** One page of published coaches after `after` (keyset continuation). */
export async function getInstructorPage(after?: string) {
  const page = await publicCatalogPage(async (limit) => (await studioClient.request<{ publicStudioInstructors: PublicInstructor[] }>(gql`
    query StorefrontInstructorPage($limit: Int, $after: ID) {
      publicStudioInstructors(limit: $limit, after: $after) { id name bio specialties certifications imagePath }
    }
  `, { limit, after: after || null })).publicStudioInstructors);
  return { items: page.items.map(instructorShape), nextAfter: page.nextAfter };
}

export async function getInstructorById(id: string): Promise<InstructorData | null> {
  const result = await studioClient.request<{ publicStudioInstructor: PublicInstructor | null }>(gql`
    query StorefrontInstructor($id: ID!) {
      publicStudioInstructor(id: $id) { id name bio specialties certifications imagePath }
    }
  `, { id });
  return result.publicStudioInstructor ? instructorShape(result.publicStudioInstructor) : null;
}

export async function getInstructorSchedules(instructorId: string) {
  const result = await studioClient.request<{ publicStudioSchedules: any[] }>(gql`
    query StorefrontInstructorSchedules($instructorId: ID!) {
      publicStudioSchedules(instructorId: $instructorId, limit: 100) {
        id name description dayOfWeek startTime endTime maxCapacity
      }
    }
  `, { instructorId });
  return result.publicStudioSchedules;
}
