import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Plus, Star, Trash2, Store, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import {
  Panel,
  MetricCard,
  Badge,
  Btn,
  Field,
  TextInput,
  SelectInput,
  Empty,
  ErrorNote,
  FormSection,
} from "@/components/admin/ui";
import { usePlatformTeam, shortDate } from "@/lib/admin/customers";
import {
  SUPPLIER_TYPES,
  SUPPLIER_TYPE_LABEL,
  RELATIONSHIP,
  RELATIONSHIP_LABEL,
  RELATIONSHIP_TONE,
  SUPPLY_MODALITIES,
  FULFILLMENT,
  FULFILLMENT_LABEL,
  PAYOUT_METHODS,
  FINANCE_STATUS,
  FINANCE_STATUS_LABEL,
  FINANCE_STATUS_TONE,
  DOMAIN_STATUS_LABEL,
  DOMAIN_STATUS_TONE,
  PLATFORM_DOMAIN,
  subdomainError,
  isHostname,
  type Supplier360,
  type Modality,
} from "@/lib/admin/suppliers";
import { num, dateTime } from "@/lib/admin/format";
import { cn } from "@/lib/utils";

export type SupplierTab =
  | "resumo" | "relacionamento" | "produtos" | "ofertas" | "estoque" | "loja" | "dominios"
  | "financeiro" | "usuarios" | "permissoes" | "dados" | "atividade";

/* ============================== RESUMO ============================== */

