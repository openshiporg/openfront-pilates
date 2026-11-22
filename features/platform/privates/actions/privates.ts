"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { studioGraphql as keystoneClient } from "@/features/platform/lib/studio-graphql";
import { staffActionError } from "@/features/platform/lib/action-error";
import { exactLocalTimeToUtc, normalizeTimeZone } from "@/lib/timezone";
import { openStaffIntent, settleStaffIntent } from "@/features/platform/lib/staff-intent";

export async function loadTrainingWorkspace(options: { skip?: number; cardSkip?: number; availabilitySkip?: number; memberQuery?: string } = {}) {
  const bound = (value?: number) => Number.isSafeInteger(value) ? Math.min(Math.max(0, value as number), 100_000) : 0;
  const response = await keystoneClient<{ trainingWorkspace: any }>(
    `query PrivatesWorkspace($skip: Int!, $cardSkip: Int!, $availabilitySkip: Int!, $memberQuery: String) { trainingWorkspace(skip: $skip, cardSkip: $cardSkip, availabilitySkip: $availabilitySkip, memberQuery: $memberQuery) }`,
    { skip: bound(options.skip), cardSkip: bound(options.cardSkip), availabilitySkip: bound(options.availabilitySkip), memberQuery: (options.memberQuery || "").slice(0, 100) || null },
  );
  if (!response.success) throw new Error(response.error);
  return { ...response.data.trainingWorkspace, asOf: Date.now() };
}
function dateValue(value: string, timeZone: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!match) throw new Error("Choose a valid local date and time");
  const [, y, m, d, h = "12", min = "00"] = match;
  return exactLocalTimeToUtc({ year: Number(y), month: Number(m), day: Number(d), hour: Number(h), minute: Number(min) }, normalizeTimeZone(timeZone)).toISOString();
}
export async function trainingAction(submitted: FormData): Promise<void> {
  const path = submitted.get("surface") === "member" ? "/account/privates" : "/dashboard/platform/privates";
  let message = "Saved";
  let checkoutUrl: string | null = null;
  let intentId = "";
  try {
    // The request is recorded before it is sent; a retry resends exactly that record.
    const intent = await openStaffIntent("training", submitted);
    intentId = intent.id;
    const form = intent.form;
    const operation = String(form.get("operation") || "");
    const timeZone = String(form.get("timeZone") || "UTC");
    const text = (key: string) => String(form.get(key) || "");
    const numeric = (key: string) => Number(text(key));
    const date = (key: string) => dateValue(text(key), timeZone);
    // A blank weekday stays blank so the server can reject it instead of reading Sunday.
    const weekday = text("dayOfWeek") === "" ? null : numeric("dayOfWeek");
    // Effective bounds cover whole local days.
    const bound = (key: string, time: string) => text(key) ? dateValue(`${text(key)}T${time}`, timeZone) : null;
    const operations: Record<string, { query: string; variables: Record<string, unknown> }> = {
      book: { query: `mutation BookTraining($data: JSON!) { bookAppointment(data: $data) }`, variables: { data: { instructorId: text("instructorId"), resourceId: text("resourceId") || null, trainingPackageId: text("trainingPackageId"), startTime: date("startTime"), memberNotes: text("memberNotes"), idempotencyKey: text("requestKey") } } },
      reschedule: { query: `mutation RescheduleTraining($data: JSON!) { rescheduleAppointment(data: $data) }`, variables: { data: { appointmentId: text("appointmentId"), instructorId: text("instructorId") || undefined, startTime: date("startTime"), idempotencyKey: text("requestKey"), reason: text("reason") } } },
      transition: { query: `mutation TransitionTraining($appointmentId: ID!, $status: String!, $reason: String) { transitionAppointment(appointmentId: $appointmentId, status: $status, reason: $reason) }`, variables: { appointmentId: text("appointmentId"), status: text("status"), reason: text("reason") } },
      package: { query: `mutation RecordTraining($data: JSON!) { recordTrainingPackage(data: $data) }`, variables: { data: { requestKey: text("requestKey"), memberId: text("memberId"), locationId: text("locationId"), serviceName: text("serviceName"), amount: numeric("amount"), currencyCode: "USD", totalCredits: numeric("totalCredits"), durationMinutes: numeric("durationMinutes"), purchasedAt: date("purchasedAt"), expiresAt: date("expiresAt"), purchaseReference: text("purchaseReference") } } },
      refund: { query: `mutation RefundTraining($data: JSON!) { refundTrainingPackage(data: $data) }`, variables: { data: { requestKey: text("requestKey"), packageId: text("packageId"), amount: numeric("amount"), refundReference: text("refundReference") } } },
      availability: { query: `mutation Availability($data: JSON!) { saveInstructorAvailability(data: $data) }`, variables: { data: { requestKey: text("requestKey"), id: text("id") || null, instructorId: text("instructorId"), locationId: text("locationId"), type: text("type"), dayOfWeek: weekday, date: date("date"), effectiveFrom: bound("effectiveFrom", "00:00"), effectiveTo: bound("effectiveTo", "23:59"), startTime: text("fromTime"), endTime: text("toTime"), isAvailable: text("type") !== "time_off", reason: text("reason") } } },
    };
    const startCard = operation === "package" && form.get("cardCheckout") === "yes";
    const selected = startCard
      ? { query: `mutation StartCardTraining($data: JSON!) { recordTrainingPackage(data: $data) }`, variables: { data: { mode: "startCard", memberId: text("memberId"), locationId: text("locationId"), serviceName: text("serviceName"), amount: numeric("amount"), totalCredits: numeric("totalCredits"), durationMinutes: numeric("durationMinutes"), expiresAt: date("expiresAt"), requestKey: text("requestKey") } } }
      : operations[operation];
    if (!selected) throw new Error("Unknown privates action");
    const response = await keystoneClient<Record<string, any>>(selected.query, selected.variables);
    if (!response.success) throw new Error(staffActionError(response, "Unable to save privates action. Refresh and try again."));
    if (startCard) {
      checkoutUrl = response.data.recordTrainingPackage?.checkoutUrl || null;
      if (!checkoutUrl) throw new Error("Card checkout could not be opened. Try again.");
    }
    if (operation === "book") message = "Session reserved";
    await settleStaffIntent(intentId, "succeeded");
  } catch (error) {
    message = error instanceof Error ? error.message : "Unable to save privates action";
    const status = intentId ? await settleStaffIntent(intentId, "failed", message) : "unknown";
    // The server confirmed this exact request although its response didn't arrive.
    if (status === "succeeded") redirect(`${path}?success=${encodeURIComponent("Saved. The confirmation arrived late, so nothing was repeated.")}`);
    redirect(`${path}?error=${encodeURIComponent(message)}${intentId ? `&intent=${encodeURIComponent(intentId)}` : ""}`);
  }
  // Staff hand the counter device to the customer; Stripe returns with the checkout id.
  if (checkoutUrl) redirect(checkoutUrl);
  revalidatePath("/dashboard/platform/privates"); revalidatePath("/account/privates");
  redirect(`${path}?success=${encodeURIComponent(message)}`);
}
