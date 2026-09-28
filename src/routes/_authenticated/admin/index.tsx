import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  CircleDollarSign, TrendingUp, ShoppingCart, Receipt, Users, Factory, Store, Package, Clock, Send, AlertTriangle,
  ArrowRight, Building2, Handshake, Radar, CheckCircle2, Activity,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MetricCard, Panel, DarkPanel, Empty, QuickAction, Timeline, MoneyValue } from "@/components/admin/ui";
import { brl, num, dateTime } from "@/lib/admin/format";
import { useOps } from "@/lib/admin/useOps";
import { cn } from "@/lib/utils";
import type { Metrics } from "@/lib/admin/metrics";

export const Route = createFileRoute("/_authenticated/admin/")({ component: Dashboard });

const PERIODS = { "7": "7d", "30": "30d", "90": "90d", "365": "12m" } as const;

function Dashboard() {
  const [days, setDays] = useState<keyof typeof PERIODS>("30");
  const metrics = useQuery({
    queryKey: ["admin-metrics", days],
    queryFn: async () => {
      const to = new Date();
      const from = new Date(to.getTime() - Number(days) * 864e5);
      const { data, error } = await supabase.rpc("admin_dashboard_metrics", { _from: from.toISOString(), _to: to.toISOString() });
      if (error) throw error;
      return data as unknown as Metrics;
    },
  });
  const ops = useOps();
  const activity = useQuery({
    queryKey: ["admin-activity"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_logs").select("id,occurred_at,action,entity_type,entity_id").order("occurred_at", { ascending: false }).limit(8);
      if (error) throw error;
      return data;
    },
  });

  const m = metrics.data;
  const L = "…";
  const ticket = m && m.paid_count ? m.gmv / m.paid_count : 0;
  type Alert = { n: number | undefined; label: string; to: NonNullable<LinkProps["to"]> };
  const control: Alert[] = [
    { n: ops.data?.offers_pending, label: "Ofertas pendentes", to: "/admin/ofertas" },
    { n: ops.data?.payouts_pending, label: "Repasses pendentes", to: "/admin/financeiro/repasses" },
    { n: ops.data?.stock_critical, label: "Estoque zerado / ajuste", to: "/admin/estoque" },
    { n: ops.data?.accounts_pending, label: "Contas a validar", to: "/admin/financeiro/contas" },
  ];
  const totalAttention = control.reduce((a, c) => a + (c.n ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="admin-in flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Visão geral</p>
          <h1 className="mt-2 font-display text-[clamp(1.75rem,3vw,2.5rem)] font-bold leading-none tracking-tight">Central BemMais</h1>
          <p className="mt-2 text-sm text-muted-foreground">Acompanhe o ecossistema em tempo real.</p>
        </div>
        <div role="radiogroup" aria-label="Período" className="inline-flex rounded-xl border border-border-subtle bg-surface-elevated p-1 shadow-card">
          {Object.entries(PERIODS).map(([k, l]) => (
            <button key={k} role="radio" aria-checked={days === k} onClick={() => setDays(k as keyof typeof PERIODS)}
              className={cn("rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all", days === k ? "bg-surface-dark text-ink-foreground shadow-card" : "text-muted-foreground hover:text-foreground")}>{l}</button>
          ))}
        </div>
      </div>

      {/* Layer 1: priority KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard size="lg" tone="brand" icon={CircleDollarSign} label="GMV" value={m ? <MoneyValue value={m.gmv} /> : L} hint="Pagamentos aprovados no período" />
        <MetricCard size="lg" icon={TrendingUp} label="Receita BemMais" value={m ? <MoneyValue value={m.platform_revenue} /> : L} hint="Parcela da plataforma nas divisões" />
        <MetricCard size="lg" icon={ShoppingCart} label="Pedidos" value="—" locked="Disponível após ativação de Pedidos" />
        <MetricCard size="lg" icon={Receipt} label="Ticket médio" value={m ? <MoneyValue value={ticket} /> : L} hint={m ? `${num(m.paid_count)} pagamento(s) aprovados` : undefined} />
      </div>

      {/* Control center + layer 2 */}
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <DarkPanel className="p-6">
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">BemMais Control Center</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">
                {ops.data ? (totalAttention ? `${num(totalAttention)} ${totalAttention === 1 ? "item exige" : "itens exigem"} atenção` : "Operação sob controle") : "Carregando operação…"}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">Filas reais da plataforma, atualizadas a cada acesso.</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-dark-2 px-2.5 py-1 text-[11px] font-semibold text-ink-muted ring-1 ring-ink-border">
              <Activity className="h-3 w-3 text-primary" /> Ao vivo
            </span>
          </div>
          <div className="relative mt-6 grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {control.map((c) => (
              <Link key={c.label} to={c.to} className="group rounded-xl bg-surface-dark-2/80 p-3.5 ring-1 ring-ink-border transition-all hover:-translate-y-0.5 hover:ring-primary/40">
                <p className={cn("metric text-2xl font-bold", c.n ? "text-primary" : "text-ink-foreground")}>{c.n ?? "…"}</p>
                <p className="mt-1 text-[11px] leading-snug text-ink-muted group-hover:text-ink-foreground">{c.label}</p>
              </Link>
            ))}
          </div>
          <Link to="/admin/operacional" className="relative mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold uppercase tracking-[0.08em] text-primary-foreground transition-all hover:gap-3 hover:bg-primary-hover">
            <Radar className="h-4 w-4" /> Abrir Central Operacional <ArrowRight className="h-4 w-4" />
          </Link>
        </DarkPanel>

        <div className="grid grid-cols-2 gap-4">
          <MetricCard icon={Users} label="Clientes ativos" value={m ? num(m.active_clients) : L} />
          <MetricCard icon={Factory} label="Fornecedores" value={m ? num(m.suppliers) : L} />
          <MetricCard icon={Store} label="Lojas" value={m ? num(m.stores) : L} />
          <MetricCard icon={Package} label="Produtos · SKUs" value={m ? `${num(m.products)} · ${num(m.skus)}` : L} />
        </div>
      </div>

      {/* Layer 3: finance + alerts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <MetricCard icon={Clock} label="Recebíveis" value={m ? <MoneyValue value={m.receivables_pending} /> : L} hint="Pendentes ou disponíveis" />
        <MetricCard icon={Send} label="Repasses pendentes" value={m ? <MoneyValue value={m.payouts_pending} /> : L} hint={m ? `${num(m.payouts_pending_count)} repasse(s)` : undefined} />
        <MetricCard icon={AlertTriangle} label="Alertas" value={ops.data ? num(totalAttention) : L} hint={ops.data && !totalAttention ? "Nenhum alerta no momento" : "Itens nas filas operacionais"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Atividade recente" description="Registro imutável da auditoria" className="lg:col-span-2"
          actions={<Link to="/admin/auditoria" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:gap-1.5">Ver auditoria <ArrowRight className="h-3 w-3" /></Link>}>
          {!activity.data?.length ? <Empty icon={CheckCircle2} text="Nenhuma atividade registrada." /> : (
            <Timeline items={activity.data.map((a) => ({
              id: String(a.id),
              title: <><b className="font-semibold capitalize">{a.action}</b> <span className="text-muted-foreground">em</span> {a.entity_type}</>,
              time: dateTime(a.occurred_at),
            }))} />
          )}
        </Panel>
        <Panel title="Ações rápidas">
          <div className="grid gap-2 p-4 pt-2">
            <Link to="/admin/empresas"><QuickAction icon={Building2} label="Nova empresa" /></Link>
            <Link to="/admin/lojas"><QuickAction icon={Store} label="Criar loja para cliente" /></Link>
            <Link to="/admin/produtos"><QuickAction icon={Package} label="Novo produto" /></Link>
            <Link to="/admin/ofertas"><QuickAction icon={Handshake} label="Nova oferta" /></Link>
          </div>
          {m && <p className="px-5 pb-4 text-[11px] text-muted-foreground">GMV do período: {brl(m.gmv)}</p>}
        </Panel>
      </div>
    </div>
  );
}
