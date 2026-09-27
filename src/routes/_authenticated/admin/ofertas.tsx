import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Constants, type Database } from "@/integrations/supabase/types";
import { PageHeader, Panel, DataTable, Pager, Badge, Btn, Field, TextInput, SelectInput } from "@/components/admin/ui";
import { FormModal } from "@/components/admin/Modal";
import { brl, MODALITY_LABEL, pageRange, STATUS_LABEL } from "@/lib/admin/format";
import { useOrgOptions, useProductOptions } from "@/lib/admin/queries";

export const Route = createFileRoute("/_authenticated/admin/ofertas")({ component: Offers });
type CStatus = Database["public"]["Enums"]["catalog_status"];
type Modality = Database["public"]["Enums"]["commercial_modality"];

function Offers() {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [status, setStatusF] = useState<"" | CStatus>("");
  const [open, setOpen] = useState(false);
  const [costFor, setCostFor] = useState<{ id: string; product_id: string; label: string } | null>(null);
  const list = useQuery({
    queryKey: ["offers", page, status],
    queryFn: async () => {
      let query = supabase.from("supplier_offers")
        .select("id,product_id,status,modalities,moq,organizations(name),products(name),supplier_offer_variants(supply_cost)", { count: "exact" })
        .order("created_at", { ascending: false }).range(...pageRange(page));
      if (status) query = query.eq("status", status);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data, count };
    },
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CStatus }) => {
      const { error } = await supabase.from("supplier_offers").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["offers"] }); qc.invalidateQueries({ queryKey: ["admin-ops"] }); },
  });
  type Row = NonNullable<typeof list.data>["rows"][number];
  return (
    <>
      <PageHeader eyebrow="Catálogo" title="Ofertas de fornecedores" description="Relação comercial fornecedor × produto: custo por SKU, modalidades e pedido mínimo. Publicação exige aprovação BemMais."
        actions={<Btn onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nova oferta</Btn>} />
      <Panel>
        <div className="border-b border-border p-3">
          <SelectInput value={status} onChange={(e) => { setStatusF(e.target.value as CStatus); setPage(0); }} className="w-48">
            <option value="">Todos os status</option>
            {Constants.public.Enums.catalog_status.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </SelectInput>
        </div>
        <DataTable<Row> rowKey={(r) => r.id} rows={list.data?.rows} loading={list.isLoading} empty="Nenhuma oferta cadastrada." columns={[
          { key: "p", label: "Produto", render: (r) => <span className="font-semibold">{r.products?.name}</span> },
          { key: "f", label: "Fornecedor", render: (r) => r.organizations?.name },
          { key: "m", label: "Modalidades", render: (r) => <div className="flex flex-wrap gap-1">{r.modalities.map((x) => <span key={x} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{MODALITY_LABEL[x]}</span>)}</div> },
          { key: "q", label: "Mín.", render: (r) => r.moq },
          { key: "c", label: "Custo", render: (r) => {
            const c = r.supplier_offer_variants.map((v) => Number(v.supply_cost));
            return c.length ? (Math.min(...c) === Math.max(...c) ? brl(c[0]) : `${brl(Math.min(...c))} – ${brl(Math.max(...c))}`) : <span className="text-muted-foreground">sem SKUs</span>;
          } },
          { key: "s", label: "Status", render: (r) => <Badge value={r.status} /> },
          { key: "a", label: "", className: "text-right whitespace-nowrap", render: (r) => (
            <div className="flex justify-end gap-1.5">
              <Btn variant="outline" className="h-8 text-xs" onClick={() => setCostFor({ id: r.id, product_id: r.product_id, label: `${r.products?.name} · ${r.organizations?.name}` })}>+ Custo SKU</Btn>
              {r.status === "pending_review" || r.status === "draft" ? (<>
                <Btn className="h-8 text-xs" onClick={() => setStatus.mutate({ id: r.id, status: "approved" })} aria-label="Aprovar"><Check className="h-3.5 w-3.5" /></Btn>
                <Btn variant="outline" className="h-8 text-xs" onClick={() => setStatus.mutate({ id: r.id, status: "rejected" })} aria-label="Rejeitar"><X className="h-3.5 w-3.5" /></Btn>
              </>) : (
                <SelectInput aria-label="Status" value={r.status} className="h-8 w-32 text-xs" onChange={(e) => setStatus.mutate({ id: r.id, status: e.target.value as CStatus })}>
                  {Constants.public.Enums.catalog_status.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </SelectInput>
              )}
            </div>) },
        ]} />
        <Pager page={page} setPage={setPage} total={list.data?.count} />
      </Panel>
      {open && <CreateOffer onClose={() => setOpen(false)} />}
      {costFor && <AddCost offer={costFor} onClose={() => setCostFor(null)} />}
    </>
  );
}

function CreateOffer({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const suppliers = useOrgOptions("supply_products");
  const products = useProductOptions();
  const [f, setF] = useState({ organization_id: "", product_id: "", moq: "1", lead_time_days: "" });
  const [mods, setMods] = useState<Modality[]>(["drop"]);
  const m = useMutation({
    mutationFn: async () => {
      if (!f.organization_id || !f.product_id) throw new Error("Selecione fornecedor e produto.");
      const moq = Number.parseInt(f.moq, 10);
      if (!Number.isFinite(moq) || moq < 1) throw new Error("Pedido mínimo inválido.");
      const { error } = await supabase.from("supplier_offers").insert({
        organization_id: f.organization_id, product_id: f.product_id, modalities: mods, moq, status: "pending_review",
        lead_time_days: f.lead_time_days ? Number.parseInt(f.lead_time_days, 10) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["offers"] }); onClose(); },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <FormModal open onOpenChange={(v) => !v && onClose()} title="Nova oferta de fornecedor" onSubmit={() => m.mutate()} submitting={m.isPending} error={m.error}>
      <Field label="Fornecedor"><SelectInput value={f.organization_id} onChange={set("organization_id")} required><option value="">Selecione...</option>{suppliers.data?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</SelectInput></Field>
      <Field label="Produto"><SelectInput value={f.product_id} onChange={set("product_id")} required><option value="">Selecione...</option>{products.data?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</SelectInput></Field>
      <fieldset><legend className="mb-1 text-xs font-semibold text-muted-foreground">Modalidades</legend>
        <div className="grid grid-cols-2 gap-1.5">{Constants.public.Enums.commercial_modality.map((x) => (
          <label key={x} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[var(--primary)]" checked={mods.includes(x)} onChange={(e) => setMods(e.target.checked ? [...mods, x] : mods.filter((y) => y !== x))} />{MODALITY_LABEL[x]}</label>
        ))}</div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pedido mínimo (unidades)"><TextInput type="number" min={1} value={f.moq} onChange={set("moq")} /></Field>
        <Field label="Prazo de envio (dias)"><TextInput type="number" min={0} value={f.lead_time_days} onChange={set("lead_time_days")} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">A oferta entra como "Em análise" até ser aprovada.</p>
    </FormModal>
  );
}

function AddCost({ offer, onClose }: { offer: { id: string; product_id: string; label: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const variants = useQuery({
    queryKey: ["variants", offer.product_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_variants").select("id,sku").eq("product_id", offer.product_id).order("sku");
      if (error) throw error;
      return data;
    },
  });
  const [variant, setVariant] = useState("");
  const [cost, setCost] = useState("");
  const m = useMutation({
    mutationFn: async () => {
      const v = Number(cost.replace(",", "."));
      if (!variant) throw new Error("Selecione o SKU.");
      if (!Number.isFinite(v) || v <= 0) throw new Error("Custo inválido.");
      // organization_id is overwritten by trigger from the offer (never trusted from the browser)
      const { error } = await supabase.from("supplier_offer_variants")
        .upsert({ offer_id: offer.id, variant_id: variant, supply_cost: v, organization_id: "00000000-0000-0000-0000-000000000000" }, { onConflict: "offer_id,variant_id" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["offers"] }); onClose(); },
  });
  return (
    <FormModal open onOpenChange={(v) => !v && onClose()} title={`Custo por SKU — ${offer.label}`} onSubmit={() => m.mutate()} submitting={m.isPending} error={m.error}>
      {variants.data && !variants.data.length && <p className="text-sm text-muted-foreground">Esse produto ainda não tem SKUs. Cadastre em Produtos.</p>}
      <Field label="SKU"><SelectInput value={variant} onChange={(e) => setVariant(e.target.value)}><option value="">Selecione...</option>{variants.data?.map((v) => <option key={v.id} value={v.id}>{v.sku}</option>)}</SelectInput></Field>
      <Field label="Custo do fornecedor (R$)"><TextInput inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0,00" /></Field>
    </FormModal>
  );
}
