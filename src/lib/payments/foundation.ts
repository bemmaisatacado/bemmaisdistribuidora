import type { OrderPaymentStatus, OrderStatus } from "../orders/foundation";
export { sanitizePaymentMetadata } from "./metadata.ts";

export type PaymentMethod = "pix" | "card";
export type PaymentStatus = OrderPaymentStatus;
export type PaymentCreationIntent = {
  orderId: string;
  method: PaymentMethod;
  idempotencyKey: string;
};
export type PaymentOrder = {
  id: string;
  buyerUserId: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalAmount: string;
  currency: string;
};
export type PaymentCreationError =
  "UNAUTHORIZED_PAYMENT" | "ORDER_NOT_PAYABLE" | "PAYMENT_IDEMPOTENCY_CONFLICT";

export const paymentTransitionAllowed = (from: PaymentStatus, to: PaymentStatus) => {
  if (from === to) return true;
  const transitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
    pending: ["processing", "authorized", "paid", "failed", "cancelled", "expired"],
    processing: ["authorized", "paid", "failed", "cancelled", "expired"],
    authorized: ["paid", "failed", "cancelled", "expired"],
    paid: ["refunded", "partially_refunded", "chargeback"],
    failed: [],
    cancelled: [],
    expired: [],
    refunded: [],
    partially_refunded: [],
    chargeback: [],
  };
  return transitions[from].includes(to);
};

export const paymentCreationError = (
  order: PaymentOrder | null,
  buyerUserId: string | null,
  intent: Pick<PaymentCreationIntent, "idempotencyKey">,
): PaymentCreationError | null => {
  if (!buyerUserId || !order || order.buyerUserId !== buyerUserId) return "UNAUTHORIZED_PAYMENT";
  if (!intent.idempotencyKey.trim()) return "PAYMENT_IDEMPOTENCY_CONFLICT";
  if (
    order.status !== "pending_payment" ||
    order.paymentStatus === "paid" ||
    order.totalAmount === "0.00"
  )
    return "ORDER_NOT_PAYABLE";
  return null;
};

export const paymentAmountFromOrder = (order: Pick<PaymentOrder, "totalAmount" | "currency">) => ({
  amount: order.totalAmount,
  currency: order.currency,
});

export const orderStateForPayment = (
  current: Pick<PaymentOrder, "status" | "paymentStatus">,
  paymentStatus: PaymentStatus,
) =>
  paymentStatus === "paid"
    ? { status: "paid" as const, paymentStatus: "paid" as const }
    : { status: current.status, paymentStatus: current.paymentStatus };

export const paymentErrorMessage = (code: string) =>
  (
    ({
      ORDER_NOT_PAYABLE: "Este pedido não está disponível para pagamento.",
      PAYMENT_ALREADY_PAID: "Este pedido já possui um pagamento confirmado.",
      PAYMENT_INVALID_TRANSITION: "A atualização de pagamento não é válida.",
      PAYMENT_IDEMPOTENCY_CONFLICT: "Não foi possível confirmar esta tentativa de pagamento.",
      PAYMENT_NOT_FOUND: "Pagamento não encontrado.",
      PAYMENT_IN_PROGRESS: "Já existe uma tentativa de pagamento em andamento.",
      PAYMENT_METHOD_UNSUPPORTED: "Este método de pagamento não está disponível.",
      PAYMENT_PROVIDER_UNAVAILABLE:
        "Pagamento online ainda indisponível. Seu pedido permanece aguardando pagamento.",
      PROVIDER_EVENT_DUPLICATE: "Este evento de pagamento já foi processado.",
      PROVIDER_EVENT_INVALID: "Não foi possível validar a atualização de pagamento.",
      UNAUTHORIZED_PAYMENT: "Você não tem permissão para pagar este pedido.",
    }) as Record<string, string>
  )[code] ?? "Não foi possível processar o pagamento agora.";
