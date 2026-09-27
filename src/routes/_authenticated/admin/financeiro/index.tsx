import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Stat } from "@/components/admin/ui";
import { brl, num } from "@/lib/admin/format";

export const Route = createFileRoute("/_authenticated/admin/financeiro/")({ component: FinanceOverview });

function FinanceOverview() {
  const { data: m } = useQuery({
    queryKey: ["admin-metrics", "30"],
    queryFn: async () => {
      const to = new Date();
      const { data, error } = await supabase.rpc("admin_dashboard_metrics", { _from: new Date(to.getTime() - 30 * 864e5).toISOString(), _to: to.toISOString() });
      if (error) throw error;
      return data as unknown as Record<string, number>;
    },
  });
  return (
    <>
      <PageHeader eyebrow="Financeiro" title="Visão geral financeira" description="Modelo de marketplace: pagamento ≠ divisão ≠ recebível ≠ repasse. Nada é apagado — correções são lançamentos de estorno." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="GMV (30 dias)" value={m ? brl(m.gmv) : "…"} />
        <Stat label="Receita BemMais (30 dias)" value={m ? brl(m.platform_revenue) : "…"} />
        <Stat label="Recebíveis em aberto" value={m ? brl(m.receivables_pending) : "…"} />
        <Stat label="Repasses pendentes" value={m ? brl(m.payouts_pending) : "…"} hint={m ? `${num(m.payouts_pending_count)} repasse(s)` : undefined} />
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
            <li key={t}><Link to={to as "/admin/financeiro/transacoes"} className="block h-full rounded-lg border border-border p-3 hover:border-primary">
              <p className="text-xs font-bold text-primary">{i + 1}</p><p className="font-semibold">{t}</p><p className="text-muted-foreground">{d}</p>
            </Link></li>
          ))}
        </ol>
      </Panel>
      <p className="mt-3 text-xs text-muted-foreground">Nenhum gateway está conectado ainda. A integração acontece por uma camada de adaptadores, sem prender a plataforma a um único banco.</p>
    </>
  );
}
