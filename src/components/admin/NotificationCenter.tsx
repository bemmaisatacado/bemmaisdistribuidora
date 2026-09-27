import { Link, type LinkProps } from "@tanstack/react-router";
import { Bell, CheckCircle2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOps } from "@/lib/admin/useOps";
import type { Ops } from "@/lib/admin/metrics";

const ITEMS: { key: keyof Ops; label: string; to: NonNullable<LinkProps["to"]> }[] = [
  { key: "offers_pending", label: "Ofertas aguardando aprovação", to: "/admin/ofertas" },
  { key: "products_pending", label: "Produtos aguardando aprovação", to: "/admin/produtos" },
  { key: "stock_critical", label: "SKUs com estoque crítico", to: "/admin/estoque" },
  { key: "payouts_pending", label: "Repasses pendentes", to: "/admin/financeiro/repasses" },
  { key: "accounts_pending", label: "Contas recebedoras pendentes", to: "/admin/financeiro/contas" },
  { key: "payments_problem", label: "Pagamentos com problema", to: "/admin/financeiro/transacoes" },
];

/** Notifications derived from the real operational queue — nothing invented. */
export function NotificationCenter() {
  const { data } = useOps();
  const items = data ? ITEMS.filter((i) => (data[i.key] ?? 0) > 0) : [];
  return (
    <Popover>
      <PopoverTrigger aria-label="Notificações" className="relative grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
        <Bell className="h-[18px] w-[18px]" />
        {items.length > 0 && <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-primary ring-2 ring-surface-elevated" />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl p-0 shadow-float">
        <div className="border-b border-border-subtle px-4 py-3">
          <p className="font-display text-sm font-semibold">Notificações</p>
          <p className="text-xs text-muted-foreground">Baseadas na fila operacional</p>
        </div>
        {!items.length ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-success" /> Nada exigindo atenção agora.</div>
        ) : (
          <ul className="p-1.5">
            {items.map((i) => (
              <li key={i.key}>
                <Link to={i.to} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-secondary">
                  <span>{i.label}</span><b className="metric text-primary">{data?.[i.key]}</b>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
