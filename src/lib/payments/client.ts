import { paymentErrorMessage, type PaymentCreationIntent } from "./foundation.ts";

export interface PaymentRpcClient {
  rpc(
    name: "create_order_payment",
    args: {
      _order_id: string;
      _method: string;
      _idempotency_key: string;
    },
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export async function startOrderPayment(client: PaymentRpcClient, intent: PaymentCreationIntent) {
  const { data, error } = await client.rpc("create_order_payment", {
    _order_id: intent.orderId,
    _method: intent.method,
    _idempotency_key: intent.idempotencyKey,
  });
  if (error) return { paymentId: null, message: paymentErrorMessage(error.message) };
  if (
    typeof data !== "object" ||
    data === null ||
    !("payment_id" in data) ||
    typeof data.payment_id !== "string"
  ) {
    return { paymentId: null, message: paymentErrorMessage("PAYMENT_NOT_FOUND") };
  }
  return {
    paymentId: data.payment_id,
    message: "Tentativa registrada. Aguarde a confirmação do pagamento.",
  };
}
