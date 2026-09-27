import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, DarkPanel, MetricCard, MoneyValue } from "@/components/admin/ui";
import { Clock, Send, TrendingUp } from "lucide-react";
import { brl, num } from "@/lib/admin/format";
import type { Metrics } from "@/lib/admin/metrics";

export const Route = createFileRoute("/_authenticated/admin/financeiro/")({ component: FinanceOverview });

function FinanceOverview() {
  const { data: m } = useQuery({
    queryKey: ["admin-metrics", "30"],
    queryFn: async () => {
      const to = new Date();
      const { data, error } = await supabase.rpc("admin_dashboard_metrics", { _from: new Date(to.getTime() - 30 * 864e5).toISOString(), _to: to.toISOString() });
      if (error) throw error;
      return data as unknown as Metrics;
    },
  });
  return (
    <>
      <PageHeader eyebrow="Financeiro" title="Visão geral financeira" description="Modelo de marketplace: pagamento ≠ divisão ≠ recebível ≠ repasse. Nada é apagado — correções são lançamentos de estorno." />
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr_1fr]">
        <DarkPanel className="p-6 lg:row-span-2">
          <p className="relative text-[10px] font-bold uppercase tracking-[0.24em] text-primary">GMV · 30 dias</p>
          <p className="metric relative mt-3 text-[clamp(2rem,4vw,2.75rem)] font-bold">{m ? <MoneyValue value={m.gmv} /> : "…"}</p>
          <p className="relative mt-1 text-sm text-ink-muted">Total de pagamentos aprovados</p>
          <div className="relative mt-6 rounded-xl bg-surface-dark-2/80 p-4 ring-1 ring-ink-border">
            <p className="text-[11px] text-ink-muted">Receita BemMais</p>
            <p className="metric mt-1 text-xl font-bold text-primary">{m ? brl(m.platform_revenue) : "…"}</p>
          </div>
        </DarkPanel>
        <MetricCard icon={TrendingUp} label="Receita BemMais" value={m ? <MoneyValue value={m.platform_revenue} /> : "…"} hint="Últimos 30 dias" />
        <MetricCard icon={Clock} label="Recebíveis em aberto" value={m ? <MoneyValue value={m.receivables_pending} /> : "…"} />
        <MetricCard icon={Send} label="Repasses pendentes" value={m ? <MoneyValue value={m.payouts_pending} /> : "…"} hint={m ? `${num(m.payouts_pending_count)} repasse(s)` : undefined} />
        <MetricCard icon={Clock} label="Saldo / posição" value="—" locked="Disponível após conexão do gateway" />
      </div>
      <Panel title="Como o dinheiro flui" className="mt-6">
        <ol className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Pagamento", "Dinheiro pago pelo comprador.", "/admin/financeiro/transacoes"],
            ["Divisão (allocation)", "Quanto pertence a cada participante: fornecedor, BemMais, lojista, frete, taxas.", "/admin/financeiro/allocations"],
            ["Recebível", "Valor que cada participante tem a receber.", "/admin/financeiro/recebiveis"],
            ["Repasse (payout)", "Liquidação efetiva — via split do gateway ou Pix.", "/admin/financeiro/repasses"],
            ["Conta recebedora", "Conta do gateway ou chave Pix de cada empresa.", "/admin/financeiro/contas"],
            ["Livro-razão", "Registro imutável de todas as movimentações.", "/admin/financeiro/ledger"],
          ].map(([t, d, to], i) => (
            <li key={t}><Link to={to as "/admin/financeiro/transacoes"} className="group block h-full rounded-xl bg-secondary/50 p-4 transition-all hover:-translate-y-0.5 hover:bg-primary-soft">
              <p className="metric grid h-7 w-7 place-items-center rounded-lg bg-surface-dark text-xs font-bold text-ink-foreground group-hover:bg-primary">{String(i + 1).padStart(2, "0")}</p><p className="mt-3 font-semibold">{t}</p><p className="mt-1 text-muted-foreground">{d}</p>
            </Link></li>
          ))}
        </ol>
      </Panel>
      <p className="mt-3 text-xs text-muted-foreground">Nenhum gateway está conectado ainda. A integração acontece por uma camada de adaptadores, sem prender a plataforma a um único banco.</p>
    </>
  );
}
