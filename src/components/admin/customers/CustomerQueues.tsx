import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Rocket, Mail, FileWarning, Store, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { shortDate } from "@/lib/admin/customers";
import { cn } from "@/lib/utils";

type Item = { id: string; name: string; detail?: string | null; due_at?: string | null };
type Queues = Record<
  "followups_late" | "onboarding" | "invites_pending" | "incomplete" | "stores_draft",
  Item[]
>;

const QUEUES: {
  key: keyof Queues;
  title: string;
  icon: typeof Rocket;
  critical?: boolean;
  tab: "relacionamento" | "usuarios" | "dados" | "loja";
}[] = [
  {
    key: "followups_late",
    title: "Follow-ups vencidos",
    icon: CalendarClock,
    critical: true,
    tab: "relacionamento",
  },
  { key: "onboarding", title: "Clientes em onboarding", icon: Rocket, tab: "relacionamento" },
  { key: "invites_pending", title: "Convites pendentes", icon: Mail, tab: "usuarios" },
  { key: "incomplete", title: "Cadastros incompletos", icon: FileWarning, tab: "dados" },
  { key: "stores_draft", title: "Lojas em rascunho", icon: Store, tab: "loja" },
];

/** Real customer queues for the Ops Center — every row comes from customer data. */
export function CustomerQueues() {
  const q = useQuery({
    queryKey: ["customer-queues"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_customer_queues");
      if (error) throw error;
      return data as unknown as Queues;
    },
  });
  return (
    <section className="mt-8">
      <h2 className="mb-3 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        Clientes BemMais
      </h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {QUEUES.map((d) => {
          const rows = q.data?.[d.key] ?? [];
          const I = d.icon;
          return (
            <div
              key={d.key}
              className={cn(
                "admin-card p-4",
                d.critical && rows.length > 0 && "ring-1 ring-danger/40",
              )}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-lg bg-secondary",
                    rows.length
                      ? d.critical
                        ? "text-danger"
                        : "text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  <I className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm font-semibold">{d.title}</span>
                <span
                  className={cn(
                    "metric text-lg font-bold",
                    rows.length
                      ? d.critical
                        ? "text-danger"
                        : "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {q.isLoading ? "…" : rows.length}
                </span>
              </div>
              {rows.length ? (
                <ul className="divide-y divide-border-subtle">
                  {rows.slice(0, 5).map((r, i) => (
                    <li key={`${r.id}-${i}`}>
                      <Link
                        to="/admin/clientes/$orgId"
                        params={{ orgId: r.id }}
                        search={{ tab: d.tab }}
                        className="group flex items-center gap-2 py-2 text-sm hover:text-primary"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-semibold">{r.name}</span>
                          {r.detail && <span className="text-muted-foreground"> · {r.detail}</span>}
                        </span>
                        {r.due_at && (
                          <span className="text-xs font-semibold text-danger">
                            {shortDate(r.due_at)}
                          </span>
                        )}
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {q.isLoading ? "Carregando..." : "Nada pendente."}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
