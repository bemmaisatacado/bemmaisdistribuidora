import type { OrderStatus, OrderPaymentStatus, OrderFulfillmentStatus } from "./foundation";

export const cancellationStates: readonly OrderStatus[] = ["draft", "pending_payment"];
export function cancellationBlock(input: {
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  payments: readonly OrderPaymentStatus[];
  items: readonly OrderFulfillmentStatus[];
  financial?: boolean;
}) {
  if (!cancellationStates.includes(input.status)) return "ORDER_NOT_CANCELLABLE";
  const settled = ["pending", "failed", "expired", "cancelled"];
  if (!settled.includes(input.paymentStatus) || input.financial) return "ORDER_FINANCIAL_BLOCK";
  if (input.payments.some((s) => !["failed", "expired", "cancelled"].includes(s)))
    return "ORDER_PAYMENT_UNCERTAIN";
  if (input.items.some((s) => !["unassigned", "cancelled"].includes(s)))
    return "ORDER_FULFILLMENT_BLOCK";
  return null;
}
export const validCancellationReason = (reason: string) =>
  reason.trim().length >= 3 && reason.trim().length <= 1000;
export const cancellationErrorMessage = (code: string) =>
  (
    ({
      FORBIDDEN: "Você não tem permissão para cancelar este pedido.",
      ORDER_NOT_CANCELLABLE: "Este estado do pedido não permite cancelamento.",
      ORDER_FINANCIAL_BLOCK: "Pedido com pagamento ou vínculo financeiro. Cancelamento bloqueado.",
      ORDER_PAYMENT_UNCERTAIN: "Há pagamento aberto ou incerto. Verifique antes de cancelar.",
      ORDER_FULFILLMENT_BLOCK: "Há item em execução ou concluído. Cancelamento bloqueado.",
      ORDER_STATUS_CONFLICT: "O pedido mudou. Atualize e revise antes de cancelar.",
      CANCELLATION_IDEMPOTENCY_CONFLICT: "O pedido já foi cancelado com outro motivo.",
      CANCELLATION_REASON_REQUIRED: "Informe um motivo entre 3 e 1000 caracteres.",
      ORDER_LEGACY_CANCELLED: "Cancelamento anterior sem registro operacional. Requer revisão.",
    }) as Record<string, string>
  )[code] ?? "Não foi possível cancelar. Nenhuma alteração parcial foi confirmada.";

export interface OrderCancellationRpc {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}
export type CancellationContext = {
  canCancel: boolean;
  block: string | null;
  reason: string | null;
  cancelledAt: string | null;
};
export function readCancellationContext(raw: unknown): CancellationContext | null {
  if (
    typeof raw !== "object" ||
    raw === null ||
    !("can_cancel" in raw) ||
    typeof raw.can_cancel !== "boolean"
  )
    return null;
  const data = raw as Record<string, unknown>;
  return {
    canCancel: raw.can_cancel,
    block: typeof data.block === "string" ? data.block : null,
    reason: typeof data.reason === "string" ? data.reason : null,
    cancelledAt: typeof data.cancelled_at === "string" ? data.cancelled_at : null,
  };
}
export async function cancelOrder(
  client: OrderCancellationRpc,
  orderId: string,
  status: OrderStatus,
  reason: string,
) {
  if (!validCancellationReason(reason))
    throw new Error(cancellationErrorMessage("CANCELLATION_REASON_REQUIRED"));
  const { data, error } = await client.rpc("cancel_order", {
    _order_id: orderId,
    _expected_status: status,
    _reason: reason.trim(),
  });
  if (error) throw new Error(cancellationErrorMessage(error.message));
  if (
    typeof data !== "object" ||
    data === null ||
    !("order_id" in data) ||
    data.order_id !== orderId
  )
    throw new Error(cancellationErrorMessage("UNKNOWN"));
  return data;
}
