import assert from "node:assert/strict";
import test from "node:test";
import {
  fulfillmentSummary,
  orderParticipants,
  readOrder360,
} from "../src/lib/orders/order-360.ts";
import { orderStatusPresentation } from "../src/lib/orders/foundation.ts";

const rawOrder = {
  order: {
    id: "order-1",
    order_number: "BM-0000000001",
    status: "pending_payment",
    payment_status: "pending",
    fulfillment_status: "pending",
    currency: "BRL",
    subtotal_amount: "100.00",
    discount_amount: "10.00",
    shipping_amount: "5.00",
    total_amount: "95.00",
    buyer_name: "Comprador",
    buyer_email: "buyer@example.com",
    organization_name: "BemMais",
    store_name: "Loja",
    shipping_address: { city: "São Paulo", zip_code: "01000-000" },
    created_at: "2026-10-03T12:00:00Z",
    updated_at: "2026-10-03T12:00:00Z",
  },
  items: [
    {
      id: "a",
      product_name_snapshot: "Tênis histórico",
      sku_snapshot: "BM-A",
      attributes_snapshot: { tamanho: "38" },
      quantity: 1,
      unit_price: "50.00",
      subtotal_amount: "50.00",
      discount_amount: "0.00",
      shipping_amount: "0.00",
      total_amount: "50.00",
      fulfillment_status: "fulfilled",
      stock_reservation_status: "reserved",
      supplier_name: "Fornecedor A",
    },
    {
      id: "b",
      product_name_snapshot: "Bolsa histórica",
      sku_snapshot: "BM-B",
      attributes_snapshot: {},
      quantity: 1,
      unit_price: "50.00",
      subtotal_amount: "50.00",
      discount_amount: "10.00",
      shipping_amount: "5.00",
      total_amount: "45.00",
      fulfillment_status: "pending",
      stock_reservation_status: "released",
      stock_owner_name: "BemMais",
    },
  ],
  payments: [
    {
      id: "payment-1",
      status: "failed",
      method: "pix",
      amount: "95.00",
      failure_message: "Não foi possível confirmar o pagamento.",
      created_at: "2026-10-03T12:01:00Z",
      updated_at: "2026-10-03T12:02:00Z",
    },
  ],
  activity: [],
};
test("Order 360 preserva valores, snapshots e endereço histórico", () => {
  const order = readOrder360(rawOrder);
  assert.ok(order);
  assert.equal(order.items[0]?.productName, "Tênis histórico");
  assert.equal(order.items[0]?.unitPrice, "50.00");
  assert.equal(order.address?.city, "São Paulo");
  assert.equal(order.total, "95.00");
  assert.equal(order.items[0]?.stockReservationStatus, "reserved");
  assert.equal(order.items[1]?.stockReservationStatus, "released");
});
test("fulfillment resume um pedido multi-item sem ocultar pendências", () => {
  const order = readOrder360(rawOrder);
  assert.ok(order);
  assert.equal(fulfillmentSummary(order.items), "pending");
  assert.equal(fulfillmentSummary([]), "unassigned");
  assert.equal(fulfillmentSummary([{ fulfillmentStatus: "fulfilled" }]), "fulfilled");
});
test("participantes mantêm fornecedor e owner de estoque separados", () => {
  const order = readOrder360(rawOrder);
  assert.ok(order);
  const groups = orderParticipants(order.items);
  assert.equal(groups.get("Fornecedor A")?.[0]?.sku, "BM-A");
  assert.equal(groups.get("BemMais")?.[0]?.sku, "BM-B");
});
test("Order 360 lê tentativas de pagamento sem expor metadata sensível", () => {
  const order = readOrder360(rawOrder);
  assert.ok(order);
  assert.equal(order.payments[0]?.status, "failed");
  assert.equal(order.payments[0]?.failureMessage, "Não foi possível confirmar o pagamento.");
  assert.equal("providerMetadata" in (order.payments[0] ?? {}), false);
});
test("apresentação centraliza labels de status", () => {
  assert.equal(orderStatusPresentation("pending_payment").label, "Aguardando pagamento");
  assert.equal(orderStatusPresentation("fulfilled").label, "Concluído");
});
