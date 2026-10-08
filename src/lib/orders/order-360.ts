import type { OrderFulfillmentStatus, OrderPaymentStatus, OrderStatus } from "./foundation";
import type { ReservationStatus } from "./stock-reservation";

export type Order360Item = {
  id: string;
  productName: string;
  sku: string;
  imagePath: string | null;
  attributes: Record<string, string>;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  discount: string;
  shipping: string;
  total: string;
  modality: string | null;
  fulfillmentStatus: OrderFulfillmentStatus;
  supplierName: string | null;
  sellerName: string | null;
  stockOwnerName: string | null;
  fulfillmentOwnerName: string | null;
  productId: string | null;
  variantId: string | null;
  stockReservationStatus: ReservationStatus;
};
export type Order360Payment = {
  id: string;
  status: OrderPaymentStatus;
  provider: string | null;
  method: string | null;
  amount: string;
  externalId: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  failureCode: string | null;
  failureMessage: string | null;
};
export type Order360Activity = {
  id: string;
  action: string;
  entityType: string;
  actorName: string | null;
  occurredAt: string;
};
export type Order360 = {
  id: string;
  number: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: OrderFulfillmentStatus;
  currency: string;
  subtotal: string;
  discount: string;
  shipping: string;
  total: string;
  buyerName: string | null;
  buyerEmail: string | null;
  organizationName: string | null;
  storeName: string | null;
  address: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
  items: Order360Item[];
  payments: Order360Payment[];
  activity: Order360Activity[];
};

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const string = (value: unknown) => (typeof value === "string" ? value : null);
const money = (value: unknown) => string(value) ?? "0.00";
const orderStatus = (value: unknown): value is OrderStatus =>
  value === "draft" || value === "pending_payment" || value === "paid" || value === "cancelled";
const paymentStatus = (value: unknown): value is OrderPaymentStatus =>
  [
    "pending",
    "processing",
    "authorized",
    "paid",
    "failed",
    "expired",
    "refunded",
    "partially_refunded",
    "chargeback",
    "cancelled",
  ].includes(String(value));
const fulfillmentStatus = (value: unknown): value is OrderFulfillmentStatus =>
  ["unassigned", "pending", "fulfilled", "cancelled"].includes(String(value));
const stringRecord = (value: unknown): Record<string, string> =>
  record(value)
    ? Object.fromEntries(
        Object.entries(value).flatMap(([key, item]) =>
          typeof item === "string" ? [[key, item]] : [],
        ),
      )
    : {};

const readItems = (value: unknown): Order360Item[] =>
  Array.isArray(value)
    ? value.flatMap((raw) => {
        if (
          !record(raw) ||
          !string(raw.id) ||
          !string(raw.product_name_snapshot) ||
          !string(raw.sku_snapshot) ||
          typeof raw.quantity !== "number" ||
          !fulfillmentStatus(raw.fulfillment_status)
        )
          return [];
        return [
          {
            id: raw.id,
            productName: raw.product_name_snapshot,
            sku: raw.sku_snapshot,
            imagePath: string(raw.image_path_snapshot),
            attributes: stringRecord(raw.attributes_snapshot),
            quantity: raw.quantity,
            unitPrice: money(raw.unit_price),
            subtotal: money(raw.subtotal_amount),
            discount: money(raw.discount_amount),
            shipping: money(raw.shipping_amount),
            total: money(raw.total_amount),
            modality: string(raw.commercial_modality),
            fulfillmentStatus: raw.fulfillment_status,
            supplierName: string(raw.supplier_name),
            sellerName: string(raw.seller_name),
            stockOwnerName: string(raw.stock_owner_name),
            fulfillmentOwnerName: string(raw.fulfillment_owner_name),
            productId: string(raw.product_id),
            variantId: string(raw.variant_id),
            stockReservationStatus:
              raw.stock_reservation_status === "reserved" ||
              raw.stock_reservation_status === "released"
                ? raw.stock_reservation_status
                : "not_controlled",
          },
        ];
      })
    : [];

