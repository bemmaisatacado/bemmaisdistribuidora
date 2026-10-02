import assert from "node:assert/strict";
import test from "node:test";
import {
  decimalToCents,
  orderItemsBySupplier,
  orderLineSubtotal,
  orderNumberFromSequence,
  readAdminOrderSummaries,
  snapshotOrderItem,
} from "../src/lib/orders/foundation.ts";

test("gera número de pedido humano estável sem expor UUID", () => {
  assert.equal(orderNumberFromSequence(42n), "BM-0000000042");
});

test("calcula dinheiro com centavos inteiros, sem float", () => {
  assert.equal(decimalToCents("19.99"), 1999n);
  assert.equal(orderLineSubtotal("19.99", 3), "59.97");
  assert.throws(() => orderLineSubtotal("19.999", 1));
});

test("snapshot do item preserva preço, SKU e produto após mudanças futuras no catálogo", () => {
  const item = snapshotOrderItem({
    productId: "product-1",
    variantId: "variant-1",
    storeListingId: "listing-1",
    supplierOfferId: "offer-1",
    sellerOrganizationId: "store-owner",
    supplierOrganizationId: "supplier-1",
    stockOwnerOrganizationId: "supplier-1",
    fulfillmentOwnerOrganizationId: "supplier-1",
    productName: "New Balance 9060",
    sku: "BM-9060-38",
    imagePath: "product-1/main.webp",
    attributes: { tamanho: "38" },
    commercialModality: "drop",
    unitPrice: "899.90",
    quantity: 2,
  });
  assert.equal(item.productName, "New Balance 9060");
  assert.equal(item.sku, "BM-9060-38");
  assert.equal(item.subtotal, "1799.80");
});

test("um pedido agrupa vários fornecedores sem ser duplicado", () => {
  const groups = orderItemsBySupplier([
    { supplierOrganizationId: "supplier-a", stockOwnerOrganizationId: null },
    { supplierOrganizationId: "supplier-b", stockOwnerOrganizationId: null },
    { supplierOrganizationId: null, stockOwnerOrganizationId: "bemmais" },
  ]);
  assert.equal(groups.size, 3);
  assert.equal(groups.get("supplier-a")?.length, 1);
  assert.equal(groups.get("bemmais")?.length, 1);
});

test("status operacional e pagamento permanecem separados", () => {
  assert.deepEqual(
    readAdminOrderSummaries([
      {
        id: "order-1",
        order_number: "BM-0000000001",
        status: "pending_payment",
        payment_status: "authorized",
        currency: "BRL",
        total_amount: "59.97",
        item_count: 2,
        store_name: "Loja BemMais",
        buyer_name: "Cliente",
        created_at: "2026-10-02T12:00:00Z",
      },
    ]),
    [
      {
        id: "order-1",
        orderNumber: "BM-0000000001",
        status: "pending_payment",
        paymentStatus: "authorized",
        currency: "BRL",
        totalAmount: "59.97",
        itemCount: 2,
        storeName: "Loja BemMais",
        buyerName: "Cliente",
        createdAt: "2026-10-02T12:00:00Z",
      },
    ],
  );
});
