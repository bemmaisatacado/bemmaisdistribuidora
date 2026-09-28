import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Btn, Field, TextInput, SelectInput, ErrorNote, Badge } from "@/components/admin/ui";
import { slugify } from "@/lib/admin/format";
import { CAP_ORDER, CAPABILITY_INFO, ORG_STATUS_LABEL, NOTE_KIND, UF, isValidDocument, onlyDigits, formatDocument, type Cap, type OrgStatus } from "@/lib/admin/orgs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/empresas/nova")({ component: NewOrg });

const STEPS = ["Identificação", "Responsável", "Endereço", "Perfil da operação", "Configuração", "Revisão"];
const emailOk = (s: string) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function NewOrg() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = Route.useRouteContext();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    name: "", legal_name: "", document: "", person_type: "pj", email: "", whatsapp: "", phone: "", website: "",
    responsible_name: "", responsible_email: "", responsible_whatsapp: "", responsible_document: "", responsible_role: "",
    postal_code: "", street: "", street_number: "", complement: "", district: "", city: "", state: "", country: "BR",
    status: "pending" as OrgStatus, account_manager_id: user.id, origin: "", note: "", note_kind: "general",
  });
  const [caps, setCaps] = useState<Cap[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const team = useQuery({ queryKey: ["platform-team"], queryFn: async () => { const { data, error } = await supabase.rpc("platform_team"); if (error) throw error; return data; } });
  const tags = useQuery({ queryKey: ["org-tags"], queryFn: async () => { const { data, error } = await supabase.from("org_tags").select("id,name,color").order("name"); if (error) throw error; return data; } });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  function validate(s: number): string | null {
    if (s === 0) {
      if (f.name.trim().length < 2) return "Informe o nome comercial.";
      if (f.document && !isValidDocument(f.document)) return f.person_type === "pf" ? "CPF inválido." : "CNPJ inválido.";
      if (f.document && f.person_type === "pf" && onlyDigits(f.document).length !== 11) return "Para pessoa física, informe um CPF.";
      if (f.document && f.person_type === "pj" && onlyDigits(f.document).length !== 14) return "Para pessoa jurídica, informe um CNPJ.";
      if (!emailOk(f.email)) return "E-mail inválido.";
      if (f.website && !/^https?:\/\/.+\..+/.test(f.website)) return "O site deve começar com http:// ou https://";
    }
    if (s === 1) {
      if (!emailOk(f.responsible_email)) return "E-mail do responsável inválido.";
      if (f.responsible_document && !isValidDocument(f.responsible_document)) return "CPF do responsável inválido.";
    }
    if (s === 2 && f.postal_code && onlyDigits(f.postal_code).length !== 8) return "CEP deve ter 8 dígitos.";
    return null;
  }
  function next() { const e = validate(step); setErr(e); if (!e) setStep(step + 1); }

  const create = useMutation({
    mutationFn: async () => {
      for (let i = 0; i < 3; i++) { const e = validate(i); if (e) { setStep(i); throw new Error(e); } }
      const slug = `${slugify(f.name)}-${Math.random().toString(36).slice(2, 6)}`;
      const nz = (v: string) => (v.trim() ? v.trim() : null);
      const { data, error } = await supabase.from("organizations").insert({
        name: f.name.trim(), slug, legal_name: nz(f.legal_name), document: f.document ? onlyDigits(f.document) : null, person_type: f.person_type,
        email: nz(f.email), whatsapp: nz(f.whatsapp), phone: nz(f.phone), website: nz(f.website),
        responsible_name: nz(f.responsible_name), responsible_email: nz(f.responsible_email), responsible_whatsapp: nz(f.responsible_whatsapp),
        responsible_document: f.responsible_document ? onlyDigits(f.responsible_document) : null, responsible_role: nz(f.responsible_role),
        postal_code: f.postal_code ? onlyDigits(f.postal_code) : null, street: nz(f.street), street_number: nz(f.street_number), complement: nz(f.complement),
        district: nz(f.district), city: nz(f.city), state: nz(f.state), country: f.country || "BR",
        status: f.status, account_manager_id: f.account_manager_id || null, origin: nz(f.origin), created_by: user.id,
      }).select("id").single();
      if (error) throw error;
      const id = data.id;
      if (caps.length) { const { error: e } = await supabase.from("organization_capabilities").insert(caps.map((capability) => ({ organization_id: id, capability }))); if (e) throw e; }
      if (tagIds.length) { const { error: e } = await supabase.from("organization_tag_links").insert(tagIds.map((tag_id) => ({ organization_id: id, tag_id }))); if (e) throw e; }
      if (f.note.trim()) { const { error: e } = await supabase.from("organization_notes").insert({ organization_id: id, body: f.note.trim().slice(0, 4000), kind: f.note_kind, author_id: user.id }); if (e) throw e; }
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["orgs"] }); qc.invalidateQueries({ queryKey: ["org-stats"] }); qc.invalidateQueries({ queryKey: ["admin-metrics"] });
      navigate({ to: "/admin/empresas/$orgId", params: { orgId: id }, search: { tab: "resumo" } });
    },
  });

  const manager = team.data?.find((t) => t.user_id === f.account_manager_id);

  return (
    <>
      <Link to="/admin/empresas" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" /> Empresas</Link>
      <PageHeader eyebrow="Nova empresa" title="Cadastrar organização" description="Seis etapas rápidas. Só o nome comercial é obrigatório — o resto pode ser completado depois no perfil." />

      <ol className="mb-5 flex gap-1.5 overflow-x-auto pb-1" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <li key={s} className="min-w-[110px] flex-1">
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step}
              className={cn("w-full rounded-xl px-3 py-2.5 text-left transition-all", i === step ? "bg-surface-dark text-ink-foreground shadow-float" : i < step ? "bg-primary-soft text-primary hover:bg-primary/15" : "bg-secondary text-muted-foreground")}>
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em]">
                {i < step ? <Check className="h-3 w-3" /> : <span className={cn("metric", i === step && "text-primary")}>{String(i + 1).padStart(2, "0")}</span>} Etapa
              </span>
              <span className="mt-0.5 block truncate text-sm font-semibold">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <Panel className="p-5 sm:p-6">
        <form onSubmit={(e) => { e.preventDefault(); if (step < 5) next(); else create.mutate(); }} className="grid gap-4">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome comercial *"><TextInput value={f.name} onChange={set("name")} required maxLength={120} autoFocus /></Field>
              <Field label="Razão social"><TextInput value={f.legal_name} onChange={set("legal_name")} maxLength={160} /></Field>
              <Field label="Tipo de pessoa"><SelectInput value={f.person_type} onChange={set("person_type")}><option value="pj">Pessoa jurídica (CNPJ)</option><option value="pf">Pessoa física (CPF)</option></SelectInput></Field>
              <Field label={f.person_type === "pf" ? "CPF" : "CNPJ"} hint="Validamos os dígitos. Após criar, só a equipe BemMais altera."><TextInput value={f.document} onChange={set("document")} maxLength={18} inputMode="numeric" /></Field>
              <Field label="E-mail"><TextInput type="email" value={f.email} onChange={set("email")} maxLength={160} /></Field>
              <Field label="WhatsApp"><TextInput value={f.whatsapp} onChange={set("whatsapp")} maxLength={20} inputMode="tel" placeholder="(11) 99999-9999" /></Field>
              <Field label="Telefone alternativo"><TextInput value={f.phone} onChange={set("phone")} maxLength={20} inputMode="tel" /></Field>
              <Field label="Site (opcional)"><TextInput value={f.website} onChange={set("website")} maxLength={200} placeholder="https://" /></Field>
            </div>
          )}
          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome do responsável"><TextInput value={f.responsible_name} onChange={set("responsible_name")} maxLength={120} autoFocus /></Field>
              <Field label="Cargo / função"><TextInput value={f.responsible_role} onChange={set("responsible_role")} maxLength={80} /></Field>
              <Field label="E-mail"><TextInput type="email" value={f.responsible_email} onChange={set("responsible_email")} maxLength={160} /></Field>
              <Field label="WhatsApp"><TextInput value={f.responsible_whatsapp} onChange={set("responsible_whatsapp")} maxLength={20} inputMode="tel" /></Field>
              <Field label="CPF (quando necessário)"><TextInput value={f.responsible_document} onChange={set("responsible_document")} maxLength={14} inputMode="numeric" /></Field>
              <p className="self-end text-xs text-muted-foreground sm:pb-2">Isto é só o contato. Para dar acesso ao painel, convide a pessoa na aba Usuários depois de criar.</p>
            </div>
          )}
          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-6">
              <div className="sm:col-span-2"><Field label="CEP" hint="Busca automática por CEP chega em breve."><TextInput value={f.postal_code} onChange={set("postal_code")} maxLength={9} inputMode="numeric" autoFocus /></Field></div>
              <div className="sm:col-span-4"><Field label="Rua"><TextInput value={f.street} onChange={set("street")} maxLength={160} /></Field></div>
              <div className="sm:col-span-2"><Field label="Número"><TextInput value={f.street_number} onChange={set("street_number")} maxLength={20} /></Field></div>
              <div className="sm:col-span-4"><Field label="Complemento"><TextInput value={f.complement} onChange={set("complement")} maxLength={80} /></Field></div>
              <div className="sm:col-span-2"><Field label="Bairro"><TextInput value={f.district} onChange={set("district")} maxLength={80} /></Field></div>
              <div className="sm:col-span-2"><Field label="Cidade"><TextInput value={f.city} onChange={set("city")} maxLength={80} /></Field></div>
              <div className="sm:col-span-1"><Field label="Estado"><SelectInput value={f.state} onChange={set("state")}><option value="">—</option>{UF.map((u) => <option key={u}>{u}</option>)}</SelectInput></Field></div>
              <div className="sm:col-span-1"><Field label="País"><TextInput value={f.country} onChange={set("country")} maxLength={2} /></Field></div>
            </div>
          )}
          {step === 3 && (
            <div>
              <p className="font-display text-lg font-semibold">O que esta empresa fará dentro da BemMais?</p>
              <p className="mt-1 text-sm text-muted-foreground">Marque quantas quiser — uma mesma empresa pode fornecer, comprar e vender ao mesmo tempo.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {CAP_ORDER.map((c) => { const I = CAPABILITY_INFO[c]; const on = caps.includes(c); return (
                  <label key={c} className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all", on ? "border-primary bg-primary-soft/60 shadow-card" : "border-border-subtle bg-surface-elevated hover:border-primary/40")}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={(e) => setCaps(e.target.checked ? [...caps, c] : caps.filter((x) => x !== c))} />
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", on ? "bg-primary text-primary-foreground" : "bg-secondary")}><I.icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-bold uppercase tracking-wide">{I.title}</span><span className="text-xs text-muted-foreground">{I.desc}</span></span>
                    <span className={cn("mt-1 grid h-5 w-5 place-items-center rounded-md border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{on && <Check className="h-3 w-3" />}</span>
                  </label>); })}
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status inicial"><SelectInput value={f.status} onChange={set("status")}>{(["pending", "active"] as OrgStatus[]).map((s) => <option key={s} value={s}>{ORG_STATUS_LABEL[s]}</option>)}</SelectInput></Field>
              <Field label="Responsável BemMais"><SelectInput value={f.account_manager_id} onChange={set("account_manager_id")}>
                <option value="">Nenhum</option>{team.data?.map((t) => <option key={t.user_id} value={t.user_id}>{t.full_name || t.email}</option>)}
              </SelectInput></Field>
              <Field label="Origem"><SelectInput value={f.origin} onChange={set("origin")}>
                <option value="">Não informado</option>{["Site", "Indicação", "WhatsApp", "Instagram", "Evento", "Prospecção ativa", "Outro"].map((o) => <option key={o}>{o}</option>)}
              </SelectInput></Field>
              <div className="grid gap-1.5 text-sm">
                <span className="text-xs font-semibold text-foreground/80">Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {tags.data?.map((t) => { const on = tagIds.includes(t.id); return (
                    <button type="button" key={t.id} onClick={() => setTagIds(on ? tagIds.filter((x) => x !== t.id) : [...tagIds, t.id])} aria-pressed={on}
                      className={cn("rounded-full px-3 py-1 text-xs font-semibold transition-all", on ? "bg-surface-dark text-ink-foreground" : "bg-secondary hover:bg-primary-soft hover:text-primary")}>{t.name}</button>); })}
                </div>
                <span className="text-[11px] text-muted-foreground">Crie novas tags no perfil da empresa.</span>
              </div>
              <div className="sm:col-span-2 grid gap-2 sm:grid-cols-[180px_1fr]">
                <Field label="Tipo da nota"><SelectInput value={f.note_kind} onChange={set("note_kind")}>{Object.entries(NOTE_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
                <Field label="Observações internas" hint="Visível só para a equipe BemMais.">
                  <textarea value={f.note} onChange={set("note")} maxLength={4000} rows={3} className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15" />
                </Field>
              </div>
            </div>
          )}
          {step === 5 && (
            <div className="grid gap-3 md:grid-cols-2">
              <Review title="Identificação" rows={[["Nome", f.name], ["Razão social", f.legal_name], ["Tipo", f.person_type === "pf" ? "Pessoa física" : "Pessoa jurídica"], ["Documento", formatDocument(f.document)], ["E-mail", f.email], ["WhatsApp", f.whatsapp], ["Telefone", f.phone], ["Site", f.website]]} />
              <Review title="Responsável" rows={[["Nome", f.responsible_name], ["Cargo", f.responsible_role], ["E-mail", f.responsible_email], ["WhatsApp", f.responsible_whatsapp], ["CPF", formatDocument(f.responsible_document)]]} />
              <Review title="Endereço" rows={[["CEP", f.postal_code], ["Rua", [f.street, f.street_number].filter(Boolean).join(", ")], ["Complemento", f.complement], ["Bairro", f.district], ["Cidade", [f.city, f.state].filter(Boolean).join(" / ")], ["País", f.country]]} />
              <div className="rounded-xl bg-secondary/50 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Operação & configuração</p>
                <div className="mt-2 flex flex-wrap gap-1">{caps.length ? caps.map((c) => <Badge key={c} value={c} tone="brand" label={CAPABILITY_INFO[c].title} />) : <span className="text-sm text-muted-foreground">Nenhuma capacidade marcada</span>}</div>
                <dl className="mt-3 grid grid-cols-[120px_1fr] gap-y-1 text-sm">
                  <dt className="text-muted-foreground">Status</dt><dd>{ORG_STATUS_LABEL[f.status]}</dd>
                  <dt className="text-muted-foreground">Resp. BemMais</dt><dd>{manager ? manager.full_name || manager.email : "—"}</dd>
                  <dt className="text-muted-foreground">Origem</dt><dd>{f.origin || "—"}</dd>
                  <dt className="text-muted-foreground">Tags</dt><dd>{tags.data?.filter((t) => tagIds.includes(t.id)).map((t) => t.name).join(", ") || "—"}</dd>
                  <dt className="text-muted-foreground">Nota interna</dt><dd className="line-clamp-2">{f.note || "—"}</dd>
                </dl>
              </div>
            </div>
          )}

          <ErrorNote error={err ?? create.error} />
          <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-4">
            <Btn type="button" variant="outline" onClick={() => (step === 0 ? navigate({ to: "/admin/empresas" }) : (setErr(null), setStep(step - 1)))}>
              <ArrowLeft className="h-4 w-4" /> {step === 0 ? "Cancelar" : "Voltar"}
            </Btn>
            {step < 5 ? <Btn type="submit">Continuar <ArrowRight className="h-4 w-4" /></Btn>
              : <Btn type="submit" disabled={create.isPending} className="h-10 px-5">{create.isPending ? "Criando..." : "Criar empresa"}</Btn>}
          </div>
        </form>
      </Panel>
    </>
  );
}

function Review({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      <dl className="mt-2 grid grid-cols-[120px_1fr] gap-y-1 text-sm">
        {rows.map(([k, v]) => <><dt key={`${k}-k`} className="text-muted-foreground">{k}</dt><dd key={`${k}-v`} className="truncate">{v || "—"}</dd></>)}
      </dl>
    </div>
  );
}