export const readOrder360 = (value: unknown): Order360 | null => {
  if (!record(value) || !record(value.order)) return null;
  const order = value.order;
  if (
    !string(order.id) ||
    !string(order.order_number) ||
    !orderStatus(order.status) ||
    !paymentStatus(order.payment_status) ||
    !fulfillmentStatus(order.fulfillment_status) ||
    !string(order.currency) ||
    !string(order.created_at) ||
    !string(order.updated_at)
  )
    return null;
  const payments: Order360Payment[] = Array.isArray(value.payments)
    ? value.payments.flatMap((raw) =>
        record(raw) &&
        string(raw.id) &&
        paymentStatus(raw.status) &&
        string(raw.created_at) &&
        string(raw.updated_at)
          ? [
              {
                id: raw.id,
                status: raw.status,
                provider: string(raw.provider),
                method: string(raw.method),
                amount: money(raw.amount),
                externalId: string(raw.provider_payment_id),
                paidAt: string(raw.paid_at),
                createdAt: raw.created_at,
                updatedAt: raw.updated_at,
                failureCode:
                  raw.status === "failed"
                    ? "PAYMENT_FAILED"
                    : raw.status === "expired"
                      ? "PAYMENT_EXPIRED"
                      : raw.status === "cancelled"
                        ? "PAYMENT_CANCELLED"
                        : null,
                // Never render provider free text, including historical failure payloads.
                failureMessage:
                  raw.status === "failed"
                    ? "Não foi possível confirmar o pagamento."
                    : raw.status === "expired"
                      ? "A tentativa de pagamento expirou."
                      : raw.status === "cancelled"
                        ? "A tentativa de pagamento foi cancelada."
                        : null,
              },
            ]
          : [],
      )
    : [];
  const activity: Order360Activity[] = Array.isArray(value.activity)
    ? value.activity.flatMap((raw) =>
        record(raw) &&
        string(raw.id) &&
        string(raw.action) &&
        string(raw.entity_type) &&
        string(raw.occurred_at)
          ? [
              {
                id: raw.id,
                action: raw.action,
                entityType: raw.entity_type,
                actorName: string(raw.actor_name),
                occurredAt: raw.occurred_at,
              },
            ]
          : [],
      )
    : [];
  return {
    id: order.id,
    number: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    fulfillmentStatus: order.fulfillment_status,
    currency: order.currency,
    subtotal: money(order.subtotal_amount),
    discount: money(order.discount_amount),
    shipping: money(order.shipping_amount),
    total: money(order.total_amount),
    buyerName: string(order.buyer_name),
    buyerEmail: string(order.buyer_email),
    organizationName: string(order.organization_name),
    storeName: string(order.store_name),
    address: record(order.shipping_address) ? stringRecord(order.shipping_address) : null,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: readItems(value.items),
    payments,
    activity,
  };
};

export const fulfillmentSummary = (
  items: readonly Pick<Order360Item, "fulfillmentStatus">[],
): OrderFulfillmentStatus => {
  const statuses = new Set(items.map((item) => item.fulfillmentStatus));
  if (!statuses.size || (statuses.size === 1 && statuses.has("unassigned"))) return "unassigned";
  if (statuses.size === 1 && statuses.has("fulfilled")) return "fulfilled";
  if (statuses.size === 1 && statuses.has("cancelled")) return "cancelled";
  return "pending";
};

export const orderParticipants = (items: readonly Order360Item[]) =>
  new Map<string, Order360Item[]>(
    items.reduce((groups, item) => {
      const key =
        item.supplierName ?? item.stockOwnerName ?? item.fulfillmentOwnerName ?? "BemMais";
      groups.set(key, [...(groups.get(key) ?? []), item]);
      return groups;
    }, new Map<string, Order360Item[]>()),
  );
