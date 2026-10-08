import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  consumptionEffect,
  fulfillmentTransitionAllowed,
  nextFulfillmentState,
  operationalGroupKey,
  operateFulfillment,
  readFulfillmentContext,
  fulfillmentError,
} from "../src/lib/orders/fulfillment.ts";

test("fulfillment permite somente transições operacionais antes do envio", () => {
  assert.equal(nextFulfillmentState("ready_to_pick"), "picking");
  assert.equal(fulfillmentTransitionAllowed("picking", "packed"), true);
  assert.equal(fulfillmentTransitionAllowed("packed", "ready_to_ship"), true);
  assert.equal(fulfillmentTransitionAllowed("ready_to_pick", "ready_to_ship"), false);
  assert.equal(fulfillmentTransitionAllowed("ready_to_ship", "shipped"), false);
  assert.equal(nextFulfillmentState("ready_to_ship"), null);
});
test("grupos operacionais mantêm fornecedor, seller, stock owner e fulfillment owner distintos", () => {
  const item = {
    fulfillmentOwner: "expedidor",
    stockOwner: "estoquista",
    supplier: "fornecedor-a",
    seller: "loja",
  };
  assert.notEqual(
    operationalGroupKey(item),
    operationalGroupKey({ ...item, supplier: "fornecedor-b" }),
  );
  assert.notEqual(
    operationalGroupKey(item),
    operationalGroupKey({ ...item, stockOwner: "outro-estoquista" }),
  );
  assert.notEqual(
    operationalGroupKey(item),
    operationalGroupKey({ ...item, fulfillmentOwner: "outro-expedidor" }),
  );
  assert.equal(operationalGroupKey(item), "expedidor:estoquista:fornecedor-a:loja");
});
test("consumo diminui on_hand e reserved uma vez e não reduz available novamente", () => {
  assert.deepEqual(consumptionEffect({ onHand: 10, reserved: 5 }, 3), {
    onHand: 7,
    reserved: 2,
    available: 5,
  });
  assert.deepEqual(consumptionEffect({ onHand: 1, reserved: 1 }, 1), {
    onHand: 0,
    reserved: 0,
    available: 0,
  });
});
test("consumo rejeita parcial inválido, reserva insuficiente e divergência sem corrigir legado", () => {
  for (const [balance, quantity] of [
    [{ onHand: 2, reserved: 3 }, 1],
    [{ onHand: 5, reserved: 0 }, 1],
    [{ onHand: -1, reserved: 0 }, 1],
    [{ onHand: 10, reserved: 5 }, 0],
  ] as const) {
    assert.throws(() => consumptionEffect(balance, quantity), /STOCK_POSITION_INVALID/);
  }
});
const context = {
  can_start: false,
  block: null,
  groups: [
    {
      id: "group",
      status: "ready_to_ship",
      owner: "Expedidor",
      stock_owner: "Estoque",
      supplier: "Fornecedor",
      seller: "Seller",
      updated_at: "2026-10-08T12:00:00Z",
      stock_consumed_at: "2026-10-08T12:00:00Z",
      items: [
        { id: "item", name: "Nome histórico", sku: "BM-1", quantity: 2, reservation: "consumed" },
        {
          id: "uncontrolled",
          name: "Outro snapshot",
          sku: "BM-2",
          quantity: 3,
          reservation: "not_controlled",
        },
      ],
    },
  ],
  activity: [{ id: 1, action: "UPDATE", actor: "actor", at: "2026-10-08T12:00:00Z" }],
};
test("DTO preserva snapshots e distingue consumo, liberação e estoque não controlado", () => {
  const decoded = readFulfillmentContext(context)!;
  assert.equal(decoded.groups[0].items[0].name, "Nome histórico");
  assert.equal(decoded.groups[0].items[0].reservation, "consumed");
  assert.equal(decoded.groups[0].items[1].reservation, "not_controlled");
  assert.equal(decoded.groups[0].owner, "Expedidor");
  assert.equal(decoded.groups[0].stockOwner, "Estoque");
  assert.equal(decoded.activity[0].actor, "actor");
});
test("DTO bloqueia status fictício e campos inválidos; estados vazios são honestos", () => {
  assert.equal(
    readFulfillmentContext({ ...context, groups: [{ ...context.groups[0], status: "shipped" }] }),
    null,
  );
  assert.equal(
    readFulfillmentContext({
      ...context,
      groups: [{ ...context.groups[0], items: [{ ...context.groups[0].items[0], quantity: 0 }] }],
    }),
    null,
  );
  assert.deepEqual(
    readFulfillmentContext({ can_start: false, block: "ORDER_NOT_PAID", groups: [], activity: [] })
      ?.groups,
    [],
  );
});
test("chamador envia somente intenção; retry recebe resposta idempotente", async () => {
  const calls: Record<string, unknown>[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      assert.equal(name, "advance_order_fulfillment");
      calls.push(args);
      return { data: { fulfillment_id: "group", idempotent: calls.length > 1 }, error: null };
    },
  };
  const intent = {
    fulfillmentId: "group",
    expectedStatus: "packed",
    targetStatus: "ready_to_ship",
  } as const;
  await operateFulfillment(client, intent);
  assert.equal((await operateFulfillment(client, intent)).idempotent, true);
  assert.deepEqual(calls[0], {
    _fulfillment_id: "group",
    _expected_status: "packed",
    _target_status: "ready_to_ship",
  });
});
test("chamador rejeita ação inválida e autorização negada com erro seguro", async () => {
  let called = false;
  const client = {
    rpc: async () => {
      called = true;
      return { data: null, error: { message: "FORBIDDEN" } };
    },
  };
  await assert.rejects(
    operateFulfillment(client, {
      fulfillmentId: "x",
      expectedStatus: "ready_to_pick",
      targetStatus: "ready_to_ship",
    }),
  );
  assert.equal(called, false);
  await assert.rejects(operateFulfillment(client, { orderId: "order" }), /permissão/);
  assert.equal(fulfillmentError("SQL private detail"), fulfillmentError("UNKNOWN"));
});
const sql = readFileSync(
  new URL("../supabase/migrations/20261008230204_operational_fulfillment.sql", import.meta.url),
  "utf8",
);
test("contrato SQL exige payment verificado, bloqueia não pago/cancelado/incerto (não é teste transacional)", () => {
  assert.match(sql, /_o.status<>'paid' OR _o.payment_status<>'paid'/);
  assert.match(sql, /payment_provider_events/);
  assert.match(sql, /e.verified_amount=_p.amount/);
  assert.match(sql, /PAYMENT_UNCERTAIN/);
  assert.match(sql, /fulfillment_mode='supplier'/);
  assert.match(sql, /fulfillment_mode='bemmais'/);
});
test("contrato SQL protege atomicidade, idempotência e locks sem homologar concorrência", () => {
  const advance = sql.slice(sql.indexOf("CREATE FUNCTION public.advance_order_fulfillment"));
  assert.ok(advance.indexOf("public.orders WHERE") < advance.indexOf("public.payments WHERE"));
  assert.ok(
    advance.indexOf("public.order_items WHERE") < advance.indexOf("_fulfillment_id FOR UPDATE"),
  );
  assert.match(advance, /ORDER BY m.organization_id,m.variant_id/);
  assert.match(advance, /pg_advisory_xact_lock/);
  assert.match(sql, /inventory_consumption_once_per_reservation_idx/);
  assert.match(sql, /UNIQUE\(order_id,group_key\)/);
  assert.match(advance, /STOCK_RESERVATION_RELEASED/);
  assert.match(advance, /STOCK_RESERVATION_CONSUMED/);
  assert.match(advance, /IF NOT FOUND THEN CONTINUE/);
  assert.ok(advance.indexOf("'release',_r.quantity") < advance.indexOf("'out',_r.quantity"));
  assert.doesNotMatch(advance, /EXCEPTION WHEN/); // exceptions escape and roll back the operation
  assert.doesNotMatch(sql, /DELETE FROM|UPDATE public.inventory_movements/);
});
test("contrato UI exige confirmação de baixa e autorização por contexto do backend", () => {
  const ui = readFileSync(
    new URL("../src/components/admin/orders/fulfillment-panel.tsx", import.meta.url),
    "utf8",
  );
  assert.match(ui, /Confirmar baixa física/);
  assert.match(ui, /query.data\?\.block/);
  assert.match(ui, /query.data\?\.canStart/);
  assert.match(ui, /Dialog/);
  assert.match(ui, /disabled=\{busy\}/);
  assert.doesNotMatch(ui, /service_role|markOrderPaid/);
});
