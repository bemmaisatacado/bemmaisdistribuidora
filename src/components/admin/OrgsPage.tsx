import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Constants, type Database } from "@/integrations/supabase/types";
import { PageHeader, Panel, DataTable, Pager, Badge, Btn, Field, TextInput, SelectInput, SearchBox, type Column } from "./ui";
import { FormModal } from "./Modal";
import { CAPABILITY_LABEL, dateTime, pageRange, slugify, STATUS_LABEL } from "@/lib/admin/format";

type Cap = Database["public"]["Enums"]["org_capability"];
type Status = Database["public"]["Enums"]["org_status"];
const CAPS = Constants.public.Enums.org_capability;
const BUYER_CAPS = CAPS.filter((c) => c !== "supply_products");

type Kind = "all" | "clients" | "suppliers";
const COPY: Record<Kind, { title: string; desc: string; defaults: Cap[] }> = {
  all: { title: "Empresas", desc: "Todas as organizações do ecossistema. Cada uma pode ter várias capacidades ao mesmo tempo.", defaults: [] },
  clients: { title: "Clientes BemMais", desc: "Organizações que compram, revendem ou operam loja.", defaults: ["use_dropshipping", "sell_retail", "operate_store"] },
  suppliers: { title: "Fornecedores", desc: "Organizações que fornecem produtos. No início a BemMais cadastra as ofertas por elas.", defaults: ["supply_products"] },
};

export function OrgsPage({ kind }: { kind: Kind }) {
  const copy = COPY[kind];
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const list = useQuery({
    queryKey: ["orgs", kind, page, q],
    queryFn: async () => {
      const capSel = kind === "all" ? "organization_capabilities(capability,enabled)" : "organization_capabilities!inner(capability,enabled)";
      let query = supabase.from("organizations")
        .select(`id,name,slug,document,email,status,created_at,${capSel}`, { count: "exact" })
        .eq("is_platform", false).order("created_at", { ascending: false }).range(...pageRange(page));
      if (kind === "suppliers") query = query.eq("organization_capabilities.capability", "supply_products");
      if (kind === "clients") query = query.in("organization_capabilities.capability", BUYER_CAPS);
      if (q.trim()) query = query.ilike("name", `%${q.trim()}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data as unknown as Row[], count };
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("organizations").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orgs"] }),
  });

  const cols: Column<Row>[] = [
    { key: "name", label: "Empresa", render: (r) => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-muted-foreground">{r.document || r.email || r.slug}</p></div> },
    { key: "caps", label: "Capacidades", render: (r) => (
      <div className="flex flex-wrap gap-1">{r.organization_capabilities.filter((c) => c.enabled).map((c) => (
        <span key={c.capability} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{CAPABILITY_LABEL[c.capability]}</span>))}</div>) },
    { key: "status", label: "Status", render: (r) => <Badge value={r.status} /> },
    { key: "created", label: "Criada em", render: (r) => <span className="text-xs text-muted-foreground">{dateTime(r.created_at)}</span> },
    { key: "act", label: "", className: "text-right", render: (r) => (
      <SelectInput aria-label="Alterar status" value={r.status} className="h-8 w-32 text-xs" onChange={(e) => setStatus.mutate({ id: r.id, status: e.target.value as Status })}>
        {Constants.public.Enums.org_status.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </SelectInput>) },
  ];

  return (
    <>
      <PageHeader eyebrow="Ecossistema" title={copy.title} description={copy.desc}
        actions={<Btn onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nova empresa</Btn>} />
      <Panel>
        <div className="border-b border-border p-3"><SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Buscar por nome..." /></div>
        <DataTable columns={cols} rows={list.data?.rows} loading={list.isLoading} rowKey={(r) => r.id} empty="Nenhuma empresa cadastrada." />
        <Pager page={page} setPage={setPage} total={list.data?.count} />
      </Panel>
      {open && <CreateOrg defaults={copy.defaults} onClose={() => setOpen(false)} />}
    </>
  );
}

type Row = { id: string; name: string; slug: string; document: string | null; email: string | null; status: Status; created_at: string; organization_capabilities: { capability: Cap; enabled: boolean }[] };

function CreateOrg({ defaults, onClose }: { defaults: Cap[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", legal_name: "", document: "", email: "", phone: "" });
  const [caps, setCaps] = useState<Cap[]>(defaults);
  const m = useMutation({
    mutationFn: async () => {
      if (f.name.trim().length < 2) throw new Error("Informe o nome da empresa.");
      const slug = `${slugify(f.name)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabase.from("organizations").insert({
        name: f.name.trim(), slug, legal_name: f.legal_name || null, document: f.document || null, email: f.email || null, phone: f.phone || null,
      }).select("id").single();
      if (error) throw error;
      if (caps.length) {
        const { error: e2 } = await supabase.from("organization_capabilities").insert(caps.map((capability) => ({ organization_id: data.id, capability })));
        if (e2) throw e2;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["orgs"] }); qc.invalidateQueries({ queryKey: ["admin-metrics"] }); onClose(); },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <FormModal open onOpenChange={(v) => !v && onClose()} title="Nova empresa" onSubmit={() => m.mutate()} submitting={m.isPending} error={m.error}>
      <Field label="Nome"><TextInput value={f.name} onChange={set("name")} required maxLength={120} /></Field>
      <Field label="Razão social"><TextInput value={f.legal_name} onChange={set("legal_name")} maxLength={160} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="CPF/CNPJ"><TextInput value={f.document} onChange={set("document")} maxLength={20} /></Field>
        <Field label="Telefone"><TextInput value={f.phone} onChange={set("phone")} maxLength={20} /></Field>
      </div>
      <Field label="E-mail"><TextInput type="email" value={f.email} onChange={set("email")} maxLength={160} /></Field>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-xs font-semibold text-muted-foreground">Capacidades</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {CAPS.map((c) => (
            <label key={c} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={caps.includes(c)} onChange={(e) => setCaps(e.target.checked ? [...caps, c] : caps.filter((x) => x !== c))} className="accent-[var(--primary)]" />
              {CAPABILITY_LABEL[c]}
            </label>
          ))}
        </div>
      </fieldset>
    </FormModal>
  );
}
