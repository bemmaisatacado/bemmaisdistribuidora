import assert from "node:assert/strict";
import test from "node:test";
import {
  orderedStockLocks,
  requestedStockByPosition,
  reservationError,
  reservationStatus,
} from "../src/lib/orders/stock-reservation.ts";

const ownerA = "00000000-0000-4000-8000-000000000010";
const ownerB = "00000000-0000-4000-8000-000000000020";
const variantA = "00000000-0000-4000-8000-000000000001";
const variantB = "00000000-0000-4000-8000-000000000002";

test("ordena locks de estoque de modo determinístico e elimina repetição", () => {
  assert.deepEqual(
    orderedStockLocks([
      { stockOwnerId: ownerB, variantId: variantA, quantity: 1, stockControlled: true },
      { stockOwnerId: ownerA, variantId: variantB, quantity: 1, stockControlled: true },
      {
        stockOwnerId: ownerA.toUpperCase(),
        variantId: variantB,
        quantity: 2,
        stockControlled: true,
      },
    ]),
    [
      { stockOwnerId: ownerA, variantId: variantB },
      { stockOwnerId: ownerB, variantId: variantA },
    ],
  );
});

test("soma somente posições controladas por owner e variante", () => {
  const quantities = requestedStockByPosition([
    { stockOwnerId: ownerA, variantId: variantA, quantity: 2, stockControlled: true },
    { stockOwnerId: ownerA, variantId: variantA, quantity: 3, stockControlled: true },
    { stockOwnerId: ownerB, variantId: variantA, quantity: 99, stockControlled: false },
  ]);
  assert.equal(quantities.get(`${ownerA}:${variantA}`), 5);
  assert.equal(quantities.has(`${ownerB}:${variantA}`), false);
});

test("reserva mantém on_hand e bloqueia disponível insuficiente", () => {
  assert.equal(reservationError({ onHand: 5, reserved: 2, requested: 3 }), null);
  assert.equal(reservationError({ onHand: 5, reserved: 2, requested: 4 }), "INSUFFICIENT_STOCK");
  assert.equal(reservationError({ onHand: 2, reserved: 3, requested: 1 }), "INSUFFICIENT_STOCK");
});

test("estado de reserva deriva do ledger sem criar estado paralelo", () => {
  assert.equal(reservationStatus({ hasReservation: false, hasRelease: false }), "not_controlled");
  assert.equal(reservationStatus({ hasReservation: true, hasRelease: false }), "reserved");
  assert.equal(reservationStatus({ hasReservation: true, hasRelease: true }), "released");
});
