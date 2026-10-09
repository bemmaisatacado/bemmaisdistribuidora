import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  dashboardDefinitions,
  dashboardRange,
  dashboardMoney,
  readExecutiveDashboard,
  readDashboardQueue,
  dashboardChartPoints,
  dashboardQueryState,
} from "../src/lib/admin/dashboard.ts";

const executive = () => ({
  orders: 3,
  draft: 1,
  pending: 1,
  paid: 1,
  cancelled: 0,
  orderValue: "399.90",
  confirmedValue: "199.90",
  confirmedOrders: 1,
  ticket: "199.90",
  organizations: 2,
  crmActive: 1,
  suppliers: 1,
  publishedStores: 1,
  products: 2,
  skus: 4,
  otherCurrency: 0,
  grain: "day",
  generatedAt: "2026-10-08T12:00:00Z",
  series: [{ bucket: "2026-10-08", orders: 3, confirmations: 1 }],
});
const queue = () => ({
  orders_pending_payment: 1,
  orders_payment_review: 1,
  orders_unassigned: 1,
  fulfillment_pending: 2,
  logistics_pending: 1,
  logistics_ready: 0,
  offers_pending: 0,
  stock_critical: 0,
  order_samples: [
    { id: "12345678-1234-1234-1234-123456789012", number: "BM-0000000001", reason: "unassigned" },
  ],
});
test("dashboard distinguishes order value, confirmed payments, ticket and overlapping queues", () => {
  assert.match(dashboardDefinitions.value, /Não é faturamento/);
  assert.match(dashboardDefinitions.payments, /confirmação verificada/);
  assert.match(dashboardDefinitions.payments, /Não é receita líquida/);
  assert.match(dashboardDefinitions.ticket, /pedidos distintos/);
  assert.match(dashboardDefinitions.queues, /não são somadas/);
});
test("all period filters preserve exact rolling boundaries and reject invalid dates", () => {
  for (const days of [7, 30, 90, 365] as const) {
    const r = dashboardRange(days, new Date("2026-10-08T12:00:00Z"));
    assert.equal(Date.parse(r.to) - Date.parse(r.from), days * 86400000);
  }
  assert.throws(() => dashboardRange(30, new Date("invalid")), /DASHBOARD_INVALID_PERIOD/);
});
test("money display preserves decimal cents even above safe integer range", () => {
  assert.equal(dashboardMoney("399.90"), "R$ 399,90");
  assert.equal(dashboardMoney("0.00"), "R$ 0,00");
  assert.equal(dashboardMoney("9007199254740993.01"), "R$ 9.007.199.254.740.993,01");
});
test("executive DTO accepts aggregate values and strips unnecessary personal fields", () => {
  const dto = readExecutiveDashboard({
    executive: { ...executive(), buyerEmail: "private@example.invalid" },
  });
  assert.equal(dto?.orderValue, "399.90");
  assert.equal(dto?.ticket, "199.90");
  assert.equal(dto?.orders, 3);
  assert.equal(dto && "buyerEmail" in dto, false);
});
test("missing migration or malformed aggregates do not become fabricated zeros", () => {
  assert.equal(readExecutiveDashboard({ gmv: 0 }), null);
  for (const bad of [
    { orderValue: 399.9 },
    { orders: -1 },
    { orders: 99 },
    { ticket: "1.001" },
    { generatedAt: "bad" },
    { grain: "hour" },
  ]) {
    assert.equal(readExecutiveDashboard({ executive: { ...executive(), ...bad } }), null);
  }
});
test("zero data is valid and different from a failed or unavailable query", () => {
  const e = executive();
  const empty = readExecutiveDashboard({
    executive: { ...e, orders: 0, draft: 0, pending: 0, paid: 0, series: [] },
  });
  assert.equal(empty?.orders, 0);
  assert.equal(dashboardQueryState(false, false, true), "ready");
  assert.equal(dashboardQueryState(false, true, true), "error");
  assert.equal(dashboardQueryState(false, false, false), "error");
  assert.equal(dashboardQueryState(true, false, false), "loading");
});
test("queues retain separate units and contextual references without leaking PII", () => {
  const q = readDashboardQueue({ ...queue(), secret: "not exposed" });
  assert.equal(q?.fulfillment_pending, 2);
  assert.equal(q?.orders_unassigned, 1);
  assert.equal(q?.samples[0].number, "BM-0000000001");
  assert.equal(q && "secret" in q, false);
  assert.equal(readDashboardQueue({ ...queue(), fulfillment_pending: null }), null);
  assert.equal(
    readDashboardQueue({
      ...queue(),
      order_samples: [{ ...queue().order_samples[0], reason: "fake" }],
    }),
    null,
  );
});
test("queue samples and series are bounded and charts share a stable count scale", () => {
  assert.equal(
    readDashboardQueue({ ...queue(), order_samples: Array(13).fill(queue().order_samples[0]) }),
    null,
  );
  assert.equal(
    readExecutiveDashboard({
      executive: { ...executive(), series: Array(401).fill(executive().series[0]) },
    }),
    null,
  );
  assert.equal(dashboardChartPoints([], "orders"), "");
  assert.equal(
    dashboardChartPoints([{ bucket: "2026-10-08", orders: 0, confirmations: 0 }], "orders"),
    "20,160",
  );
  const points = [{ bucket: "2026-10-08", orders: 10, confirmations: 5 }];
  assert.equal(dashboardChartPoints(points, "orders"), "20,20");
  assert.equal(dashboardChartPoints(points, "confirmations"), "20,90");
});
test("SQL contract checks permissions, verification, bounded periods and legacy compatibility (not SQL execution)", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/20261009005809_executive_dashboard.sql", import.meta.url),
    "utf8",
  );
  assert.equal((sql.match(/NOT public\.is_platform_admin\(auth.uid\(\)\)/g) ?? []).length, 2);
  assert.match(sql, /SET search_path=public,pg_temp/);
  assert.match(sql, /verified_amount=p.amount AND e.verified_currency=p.currency/);
  assert.match(sql, /paid_at>=_from AND paid_at<_to/);
  assert.match(sql, /count\(DISTINCT order_id\)/);
  assert.match(sql, /round\(p.amount\/nullif\(p.orders,0\),2\)/);
  assert.match(sql, /RETURN _legacy\|\|jsonb_build_object\('executive'/);
  assert.match(sql, /dashboard_ops_legacy\(\)\|\|_result/);
  assert.match(sql, /LIMIT 12/);
  assert.doesNotMatch(sql, /INSERT INTO public\.(orders|payments|inventory_movements)/);
});
