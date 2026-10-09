import { decimalToCents } from "../orders/foundation.ts";

export const dashboardPeriods = [7, 30, 90, 365] as const;
export type DashboardPeriod = (typeof dashboardPeriods)[number];
export const dashboardDefinitions = {
  orders: "Pedidos criados no período; status atual, incluindo rascunhos e cancelados.",
  value:
    "Total histórico em BRL de pedidos criados no período, exceto rascunhos e cancelados. Não é faturamento.",
  payments:
    "Pagamentos atualmente paid, vinculados a pedidos e a confirmação verificada, por paid_at. Não é receita líquida nem saldo disponível.",
  ticket:
    "Valor confirmado em BRL dividido pelos pedidos distintos desses pagamentos. Arredondamento no PostgreSQL.",
  queues:
    "Pendências atuais de toda a operação, independentes do período. Categorias podem se sobrepor; não são somadas como pedidos únicos.",
};
export function dashboardRange(days: DashboardPeriod, now = new Date()) {
  if (!dashboardPeriods.includes(days) || !Number.isFinite(now.getTime()))
    throw new Error("DASHBOARD_INVALID_PERIOD");
  return { from: new Date(now.getTime() - days * 86400000).toISOString(), to: now.toISOString() };
}
export function dashboardMoney(value: string) {
  const cents = decimalToCents(value);
  return `R$ ${new Intl.NumberFormat("pt-BR").format(cents / 100n)},${String(cents % 100n).padStart(2, "0")}`;
}
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const money = (v: unknown): v is string => typeof v === "string" && /^\d+\.\d{2}$/.test(v);
export type DashboardPoint = { bucket: string; orders: number; confirmations: number };
export type ExecutiveDashboard = {
  orders: number;
  draft: number;
  pending: number;
  paid: number;
  cancelled: number;
  orderValue: string;
  confirmedValue: string;
  confirmedOrders: number;
  ticket: string;
  organizations: number;
  crmActive: number;
  suppliers: number;
  publishedStores: number;
  products: number;
  skus: number;
  otherCurrency: number;
  grain: "day" | "week" | "month";
  generatedAt: string;
  series: DashboardPoint[];
};
export function readExecutiveDashboard(value: unknown): ExecutiveDashboard | null {
  if (!record(value) || !record(value.executive)) return null;
  const r = value.executive;
  const keys = [
    "orders",
    "draft",
    "pending",
    "paid",
    "cancelled",
    "confirmedOrders",
    "organizations",
    "crmActive",
    "suppliers",
    "publishedStores",
    "products",
    "skus",
    "otherCurrency",
  ] as const;
  if (
    keys.some((key) => !count(r[key])) ||
    !money(r.orderValue) ||
    !money(r.confirmedValue) ||
    !money(r.ticket) ||
    (r.grain !== "day" && r.grain !== "week" && r.grain !== "month") ||
    typeof r.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(r.generatedAt)) ||
    !Array.isArray(r.series)
  )
    return null;
  const series: DashboardPoint[] = [];
  for (const p of r.series) {
    if (
      !record(p) ||
      typeof p.bucket !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(p.bucket) ||
      !Number.isFinite(Date.parse(p.bucket)) ||
      !count(p.orders) ||
      !count(p.confirmations)
    )
      return null;
    series.push({ bucket: p.bucket, orders: p.orders, confirmations: p.confirmations });
  }
  if (series.length > 400) return null;
  // Fields are read independently so runtime validation narrows the actual DTO.
  const n = (key: (typeof keys)[number]) => {
    const v = r[key];
    return count(v) ? v : 0;
  };
  if (n("draft") + n("pending") + n("paid") + n("cancelled") !== n("orders")) return null;
  return {
    orders: n("orders"),
    draft: n("draft"),
    pending: n("pending"),
    paid: n("paid"),
    cancelled: n("cancelled"),
    orderValue: r.orderValue,
    confirmedValue: r.confirmedValue,
    confirmedOrders: n("confirmedOrders"),
    ticket: r.ticket,
    organizations: n("organizations"),
    crmActive: n("crmActive"),
    suppliers: n("suppliers"),
    publishedStores: n("publishedStores"),
    products: n("products"),
    skus: n("skus"),
    otherCurrency: n("otherCurrency"),
    grain: r.grain,
    generatedAt: r.generatedAt,
    series,
  };
}
export const dashboardQueueKeys = [
  "orders_pending_payment",
  "orders_payment_review",
  "orders_unassigned",
  "fulfillment_pending",
  "logistics_pending",
  "logistics_ready",
  "offers_pending",
  "stock_critical",
] as const;
export type DashboardQueueKey = (typeof dashboardQueueKeys)[number];
export type DashboardQueue = Record<DashboardQueueKey, number> & {
  samples: { id: string; number: string; reason: string }[];
};
export function readDashboardQueue(value: unknown): DashboardQueue | null {
  if (
    !record(value) ||
    dashboardQueueKeys.some((k) => !count(value[k])) ||
    !Array.isArray(value.order_samples)
  )
    return null;
  const samples: DashboardQueue["samples"] = [];
  for (const r of value.order_samples) {
    if (
      !record(r) ||
      typeof r.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(r.id) ||
      typeof r.number !== "string" ||
      !/^BM-\d+$/.test(r.number) ||
      typeof r.reason !== "string" ||
      !["payment_review", "unassigned", "fulfillment", "logistics"].includes(r.reason)
    )
      return null;
    samples.push({ id: r.id, number: r.number, reason: r.reason });
  }
  if (samples.length > 12) return null;
  const n = (key: DashboardQueueKey) => {
    const v = value[key];
    return count(v) ? v : 0;
  };
  return {
    orders_pending_payment: n("orders_pending_payment"),
    orders_payment_review: n("orders_payment_review"),
    orders_unassigned: n("orders_unassigned"),
    fulfillment_pending: n("fulfillment_pending"),
    logistics_pending: n("logistics_pending"),
    logistics_ready: n("logistics_ready"),
    offers_pending: n("offers_pending"),
    stock_critical: n("stock_critical"),
    samples,
  };
}
export function dashboardChartPoints(
  series: readonly DashboardPoint[],
  key: "orders" | "confirmations",
) {
  const max = Math.max(1, ...series.flatMap((p) => [p.orders, p.confirmations]));
  return series
    .map(
      (p, i) => `${20 + (i * 560) / Math.max(1, series.length - 1)},${160 - (p[key] * 140) / max}`,
    )
    .join(" ");
}
export function dashboardQueryState(loading: boolean, failed: boolean, valid: boolean) {
  return loading ? "loading" : failed || !valid ? "error" : "ready";
}