export function Supplier360View({ s, go }: { s: Supplier360; go: (t: SupplierTab) => void }) {
  const o = s.operation;
  const f = s.finance;
  const p = s.profile;
  const alerts: { text: string; tab: SupplierTab }[] = [];
  if (!p) alerts.push({ text: "Perfil de fornecimento não configurado.", tab: "relacionamento" });
  if (o.offers_pending) alerts.push({ text: `${o.offers_pending} oferta(s) aguardando aprovação.`, tab: "ofertas" });
  if (o.offers_rejected) alerts.push({ text: `${o.offers_rejected} oferta(s) rejeitada(s) para correção.`, tab: "ofertas" });
  if (o.negative_skus) alerts.push({ text: `${o.negative_skus} SKU(s) legado(s) exigem ajuste administrativo.`, tab: "estoque" });
  if (!f.active_accounts) alerts.push({ text: "Nenhuma conta de recebimento ativa.", tab: "financeiro" });
  if (s.access.invites_pending) alerts.push({ text: `${s.access.invites_pending} convite(s) pendente(s).`, tab: "usuarios" });

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <MetricCard label="Produtos" value={num(o.products)} />
        <MetricCard label="SKUs ofertados" value={num(o.skus)} />
        <MetricCard label="Ofertas ativas" value={num(o.offers_active)} hint={`${num(o.offers)} no total`} tone="brand" />
        <MetricCard label="Estoque disponível" value={num(o.on_hand - o.reserved)} hint={`${num(o.reserved)} reservado`} />
        <MetricCard label="Lojas" value={num(o.stores)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Perfil de fornecimento" className="lg:col-span-2" actions={<Btn variant="outline" className="h-8 text-xs" onClick={() => go("relacionamento")}>Editar</Btn>}>
          {p ? (
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Info k="Tipo" v={SUPPLIER_TYPE_LABEL[p.supplier_type] ?? p.supplier_type} />
              <Info k="Modalidades" v={p.modalities.map((m) => SUPPLY_MODALITIES.find((x) => x.key === m)?.label ?? m).join(", ") || "—"} />
              <Info k="Categorias" v={s.categories.join(", ") || "—"} />
              <Info k="Expedição" v={FULFILLMENT_LABEL[p.fulfillment_mode] ?? p.fulfillment_mode} />
              <Info k="Preparo / envio" v={`${p.prep_days ?? "—"} / ${p.ship_days ?? "—"} dias`} />
              <Info k="Origem do envio" v={p.ship_origin ?? "—"} />
              <Info k="Pedido mínimo" v={p.min_order_value != null ? `R$ ${Number(p.min_order_value).toLocaleString("pt-BR")}` : p.min_quantity ? `${p.min_quantity} un.` : "—"} />
              <Info k="Venda unitária" v={p.supports_unit_sale ? "Sim" : "Não"} />
            </dl>
          ) : <Empty text="Perfil ainda não configurado." />}
        </Panel>
        <Panel title="Pontos de atenção">
          {alerts.length ? (
            <ul className="grid gap-2">
              {alerts.map((a) => (
                <li key={a.text}>
                  <button onClick={() => go(a.tab)} className="flex w-full items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-left text-sm hover:ring-1 hover:ring-warning/40">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> {a.text}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-success" /> Nada pendente.</p>
          )}
        </Panel>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Panel title="Relacionamento">
          <dl className="grid gap-2 text-sm">
            <Info k="Status" v={s.relationship ? <Badge value={s.relationship.relationship_status} tone={RELATIONSHIP_TONE[s.relationship.relationship_status]} label={RELATIONSHIP_LABEL[s.relationship.relationship_status] ?? s.relationship.relationship_status} /> : "—"} />
            <Info k="Responsável" v={s.relationship?.manager_name ?? "—"} />
            <Info k="Próxima ação" v={s.relationship?.next_action ? `${s.relationship.next_action}${s.relationship.next_action_at ? ` · ${shortDate(s.relationship.next_action_at)}` : ""}` : "—"} />
          </dl>
        </Panel>
        <Panel title="Financeiro">
          <dl className="grid gap-2 text-sm">
            <Info k="Status" v={p ? <Badge value={p.finance_status} tone={FINANCE_STATUS_TONE[p.finance_status]} label={FINANCE_STATUS_LABEL[p.finance_status] ?? p.finance_status} /> : "—"} />
            <Info k="Contas ativas" v={`${f.active_accounts} de ${f.accounts}`} />
            <Info k="Recebíveis em aberto" v={`R$ ${Number(f.receivables_open).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
            <Info k="Repasses pendentes" v={`R$ ${Number(f.payouts_pending).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
          </dl>
        </Panel>
        <Panel title="Acesso">
          <dl className="grid gap-2 text-sm">
            <Info k="Usuários" v={num(s.access.members)} />
            <Info k="Convites pendentes" v={num(s.access.invites_pending)} />
            <Info k="Último acesso" v={s.access.last_sign_in ? dateTime(s.access.last_sign_in) : "—"} />
            <Info k="Última atividade" v={s.last_activity ? dateTime(s.last_activity) : "—"} />
          </dl>
        </Panel>
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:block">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium sm:text-left">{v}</dd>
    </div>
  );
}

/* ============================== RELACIONAMENTO + PERFIL ============================== */

const toNum = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

export function SupplierRelationshipTab({ orgId, s }: { orgId: string; s: Supplier360 }) {
  const qc = useQueryClient();
  const team = usePlatformTeam();
  const r = s.relationship;
  const p = s.profile;
  const [rel, setRel] = useState({
    status: r?.relationship_status ?? "prospeccao",
    manager: r?.account_manager_id ?? "",
    next: r?.next_action ?? "",
    nextAt: r?.next_action_at ?? "",
  });
  const [pf, setPf] = useState({
    type: p?.supplier_type ?? "distributor",
    mods: (p?.modalities ?? []) as Modality[],
    fulfillment: p?.fulfillment_mode ?? "supplier",
    prep: p?.prep_days?.toString() ?? "",
    ship: p?.ship_days?.toString() ?? "",
    origin: p?.ship_origin ?? "",
    regions: p?.service_regions ?? "",
    minValue: p?.min_order_value?.toString() ?? "",
    minQty: p?.min_quantity?.toString() ?? "",
    unit: p?.supports_unit_sale ?? false,
    freight: p?.freight_policy ?? "",
    returns: p?.return_policy ?? "",
    payout: p?.payout_method ?? "",
    finance: p?.finance_status ?? "not_configured",
    commercial: p?.commercial_notes ?? "",
    logistics: p?.logistics_notes ?? "",
  });
  const save = useMutation({
    mutationFn: async () => {
      const { error: e1 } = await supabase.from("supplier_relationships").upsert({
        organization_id: orgId, relationship_status: rel.status, account_manager_id: rel.manager || null,
        next_action: rel.next.trim() || null, next_action_at: rel.nextAt || null,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("supplier_profiles").upsert({
        organization_id: orgId, supplier_type: pf.type, modalities: pf.mods, fulfillment_mode: pf.fulfillment,
        own_fulfillment: pf.fulfillment === "supplier",
        prep_days: toNum(pf.prep), ship_days: toNum(pf.ship), ship_origin: pf.origin.trim() || null,
        service_regions: pf.regions.trim() || null, min_order_value: toNum(pf.minValue), min_quantity: toNum(pf.minQty),
        supports_unit_sale: pf.unit, freight_policy: pf.freight.trim() || null, return_policy: pf.returns.trim() || null,
        payout_method: pf.payout || null, finance_status: pf.finance,
        commercial_notes: pf.commercial.trim() || null, logistics_notes: pf.logistics.trim() || null,
      });
      if (e2) throw e2;
    },
    onSuccess: () => {
      for (const k of [["supplier-360", orgId], ["suppliers"], ["supplier-stats"], ["supplier-queues"]]) qc.invalidateQueries({ queryKey: k });
    },
  });
  const ta = "w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="grid gap-4">
      <Panel title="Relacionamento BemMais" description="Visível apenas para a equipe BemMais.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Status">
            <SelectInput value={rel.status} onChange={(e) => setRel({ ...rel, status: e.target.value })}>
              {RELATIONSHIP.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </SelectInput>
          </Field>
          <Field label="Responsável">
            <SelectInput value={rel.manager} onChange={(e) => setRel({ ...rel, manager: e.target.value })}>
              <option value="">—</option>
              {team.data?.map((t) => <option key={t.user_id} value={t.user_id}>{t.full_name || t.email}</option>)}
            </SelectInput>
          </Field>
          <Field label="Próxima ação"><TextInput value={rel.next} onChange={(e) => setRel({ ...rel, next: e.target.value })} maxLength={200} /></Field>
          <Field label="Data"><TextInput type="date" value={rel.nextAt} onChange={(e) => setRel({ ...rel, nextAt: e.target.value })} /></Field>
        </div>
      </Panel>
      <Panel title="Perfil de fornecimento">
        <div className="grid gap-5">
          <FormSection title="Operação">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tipo de fornecedor">
                <SelectInput value={pf.type} onChange={(e) => setPf({ ...pf, type: e.target.value })}>
                  {SUPPLIER_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </SelectInput>
              </Field>
              <Field label="Quem despacha">
                <SelectInput value={pf.fulfillment} onChange={(e) => setPf({ ...pf, fulfillment: e.target.value })}>
                  {FULFILLMENT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </SelectInput>
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SUPPLY_MODALITIES.map((m) => {
                const on = pf.mods.includes(m.key);
                return (
                  <button type="button" key={m.key} aria-pressed={on} onClick={() => setPf({ ...pf, mods: on ? pf.mods.filter((x) => x !== m.key) : [...pf.mods, m.key] })}
                    className={cn("rounded-full border px-3 py-1 text-xs font-semibold", on ? "border-primary bg-primary-soft text-primary" : "border-border")}>
                    {m.label}
                  </button>
                );
              })}
            </div>
          </FormSection>
          <FormSection title="Logística e condições">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Preparo (dias)"><TextInput type="number" min={0} value={pf.prep} onChange={(e) => setPf({ ...pf, prep: e.target.value })} /></Field>
              <Field label="Envio (dias)"><TextInput type="number" min={0} value={pf.ship} onChange={(e) => setPf({ ...pf, ship: e.target.value })} /></Field>
              <Field label="Pedido mínimo (R$)"><TextInput inputMode="decimal" value={pf.minValue} onChange={(e) => setPf({ ...pf, minValue: e.target.value })} /></Field>
              <Field label="Qtd. mínima"><TextInput type="number" min={0} value={pf.minQty} onChange={(e) => setPf({ ...pf, minQty: e.target.value })} /></Field>
              <Field label="Origem do envio"><TextInput value={pf.origin} onChange={(e) => setPf({ ...pf, origin: e.target.value })} placeholder="Cidade/UF" /></Field>
              <Field label="Regiões atendidas"><TextInput value={pf.regions} onChange={(e) => setPf({ ...pf, regions: e.target.value })} /></Field>
              <label className="flex items-center gap-2 self-end pb-2.5 text-sm font-semibold">
                <input type="checkbox" className="accent-[var(--primary)]" checked={pf.unit} onChange={(e) => setPf({ ...pf, unit: e.target.checked })} /> Aceita venda unitária
              </label>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Política de frete"><textarea rows={2} className={ta} value={pf.freight} onChange={(e) => setPf({ ...pf, freight: e.target.value })} maxLength={1000} /></Field>
              <Field label="Política de troca/devolução"><textarea rows={2} className={ta} value={pf.returns} onChange={(e) => setPf({ ...pf, returns: e.target.value })} maxLength={1000} /></Field>
            </div>
          </FormSection>
          <FormSection title="Financeiro">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Forma de repasse">
                <SelectInput value={pf.payout} onChange={(e) => setPf({ ...pf, payout: e.target.value })}>
                  <option value="">—</option>{PAYOUT_METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </SelectInput>
              </Field>
              <Field label="Status financeiro">
                <SelectInput value={pf.finance} onChange={(e) => setPf({ ...pf, finance: e.target.value })}>
                  {FINANCE_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </SelectInput>
              </Field>
            </div>
          </FormSection>
          <FormSection title="Observações internas">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Comercial"><textarea rows={3} className={ta} value={pf.commercial} onChange={(e) => setPf({ ...pf, commercial: e.target.value })} maxLength={2000} /></Field>
              <Field label="Logística"><textarea rows={3} className={ta} value={pf.logistics} onChange={(e) => setPf({ ...pf, logistics: e.target.value })} maxLength={2000} /></Field>
            </div>
          </FormSection>
        </div>
      </Panel>
      <ErrorNote error={save.error} />
      <div className="flex items-center justify-end gap-3">
        {save.isSuccess && <span className="text-sm text-success">Salvo.</span>}
        <Btn type="submit" disabled={save.isPending}>{save.isPending ? "Salvando..." : "Salvar alterações"}</Btn>
      </div>
    </form>
  );
}

/* ============================== DOMÍNIOS ============================== */

export function SupplierDomainsTab({ orgId, onCreateStore }: { orgId: string; onCreateStore: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["supplier-domains", orgId],
    queryFn: async () => {
      const [s, d] = await Promise.all([
        supabase.from("stores").select("id,name,slug,status").eq("organization_id", orgId).order("created_at"),
        supabase.from("store_domains").select("*").eq("organization_id", orgId).order("created_at"),
      ]);
      if (s.error) throw s.error;
      if (d.error) throw d.error;
      return { stores: s.data, domains: d.data };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["supplier-domains", orgId] });
  const [storeId, setStoreId] = useState("");
  const [kind, setKind] = useState<"platform_subdomain" | "custom_domain">("platform_subdomain");
  const [value, setValue] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      const sid = storeId || q.data?.stores[0]?.id;
      if (!sid) throw new Error("Crie uma loja primeiro.");
      const v = value.trim().toLowerCase();
      let hostname = v;
      if (kind === "platform_subdomain") {
        const err = subdomainError(v);
        if (err) throw new Error(err);
        hostname = `${v}.${PLATFORM_DOMAIN}`;
      } else if (!isHostname(v)) throw new Error("Domínio inválido. Ex.: loja.suamarca.com.br");
      const hasPrimary = q.data?.domains.some((d) => d.store_id === sid && d.is_primary);
      const { error } = await supabase.from("store_domains").insert({
        store_id: sid, organization_id: orgId, hostname, type: kind, is_primary: !hasPrimary,
        verification_data: {},
      });
      if (error) throw new Error(error.message.includes("duplicate") ? "Este domínio já está em uso." : error.message);
    },
    onSuccess: () => { setValue(""); refresh(); },
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { is_primary?: boolean } }) => {
      if (patch.is_primary) {
        const d = q.data?.domains.find((x) => x.id === id);
        await supabase.from("store_domains").update({ is_primary: false }).eq("store_id", d!.store_id).eq("is_primary", true);
      }
      const { error } = await supabase.from("store_domains").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("store_domains").delete().eq("id", id); if (error) throw error; },
    onSuccess: refresh,
  });

  if (q.data && !q.data.stores.length)
    return <Panel><Empty icon={Store} text="O fornecedor ainda não tem loja. Domínios são vinculados a uma loja." action={<Btn onClick={onCreateStore}><Store className="h-4 w-4" /> Criar loja</Btn>} /></Panel>;

  const storeName = new Map(q.data?.stores.map((s) => [s.id, s.name]));
  return (
    <div className="grid gap-4">
      <Panel title="Domínios das lojas" description="Subdomínio BemMais ou domínio próprio. Somente a BemMais ativa um domínio após verificar o DNS.">
        {q.data?.domains.length ? (
          <ul className="divide-y divide-border-subtle">
            {q.data.domains.map((d) => {
              return (
                <li key={d.id} className="grid gap-2 py-3 sm:flex sm:items-center sm:gap-3">
                  <Globe className="hidden h-4 w-4 text-muted-foreground sm:block" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-mono text-sm font-semibold">
                      {d.hostname}
                      {d.is_primary && <span className="rounded bg-primary-soft px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase text-primary">Principal</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {storeName.get(d.store_id)} · {d.type === "custom_domain" ? "Domínio próprio" : "Subdomínio BemMais"}
                    </p>
                    {d.last_error && <p className="text-xs text-danger">{d.last_error}</p>}
                  </div>
                  <Badge value={d.verification_status} tone={DOMAIN_STATUS_TONE[d.verification_status]} label={DOMAIN_STATUS_LABEL[d.verification_status] ?? d.verification_status} />
                  <div className="flex gap-1">
                    {!d.is_primary && <Btn variant="outline" className="h-8 w-8 p-0" aria-label="Tornar principal" title="Tornar principal" onClick={() => update.mutate({ id: d.id, patch: { is_primary: true } })}><Star className="h-3.5 w-3.5" /></Btn>}
                    <Btn variant="outline" className="h-8 w-8 p-0" aria-label="Remover" title="Remover" onClick={() => window.confirm(`Remover ${d.hostname}?`) && del.mutate(d.id)}><Trash2 className="h-3.5 w-3.5" /></Btn>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <Empty icon={Globe} text={q.isLoading ? "Carregando..." : "Nenhum domínio configurado."} />}
        <ErrorNote error={update.error ?? del.error} />
      </Panel>
      <Panel title="Adicionar domínio">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end">
          <Field label="Loja">
            <SelectInput value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {q.data?.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Tipo">
            <SelectInput value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="platform_subdomain">Subdomínio BemMais</option>
              <option value="custom_domain">Domínio próprio</option>
            </SelectInput>
          </Field>
          <Field label={kind === "platform_subdomain" ? `Subdomínio (.${PLATFORM_DOMAIN})` : "Domínio"}>
            <TextInput value={value} onChange={(e) => setValue(e.target.value)} placeholder={kind === "platform_subdomain" ? "minhaloja" : "loja.suamarca.com.br"} />
          </Field>
          <Btn disabled={add.isPending || !value.trim()} onClick={() => add.mutate()}><Plus className="h-4 w-4" /> Adicionar</Btn>
        </div>
        <ErrorNote error={add.error} />
        {kind === "custom_domain" && (
          <p className="mt-3 rounded-lg bg-info-soft px-3 py-2 text-xs text-info">
            O domínio fica aguardando configuração e verificação. As instruções de conexão serão disponibilizadas quando a infraestrutura de lojas estiver definida.
          </p>
        )}
      </Panel>
    </div>
  );
}

