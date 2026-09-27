import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Constants, type Database } from "@/integrations/supabase/types";
import { PageHeader, Panel, DataTable, Badge, Btn, Field, TextInput, SelectInput } from "@/components/admin/ui";
import { FormModal } from "@/components/admin/Modal";
import { STATUS_LABEL } from "@/lib/admin/format";
import { useOrgOptions } from "@/lib/admin/queries";

export const Route = createFileRoute("/_authenticated/admin/financeiro/contas")({ component: Accounts });
type AStatus = Database["public"]["Enums"]["payment_account_status"];
type Kind = Database["public"]["Enums"]["payment_account_kind"];

const mask = (k: string | null) => (!k ? "—" : k.length <= 6 ? "•••" : `${k.slice(0, 3)}•••${k.slice(-3)}`);

function Accounts() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const list = useQuery({
    queryKey: ["pay-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_accounts").select("id,kind,provider,provider_account_id,pix_key_type,pix_key,holder_name,status,organizations(name)").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AStatus }) => {
      const { error } = await supabase.from("payment_accounts").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pay-accounts"] }),
  });
  type R = NonNullable<typeof list.data>[number];
  return (
    <>
      <PageHeader eyebrow="Financeiro" title="Contas recebedoras" description="Como cada empresa recebe: conta no gateway (split automático) ou Pix (repasse). Ter Pix não coloca a empresa no split — sem conta integrada, é gerado repasse pendente."
        actions={<Btn onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nova conta</Btn>} />
      <Panel>
        <DataTable<R> rowKey={(r) => r.id} rows={list.data} loading={list.isLoading} empty="Nenhuma conta recebedora." columns={[
          { key: "o", label: "Empresa", render: (r) => <span className="font-semibold">{r.organizations?.name}</span> },
          { key: "k", label: "Tipo", render: (r) => (r.kind === "pix" ? "Pix" : `Gateway${r.provider ? ` · ${r.provider}` : ""}`) },
          { key: "d", label: "Dados", render: (r) => (r.kind === "pix" ? `${r.pix_key_type ?? ""} ${mask(r.pix_key)}` : mask(r.provider_account_id)) },
          { key: "h", label: "Titular", render: (r) => r.holder_name ?? "—" },
          { key: "s", label: "Status", render: (r) => <Badge value={r.status} /> },
          { key: "a", label: "", className: "text-right", render: (r) => (
            <SelectInput aria-label="Status" value={r.status} className="h-8 w-32 text-xs" onChange={(e) => setStatus.mutate({ id: r.id, status: e.target.value as AStatus })}>
              {Constants.public.Enums.payment_account_status.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </SelectInput>) },
        ]} />
      </Panel>
      {open && <CreateAccount onClose={() => setOpen(false)} />}
    </>
  );
}

function CreateAccount({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const orgs = useOrgOptions();
  const [f, setF] = useState({ organization_id: "", kind: "pix" as Kind, provider: "", provider_account_id: "", pix_key_type: "cnpj", pix_key: "", holder_name: "", holder_document: "" });
  const m = useMutation({
    mutationFn: async () => {
      if (!f.organization_id) throw new Error("Selecione a empresa.");
      if (f.kind === "pix" && (!f.pix_key.trim() || !f.holder_name.trim())) throw new Error("Informe chave Pix e titular.");
      if (f.kind === "gateway_recipient" && !f.provider_account_id.trim()) throw new Error("Informe o ID do recebedor no gateway.");
      const pix = f.kind === "pix";
      const row = {
        organization_id: f.organization_id, kind: f.kind, holder_name: f.holder_name || null, holder_document: f.holder_document || null,
        pix_key_type: pix ? f.pix_key_type : null, pix_key: pix ? f.pix_key.trim() : null,
        provider: pix ? null : f.provider || null, provider_account_id: pix ? null : f.provider_account_id.trim(),
      };
      const { error } = await supabase.from("payment_accounts").insert(row);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pay-accounts"] }); onClose(); },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <FormModal open onOpenChange={(v) => !v && onClose()} title="Nova conta recebedora" onSubmit={() => m.mutate()} submitting={m.isPending} error={m.error}>
      <Field label="Empresa"><SelectInput value={f.organization_id} onChange={set("organization_id")}><option value="">Selecione...</option>{orgs.data?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</SelectInput></Field>
      <Field label="Tipo"><SelectInput value={f.kind} onChange={set("kind")}><option value="pix">Pix (repasse)</option><option value="gateway_recipient">Recebedor no gateway (split)</option></SelectInput></Field>
      {f.kind === "pix" ? (
        <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
          <Field label="Tipo de chave"><SelectInput value={f.pix_key_type} onChange={set("pix_key_type")}>{["cpf", "cnpj", "email", "telefone", "aleatoria"].map((k) => <option key={k} value={k}>{k}</option>)}</SelectInput></Field>
          <Field label="Chave Pix"><TextInput value={f.pix_key} onChange={set("pix_key")} maxLength={120} /></Field>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Provedor"><TextInput value={f.provider} onChange={set("provider")} maxLength={40} /></Field>
          <Field label="ID do recebedor"><TextInput value={f.provider_account_id} onChange={set("provider_account_id")} maxLength={120} /></Field>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Titular"><TextInput value={f.holder_name} onChange={set("holder_name")} maxLength={120} /></Field>
        <Field label="CPF/CNPJ do titular"><TextInput value={f.holder_document} onChange={set("holder_document")} maxLength={20} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">Nenhuma senha ou credencial bancária é guardada — só identificadores do provedor e chave Pix. A conta nasce pendente até verificação.</p>
    </FormModal>
  );
}
