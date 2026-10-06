export const OPPORTUNITY_ROUTE = "/oportunidade";

export const OPPORTUNITY_LINKS = {
  atacado: "https://chat.whatsapp.com/CJ69jmgBIPILSJ3oTEmnuN",
  drop: "https://chat.whatsapp.com/CwkFawv7e4h1pOYsh2QFJA",
  support: "https://wa.me/553897233065",
} as const;

export const OPPORTUNITY_ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
] as const;

export type OpportunityAttributionKey = (typeof OPPORTUNITY_ATTRIBUTION_KEYS)[number];
export type OpportunityAttribution = Partial<Record<OpportunityAttributionKey, string>>;

export const OPPORTUNITY_CTA_REVEAL_AFTER_SECONDS = 10;
export const OPPORTUNITY_ATTRIBUTION_STORAGE_KEY = "bemmais.opportunity.attribution";

export function readOpportunityAttribution(params: URLSearchParams): OpportunityAttribution {
  return OPPORTUNITY_ATTRIBUTION_KEYS.reduce<OpportunityAttribution>((attribution, key) => {
    const value = params.get(key)?.trim();
    if (value) attribution[key] = value;
    return attribution;
  }, {});
}

export function mergeOpportunityAttribution(
  saved: OpportunityAttribution,
  current: OpportunityAttribution,
): OpportunityAttribution {
  return { ...saved, ...current };
}

export function withOpportunityAttribution(
  destination: string,
  attribution: OpportunityAttribution,
): string {
  const url = new URL(destination);
  for (const key of OPPORTUNITY_ATTRIBUTION_KEYS) {
    const value = attribution[key];
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function shouldRevealOpportunityCtas(input: {
  elapsedSeconds: number;
  videoProgressSeconds?: number;
}): boolean {
  return (
    input.elapsedSeconds >= OPPORTUNITY_CTA_REVEAL_AFTER_SECONDS ||
    (input.videoProgressSeconds ?? 0) >= OPPORTUNITY_CTA_REVEAL_AFTER_SECONDS
  );
}

export function isOpportunityVideoConfigured(source: string | null | undefined): source is string {
  return typeof source === "string" && source.trim().length > 0;
}
