import { createPaymentWebhookHandler, type WebhookVerifier } from "../_shared/payment-webhook.ts";

// No gateway is configured. Registration is backend code, never request-controlled.
const verifiers = new Map<string, WebhookVerifier>();
const handler = createPaymentWebhookHandler(verifiers, async (event) => {
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) throw new Error("PAYMENT_PROVIDER_UNAVAILABLE");
  const response = await fetch(`${url}/rest/v1/rpc/confirm_verified_payment_event`, {
    method: "POST",
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      _provider: event.provider,
      _provider_event_id: event.providerEventId,
      _event_type: event.eventType,
      _payment_id: event.paymentId,
      _provider_payment_id: event.providerPaymentId,
      _amount: event.amount,
      _currency: event.currency,
      _mapped_status: event.status,
      _safe_metadata: event.metadata,
    }),
  });
  if (!response.ok) throw new Error("PROVIDER_EVENT_INVALID");
});
Deno.serve(handler);
