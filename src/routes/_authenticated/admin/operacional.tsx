import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRight, Boxes, Handshake, Package, Building2, Factory, CreditCard, Send, Landmark, ShoppingCart, Truck, Plug, AlertTriangle, Lock,
} from "lucide-react";
import { PageHeader, DarkPanel } from "@/components/admin/ui";
import { CustomerQueues } from "@/components/admin/customers/CustomerQueues";
import { useOps } from "@/lib/admin/useOps";
import { num } from "@/lib/admin/format";
import { cn } from "@/lib/utils";
import type { Ops } from "@/lib/admin/metrics";

export const Route = createFileRoute("/_authenticated/admin/operacional")({ component: OpsPage });

type Level = "critical" | "attention" | "pending";
type Item = { label: string; icon: LucideIcon; level: Level; key?: keyof Ops; to?: NonNullable<LinkProps["to"]>; soon?: string };
const ITEMS: Item[] = [
  { label: "Pagamentos com problema", icon: CreditCard, level: "critical", key: "payments_problem", to: "/admin/financeiro/transacoes" },
  { label: "Estoque crítico", icon: Boxes, level: "critical", key: "stock_critical", to: "/admin/estoque" },
  { label: "Pedidos atrasados", icon: ShoppingCart, level: "critical", soon: "pedidos" },
  { label: "Ofertas aguardando aprovação", icon: Handshake, level: "attention", key: "offers_pending", to: "/admin/ofertas" },
  { label: "Produtos aguardando aprovação", icon: Package, level: "attention", key: "products_pending", to: "/admin/produtos" },
  { label: "Fornecedores sem conta recebedora ativa", icon: Factory, level: "attention", key: "suppliers_without_account", to: "/admin/fornecedores" },
  { label: "Pedidos aguardando ação", icon: ShoppingCart, level: "attention", soon: "pedidos" },
  { label: "Repasses pendentes", icon: Send, level: "pending", key: "payouts_pending", to: "/admin/financeiro/repasses" },
  { label: "Contas recebedoras pendentes", icon: Landmark, level: "pending", key: "accounts_pending", to: "/admin/financeiro/contas" },
  { label: "Empresas pendentes", icon: Building2, level: "pending", key: "orgs_pending", to: "/admin/empresas" },
  { label: "Fulfillments atrasados", icon: Truck, level: "pending", soon: "fulfillments" },
  { label: "Integrações com falha", icon: Plug, level: "pending", soon: "integracoes" },
  { label: "Ocorrências", icon: AlertTriangle, level: "pending", soon: "ocorrencias" },
];
const LEVELS: Record<Level, { title: string; dot: string; text: string; ring: string }> = {
  critical: { title: "Crítico", dot: "bg-danger", text: "text-danger", ring: "hover:ring-danger/30" },
  attention: { title: "Atenção", dot: "bg-warning", text: "text-warning", ring: "hover:ring-warning/30" },
  pending: { title: "Pendente", dot: "bg-info", text: "text-info", ring: "hover:ring-info/30" },
};

function OpsPage() {
  const { data } = useOps();
  const count = (lv: Level) => ITEMS.filter((i) => i.level === lv && i.key).reduce((a, i) => a + (data?.[i.key!] ?? 0), 0);
  const total = data ? count("critical") + count("attention") + count("pending") : undefined;

  return (
    <>
      <PageHeader eyebrow="Visão geral" title="Central Operacional" description="Centro de comando da plataforma. Filas ordenadas por prioridade — clique para agir." />

      <DarkPanel className="mb-6 p-6">
        <div className="relative grid gap-6 md:grid-cols-[1.2fr_2fr] md:items-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Status geral</p>
            <p className="mt-2 font-display text-2xl font-bold">{total === undefined ? "Carregando…" : total ? `${num(total)} itens nas filas` : "Tudo normal"}</p>
            <p className="mt-1 text-sm text-ink-muted">Somente contagens reais dos módulos já ativos.</p>
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {(Object.keys(LEVELS) as Level[]).map((lv) => (
              <div key={lv} className="rounded-xl bg-surface-dark-2/80 p-3.5 ring-1 ring-ink-border">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted"><span className={cn("h-2 w-2 rounded-full", LEVELS[lv].dot)} /> {LEVELS[lv].title}</p>
                <p className="metric mt-2 text-2xl font-bold">{data ? num(count(lv)) : "…"}</p>
              </div>
            ))}
          </div>
        </div>
      </DarkPanel>

      <div className="grid gap-5 lg:grid-cols-3">
        {(Object.keys(LEVELS) as Level[]).map((lv) => (
          <section key={lv} className="admin-in">
            <h2 className="mb-3 flex items-center gap-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <span className={cn("h-2 w-2 rounded-full", LEVELS[lv].dot)} /> {LEVELS[lv].title}
            </h2>
            <ul className="space-y-2.5">
              {ITEMS.filter((i) => i.level === lv).map((it) => {
                const n = it.key ? data?.[it.key] : undefined;
                const Icon = it.icon;
                return (
                  <li key={it.label}>
                    <Link to={it.soon ? "/admin/$" : (it.to ?? "/admin")} params={{ _splat: it.soon ?? "" }}
                      className={cn("admin-card group flex items-center gap-3 p-3.5 ring-1 ring-transparent transition-all hover:-translate-y-0.5 hover:shadow-float", LEVELS[lv].ring, it.soon && "opacity-70")}>
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary", n ? LEVELS[lv].text : "text-muted-foreground")}><Icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{it.label}</span>
                      {it.soon ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"><Lock className="h-3 w-3" /> Próxima fase</span>
                      ) : (
                        <span className={cn("metric text-lg font-bold", n ? LEVELS[lv].text : "text-muted-foreground")}>{n ?? "…"}</span>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <CustomerQueues />
    </>
  );
}
