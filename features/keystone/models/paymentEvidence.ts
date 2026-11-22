type PaymentRecord = Record<string, any>;

const STUDIO_SETTLED = new Set(["succeeded", "refunded"]);
const MEMBERSHIP_SETTLED = new Set(["completed", "disputed", "refunded"]);

const STUDIO_TRANSITIONS: Record<string, Set<string>> = {
  pending: new Set(["pending", "succeeded", "failed"]),
  failed: new Set(["failed", "succeeded"]),
  succeeded: new Set(["succeeded", "refunded"]),
  refunded: new Set(["refunded"]),
};
const MEMBERSHIP_TRANSITIONS: Record<string, Set<string>> = {
  pending: new Set(["pending", "completed", "failed"]),
  failed: new Set(["failed", "completed"]),
  completed: new Set(["completed", "disputed", "refunded"]),
  disputed: new Set(["disputed", "completed", "refunded"]),
  refunded: new Set(["refunded"]),
};

const STUDIO_EVIDENCE_FIELDS = [
  "member",
  "subscription",
  "paymentProvider",
  "paymentSession",
  "amount",
  "currencyCode",
  "paymentDate",
  "metadata",
  "stripePaymentIntentId",
  "stripeChargeId",
  "stripeInvoiceId",
  "receiptNumber",
  "description",
] as const;
const MEMBERSHIP_EVIDENCE_FIELDS = [
  "member",
  "membership",
  "amount",
  "currencyCode",
  "paymentType",
  "paymentDate",
  "paymentMethod",
  "stripePaymentIntentId",
  "stripeChargeId",
  "stripeInvoiceId",
  "receiptNumber",
  "receiptUrl",
  "description",
  "isRecurring",
  "processedBy",
] as const;

function comparable(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

function validateTransition(
  model: string,
  currentStatus: string,
  nextStatus: unknown,
  transitions: Record<string, Set<string>>
) {
  if (nextStatus === undefined || nextStatus === currentStatus) return;
  if (
    typeof nextStatus !== "string" ||
    !transitions[currentStatus]?.has(nextStatus)
  ) {
    throw new Error(
      `${model} status transition ${currentStatus} -> ${String(nextStatus)} is not allowed.`
    );
  }
}

function validateImmutableEvidence(
  model: string,
  current: PaymentRecord,
  resolvedData: PaymentRecord,
  fields: readonly string[]
) {
  for (const field of fields) {
    if (!(field in resolvedData)) continue;
    const next = resolvedData[field];
    const previous = current[field];
    const relationshipWrite =
      next && typeof next === "object" &&
      ("connect" in next || "disconnect" in next || "set" in next);
    if (
      relationshipWrite ||
      JSON.stringify(comparable(next)) !== JSON.stringify(comparable(previous))
    ) {
      throw new Error(`${model} settled evidence is immutable: ${field}.`);
    }
  }
}

export function validatePaymentUpdate(
  current: PaymentRecord,
  resolvedData: PaymentRecord
) {
  validateTransition("Payment", current.status, resolvedData.status, STUDIO_TRANSITIONS);
  if (STUDIO_SETTLED.has(current.status)) {
    validateImmutableEvidence("Payment", current, resolvedData, STUDIO_EVIDENCE_FIELDS);
  }
}

export function validateMembershipPaymentUpdate(
  current: PaymentRecord,
  resolvedData: PaymentRecord
) {
  validateTransition(
    "MembershipPayment",
    current.status,
    resolvedData.status,
    MEMBERSHIP_TRANSITIONS
  );
  if (MEMBERSHIP_SETTLED.has(current.status)) {
    validateImmutableEvidence(
      "MembershipPayment",
      current,
      resolvedData,
      MEMBERSHIP_EVIDENCE_FIELDS
    );
  }
}

export function validateSettledPaymentDelete(
  model: "Payment" | "MembershipPayment",
  current: PaymentRecord
) {
  const settled = model === "Payment" ? STUDIO_SETTLED : MEMBERSHIP_SETTLED;
  if (settled.has(current.status)) {
    throw new Error(`${model} settled evidence cannot be deleted.`);
  }
}

export function paymentEvidenceHooks(
  model: "Payment" | "MembershipPayment"
) {
  return {
    validateInput({ operation, item, resolvedData, addValidationError }: any) {
      if (operation !== "update" || !item) return;
      try {
        if (model === "Payment") validatePaymentUpdate(item, resolvedData);
        else validateMembershipPaymentUpdate(item, resolvedData);
      } catch (error) {
        addValidationError(error instanceof Error ? error.message : String(error));
      }
    },
    validateDelete({ item, addValidationError }: any) {
      try {
        validateSettledPaymentDelete(model, item);
      } catch (error) {
        addValidationError(error instanceof Error ? error.message : String(error));
      }
    },
  };
}
