import assert from "node:assert/strict";
import test from "node:test";
import {
  orderStateForPayment,
  paymentAmountFromOrder,
  paymentCreationError,
  paymentErrorMessage,
  paymentTransitionAllowed,
  sanitizePaymentMetadata,
  type PaymentOrder,
} from "../src/lib/payments/foundation.ts";

const buyer = "00000000-0000-4000-8000-000000000001";
const order: PaymentOrder = {
  id: "00000000-0000-4000-8000-000000000010",
  buyerUserId: buyer,
  status: "pending_payment",
  paymentStatus: "pending",
  totalAmount: "399.90",
  currency: "BRL",
};

test("cria pagamento somente para o comprador e usa o total histórico do pedido", () => {
  assert.equal(paymentCreationError(order, buyer, { idempotencyKey: "attempt-1" }), null);
  assert.equal(
    paymentCreationError(order, "other", { idempotencyKey: "attempt-1" }),
    "UNAUTHORIZED_PAYMENT",
  );
  assert.deepEqual(paymentAmountFromOrder(order), { amount: "399.90", currency: "BRL" });
});

test("intenção de pagamento não carrega preço definido pelo frontend", () => {
  const intent = { orderId: order.id, method: "pix" as const, idempotencyKey: "attempt-1" };
  assert.equal("amount" in intent, false);
});

test("idempotência exige chave e pedido já pago não é pagável", () => {
  assert.equal(
    paymentCreationError(order, buyer, { idempotencyKey: " " }),
    "PAYMENT_IDEMPOTENCY_CONFLICT",
  );
  assert.equal(
    paymentCreationError({ ...order, status: "paid", paymentStatus: "paid" }, buyer, {
      idempotencyKey: "attempt-2",
    }),
    "ORDER_NOT_PAYABLE",
  );
});

test("lifecycle permite somente transições de pagamento coerentes", () => {
  assert.equal(paymentTransitionAllowed("pending", "processing"), true);
  assert.equal(paymentTransitionAllowed("processing", "paid"), true);
  assert.equal(paymentTransitionAllowed("paid", "processing"), false);
  assert.equal(paymentTransitionAllowed("failed", "pending"), false);
  assert.equal(paymentTransitionAllowed("expired", "paid"), false);
});

test("nova tentativa deve ser outro Payment após falha, expiração ou cancelamento", () => {
  assert.equal(paymentTransitionAllowed("failed", "pending"), false);
  assert.equal(paymentTransitionAllowed("expired", "pending"), false);
  assert.equal(paymentTransitionAllowed("cancelled", "pending"), false);
});

test("pagamento confirmado sincroniza pedido sem regredir em falha", () => {
  assert.deepEqual(orderStateForPayment(order, "paid"), { status: "paid", paymentStatus: "paid" });
  assert.deepEqual(orderStateForPayment(order, "failed"), {
    status: "pending_payment",
    paymentStatus: "pending",
  });
});

test("falha e processamento preservam a reserva para fluxo posterior", () => {
  assert.equal(orderStateForPayment(order, "failed").status, "pending_payment");
  assert.equal(orderStateForPayment(order, "processing").status, "pending_payment");
});

test("metadata de provider remove dados sensíveis dos DTOs", () => {
  assert.deepEqual(
    sanitizePaymentMetadata({
      event: "paid",
      cvv: "123",
      pan: "4111111111111111",
      retry: 2,
      nested: {},
    }),
    { event: "paid", retry: 2 },
  );
});

test("erros de pagamento permanecem seguros para a interface", () => {
  assert.equal(
    paymentErrorMessage("PAYMENT_ALREADY_PAID"),
    "Este pedido já possui um pagamento confirmado.",
  );
  assert.equal(
    paymentErrorMessage("DATABASE_ERROR"),
    "Não foi possível processar o pagamento agora.",
  );
});
