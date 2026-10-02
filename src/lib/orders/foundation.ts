export type OrderStatus = "draft" | "pending_payment" | "paid" | "cancelled";
export type OrderPaymentStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "chargeback"
  | "cancelled";
export type OrderFulfillmentStatus = "unassigned" | "pending" | "fulfilled" | "cancelled";

export type OrderItemReference = {
  productId: string | null;
  variantId: string | null;
  storeListingId: string | null;
  supplierOfferId: string | null;
  sellerOrganizationId: string | null;
  supplierOrganizationId: string | null;
  stockOwnerOrganizationId: string | null;
  fulfillmentOwnerOrganizationId: string | null;
};

export type OrderItemSnapshot = OrderItemReference & {
  productName: string;
  sku: string;
  imagePath: string | null;
  attributes: Record<string, string>;
  commercialModality: string | null;
  unitPrice: string;
  quantity: number;
  subtotal: string;
};

export type AdminOrderSummary = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  currency: string;
  totalAmount: string;
  itemCount: number;
  storeName: string | null;
  buyerName: string | null;
  createdAt: string;
  fulfillmentStatus: OrderFulfillmentStatus;
  totalCount?: number;
};

export type OrderStatusPresentation = {
  label: string;
  tone: "default" | "success" | "warning" | "danger" | "info";
};
export const orderStatusPresentation = (
  status: OrderStatus | OrderPaymentStatus | OrderFulfillmentStatus,
): OrderStatusPresentation => {
  const labels: Record<typeof status, OrderStatusPresentation> = {
    draft: { label: "Rascunho", tone: "default" },
    pending_payment: { label: "Aguardando pagamento", tone: "warning" },
    paid: { label: "Pago", tone: "success" },
    cancelled: { label: "Cancelado", tone: "danger" },
    pending: { label: "Pendente", tone: "warning" },
    authorized: { label: "Autorizado", tone: "info" },
    failed: { label: "Falhou", tone: "danger" },
    refunded: { label: "Estornado", tone: "info" },
    partially_refunded: { label: "Estorno parcial", tone: "info" },
    chargeback: { label: "Contestação", tone: "danger" },
    unassigned: { label: "Não atribuído", tone: "default" },
    fulfilled: { label: "Concluído", tone: "success" },
  };
  return labels[status];
};

const moneyPattern = /^\d+(?:\.\d{1,2})?$/;

export const decimalToCents = (value: string) => {
  if (!moneyPattern.test(value)) throw new Error("Valor monetário inválido.");
  const [whole, decimals = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt((decimals + "00").slice(0, 2));
};

export const centsToDecimal = (value: bigint) => {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
};

export const orderLineSubtotal = (unitPrice: string, quantity: number) => {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantidade inválida.");
  return centsToDecimal(decimalToCents(unitPrice) * BigInt(quantity));
};

export const orderNumberFromSequence = (sequence: bigint) =>
  `BM-${sequence.toString().padStart(10, "0")}`;

export const snapshotOrderItem = (
  input: Omit<OrderItemSnapshot, "subtotal">,
): OrderItemSnapshot => ({
  ...input,
  subtotal: orderLineSubtotal(input.unitPrice, input.quantity),
});

export const orderItemsBySupplier = <T extends OrderItemReference>(items: readonly T[]) => {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const owner = item.supplierOrganizationId ?? item.stockOwnerOrganizationId ?? "platform";
    groups.set(owner, [...(groups.get(owner) ?? []), item]);
  });
  return groups;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const readString = (value: unknown) => (typeof value === "string" ? value : null);
const isOrderStatus = (value: unknown): value is OrderStatus =>
  value === "draft" || value === "pending_payment" || value === "paid" || value === "cancelled";
const isPaymentStatus = (value: unknown): value is OrderPaymentStatus =>
  value === "pending" ||
  value === "authorized" ||
  value === "paid" ||
  value === "failed" ||
  value === "refunded" ||
  value === "partially_refunded" ||
  value === "chargeback" ||
  value === "cancelled";
const isFulfillmentStatus = (value: unknown): value is OrderFulfillmentStatus =>
  value === "unassigned" || value === "pending" || value === "fulfilled" || value === "cancelled";

export const readAdminOrderSummaries = (value: unknown): AdminOrderSummary[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        if (!isRecord(item)) return [];
        const id = readString(item.id);
        const orderNumber = readString(item.order_number);
        const status = item.status;
        const paymentStatus = item.payment_status;
        const currency = readString(item.currency);
        const totalAmount = readString(item.total_amount);
        const createdAt = readString(item.created_at);
        const itemCount = item.item_count;
        const fulfillmentStatus = item.fulfillment_status;
        if (
          !id ||
          !orderNumber ||
          !isOrderStatus(status) ||
          !isPaymentStatus(paymentStatus) ||
          !currency ||
          !totalAmount ||
          !createdAt ||
          typeof itemCount !== "number" ||
          !isFulfillmentStatus(fulfillmentStatus)
        ) {
          return [];
        }
        return [
          {
            id,
            orderNumber,
            status,
            paymentStatus,
            currency,
            totalAmount,
            itemCount,
            storeName: readString(item.store_name),
            buyerName: readString(item.buyer_name),
            createdAt,
            fulfillmentStatus,
            ...(typeof item.total_count === "number" ? { totalCount: item.total_count } : {}),
          },
        ];
      })
    : [];
