"use server";
import { revalidatePath } from "next/cache";
import { studioGraphql as keystoneClient } from "@/features/platform/lib/studio-graphql";
import { staffActionError } from "@/features/platform/lib/action-error";

/** The signed-in operator's own tenant settings, as stored, and the current participation policy. */
export async function loadStudioSettingsEditor() {
  const response = await keystoneClient<{ studioSettingsEditor: { settings: any; participationPolicy: any } }>(`query StudioSettingsEditor { studioSettingsEditor }`);
  if (!response.success) return { success: false as const, error: staffActionError(response, "Settings could not be loaded. Reload the page.") };
  return { success: true as const, data: response.data.studioSettingsEditor };
}

export async function saveStudioSettings(data: Record<string, unknown>, expectedUpdatedAt: string | null) {
  const response = await keystoneClient<{ upsertStudioSettings: { id: string } }>(`
    mutation UpsertStudioSettings($data: StudioSettingsUpdateInput!, $expectedUpdatedAt: String) {
      upsertStudioSettings(data: $data, expectedUpdatedAt: $expectedUpdatedAt) { id }
    }
  `, { data, expectedUpdatedAt });
  // Returned, not thrown: production Server Actions hide thrown messages.
  if (!response.success) return { success: false as const, error: staffActionError(response, "Settings were not saved. Check the highlighted values and try again.") };
  revalidatePath("/dashboard/platform/store-settings");
  revalidatePath("/", "layout");
  return { success: true as const, id: response.data.upsertStudioSettings.id };
}

export async function publishParticipationTerms(text: string, expectedPolicyId: string | null) {
  const response = await keystoneClient<{ publishStudioParticipationTerms: any }>(`
    mutation PublishParticipationTerms($text: String!, $expectedPolicyId: ID) {
      publishStudioParticipationTerms(text: $text, expectedPolicyId: $expectedPolicyId)
    }
  `, { text, expectedPolicyId });
  if (!response.success) return { success: false as const, error: staffActionError(response, "Terms were not published. Reload and try again.") };
  return { success: true as const, policy: response.data.publishStudioParticipationTerms };
}
