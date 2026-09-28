export type Metrics = {
  gmv: number;
  paid_count: number;
  platform_revenue: number;
  active_clients: number;
  suppliers: number;
  stores: number;
  products: number;
  skus: number;
  receivables_pending: number;
  payouts_pending: number;
  payouts_pending_count: number;
};
export type Ops = Record<
  | "offers_pending"
  | "products_pending"
  | "orgs_pending"
  | "payments_problem"
  | "payouts_pending"
  | "accounts_pending"
  | "suppliers_without_account"
  | "stock_critical",
  number
>;
