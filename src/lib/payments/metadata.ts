export type SafePaymentMetadata = {
  event?: string;
  retry?: number;
  reason_code?: string;
};

/** Persist only operational fields. Unknown/nested objects and arrays are discarded. */
export function sanitizePaymentMetadata(metadata: Record<string, unknown>): SafePaymentMetadata {
  const result: SafePaymentMetadata = {};
  for (const [rawKey, value] of Object.entries(metadata).slice(0, 32)) {
    const key = rawKey.toLowerCase();
    if ((key === "event" || key === "reason_code") && typeof value === "string") {
      const allowed =
        key === "event"
          ? ["pending", "processing", "authorized", "paid", "failed", "cancelled", "expired"]
          : ["PROVIDER_EVENT_INVALID", "PAYMENT_FAILED", "PAYMENT_CANCELLED", "PAYMENT_EXPIRED"];
      if (allowed.includes(value)) result[key] = value;
    }
    if (
      key === "retry" &&
      typeof value === "number" &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 100
    ) {
      result.retry = value;
    }
  }
  return result;
}
