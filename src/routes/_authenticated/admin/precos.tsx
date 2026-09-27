import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Constants, type Database } from "@/integrations/supabase/types";
import { PageHeader, Panel, DarkPanel, DataTable, Badge, Btn, Field, TextInput, SelectInput, ErrorNote } from "@/components/admin/ui";
import { FormModal } from "@/components/admin/Modal";
import { brl, MODALITY_LABEL } from "@/lib/admin/format";

export const Route = createFileRoute("/_authenticated/admin/precos")({ component: Pricing });
type Scope = Database["public"]["Enums"]["pricing_scope"];
type RType = Database["public"]["Enums"]["pricing_rule_type"];
type Modality = Database["public"]["Enums"]["commercial_modality"];

const SCOPE_LABEL: Record<Scope, string> = { global: "Global", supplier: "Fornecedor", category: "Categoria", brand: "Marca", product: "Produto", variant: "SKU", modality: "Modalidade", organization: "Empresa compradora", promotion: "Promoção" };
const TYPE_LABEL: Record<RType, string> = { percent: "Percentual", fixed: "Valor fixo", tiered: "Por faixa" };

function Pricing() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const list = useQuery({
    queryKey: ["pricing"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pricing_rules").select("*").order("priority", { ascending: false }).limit(200);
      if (error) throw error;
      return data;
    },
  });
  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("pricing_rules").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pricing"] }),
  });
  type Row = NonNullable<typeof list.data>[number];
  return (
    <>
      <PageHeader eyebrow="Comercial" title="Preços & Margens" description="Camada BemMais sobre o custo do fornecedor. A regra mais específica vence (promoção › SKU › produto › empresa › marca › categoria › fornecedor › modalidade › global); empate decide pela prioridade. Cálculo feito no banco."
        actions={<Btn onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nova regra</Btn>} />
      <Panel>
        <DataTable<Row> rowKey={(r) => r.id} rows={list.data} loading={list.isLoading} empty="Nenhuma regra. Sem regra, a margem BemMais é zero." columns={[
          { key: "n", label: "Regra", render: (r) => <span className="font-semibold">{r.name}</span> },
          { key: "s", label: "Escopo", render: (r) => SCOPE_LABEL[r.scope] },
          { key: "m", label: "Modalidade", render: (r) => (r.modality ? MODALITY_LABEL[r.modality] : "Todas") },
          { key: "t", label: "Tipo", render: (r) => TYPE_LABEL[r.rule_type] },
          { key: "v", label: "Valor", render: (r) => (r.rule_type === "percent" ? `${Number(r.value)}%` : r.rule_type === "fixed" ? brl(r.value) : `${(r.tiers as unknown[]).length} faixa(s)`) },
          { key: "p", label: "Prioridade", render: (r) => r.priority },
          { key: "a", label: "Status", render: (r) => <Badge value={r.is_active ? "active" : "disabled"} /> },
          { key: "x", label: "", className: "text-right", render: (r) => <Btn variant="outline" className="h-8 text-xs" onClick={() => toggle.mutate({ id: r.id, is_active: !r.is_active })}>{r.is_active ? "Desativar" : "Ativar"}</Btn> },
        ]} />
      </Panel>
      <Simulator />
      {open && <CreateRule onClose={() => setOpen(false)} />}
    </>
  );
}

