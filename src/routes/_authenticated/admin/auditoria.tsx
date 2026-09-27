import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, DataTable, Pager, SelectInput } from "@/components/admin/ui";
import { dateTime, pageRange } from "@/lib/admin/format";

export const Route = createFileRoute("/_authenticated/admin/auditoria")({ component: Audit });

const ENTITIES = ["organizations", "organization_members", "organization_capabilities", "stores", "products", "supplier_offers", "supplier_offer_variants", "pricing_rules", "inventory_movements", "payment_accounts", "payments", "payment_allocations", "payouts", "ledger_entries", "ai_providers", "ai_features", "platform_settings"];

function Audit() {
  const [page, setPage] = useState(0);
  const [entity, setEntity] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const q = useQuery({
    queryKey: ["audit", page, entity],
    queryFn: async () => {
      let query = supabase.from("audit_logs").select("id,occurred_at,actor_id,action,entity_type,entity_id,before_data,after_data", { count: "exact" })
        .order("occurred_at", { ascending: false }).range(...pageRange(page));
      if (entity) query = query.eq("entity_type", entity);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data, count };
    },
  });
  type R = NonNullable<typeof q.data>["rows"][number];
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Auditoria" description="Registro imutável de mudanças críticas, gravado automaticamente pelo banco. Não pode ser editado nem apagado." />
      <Panel>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-2 pt-4">
          <SelectInput value={entity} onChange={(e) => { setEntity(e.target.value); setPage(0); }} className="w-64">
            <option value="">Todas as entidades</option>{ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
          </SelectInput>
        </div>
        <DataTable<R> rowKey={(r) => String(r.id)} rows={q.data?.rows} loading={q.isLoading} columns={[
          { key: "d", label: "Quando", render: (r) => <span className="text-xs">{dateTime(r.occurred_at)}</span> },
          { key: "a", label: "Ação", render: (r) => <span className="font-semibold capitalize">{r.action}</span> },
          { key: "e", label: "Entidade", render: (r) => r.entity_type },
          { key: "i", label: "ID", render: (r) => <code className="text-[11px] text-muted-foreground">{r.entity_id?.slice(0, 8)}</code> },
          { key: "u", label: "Autor", render: (r) => <code className="text-[11px] text-muted-foreground">{r.actor_id?.slice(0, 8) ?? "sistema"}</code> },
          { key: "x", label: "", className: "text-right", render: (r) => (
            <button className="text-xs font-semibold text-primary" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Fechar" : "Detalhes"}</button>) },
        ]} />
        {open !== null && (() => { const r = q.data?.rows.find((x) => x.id === open); return r ? (
          <div className="grid gap-3 border-t border-border-subtle p-4 text-xs md:grid-cols-2">
            <div><p className="mb-1 font-semibold">Antes</p><pre className="max-h-72 overflow-auto rounded-lg bg-secondary p-3">{JSON.stringify(r.before_data, null, 2)}</pre></div>
            <div><p className="mb-1 font-semibold">Depois</p><pre className="max-h-72 overflow-auto rounded-lg bg-secondary p-3">{JSON.stringify(r.after_data, null, 2)}</pre></div>
          </div>) : null; })()}
        <Pager page={page} setPage={setPage} total={q.data?.count} />
      </Panel>
    </>
  );
}
