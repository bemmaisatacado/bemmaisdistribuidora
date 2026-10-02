import assert from "node:assert/strict";
import test from "node:test";
import {
  contextualProductInventory,
  inventoryAvailable,
  productInventoryMovements,
} from "../src/lib/catalog/product-inventory.ts";

const variants = [
  { id: "black-38", sku: "BM-BLACK-38", attributes: { Cor: "Preto", Tamanho: "38" } },
  { id: "white-39", sku: "BM-WHITE-39", attributes: { Cor: "Branco", Tamanho: "39" } },
];

test("mantém estoque contextual por SKU e owner, sem consolidar posições", () => {
  const inventory = contextualProductInventory(variants, [
    {
      organizationId: "bemmais",
      organizationName: "BemMais",
      variantId: "black-38",
      onHand: 8,
      reserved: 2,
    },
    {
      organizationId: "supplier",
      organizationName: "Fornecedor A",
      variantId: "black-38",
      onHand: 4,
      reserved: 1,
    },
  ]);

  assert.equal(inventory.rows[0].positions.length, 2);
  assert.equal(inventory.rows[0].positions[0].available, 6);
  assert.equal(inventory.rows[0].positions[1].organizationName, "Fornecedor A");
  assert.equal(inventory.rows[1].hasPosition, false);
  assert.deepEqual(inventory.summary, {
    onHand: 12,
    reserved: 3,
    available: 9,
    skusWithPosition: 1,
    skusWithoutPosition: 1,
    divergences: 0,
  });
});

test("distingue posição zerada de SKU sem posição", () => {
  const inventory = contextualProductInventory(variants, [
    {
      organizationId: "bemmais",
      organizationName: "BemMais",
      variantId: "black-38",
      onHand: 0,
      reserved: 0,
    },
  ]);

  assert.equal(inventory.rows[0].hasPosition, true);
  assert.equal(inventory.rows[0].positions[0].isZero, true);
  assert.equal(inventory.rows[1].hasPosition, false);
});

test("available segue a regra autoritativa on_hand menos reserved e sinaliza legado divergente", () => {
  assert.equal(inventoryAvailable(7, 3), 4);
  const inventory = contextualProductInventory(variants, [
    {
      organizationId: "legacy",
      organizationName: "Legado",
      variantId: "black-38",
      onHand: 1,
      reserved: 2,
    },
  ]);
  assert.equal(inventory.rows[0].positions[0].hasDivergence, true);
  assert.equal(inventory.summary.divergences, 1);
});

test("movimentações permanecem vinculadas ao SKU correto do Product Master", () => {
  const movements = productInventoryMovements(variants, [
    {
      id: 1,
      variantId: "white-39",
      organizationName: "BemMais",
      movementType: "in",
      quantity: 5,
      reason: "Recebimento",
      referenceType: "purchase",
      referenceId: "purchase-1",
      createdAt: "2026-10-01T10:00:00Z",
    },
    {
      id: 2,
      variantId: "outside-product",
      organizationName: "BemMais",
      movementType: "out",
      quantity: 1,
      reason: null,
      referenceType: null,
      referenceId: null,
      createdAt: "2026-10-01T11:00:00Z",
    },
  ]);
  assert.deepEqual(
    movements.map((movement) => [movement.id, movement.sku]),
    [[1, "BM-WHITE-39"]],
  );
});
