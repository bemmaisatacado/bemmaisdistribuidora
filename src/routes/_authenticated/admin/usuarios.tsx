import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, DataTable, Pager, Badge } from "@/components/admin/ui";
import { dateTime, pageRange } from "@/lib/admin/format";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({ component: Members });

function Members() {
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["members", page],
    queryFn: async () => {
      const { data, error, count } = await supabase.from("organization_members").select("id,user_id,role_key,status,created_at,organizations(name),roles(name)", { count: "exact" })
        .order("created_at", { ascending: false }).range(...pageRange(page));
      if (error) throw error;
      const ids = [...new Set(data.map((d) => d.user_id))];
      const { data: profiles } = ids.length ? await supabase.from("profiles").select("id,full_name").in("id", ids) : { data: [] };
      const pm = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      return { count, rows: data.map((d) => ({ ...d, full_name: pm.get(d.user_id) })) };
    },
  });
  type R = NonNullable<typeof q.data>["rows"][number];
  return (
    <>
      <PageHeader eyebrow="Ecossistema" title="Usuários & Equipe" description="Vínculos de pessoas com empresas. Uma pessoa pode pertencer a várias organizações com papéis diferentes. Convites chegam na próxima fase." />
      <Panel>
        <DataTable<R> rowKey={(r) => r.id} rows={q.data?.rows} loading={q.isLoading} columns={[
          { key: "n", label: "Pessoa", render: (r) => <div><p className="font-semibold">{r.full_name || "Sem nome"}</p><code className="text-[11px] text-muted-foreground">{r.user_id.slice(0, 8)}</code></div> },
          { key: "o", label: "Empresa", render: (r) => r.organizations?.name },
          { key: "r", label: "Papel", render: (r) => r.roles?.name ?? r.role_key },
          { key: "s", label: "Status", render: (r) => <Badge value={r.status} /> },
          { key: "d", label: "Desde", render: (r) => <span className="text-xs text-muted-foreground">{dateTime(r.created_at)}</span> },
        ]} />
        <Pager page={page} setPage={setPage} total={q.data?.count} />
      </Panel>
    </>
  );
}
