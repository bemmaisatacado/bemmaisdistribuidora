import type { OrderCancellationRpc } from "./cancellation";

export const fulfillmentStates = ["ready_to_pick", "picking", "packed", "ready_to_ship"] as const;
export const fulfillmentReservationLabels = {
  reserved: "Reservado",
  released: "Liberado",
  consumed: "Consumido · baixa física",
  not_controlled: "Estoque não controlado",
};
export type OperationalStatus = (typeof fulfillmentStates)[number];
export const fulfillmentLabels: Record<OperationalStatus, string> = {
  ready_to_pick: "Pronto para separar",
  picking: "Em separação",
  packed: "Separado e embalado",
  ready_to_ship: "Baixa física confirmada · pronto para expedição",
};
export const nextFulfillmentState = (status: OperationalStatus): OperationalStatus | null =>
  fulfillmentStates[fulfillmentStates.indexOf(status) + 1] ?? null;
export const fulfillmentTransitionAllowed = (from: OperationalStatus, to: string) =>
  nextFulfillmentState(from) === to;
export const fulfillmentActionLabels: Record<OperationalStatus, string | null> = {
  ready_to_pick: "Iniciar separação",
  picking: "Confirmar separação e embalagem",
  packed: "Confirmar baixa física",
  ready_to_ship: null,
};
export type OperationalItem = {
  id: string;
  name: string;
  sku: string;
  quantity: number;
  reservation: "reserved" | "released" | "consumed" | "not_controlled";
};
export type FulfillmentGroup = {
  id: string;
  status: OperationalStatus;
  owner: string;
  stockOwner: string | null;
  supplier: string | null;
  seller: string | null;
  consumedAt: string | null;
  updatedAt: string;
  items: OperationalItem[];
};
export type FulfillmentContext = {
  canStart: boolean;
  block: string | null;
  groups: FulfillmentGroup[];
  activity: { id: string; action: string; actor: string | null; at: string }[];
};
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const optionalText = (value: unknown) => (typeof value === "string" ? value : null);
const operationalStatus = (value: unknown): value is OperationalStatus =>
  fulfillmentStates.some((status) => status === value);
export function readFulfillmentContext(raw: unknown): FulfillmentContext | null {
  if (!record(raw) || typeof raw.can_start !== "boolean" || !Array.isArray(raw.groups)) return null;
  const groups: FulfillmentGroup[] = [];
  for (const group of raw.groups) {
    if (
      !record(group) ||
      typeof group.id !== "string" ||
      !operationalStatus(group.status) ||
      typeof group.owner !== "string" ||
      typeof group.updated_at !== "string" ||
      !Array.isArray(group.items)
    )
      return null;
    const items: OperationalItem[] = [];
    for (const item of group.items) {
      if (
        !record(item) ||
        typeof item.id !== "string" ||
        typeof item.name !== "string" ||
        typeof item.sku !== "string" ||
        !Number.isInteger(item.quantity) ||
        typeof item.quantity !== "number" ||
        item.quantity <= 0 ||
        !["reserved", "released", "consumed", "not_controlled"].includes(String(item.reservation))
      )
        return null;
      items.push({
        id: item.id,
        name: item.name,
        sku: item.sku,
        quantity: item.quantity,
        reservation: item.reservation as OperationalItem["reservation"],
      });
    }
    groups.push({
      id: group.id,
      status: group.status,
      owner: group.owner,
      stockOwner: optionalText(group.stock_owner),
      supplier: optionalText(group.supplier),
      seller: optionalText(group.seller),
      consumedAt: optionalText(group.stock_consumed_at),
      updatedAt: group.updated_at,
      items,
    });
  }
  const activity = Array.isArray(raw.activity)
    ? raw.activity.flatMap((event) =>
        record(event) &&
        typeof event.action === "string" &&
        typeof event.at === "string" &&
        (typeof event.id === "string" || typeof event.id === "number")
          ? [
              {
                id: String(event.id),
                action: event.action,
                actor: optionalText(event.actor),
                at: event.at,
              },
            ]
          : [],
      )
    : [];
  return { canStart: raw.can_start, block: optionalText(raw.block), groups, activity };
}
export const fulfillmentError = (code: string) =>
  (
    ({
      FORBIDDEN: "Você não tem permissão para operar este pedido.",
      ORDER_NOT_PAID: "O pedido precisa estar pago e não cancelado.",
      PAYMENT_UNCERTAIN: "Há pagamento incerto ou incompatível. Operação bloqueada.",
      PAYMENT_UNVERIFIED: "A confirmação autoritativa do pagamento não foi comprovada.",
      FULFILLMENT_CONTEXT_INVALID:
        "Faltam itens ou responsável operacional. Revise o fulfillment do fornecedor.",
      FULFILLMENT_INVALID_TRANSITION: "O estado mudou ou a ação não é válida. Atualize o pedido.",
      STOCK_POSITION_INVALID: "Divergência na reserva ou saldo. Ajuste operacional necessário.",
      STOCK_RESERVATION_RELEASED: "A reserva já foi liberada. Baixa bloqueada.",
      STOCK_RESERVATION_CONSUMED: "A reserva já foi consumida. Nenhuma segunda baixa é permitida.",
    }) as Record<string, string>
  )[code] ?? "Não foi possível confirmar a operação. Atualize e revise o pedido.";
export async function operateFulfillment(
  client: OrderCancellationRpc,
  intent:
    | { orderId: string }
    | { fulfillmentId: string; expectedStatus: OperationalStatus; targetStatus: OperationalStatus },
) {
  const start = "orderId" in intent;
  if (!start && !fulfillmentTransitionAllowed(intent.expectedStatus, intent.targetStatus))
    throw new Error(fulfillmentError("FULFILLMENT_INVALID_TRANSITION"));
  const { data, error } = await client.rpc(
    start ? "start_order_fulfillment" : "advance_order_fulfillment",
    start
      ? { _order_id: intent.orderId }
      : {
          _fulfillment_id: intent.fulfillmentId,
          _expected_status: intent.expectedStatus,
          _target_status: intent.targetStatus,
        },
  );
  if (error) throw new Error(fulfillmentError(error.message));
  if (
    !record(data) ||
    (start ? data.order_id !== intent.orderId : data.fulfillment_id !== intent.fulfillmentId)
  )
    throw new Error(fulfillmentError("UNKNOWN"));
  return data;
}

// Mirrors existing reserve/release/out semantics for pure validation, NOT a stock writer.
export function consumptionEffect(balance: { onHand: number; reserved: number }, quantity: number) {
  if (
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    balance.onHand < quantity ||
    balance.reserved < quantity ||
    balance.onHand - balance.reserved < 0
  )
    throw new Error("STOCK_POSITION_INVALID");
  return {
    onHand: balance.onHand - quantity,
    reserved: balance.reserved - quantity,
    available: balance.onHand - balance.reserved,
  };
}

export function operationalGroupKey(item: {
  fulfillmentOwner: string;
  stockOwner: string | null;
  supplier: string | null;
  seller: string | null;
}) {
  return [item.fulfillmentOwner, item.stockOwner, item.supplier, item.seller]
    .map((id) => id ?? "none")
    .join(":");
}
