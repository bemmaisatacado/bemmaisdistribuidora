import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Mail, Store, UserPlus, FileCheck2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Field, TextInput, SelectInput, Btn, ErrorNote } from "@/components/admin/ui";
import { CreateStoreModal } from "@/components/admin/orgs/CreateStoreModal";
import { inviteMember } from "@/lib/admin/members.functions";
import { slugify } from "@/lib/admin/format";
import { isValidDocument, onlyDigits, formatDocument, type Cap } from "@/lib/admin/orgs";
import { OPERATION_OPTIONS, ORIGINS, usePlatformTeam, useOrgTags } from "@/lib/admin/customers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/clientes/novo")({ component: NewCustomer });

const STEPS = ["Identificação", "Perfil", "Comercial", "Acesso", "Loja", "Revisão"];

function NewCustomer() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const team = usePlatformTeam();
  const tags = useOrgTags();
  const invite = useServerFn(inviteMember);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; name: string; inviteError?: string } | null>(null);
  const [f, setF] = useState({
    person_type: "pj" as "pf" | "pj", name: "", legal_name: "", document: "", email: "", whatsapp: "",
    caps: [] as Cap[], origin: "", manager: user.id as string, tagIds: [] as string[], note: "",
    access: "none" as "none" | "invite", inviteEmail: "", inviteName: "", createStore: false,
  });
  const up = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));

  const validate = (i: number): string | null => {
    if (i === 0) {
      if (f.name.trim().length < 2) return "Informe o nome do cliente.";
      if (f.document && !isValidDocument(f.document)) return f.person_type === "pf" ? "CPF inválido." : "CNPJ inválido.";
      if (f.document && onlyDigits(f.document).length !== (f.person_type === "pf" ? 11 : 14)) return "Documento não corresponde ao tipo de pessoa.";
      if (!f.email.trim() && !f.whatsapp.trim()) return "Informe ao menos e-mail ou WhatsApp.";
    }
    if (i === 3 && f.access === "invite" && !/^\S+@\S+\.\S+$/.test(f.inviteEmail || f.email)) return "Informe um e-mail válido para o convite.";
    return null;
  };
  const next = () => { const e = validate(step); setErr(e); if (!e) setStep((s) => Math.min(s + 1, 5)); };

  const m = useMutation({
    mutationFn: async () => {
      for (let i = 0; i < 4; i++) { const e = validate(i); if (e) throw new Error(e); }
      const doc = f.document ? onlyDigits(f.document) : null;
      if (doc) {
        const { data: dup } = await supabase.from("organizations").select("id").eq("document", doc).maybeSingle();
        if (dup) throw new Error("Já existe uma empresa com este documento. Abra-a em Empresas para torná-la cliente.");
      }
      const nz = (v: string) => (v.trim() ? v.trim() : null);
      const { data, error } = await supabase.from("organizations").insert({
        name: f.name.trim(), slug: `${slugify(f.name)}-${Math.random().toString(36).slice(2, 6)}`,
        legal_name: f.person_type === "pj" ? nz(f.legal_name) : null, document: doc, person_type: f.person_type,
        email: nz(f.email), whatsapp: nz(f.whatsapp), status: "active", account_manager_id: f.manager || null,
        origin: nz(f.origin), created_by: user.id,
      }).select("id").single();
      if (error) throw error;
      const id = data.id;
      const { error: re } = await supabase.from("customer_relationships").insert({
        organization_id: id, commercial_status: "novo", account_manager_id: f.manager || null, origin: nz(f.origin),
      });
      if (re) throw re;
      if (f.caps.length) {
        const { error: e } = await supabase.from("organization_capabilities").insert(f.caps.map((capability) => ({ organization_id: id, capability })));
        if (e) throw e;
      }
      if (f.tagIds.length) await supabase.from("organization_tag_links").insert(f.tagIds.map((tag_id) => ({ organization_id: id, tag_id })));
      if (f.note.trim()) await supabase.from("organization_notes").insert({ organization_id: id, body: f.note.trim().slice(0, 4000), kind: "general", author_id: user.id });
      let inviteError: string | undefined;
      if (f.access === "invite") {
        try {
          await invite({ data: { organizationId: id, email: (f.inviteEmail || f.email).trim(), fullName: f.inviteName.trim() || undefined, roleKey: "org_owner", redirectTo: `${window.location.origin}/entrar` } });
        } catch (e) { inviteError = e instanceof Error ? e.message : "Falha ao enviar convite."; }
      }
      return { id, name: f.name.trim(), inviteError };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer-stats"] });
      if (f.createStore) setCreated(r);
      else navigate({ to: "/admin/clientes/$orgId", params: { orgId: r.id }, search: { tab: "resumo" } });
    },
  });

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <>
      <Link to="/admin/clientes" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" /> Clientes</Link>
      <PageHeader eyebrow="Novo cliente" title="Cadastrar cliente BemMais" description="Uma única empresa no ecossistema, com a visão comercial da BemMais sobre ela." />

      <ol className="mb-6 grid grid-cols-3 gap-2 md:grid-cols-6">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button disabled={i > step} onClick={() => setStep(i)} className={cn("flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors",
              i === step ? "border-primary bg-primary-soft text-primary" : i < step ? "border-border-subtle bg-surface-elevated" : "border-dashed border-border text-muted-foreground")}>
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px]", i < step ? "bg-primary text-primary-foreground" : "bg-secondary")}>{i < step ? <Check className="h-3 w-3" /> : `0${i + 1}`}</span>
              <span className="truncate">{s}</span>
            </button>
          </li>
        ))}
      </ol>

      <Panel>
        {step === 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Tipo de pessoa">
              <div className="flex gap-2">
                {(["pf", "pj"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => up({ person_type: t, document: "" })} className={cn("flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold", f.person_type === t ? "border-primary bg-primary-soft text-primary" : "border-border")}>
                    {t === "pf" ? "Pessoa Física" : "Pessoa Jurídica"}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Nome *"><TextInput value={f.name} onChange={(e) => up({ name: e.target.value })} maxLength={120} autoFocus /></Field>
            {f.person_type === "pj" && <Field label="Razão social"><TextInput value={f.legal_name} onChange={(e) => up({ legal_name: e.target.value })} maxLength={160} /></Field>}
            <Field label={f.person_type === "pf" ? "CPF" : "CNPJ"}><TextInput value={f.document} onChange={(e) => up({ document: e.target.value })} onBlur={() => up({ document: formatDocument(f.document) })} inputMode="numeric" maxLength={18} /></Field>
            <Field label="E-mail"><TextInput type="email" value={f.email} onChange={(e) => up({ email: e.target.value })} maxLength={160} /></Field>
            <Field label="WhatsApp"><TextInput value={f.whatsapp} onChange={(e) => up({ whatsapp: e.target.value })} inputMode="tel" maxLength={20} /></Field>
          </div>
        )}
        {step === 1 && (
          <>
            <h2 className="font-display text-lg font-bold">Como este cliente pretende operar?</h2>
            <p className="mb-4 text-sm text-muted-foreground">Selecione quantas quiser. Cada opção vira uma capacidade real e pode ser alterada depois.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {OPERATION_OPTIONS.map((o) => {
                const on = f.caps.includes(o.cap);
                return (
                  <button key={o.cap} type="button" aria-pressed={on} onClick={() => up({ caps: toggle(f.caps, o.cap) })}
                    className={cn("flex items-center gap-3 rounded-xl border p-3.5 text-left text-sm font-semibold transition-all", on ? "border-primary bg-primary-soft" : "border-border hover:border-foreground/30")}>
                    <span className={cn("grid h-5 w-5 place-items-center rounded-md border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{on && <Check className="h-3 w-3" />}</span>
                    {o.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {step === 2 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Origem do lead"><SelectInput value={f.origin} onChange={(e) => up({ origin: e.target.value })}><option value="">Não informada</option>{ORIGINS.map((o) => <option key={o}>{o}</option>)}</SelectInput></Field>
            <Field label="Responsável BemMais"><SelectInput value={f.manager} onChange={(e) => up({ manager: e.target.value })}><option value="">Sem responsável</option>{team.data?.map((t) => <option key={t.user_id} value={t.user_id}>{t.full_name || t.email}</option>)}</SelectInput></Field>
            <Field label="Tags">
              <div className="flex flex-wrap gap-1.5">
                {tags.data?.length ? tags.data.map((t) => (
                  <button key={t.id} type="button" onClick={() => up({ tagIds: toggle(f.tagIds, t.id) })} className={cn("rounded-full border px-3 py-1 text-xs font-semibold", f.tagIds.includes(t.id) ? "border-primary bg-primary-soft text-primary" : "border-border")}>{t.name}</button>
                )) : <span className="text-xs text-muted-foreground">Nenhuma tag criada ainda (crie no perfil de uma empresa).</span>}
              </div>
            </Field>
            <Field label="Observações internas" hint="Visível somente para a equipe BemMais."><textarea value={f.note} onChange={(e) => up({ note: e.target.value })} maxLength={4000} rows={3} className="w-full rounded-lg border border-border bg-surface-elevated p-3 text-sm" /></Field>
          </div>
        )}
        {step === 3 && (
          <div className="grid gap-3">
            {([["none", FileCheck2, "Criar somente cadastro", "O cliente é registrado sem acesso à plataforma. Você pode convidar depois."],
               ["invite", Mail, "Enviar convite para acessar a BemMais", "O cliente recebe um e-mail e define a própria senha. Ninguém cria senha por ele."]] as const).map(([k, I, t, d]) => (
              <button key={k} type="button" onClick={() => up({ access: k })} className={cn("flex items-start gap-3 rounded-xl border p-4 text-left", f.access === k ? "border-primary bg-primary-soft" : "border-border")}>
                <I className="mt-0.5 h-5 w-5 text-primary" /><span><span className="block font-semibold">{t}</span><span className="text-sm text-muted-foreground">{d}</span></span>
              </button>
            ))}
            {f.access === "invite" && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="E-mail do convite"><TextInput type="email" value={f.inviteEmail} placeholder={f.email} onChange={(e) => up({ inviteEmail: e.target.value })} /></Field>
                <Field label="Nome de quem vai acessar"><TextInput value={f.inviteName} onChange={(e) => up({ inviteName: e.target.value })} /></Field>
              </div>
            )}
          </div>
        )}
        {step === 4 && (
          <>
            <h2 className="mb-4 font-display text-lg font-bold">Criar loja agora?</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {([[true, "Sim, criar loja", "Abre o fluxo de criação de loja logo após o cadastro."], [false, "Não, depois", "A loja pode ser criada a qualquer momento no perfil."]] as const).map(([v, t, d]) => (
                <button key={t} type="button" onClick={() => up({ createStore: v })} className={cn("flex items-start gap-3 rounded-xl border p-4 text-left", f.createStore === v ? "border-primary bg-primary-soft" : "border-border")}>
                  <Store className="mt-0.5 h-5 w-5 text-primary" /><span><span className="block font-semibold">{t}</span><span className="text-sm text-muted-foreground">{d}</span></span>
                </button>
              ))}
            </div>
          </>
        )}
        {step === 5 && (
          <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-2">
            {[
              ["Cliente", `${f.name} (${f.person_type === "pf" ? "PF" : "PJ"})`],
              ["Documento", formatDocument(f.document) || "—"],
              ["Contato", [f.email, f.whatsapp].filter(Boolean).join(" · ") || "—"],
              ["Modalidades", OPERATION_OPTIONS.filter((o) => f.caps.includes(o.cap)).map((o) => o.short).join(", ") || "Nenhuma"],
              ["Origem", f.origin || "—"],
              ["Responsável", team.data?.find((t) => t.user_id === f.manager)?.full_name || team.data?.find((t) => t.user_id === f.manager)?.email || "—"],
              ["Acesso", f.access === "invite" ? `Convite para ${f.inviteEmail || f.email}` : "Somente cadastro"],
              ["Loja", f.createStore ? "Criar em seguida" : "Depois"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-secondary/60 p-3"><dt className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{k}</dt><dd className="mt-0.5 font-semibold">{v}</dd></div>
            ))}
          </dl>
        )}

        {(err || m.error) && <div className="mt-4">{err ? <p className="text-sm font-semibold text-danger">{err}</p> : <ErrorNote error={m.error} />}</div>}
        <div className="mt-6 flex justify-between gap-2 border-t border-border-subtle pt-4">
          <Btn variant="outline" disabled={step === 0} onClick={() => { setErr(null); setStep((s) => s - 1); }}>Voltar</Btn>
          {step < 5 ? <Btn onClick={next}>Continuar</Btn> : <Btn onClick={() => m.mutate()} disabled={m.isPending}><UserPlus className="h-4 w-4" /> {m.isPending ? "Cadastrando..." : "Confirmar cadastro"}</Btn>}
        </div>
      </Panel>

      {created && (
        <CreateStoreModal organizationId={created.id} organizationName={created.name}
          onClose={() => navigate({ to: "/admin/clientes/$orgId", params: { orgId: created.id }, search: { tab: "loja" } })} />
      )}
    </>
  );
}
