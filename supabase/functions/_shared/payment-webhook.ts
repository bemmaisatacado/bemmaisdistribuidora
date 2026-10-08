import { sanitizePaymentMetadata } from "../../../src/lib/payments/metadata.ts";
import type { VerifiedProviderEvent } from "../../../src/lib/payments/provider.ts";

export type VerifiedPaymentEvent = VerifiedProviderEvent;

export interface WebhookVerifier {
  /** Adapter must validate authenticity, timestamp and replay rules against the raw body. */
  verify(request: { headers: Headers; body: string }): Promise<VerifiedPaymentEvent>;
}

export function createPaymentWebhookHandler(
  verifiers: ReadonlyMap<string, WebhookVerifier>,
  processEvent: (event: VerifiedPaymentEvent) => Promise<void>,
) {
  return async (request: Request): Promise<Response> => {
    const respond = (code: string, status: number) => Response.json({ code }, { status });
    if (request.method !== "POST") return respond("METHOD_NOT_ALLOWED", 405);
    const provider = new URL(request.url).searchParams.get("provider") ?? "";
    const verifier = verifiers.get(provider);
    if (!verifier) return respond("PAYMENT_PROVIDER_UNAVAILABLE", 503);
    try {
      if (Number(request.headers.get("content-length") ?? 0) > 65536)
        return respond("PROVIDER_EVENT_INVALID", 400);
      const body = await request.text();
      if (new TextEncoder().encode(body).length > 65536)
        return respond("PROVIDER_EVENT_INVALID", 400);
      const event = await verifier.verify({ headers: request.headers, body });
      if (
        event.provider !== provider ||
        !/^[a-z0-9_-]{2,50}$/.test(provider) ||
        !/^[0-9a-f-]{36}$/i.test(event.paymentId) ||
        !event.providerEventId ||
        event.providerEventId.length > 160 ||
        !event.providerPaymentId ||
        event.providerPaymentId.length > 160 ||
        !event.eventType ||
        event.eventType.length > 100 ||
        !/^\d{1,10}\.\d{2}$/.test(event.amount) ||
        !/^[A-Z]{3}$/.test(event.currency) ||
        !["processing", "authorized", "paid", "failed", "cancelled", "expired"].includes(
          event.status,
        )
      ) {
        return respond("PROVIDER_EVENT_INVALID", 400);
      }
      await processEvent({ ...event, metadata: sanitizePaymentMetadata(event.metadata) });
      return respond("PROVIDER_EVENT_ACCEPTED", 200);
    } catch {
      return respond("PROVIDER_EVENT_INVALID", 400);
    }
  };
}
