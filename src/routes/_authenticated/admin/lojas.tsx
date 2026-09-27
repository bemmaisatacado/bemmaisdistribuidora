import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Constants, type Database } from "@/integrations/supabase/types";
import { PageHeader, Panel, DataTable, Pager, Badge, Btn, Field, TextInput, SelectInput, SearchBox } from "@/components/admin/ui";
import { FormModal } from "@/components/admin/Modal";
import { dateTime, pageRange, slugify, STATUS_LABEL } from "@/lib/admin/format";
import { useOrgOptions } from "@/lib/admin/queries";

export const Route = createFileRoute("/_authenticated/admin/lojas")({ component: Stores });

type StoreStatus = Database["public"]["Enums"]["store_status"];
type Mode = Database["public"]["Enums"]["store_mode"];

function Stores() {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const list = useQuery({
    queryKey: ["stores", page, q],
    queryFn: async () => {
      let query = supabase.from("stores").select("id,name,slug,mode,status,whatsapp,created_at,organizations(name)", { count: "exact" })
        .order("created_at", { ascending: false }).range(...pageRange(page));
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stores"] }),
  });
  type Row = NonNullable<typeof list.data>["rows"][number];

  return (
    <>
      <PageHeader eyebrow="Ecossistema" title="Lojas" description="Lojas white-label das empresas clientes. A BemMais pode criar e configurar a loja pelo cliente."
        actions={<Btn onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Criar loja para cliente</Btn>} />
      <Panel>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-2 pt-4"><SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} /></div>
        <DataTable<Row> rowKey={(r) => r.id} rows={list.data?.rows} loading={list.isLoading} empty="Nenhuma loja criada." columns={[
          { key: "n", label: "Loja", render: (r) => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-muted-foreground">/{r.slug}</p></div> },
          { key: "o", label: "Empresa", render: (r) => r.organizations?.name ?? "—" },
          { key: "m", label: "Modo", render: (r) => STATUS_LABEL[r.mode] },
          { key: "s", label: "Status", render: (r) => <Badge value={r.status} /> },
          { key: "c", label: "Criada", render: (r) => <span className="text-xs text-muted-foreground">{dateTime(r.created_at)}</span> },
          { key: "a", label: "", className: "text-right", render: (r) => (
            <SelectInput aria-label="Status da loja" value={r.status} className="h-8 w-32 text-xs" onChange={(e) => setStatus.mutate({ id: r.id, status: e.target.value as StoreStatus })}>
              {Constants.public.Enums.store_status.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </SelectInput>) },
        ]} />
        <Pager page={page} setPage={setPage} total={list.data?.count} />
      </Panel>
      {open && <CreateStore onClose={() => setOpen(false)} />}
    </>
  );
}

function CreateStore({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const orgs = useOrgOptions();
  const [f, setF] = useState({ organization_id: "", name: "", slug: "", mode: "retail" as Mode, whatsapp: "", instagram: "", primary_color: "#E8641E", secondary_color: "#1F1D1B" });
  const m = useMutation({
    mutationFn: async () => {
      if (!f.organization_id) throw new Error("Selecione a empresa.");
      const slug = slugify(f.slug || f.name);
      if (!slug) throw new Error("Informe o nome da loja.");
      const { error } = await supabase.from("stores").insert({ ...f, slug, name: f.name.trim(), whatsapp: f.whatsapp || null, instagram: f.instagram || null });
      if (error) throw error.code === "23505" ? new Error("Esse endereço já está em uso.") : error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["stores"] }); onClose(); },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <FormModal open onOpenChange={(v) => !v && onClose()} title="Criar loja para cliente" onSubmit={() => m.mutate()} submitting={m.isPending} error={m.error} submitLabel="Criar loja">
      <Field label="Empresa"><SelectInput value={f.organization_id} onChange={set("organization_id")} required>
        <option value="">Selecione...</option>{orgs.data?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </SelectInput></Field>
      <Field label="Nome da loja"><TextInput value={f.name} onChange={set("name")} required maxLength={80} /></Field>
      <Field label="Endereço (slug)"><TextInput value={f.slug} onChange={set("slug")} placeholder={slugify(f.name) || "minha-loja"} maxLength={60} /></Field>
      <Field label="Modo"><SelectInput value={f.mode} onChange={set("mode")}>
        {Constants.public.Enums.store_mode.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </SelectInput></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="WhatsApp"><TextInput value={f.whatsapp} onChange={set("whatsapp")} maxLength={20} /></Field>
        <Field label="Instagram"><TextInput value={f.instagram} onChange={set("instagram")} maxLength={60} /></Field>
        <Field label="Cor principal"><TextInput type="color" value={f.primary_color} onChange={set("primary_color")} /></Field>
        <Field label="Cor secundária"><TextInput type="color" value={f.secondary_color} onChange={set("secondary_color")} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">A loja nasce como rascunho. Ative quando estiver pronta.</p>
    </FormModal>
  );
}
