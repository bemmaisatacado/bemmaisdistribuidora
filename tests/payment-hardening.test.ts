import assert from "node:assert/strict";
import test from "node:test";
import { sanitizePaymentMetadata } from "../src/lib/payments/metadata.ts";
import {
  createPaymentWebhookHandler,
  type VerifiedPaymentEvent,
} from "../supabase/functions/_shared/payment-webhook.ts";
import { startOrderPayment } from "../src/lib/payments/client.ts";

const event: VerifiedPaymentEvent = {
  provider: "test_adapter",
  providerEventId: "event-1",
  eventType: "payment.paid",
  paymentId: "00000000-0000-4000-8000-000000000010",
  providerPaymentId: "external-1",
  amount: "399.90",
  currency: "BRL",
  status: "paid",
  failureCode: null,
  metadata: { event: "paid" },
};

test("metadata uses bounded scalar allowlist and discards nested secrets and arrays", () => {
  assert.deepEqual(
    sanitizePaymentMetadata({
      EVENT: "paid",
      RETRY: 2,
      nested: { Authorization: "secret" },
      list: [{ CVV: "123" }],
      TOKEN: "private",
      event_id: "4111111111111111",
      reason_code: "4111111111111111",
    }),
    { event: "paid", retry: 2 },
  );
  assert.deepEqual(
    sanitizePaymentMetadata({ event: "a".repeat(81), retry: 101, reason_code: ["secret"] }),
    {},
  );
});

test("unconfigured webhook rejects even a publicly supplied paid event", async () => {
  let called = false;
  const handler = createPaymentWebhookHandler(new Map(), async () => {
    called = true;
  });
  const response = await handler(
    new Request("https://example.test?provider=stripe", {
      method: "POST",
      body: JSON.stringify(event),
    }),
  );
  assert.equal(response.status, 503);
  assert.equal(called, false);
});

test("failed provider authenticity verification never reaches confirmation", async () => {
  let called = false;
  const handler = createPaymentWebhookHandler(
    new Map([
      [
        "test_adapter",
        {
          verify: async () => {
            throw new Error("bad signature");
          },
        },
      ],
    ]),
    async () => {
      called = true;
    },
  );
  assert.equal(
    (
      await handler(
        new Request("https://example.test?provider=test_adapter", { method: "POST", body: "{}" }),
      )
    ).status,
    400,
  );
  assert.equal(called, false);
});

test("verified boundary validates provider identity and sends only sanitized metadata", async () => {
  let received: VerifiedPaymentEvent | null = null;
  const handler = createPaymentWebhookHandler(
    new Map([
      [
        "test_adapter",
        { verify: async () => ({ ...event, metadata: { event: "paid", secret: "private" } }) },
      ],
    ]),
    async (value) => {
      received = value;
    },
  );
  assert.equal(
    (
      await handler(
        new Request("https://example.test?provider=test_adapter", { method: "POST", body: "{}" }),
      )
    ).status,
    200,
  );
  assert.deepEqual(received, event);
  const invalid = createPaymentWebhookHandler(
    new Map([["test_adapter", { verify: async () => ({ ...event, provider: "other" }) }]]),
    async () => {
      assert.fail("invalid provider reached DB");
    },
  );
  assert.equal(
    (
      await invalid(
        new Request("https://example.test?provider=test_adapter", { method: "POST", body: "{}" }),
      )
    ).status,
    400,
  );
});

test("payment caller sends intent only and displays provider unavailability honestly", async () => {
  const result = await startOrderPayment(
    {
      rpc: async (name, args) => {
        assert.equal(name, "create_order_payment");
        assert.deepEqual(args, {
          _order_id: event.paymentId,
          _method: "pix",
          _idempotency_key: "attempt-1",
        });
        return { data: null, error: { message: "PAYMENT_PROVIDER_UNAVAILABLE" } };
      },
    },
    { orderId: event.paymentId, method: "pix", idempotencyKey: "attempt-1" },
  );
  assert.equal(result.paymentId, null);
  assert.match(result.message, /indisponível/);
});
