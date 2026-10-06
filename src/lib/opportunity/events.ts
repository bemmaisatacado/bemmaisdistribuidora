export const OPPORTUNITY_EVENTS = [
  "landing_view",
  "video_started",
  "video_10_seconds",
  "cta_revealed",
  "click_atacado",
  "click_drop",
  "click_whatsapp_support",
] as const;

export type OpportunityEventName = (typeof OPPORTUNITY_EVENTS)[number];
export type OpportunityEventPayload = Record<string, string | number | boolean | undefined>;

type OpportunityDataLayer = {
  push: (event: Record<string, string | number | boolean | undefined>) => unknown;
};

function hasDataLayer(value: unknown): value is OpportunityDataLayer {
  return (
    typeof value === "object" &&
    value !== null &&
    "push" in value &&
    typeof value.push === "function"
  );
}

export function dispatchOpportunityEvent(
  event: OpportunityEventName,
  payload: OpportunityEventPayload = {},
  dataLayer?: unknown,
): void {
  if (!hasDataLayer(dataLayer)) return;
  dataLayer.push({ event, ...payload });
}

export function trackOpportunityEvent(
  event: OpportunityEventName,
  payload: OpportunityEventPayload = {},
): void {
  const potentialDataLayer = globalThis as typeof globalThis & { dataLayer?: unknown };
  dispatchOpportunityEvent(event, payload, potentialDataLayer.dataLayer);
}