function CreateRule({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", scope: "global" as Scope, scope_id: "", modality: "" as "" | Modality, rule_type: "percent" as RType, value: "", tiers: "", priority: "0" });
  const m = useMutation({
    mutationFn: async () => {
      if (!f.name.trim()) throw new Error("Dê um nome à regra.");
      const needsId = !["global", "modality", "promotion"].includes(f.scope);
      if (needsId && !/^[0-9a-f-]{36}$/i.test(f.scope_id)) throw new Error("Informe o ID do item do escopo.");
      let tiers: unknown[] = [];
      if (f.rule_type === "tiered") {
        try { tiers = JSON.parse(f.tiers); if (!Array.isArray(tiers)) throw 0; } catch { throw new Error("Faixas inválidas (JSON)."); }
      }
      const value = Number(f.value.replace(",", ".") || 0);
      if (!Number.isFinite(value) || value < 0) throw new Error("Valor inválido.");
      const { error } = await supabase.from("pricing_rules").insert({
        name: f.name.trim(), scope: f.scope, scope_id: needsId ? f.scope_id : null, modality: f.modality || null,
        rule_type: f.rule_type, value, tiers: tiers as never, priority: Number.parseInt(f.priority, 10) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pricing"] }); onClose(); },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <FormModal open onOpenChange={(v) => !v && onClose()} title="Nova regra de margem" onSubmit={() => m.mutate()} submitting={m.isPending} error={m.error}>
      <Field label="Nome"><TextInput value={f.name} onChange={set("name")} maxLength={80} required /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Escopo"><SelectInput value={f.scope} onChange={set("scope")}>{Constants.public.Enums.pricing_scope.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}</SelectInput></Field>
        <Field label="Modalidade"><SelectInput value={f.modality} onChange={set("modality")}><option value="">Todas</option>{Constants.public.Enums.commercial_modality.map((s) => <option key={s} value={s}>{MODALITY_LABEL[s]}</option>)}</SelectInput></Field>
      </div>
      {!["global", "modality", "promotion"].includes(f.scope) && <Field label={`ID (${SCOPE_LABEL[f.scope]})`}><TextInput value={f.scope_id} onChange={set("scope_id")} placeholder="uuid" /></Field>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tipo"><SelectInput value={f.rule_type} onChange={set("rule_type")}>{Constants.public.Enums.pricing_rule_type.map((s) => <option key={s} value={s}>{TYPE_LABEL[s]}</option>)}</SelectInput></Field>
        {f.rule_type !== "tiered" && <Field label={f.rule_type === "percent" ? "Percentual (%)" : "Valor (R$)"}><TextInput inputMode="decimal" value={f.value} onChange={set("value")} /></Field>}
        <Field label="Prioridade"><TextInput type="number" value={f.priority} onChange={set("priority")} /></Field>
      </div>
      {f.rule_type === "tiered" && <Field label="Faixas (JSON)"><TextInput value={f.tiers} onChange={set("tiers")} placeholder='[{"min":0,"max":100,"type":"percent","value":30}]' /></Field>}
    </FormModal>
  );
}

function Simulator() {
  const [ov, setOv] = useState("");
  const [mod, setMod] = useState<Modality>("drop");
  const options = useQuery({
    queryKey: ["sim-ov"],
    queryFn: async () => {
      const { data, error } = await supabase.from("supplier_offer_variants").select("id,supply_cost,product_variants(sku),organizations(name)").limit(200);
      if (error) throw error;
      return data;
    },
  });
  const r = useQuery({
    queryKey: ["sim", ov, mod],
    enabled: !!ov,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resolve_platform_price", { _offer_variant_id: ov, _modality: mod });
      if (error) throw error;
      return data?.[0];
    },
  });
  const d = r.data;
  const cell = (label: string, v: number | null | undefined, cls = "") => (
    <div className={`rounded-xl bg-surface-dark-2/80 p-4 ring-1 ring-ink-border ${cls}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">{label}</p>
      <p className="metric mt-2 text-xl font-bold sm:text-2xl">{d ? brl(v) : "—"}</p>
    </div>
  );
  const op = (c: string) => <span className="grid place-items-center font-display text-2xl font-bold text-ink-muted" aria-hidden>{c}</span>;
  return (
    <DarkPanel className="mt-6 p-6">
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Pricing Engine</p>
          <h2 className="mt-2 font-display text-xl font-bold">Composição de preço</h2>
          <p className="mt-1 text-sm text-ink-muted">Calculado no servidor pelas regras ativas. Nada é calculado na tela.</p>
        </div>
        <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-ink-muted">SKU da oferta
            <select value={ov} onChange={(e) => setOv(e.target.value)} className="h-10 rounded-lg border border-ink-border bg-surface-dark-2 px-3 text-sm text-ink-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:w-64">
              <option value="">Selecione...</option>
              {options.data?.map((o) => <option key={o.id} value={o.id}>{o.product_variants?.sku} · {o.organizations?.name}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-ink-muted">Modalidade
            <select value={mod} onChange={(e) => setMod(e.target.value as Modality)} className="h-10 rounded-lg border border-ink-border bg-surface-dark-2 px-3 text-sm text-ink-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
              {Constants.public.Enums.commercial_modality.map((s) => <option key={s} value={s}>{MODALITY_LABEL[s]}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="relative mt-6 grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {cell("Custo fornecedor", d?.supply_cost)}
        {op("+")}
        {cell("Margem BemMais", d?.platform_amount, "!ring-primary/40 [&_p:last-child]:text-primary")}
        {op("=")}
        {cell("Preço BemMais", d?.reseller_cost)}
      </div>
      <p className="relative mt-3 text-[11px] text-ink-muted">Margem do lojista e preço final entram quando a loja definir seus preços de venda.</p>
      {r.error ? <div className="relative mt-3"><ErrorNote error={r.error} /></div> : null}
    </DarkPanel>
  );
}
