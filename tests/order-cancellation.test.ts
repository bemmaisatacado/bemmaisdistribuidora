import test from "node:test";
import assert from "node:assert/strict";
import {
  cancellationBlock,
  validCancellationReason,
  cancellationErrorMessage,
  cancelOrder,
  readCancellationContext,
} from "../src/lib/orders/cancellation.ts";
import type { OrderPaymentStatus } from "../src/lib/orders/foundation.ts";
import { readFileSync } from "node:fs";

const input = {
  status: "pending_payment" as const,
  paymentStatus: "pending" as const,
  payments: [],
  items: ["unassigned" as const],
};
test("cancelamento permite draft/pending_payment sem tentativa aberta", () => {
  assert.equal(cancellationBlock(input), null);
  assert.equal(cancellationBlock({ ...input, status: "draft" }), null);
  assert.equal(cancellationBlock({ ...input, payments: ["failed", "expired", "cancelled"] }), null);
});
test("cancelamento bloqueia estados financeiros, pagos e incertos", () => {
  for (const s of [
    "pending",
    "processing",
    "authorized",
    "paid",
    "refunded",
    "partially_refunded",
    "chargeback",
  ] as OrderPaymentStatus[]) {
    assert.equal(cancellationBlock({ ...input, payments: [s] }), "ORDER_PAYMENT_UNCERTAIN");
  }
  assert.equal(cancellationBlock({ ...input, status: "paid" }), "ORDER_NOT_CANCELLABLE");
  assert.equal(cancellationBlock({ ...input, paymentStatus: "paid" }), "ORDER_FINANCIAL_BLOCK");
  assert.equal(cancellationBlock({ ...input, financial: true }), "ORDER_FINANCIAL_BLOCK");
});
test("fulfillment em execução/concluído bloqueia cancelamento multi-item", () => {
  assert.equal(
    cancellationBlock({ ...input, items: ["unassigned", "fulfilled"] }),
    "ORDER_FULFILLMENT_BLOCK",
  );
  assert.equal(cancellationBlock({ ...input, items: ["pending"] }), "ORDER_FULFILLMENT_BLOCK");
  assert.equal(cancellationBlock({ ...input, items: ["unassigned", "cancelled"] }), null);
});
test("motivo é obrigatório e limitado", () => {
  for (const value of ["", "  ", "ab", "a".repeat(1001)])
    assert.equal(validCancellationReason(value), false);
  assert.equal(validCancellationReason("  Solicitação do comprador  "), true);
});
test("caller envia somente intenção, motivo e status esperado; mantém valores e referências fora do payload", async () => {
  const result = await cancelOrder(
    {
      rpc: async (name, args) => {
        assert.equal(name, "cancel_order");
        assert.deepEqual(args, {
          _order_id: "order",
          _expected_status: "pending_payment",
          _reason: "Solicitação",
        });
        return { data: { order_id: "order", idempotent: true }, error: null };
      },
    },
    "order",
    "pending_payment",
    " Solicitação ",
  );
  assert.equal("idempotent" in result && result.idempotent, true);
});
test("caller rejeita autorização, conflitos e motivo inválido com erro seguro", async () => {
  await assert.rejects(
    cancelOrder(
      {
        rpc: async () => {
          throw new Error("não chamar");
        },
      },
      "order",
      "draft",
      "",
    ),
    /motivo/,
  );
  await assert.rejects(
    cancelOrder(
      { rpc: async () => ({ data: null, error: { message: "FORBIDDEN" } }) },
      "order",
      "draft",
      "Solicitação",
    ),
    /permissão/,
  );
  assert.match(cancellationErrorMessage("ORDER_STATUS_CONFLICT"), /mudou/);
  assert.equal(cancellationErrorMessage("SQL stack secret").includes("secret"), false);
});
test("Order 360 usa contexto autoritativo e não oferece ação para cancelado", () => {
  assert.equal(
    readCancellationContext({
      can_cancel: false,
      reason: "Solicitação",
      cancelled_at: "2026-10-08",
    })?.canCancel,
    false,
  );
  assert.equal(readCancellationContext({}), null);
  assert.equal(cancellationBlock({ ...input, status: "cancelled" }), "ORDER_NOT_CANCELLABLE");
});

test("contrato SQL mantém locks order-first e libera reservas dentro da operação, sem DELETE", () => {
  // Static contract only; NOT a PostgreSQL transaction/concurrency test.
  const sql = readFileSync(
    new URL("../supabase/migrations/20261008223449_safe_order_cancellation.sql", import.meta.url),
    "utf8",
  );
  const operation = sql.slice(
    sql.indexOf("CREATE FUNCTION public.cancel_order"),
    sql.indexOf("-- Harden the existing release"),
  );
  assert.ok(
    operation.indexOf("WHERE id=_order_id FOR UPDATE") < operation.indexOf("FROM public.payments"),
  );
  assert.ok(operation.indexOf("FROM public.payments") < operation.indexOf("pg_advisory_xact_lock"));
  assert.ok(
    operation.indexOf("SET status='cancelled'") <
      operation.indexOf("public.release_order_item_reservation"),
  );
  assert.match(operation, /ORDER BY m.organization_id,m.variant_id/);
  assert.doesNotMatch(sql, /\bDELETE\b/i);
});

test("contrato da interface exige diálogo, motivo e feedback, sem mutação financeira", () => {
  const ui = readFileSync(
    new URL("../src/routes/_authenticated/admin/pedidos.$orderId.tsx", import.meta.url),
    "utf8",
  );
  assert.match(ui, /<Dialog\s/);
  assert.match(ui, /validCancellationReason\(reason\)/);
  assert.match(ui, /canCancel/);
  assert.match(ui, /role="alert"/);
  assert.doesNotMatch(ui, /markOrderPaid|process_payment_provider_event/);
});
