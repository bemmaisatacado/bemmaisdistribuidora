import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Stat, SelectInput, Empty } from "@/components/admin/ui";
import { brl, num, dateTime } from "@/lib/admin/format";

export const Route = createFileRoute("/_authenticated/admin/")({ component: Dashboard });

const PERIODS = { "7": "Últimos 7 dias", "30": "Últimos 30 dias", "90": "Últimos 90 dias", "365": "Últimos 12 meses" } as const;
type Metrics = Record<string, number>;

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
  const ops = useQuery({
    queryKey: ["admin-ops"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_ops_queue");
      if (error) throw error;
      return data as unknown as Metrics;
    },
  });
  const activity = useQuery({
    queryKey: ["admin-activity"],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_logs").select("id,occurred_at,action,entity_type,entity_id").order("occurred_at", { ascending: false }).limit(8);
      if (error) throw error;
      return data;
    },
  });

  const m = metrics.data;
  const v = (k: string) => (m ? m[k] : undefined);
  const ticket = m && m.paid_count ? m.gmv / m.paid_count : 0;
  const alerts: { n: number; label: string; to: LinkProps["to"] }[] = ops.data ? [
    { n: ops.data.offers_pending, label: "ofertas aguardando aprovação", to: "/admin/ofertas" },
    { n: ops.data.payouts_pending, label: "repasses pendentes", to: "/admin/financeiro/repasses" },
    { n: ops.data.accounts_pending, label: "contas recebedoras pendentes", to: "/admin/financeiro/contas" },
    { n: ops.data.stock_critical, label: "SKUs com estoque crítico", to: "/admin/estoque" },
  ].filter((a) => a.n > 0) : [];

  return (
    <>
      <PageHeader eyebrow="Visão geral" title="Dashboard" description="Indicadores reais da plataforma. Valores aparecem conforme a operação acontece."
        actions={<SelectInput value={days} onChange={(e) => setDays(e.target.value as keyof typeof PERIODS)} className="w-48">
          {Object.entries(PERIODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </SelectInput>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <Stat label="GMV" value={m ? brl(v("gmv")) : "…"} hint="Pagamentos aprovados no período" />
        <Stat label="Receita BemMais" value={m ? brl(v("platform_revenue")) : "…"} hint="Parcela da plataforma nas divisões" />
        <Stat label="Pedidos" value="—" hint="Disponível com o módulo Pedidos" />
        <Stat label="Ticket médio" value={m ? brl(ticket) : "…"} />
        <Stat label="Clientes ativos" value={m ? num(v("active_clients")) : "…"} />
        <Stat label="Fornecedores" value={m ? num(v("suppliers")) : "…"} />
        <Stat label="Lojas" value={m ? num(v("stores")) : "…"} />
        <Stat label="Produtos" value={m ? num(v("products")) : "…"} />
        <Stat label="SKUs" value={m ? num(v("skus")) : "…"} />
        <Stat label="Recebíveis" value={m ? brl(v("receivables_pending")) : "…"} hint="Pendentes ou disponíveis" />
        <Stat label="Repasses pendentes" value={m ? brl(v("payouts_pending")) : "…"} hint={m ? `${num(v("payouts_pending_count"))} repasse(s)` : undefined} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Atividade recente" className="lg:col-span-2" actions={<Link to="/admin/auditoria" className="text-xs font-semibold text-primary">Ver auditoria</Link>}>
          {!activity.data?.length ? <Empty text="Nenhuma atividade registrada." /> : (
            <ul className="divide-y divide-border text-sm">
              {activity.data.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span><b className="capitalize">{a.action}</b> em {a.entity_type}</span>
                  <span className="text-xs text-muted-foreground">{dateTime(a.occurred_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="grid gap-4">
          <Panel title="Alertas operacionais">
            {!alerts.length ? <Empty text="Nenhum alerta no momento." /> : (
              <ul className="divide-y divide-border text-sm">
                {alerts.map((a) => (
                  <li key={a.label}><Link to={a.to} className="flex justify-between px-4 py-2.5 hover:bg-secondary/50"><span>{a.label}</span><b className="text-primary">{a.n}</b></Link></li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Atalhos">
            <div className="grid grid-cols-2 gap-2 p-3 text-sm">
              {([["Nova empresa", "/admin/empresas"], ["Nova loja", "/admin/lojas"], ["Novo produto", "/admin/produtos"], ["Nova oferta", "/admin/ofertas"]] as const).map(([l, to]) => (
                <Link key={to} to={to} className="rounded-lg border border-border px-3 py-2 font-semibold hover:border-primary hover:text-primary">{l}</Link>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
