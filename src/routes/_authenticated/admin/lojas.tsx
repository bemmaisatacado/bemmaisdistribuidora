import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Constants, type Database } from "@/integrations/supabase/types";
import {
  PageHeader,
  Panel,
  DataTable,
  Pager,
  Badge,
  Btn,
  SelectInput,
  SearchBox,
} from "@/components/admin/ui";
import { CreateStoreModal } from "@/components/admin/orgs/CreateStoreModal";
import { dateTime, pageRange, STATUS_LABEL } from "@/lib/admin/format";

export const Route = createFileRoute("/_authenticated/admin/lojas")({ component: Stores });

type StoreStatus = Database["public"]["Enums"]["store_status"];

function Stores() {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const list = useQuery({
    queryKey: ["stores", page, q],
    queryFn: async () => {
      let query = supabase
        .from("stores")
        .select(
          "id,name,slug,mode,status,whatsapp,created_at,organization_id,organizations(name)",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(...pageRange(page));
      if (q.trim()) query = query.ilike("name", `%${q.trim()}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data, count };
    },
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StoreStatus }) => {
      const { error } = await supabase.from("stores").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stores"] });
      qc.invalidateQueries({ queryKey: ["org"] });
    },
  });
  type Row = NonNullable<typeof list.data>["rows"][number];

  return (
    <>
      <PageHeader
        eyebrow="Ecossistema"
        title="Lojas"
        description="Lojas white-label das empresas clientes. A BemMais pode criar e configurar a loja pelo cliente."
        actions={
          <Btn onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Criar loja para cliente
          </Btn>
        }
      />
      <Panel>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-2 pt-4">
          <SearchBox
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(0);
            }}
          />
        </div>
        <DataTable<Row>
          rowKey={(r) => r.id}
          rows={list.data?.rows}
          loading={list.isLoading}
          empty="Nenhuma loja criada."
          columns={[
            {
              key: "n",
              label: "Loja",
              render: (r) => (
                <div>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">/{r.slug}</p>
                </div>
              ),
            },
            {
              key: "o",
              label: "Empresa",
              render: (r) =>
                r.organizations ? (
                  <Link
                    to="/admin/empresas/$orgId"
                    params={{ orgId: r.organization_id }}
                    search={{ tab: "lojas" }}
                    className="font-medium hover:text-primary"
                  >
                    {r.organizations.name}
                  </Link>
                ) : (
                  "—"
                ),
            },
            { key: "m", label: "Modo", render: (r) => STATUS_LABEL[r.mode] },
            { key: "s", label: "Status", render: (r) => <Badge value={r.status} /> },
            {
              key: "c",
              label: "Criada",
              render: (r) => (
                <span className="text-xs text-muted-foreground">{dateTime(r.created_at)}</span>
              ),
            },
            {
              key: "a",
              label: "",
              className: "text-right",
              render: (r) => (
                <SelectInput
                  aria-label="Status da loja"
                  value={r.status}
                  className="h-8 w-32 text-xs"
                  onChange={(e) =>
                    setStatus.mutate({ id: r.id, status: e.target.value as StoreStatus })
                  }
                >
                  {Constants.public.Enums.store_status.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </SelectInput>
              ),
            },
          ]}
        />
        <Pager page={page} setPage={setPage} total={list.data?.count} />
      </Panel>
      {open && <CreateStoreModal onClose={() => setOpen(false)} />}
    </>
  );
}
