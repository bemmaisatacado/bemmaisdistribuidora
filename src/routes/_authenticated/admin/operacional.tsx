import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/admin/ui";
import type { Ops } from "@/lib/admin/metrics";

export const Route = createFileRoute("/_authenticated/admin/operacional")({ component: Ops });

type Item = { label: string; key?: keyof Ops; to?: LinkProps["to"]; soon?: string };
const ITEMS: Item[] = [
  { label: "Pedidos aguardando ação", soon: "pedidos" },
  { label: "Pedidos atrasados", soon: "pedidos" },
  { label: "Estoque crítico", key: "stock_critical", to: "/admin/estoque" },
  { label: "Ofertas aguardando aprovação", key: "offers_pending", to: "/admin/ofertas" },
  { label: "Produtos aguardando aprovação", key: "products_pending", to: "/admin/produtos" },
  { label: "Empresas pendentes", key: "orgs_pending", to: "/admin/empresas" },
  { label: "Fornecedores sem conta recebedora ativa", key: "suppliers_without_account", to: "/admin/fornecedores" },
  { label: "Pagamentos com problema", key: "payments_problem", to: "/admin/financeiro/transacoes" },
  { label: "Repasses pendentes", key: "payouts_pending", to: "/admin/financeiro/repasses" },
  { label: "Contas recebedoras pendentes", key: "accounts_pending", to: "/admin/financeiro/contas" },
  { label: "Fulfillments atrasados", soon: "fulfillments" },
  { label: "Integrações com falha", soon: "integracoes" },
  { label: "Ocorrências", soon: "ocorrencias" },
];

function Ops() {
  const { data } = useQuery({
    queryKey: ["admin-ops"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_ops_queue");
      if (error) throw error;
      return data as unknown as Ops;
    },
  });
  return (
    <>
      <PageHeader eyebrow="Visão geral" title="Central Operacional" description="O que precisa de atenção hoje. Clique para abrir cada fila." />
      <Panel>
        <ul className="divide-y divide-border">
          {ITEMS.map((it) => {
            const n = it.key ? data?.[it.key] : undefined;
            return (
              <li key={it.label}>
                <Link {...(it.soon ? { to: "/admin/$", params: { _splat: it.soon } } : { to: it.to })} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-secondary/50">
                  <span className="font-medium">{it.label}</span>
                  <span className="flex items-center gap-2">
                    {it.soon ? <span className="text-xs text-muted-foreground">Próxima fase</span>
                      : <b className={n ? "text-primary" : "text-muted-foreground"}>{n ?? "…"}</b>}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
