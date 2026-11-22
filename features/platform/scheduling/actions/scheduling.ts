"use server";

import { studioGraphql as keystoneClient } from "@/features/platform/lib/studio-graphql";
import { staffActionError } from "@/features/platform/lib/action-error";

/** Returned, not thrown: production Server Actions hide thrown messages behind a generic render error. */
export type SchedulingActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  instructor: string;
  capacity: string;
  type: string;
  color: string;
  isCancelled?: boolean;
  rosterHref?: string;
  scheduleId?: string;
};

export async function getSchedulingWorkspaceData(
  start: Date,
  end: Date,
  options?: { userId?: string; isInstructorOnly?: boolean },
) {
  const response = await keystoneClient<{ schedulingWorkspace: any }>(`
    query SchedulingWorkspace($start: DateTime!, $end: DateTime!, $userId: ID) {
      schedulingWorkspace(start: $start, end: $end, userId: $userId)
    }
  `, {
    start: start.toISOString(),
    end: end.toISOString(),
    userId: options?.userId || null,
  });
  if (!response.success) throw new Error(response.error);
  return response.data.schedulingWorkspace as {
    events: CalendarEvent[];
    schedules: any[];
    instructors: any[];
    classTypes: any[];
    locations: any[];
    resources: any[];
    upcomingInstances: any[];
    timeZone: string;
    eventsComplete: boolean;
    truncated: Partial<Record<"schedules" | "instructors" | "classTypes" | "locations" | "resources", boolean>>;
  };
}

export async function cancelClassInstanceAction(classInstanceId: string, reason: string) {
  const response = await keystoneClient<{
    cancelClassInstance: { cancelledBookings: number; refundedCredits: number; reused: boolean };
  }>(`
    mutation CancelClassInstance($classInstanceId: ID!, $reason: String!) {
      cancelClassInstance(classInstanceId: $classInstanceId, reason: $reason) {
        cancelledBookings refundedCredits reused
      }
    }
  `, { classInstanceId, reason });
  if (!response.success) return { ok: false as const, error: staffActionError(response, "The session was not cancelled. Refresh and try again.") };
  return { ok: true as const, data: response.data.cancelClassInstance };
}

export async function saveClassSchedule(data: Record<string, unknown>, id?: string | null) {
  const result = await keystoneClient<{ saveStudioClassSchedule: { id: string } }>(`
    mutation SaveStudioClassSchedule($id: ID, $data: JSON!) { saveStudioClassSchedule(id: $id, data: $data) { id } }
  `, { id: id || null, data });
  if (!result.success) return { ok: false as const, error: staffActionError(result, "The template was not saved. Check the instructor, place and times, then try again.") };
  return { ok: true as const, data: result.data.saveStudioClassSchedule };
}

export type ClassScheduleDeletePreview = { scheduleId: string; name: string; sessionCount: number; blockedReason: string | null; deleted: boolean };

/** Read-only check used before the confirmation dialog opens. */
export async function previewClassScheduleDelete(id: string) {
  const result = await keystoneClient<{ deleteStudioClassSchedule: ClassScheduleDeletePreview }>(`
    mutation PreviewDeleteStudioClassSchedule($id: ID!) { deleteStudioClassSchedule(id: $id, dryRun: true) }
  `, { id });
  if (!result.success) return { ok: false as const, error: staffActionError(result, "Could not check this template. Refresh and try again.") };
  return { ok: true as const, data: result.data.deleteStudioClassSchedule };
}

export async function deleteClassSchedule(id: string) {
  const result = await keystoneClient<{ deleteStudioClassSchedule: ClassScheduleDeletePreview }>(`
    mutation DeleteStudioClassSchedule($id: ID!) { deleteStudioClassSchedule(id: $id) }
  `, { id });
  if (!result.success) return { ok: false as const, error: staffActionError(result, "The template was not deleted. Refresh and try again.") };
  return { ok: true as const, data: result.data.deleteStudioClassSchedule };
}

export async function saveClassInstance(data: Record<string, unknown>, id?: string | null) {
  const result = await keystoneClient<{ saveStudioClassInstance: { id: string } }>(`
    mutation SaveStudioClassInstance($id: ID, $data: JSON!) { saveStudioClassInstance(id: $id, data: $data) { id } }
  `, { id: id || null, data });
  if (!result.success) return { ok: false as const, error: staffActionError(result, "The session was not saved. Check the instructor, place, time and capacity, then try again.") };
  return { ok: true as const, data: result.data.saveStudioClassInstance };
}

export async function generateUpcomingInstances(weeks: number = 4) {
  const response = await keystoneClient<{
    generateUpcomingClassInstances: { success: boolean; createdCount: number; skippedNonexistent: number };
  }>(`
    mutation GenerateUpcomingClassInstances($weeks: Int!) {
      generateUpcomingClassInstances(weeks: $weeks) { success createdCount skippedNonexistent }
    }
  `, { weeks });
  if (!response.success) return { ok: false as const, error: staffActionError(response, "Upcoming sessions were not created. Refresh and try again.") };
  return { ok: true as const, data: response.data.generateUpcomingClassInstances };
}
