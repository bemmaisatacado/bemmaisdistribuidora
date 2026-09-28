import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Field, TextInput, SelectInput, Btn, ErrorNote } from "@/components/admin/ui";
import { inviteMember } from "@/lib/admin/members.functions";
import { slugify } from "@/lib/admin/format";
import { isValidDocument, onlyDigits, formatDocument, maskTail, UF, type Cap } from "@/lib/admin/orgs";
import { usePlatformTeam } from "@/lib/admin/customers";
import {
  SUPPLIER_TYPES,
  SUPPLIER_TYPE_LABEL,
  SUPPLY_MODALITIES,
  FULFILLMENT,
  FULFILLMENT_LABEL,
  PAYOUT_METHODS,
  PAYOUT_LABEL,
  PIX_KEY_TYPES,
  useCategories,
  type Modality,
} from "@/lib/admin/suppliers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/fornecedores/novo")({
  head: () => ({ meta: [{ title: "Novo fornecedor — Super Admin BemMais" }] }),
  component: NewSupplier,
});

const STEPS = ["Identificação", "Perfil", "Endereço", "Operação", "Condições", "Financeiro", "Acesso", "Revisão"];
const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
const nz = (v: string) => (v.trim() ? v.trim() : null);
const int = (v: string) => (v.trim() ? Math.max(0, Number.parseInt(v, 10) || 0) : null);

function NewSupplier() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const team = usePlatformTeam();
  const cats = useCategories();
  const invite = useServerFn(inviteMember);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    person_type: "pj" as "pf" | "pj",
    name: "",
    legal_name: "",
    document: "",
    email: "",
    whatsapp: "",
    phone: "",
    website: "",
    instagram: "",
    supplier_type: "factory",
    category_ids: [] as string[],
    manager: user.id as string,
    postal_code: "",
    street: "",
    street_number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
    country: "BR",
    modalities: [] as Modality[],
    own_inventory: false,
    own_fulfillment: false,
    operate_store: false,
    min_order_value: "",
    min_quantity: "",
    prep_days: "",
    ship_days: "",
    commercial_notes: "",
    return_policy: "",
    freight_policy: "",
    service_regions: "",
    fulfillment_mode: "supplier",
    payout_method: "" as "" | "pix" | "gateway" | "other",
    pix_key_type: "cnpj",
    pix_key: "",
    holder_name: "",
    access: "none" as "none" | "invite",
    inviteEmail: "",
    inviteName: "",
  });
  const up = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));

  const validate = (i: number): string | null => {
    if (i === 0) {
      if (f.name.trim().length < 2) return "Informe o nome fantasia.";
      if (f.document && !isValidDocument(f.document)) return f.person_type === "pf" ? "CPF inválido." : "CNPJ inválido.";
      if (f.document && onlyDigits(f.document).length !== (f.person_type === "pf" ? 11 : 14))
        return "Documento não corresponde ao tipo de pessoa.";
      if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) return "E-mail inválido.";
      if (!f.email.trim() && !f.whatsapp.trim()) return "Informe ao menos e-mail ou WhatsApp.";
    }
    if (i === 2 && f.postal_code && onlyDigits(f.postal_code).length !== 8) return "CEP deve ter 8 dígitos.";
    if (i === 3 && !f.modalities.length) return "Selecione ao menos uma forma de fornecimento.";
    if (i === 5 && f.payout_method === "pix") {
      if (!f.pix_key.trim()) return "Informe a chave Pix ou escolha outra forma.";
      if ((f.pix_key_type === "cpf" || f.pix_key_type === "cnpj") && !isValidDocument(f.pix_key))
        return "Chave Pix (CPF/CNPJ) inválida.";
      if (f.pix_key_type === "email" && !/^\S+@\S+\.\S+$/.test(f.pix_key)) return "Chave Pix (e-mail) inválida.";
    }
    if (i === 6 && f.access === "invite" && !/^\S+@\S+\.\S+$/.test(f.inviteEmail || f.email))
      return "Informe um e-mail válido para o convite.";
    return null;
  };
  const next = () => {
    const e = validate(step);
    setErr(e);
    if (!e) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const m = useMutation({
    mutationFn: async () => {
      for (let i = 0; i < 7; i++) {
        const e = validate(i);
        if (e) throw new Error(e);
      }
      const doc = f.document ? onlyDigits(f.document) : null;
      if (doc) {
        const { data: dup } = await supabase.from("organizations").select("id").eq("document", doc).maybeSingle();
        if (dup) throw new Error("Já existe uma empresa com este documento. Abra-a em Empresas e habilite a capacidade Fornecedor.");
      }
      const { data, error } = await supabase
        .from("organizations")
        .insert({
          name: f.name.trim(),
          slug: `${slugify(f.name)}-${Math.random().toString(36).slice(2, 6)}`,
          legal_name: f.person_type === "pj" ? nz(f.legal_name) : null,
          document: doc,
          person_type: f.person_type,
          email: nz(f.email),
          whatsapp: nz(f.whatsapp),
          phone: nz(f.phone),
          website: nz(f.website),
          postal_code: f.postal_code ? onlyDigits(f.postal_code) : null,
          street: nz(f.street),
          street_number: nz(f.street_number),
          complement: nz(f.complement),
          district: nz(f.district),
          city: nz(f.city),
          state: f.state || null,
          country: f.country || "BR",
          status: "active",
          account_manager_id: f.manager || null,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      const id = data.id;
      const caps: Cap[] = ["supply_products"];
      if (f.own_inventory) caps.push("own_inventory");
      if (f.operate_store) caps.push("operate_store");
      const { error: ce } = await supabase
        .from("organization_capabilities")
        .insert(caps.map((capability) => ({ organization_id: id, capability })));
      if (ce) throw ce;
      const { error: pe } = await supabase.from("supplier_profiles").insert({
        organization_id: id,
        supplier_type: f.supplier_type,
        category_ids: f.category_ids,
        instagram: nz(f.instagram),
        modalities: f.modalities,
        supports_unit_sale: f.modalities.includes("retail"),
        own_fulfillment: f.own_fulfillment,
        min_order_value: f.min_order_value ? Number(f.min_order_value.replace(",", ".")) : null,
        min_quantity: int(f.min_quantity),
        prep_days: int(f.prep_days),
        ship_days: int(f.ship_days),
        commercial_notes: nz(f.commercial_notes),
        return_policy: nz(f.return_policy),
        freight_policy: nz(f.freight_policy),
        service_regions: nz(f.service_regions),
        fulfillment_mode: f.fulfillment_mode,
        payout_method: f.payout_method || null,
        finance_status: f.payout_method ? "pending" : "not_configured",
      });
      if (pe) throw pe;
      const { error: re } = await supabase.from("supplier_relationships").insert({
        organization_id: id,
        relationship_status: "onboarding",
        account_manager_id: f.manager || null,
      });
      if (re) throw re;
      if (f.payout_method === "pix") {
        const key = f.pix_key_type === "cpf" || f.pix_key_type === "cnpj" || f.pix_key_type === "phone" ? onlyDigits(f.pix_key) : f.pix_key.trim();
        const { error: ae } = await supabase.from("payment_accounts").insert({
          organization_id: id,
          kind: "pix",
          pix_key_type: f.pix_key_type,
          pix_key: key,
          holder_name: nz(f.holder_name),
          holder_document: doc,
          status: "pending",
          is_default: true,
        });
        if (ae) throw ae;
      }
      let inviteError: string | undefined;
      if (f.access === "invite") {
        try {
          await invite({
            data: {
              organizationId: id,
              email: (f.inviteEmail || f.email).trim(),
              fullName: f.inviteName.trim() || undefined,
              roleKey: "org_owner",
              redirectTo: `${window.location.origin}/entrar`,
            },
          });
        } catch (e) {
          inviteError = e instanceof Error ? e.message : "Falha ao enviar convite.";
        }
      }
      return { id, inviteError };
    },
    onSuccess: (r) => {
      if (r.inviteError)
        window.alert(`Fornecedor cadastrado, mas o convite não foi enviado: ${r.inviteError}. Reenvie pela aba Usuários.`);
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["supplier-stats"] });
      navigate({ to: "/admin/fornecedores/$orgId", params: { orgId: r.id }, search: { tab: "resumo" } });
    },
  });

  const catNames = cats.data?.filter((c) => f.category_ids.includes(c.id)).map((c) => c.name) ?? [];

  return (
    <>
      <Link to="/admin/fornecedores" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Fornecedores
      </Link>
      <PageHeader
        eyebrow="Novo fornecedor"
        title="Cadastrar fornecedor"
        description="Uma organização do ecossistema com capacidade de fornecer produtos — pronta para, no futuro, operar a própria estrutura."
      />

      <ol className="mb-6 grid grid-cols-4 gap-2 md:grid-cols-8">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              disabled={i > step}
              onClick={() => setStep(i)}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs font-semibold transition-colors",
                i === step ? "border-primary bg-primary-soft text-primary" : i < step ? "border-border-subtle bg-surface-elevated" : "border-dashed border-border text-muted-foreground",
              )}
            >
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px]", i < step ? "bg-primary text-primary-foreground" : "bg-secondary")}>
                {i < step ? <Check className="h-3 w-3" /> : `0${i + 1}`}
              </span>
              <span className="hidden truncate sm:inline">{s}</span>
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
                  <Choice key={t} on={f.person_type === t} onClick={() => up({ person_type: t, document: "" })}>
                    {t === "pf" ? "Pessoa Física" : "Pessoa Jurídica"}
                  </Choice>
                ))}
              </div>
            </Field>
            <Field label="Nome fantasia *">
              <TextInput value={f.name} onChange={(e) => up({ name: e.target.value })} maxLength={120} autoFocus />
            </Field>
            {f.person_type === "pj" && (
              <Field label="Razão social">
                <TextInput value={f.legal_name} onChange={(e) => up({ legal_name: e.target.value })} maxLength={160} />
              </Field>
            )}
            <Field label={f.person_type === "pf" ? "CPF" : "CNPJ"}>
              <TextInput value={f.document} onChange={(e) => up({ document: e.target.value })} onBlur={() => up({ document: formatDocument(f.document) })} inputMode="numeric" maxLength={18} />
            </Field>
            <Field label="E-mail"><TextInput type="email" value={f.email} onChange={(e) => up({ email: e.target.value })} maxLength={160} /></Field>
            <Field label="WhatsApp"><TextInput value={f.whatsapp} onChange={(e) => up({ whatsapp: e.target.value })} inputMode="tel" maxLength={20} /></Field>
            <Field label="Telefone"><TextInput value={f.phone} onChange={(e) => up({ phone: e.target.value })} inputMode="tel" maxLength={20} /></Field>
            <Field label="Site"><TextInput value={f.website} onChange={(e) => up({ website: e.target.value })} maxLength={200} placeholder="https://" /></Field>
            <Field label="Instagram"><TextInput value={f.instagram} onChange={(e) => up({ instagram: e.target.value })} maxLength={60} placeholder="@marca" /></Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5">
            <div>
              <h2 className="font-display text-lg font-bold">Perfil comercial</h2>
              <p className="mb-3 text-sm text-muted-foreground">Descreve o negócio — não define permissões.</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {SUPPLIER_TYPES.map(([k, l]) => (
                  <Choice key={k} on={f.supplier_type === k} onClick={() => up({ supplier_type: k })}>{l}</Choice>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-bold">Categorias fornecidas</h3>
              {cats.data?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {cats.data.map((c) => (
                    <button key={c.id} type="button" aria-pressed={f.category_ids.includes(c.id)} onClick={() => up({ category_ids: toggle(f.category_ids, c.id) })}
                      className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors", f.category_ids.includes(c.id) ? "border-primary bg-primary-soft text-primary" : "border-border hover:border-foreground/30")}>
                      {c.name}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma categoria cadastrada ainda. Cadastre em <Link to="/admin/categorias" className="font-semibold text-primary">Categorias</Link> — pode vincular depois.
                </p>
              )}
            </div>
            <Field label="Responsável BemMais">
              <SelectInput value={f.manager} onChange={(e) => up({ manager: e.target.value })}>
                <option value="">Sem responsável</option>
                {team.data?.map((t) => <option key={t.user_id} value={t.user_id}>{t.full_name || t.email}</option>)}
              </SelectInput>
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="CEP"><TextInput value={f.postal_code} onChange={(e) => up({ postal_code: e.target.value })} inputMode="numeric" maxLength={9} /></Field>
            <div className="md:col-span-2"><Field label="Rua"><TextInput value={f.street} onChange={(e) => up({ street: e.target.value })} maxLength={160} /></Field></div>
            <Field label="Número"><TextInput value={f.street_number} onChange={(e) => up({ street_number: e.target.value })} maxLength={20} /></Field>
            <Field label="Complemento"><TextInput value={f.complement} onChange={(e) => up({ complement: e.target.value })} maxLength={80} /></Field>
            <Field label="Bairro"><TextInput value={f.district} onChange={(e) => up({ district: e.target.value })} maxLength={80} /></Field>
            <Field label="Cidade"><TextInput value={f.city} onChange={(e) => up({ city: e.target.value })} maxLength={80} /></Field>
            <Field label="UF">
              <SelectInput value={f.state} onChange={(e) => up({ state: e.target.value })}>
                <option value="">—</option>
                {UF.map((u) => <option key={u}>{u}</option>)}
              </SelectInput>
            </Field>
            <Field label="País"><TextInput value={f.country} onChange={(e) => up({ country: e.target.value.toUpperCase().slice(0, 2) })} maxLength={2} /></Field>
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4">
            <h2 className="font-display text-lg font-bold">O que este fornecedor suporta?</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUPPLY_MODALITIES.map((mo) => (
                <Toggle key={mo.key} on={f.modalities.includes(mo.key)} onClick={() => up({ modalities: toggle(f.modalities, mo.key) })}>{mo.label}</Toggle>
              ))}
              <Toggle on={f.own_inventory} onClick={() => up({ own_inventory: !f.own_inventory })}>Estoque próprio</Toggle>
              <Toggle on={f.own_fulfillment} onClick={() => up({ own_fulfillment: !f.own_fulfillment })}>Fulfillment próprio</Toggle>
              <Toggle on={f.operate_store} onClick={() => up({ operate_store: !f.operate_store })}>Loja própria</Toggle>
            </div>
            <Field label="Quem despacha os pedidos?">
              <SelectInput value={f.fulfillment_mode} onChange={(e) => up({ fulfillment_mode: e.target.value })}>
                {FULFILLMENT.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </SelectInput>
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="grid gap-4 md:grid-cols-2">
            <p className="rounded-xl bg-info-soft px-3 py-2 text-xs text-info md:col-span-2">
              Condições gerais do fornecedor. Condições específicas (custo, MOQ, prazo) ficam em cada oferta.
            </p>
            <Field label="Pedido mínimo (R$)"><TextInput inputMode="decimal" value={f.min_order_value} onChange={(e) => up({ min_order_value: e.target.value })} /></Field>
            <Field label="Quantidade mínima (peças)"><TextInput type="number" min={0} value={f.min_quantity} onChange={(e) => up({ min_quantity: e.target.value })} /></Field>
            <Field label="Prazo médio de preparação (dias)"><TextInput type="number" min={0} value={f.prep_days} onChange={(e) => up({ prep_days: e.target.value })} /></Field>
            <Field label="Prazo de expedição (dias)"><TextInput type="number" min={0} value={f.ship_days} onChange={(e) => up({ ship_days: e.target.value })} /></Field>
            <Field label="Frete"><TextInput value={f.freight_policy} onChange={(e) => up({ freight_policy: e.target.value })} maxLength={300} /></Field>
            <Field label="Região atendida"><TextInput value={f.service_regions} onChange={(e) => up({ service_regions: e.target.value })} maxLength={300} /></Field>
            <Field label="Política de troca"><TextInput value={f.return_policy} onChange={(e) => up({ return_policy: e.target.value })} maxLength={500} /></Field>
            <Field label="Observações comerciais"><TextInput value={f.commercial_notes} onChange={(e) => up({ commercial_notes: e.target.value })} maxLength={1000} /></Field>
          </div>
        )}

        {step === 5 && (
          <div className="grid gap-4">
            <h2 className="font-display text-lg font-bold">Forma de recebimento preferencial</h2>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Choice on={f.payout_method === ""} onClick={() => up({ payout_method: "" })}>Definir depois</Choice>
              {PAYOUT_METHODS.map(([k, l]) => <Choice key={k} on={f.payout_method === k} onClick={() => up({ payout_method: k })}>{l}</Choice>)}
            </div>
            {f.payout_method === "pix" && (
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Tipo de chave">
                  <SelectInput value={f.pix_key_type} onChange={(e) => up({ pix_key_type: e.target.value })}>
                    {PIX_KEY_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Chave Pix"><TextInput value={f.pix_key} onChange={(e) => up({ pix_key: e.target.value })} maxLength={120} autoComplete="off" /></Field>
                <Field label="Titular (opcional)"><TextInput value={f.holder_name} onChange={(e) => up({ holder_name: e.target.value })} maxLength={120} /></Field>
              </div>
            )}
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" /> Guardamos só o necessário para repasse. A chave aparece mascarada e a conta entra como pendente até a validação da BemMais.
            </p>
          </div>
        )}

        {step === 6 && (
          <div className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice on={f.access === "none"} onClick={() => up({ access: "none" })}>Somente cadastrar fornecedor</Choice>
              <Choice on={f.access === "invite"} onClick={() => up({ access: "invite" })}>Convidar fornecedor para a plataforma</Choice>
            </div>
            {f.access === "invite" && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="E-mail do convite"><TextInput type="email" value={f.inviteEmail} placeholder={f.email} onChange={(e) => up({ inviteEmail: e.target.value })} /></Field>
                <Field label="Nome do responsável"><TextInput value={f.inviteName} onChange={(e) => up({ inviteName: e.target.value })} /></Field>
                <p className="text-xs text-muted-foreground md:col-span-2">O convidado define a própria senha pelo e-mail. Recebe o papel Proprietário da própria organização — nunca acesso à plataforma.</p>
              </div>
            )}
          </div>
        )}

        {step === 7 && (
          <div className="grid gap-3 md:grid-cols-2">
            <Review title="Identificação" rows={[["Nome", f.name], ["Razão social", f.legal_name], ["Documento", formatDocument(f.document)], ["Contato", [f.email, f.whatsapp].filter(Boolean).join(" · ")]]} />
            <Review title="Perfil" rows={[["Tipo", SUPPLIER_TYPE_LABEL[f.supplier_type] ?? ""], ["Categorias", catNames.join(", ")]]} />
            <Review title="Endereço" rows={[["Local", [f.street, f.street_number, f.district, f.city, f.state].filter(Boolean).join(", ")]]} />
            <Review title="Operação" rows={[["Modalidades", SUPPLY_MODALITIES.filter((x) => f.modalities.includes(x.key)).map((x) => x.label).join(", ")], ["Extras", [f.own_inventory && "Estoque próprio", f.own_fulfillment && "Fulfillment", f.operate_store && "Loja"].filter(Boolean).join(", ")], ["Despacho", FULFILLMENT_LABEL[f.fulfillment_mode] ?? ""]]} />
            <Review title="Condições" rows={[["Pedido mínimo", f.min_order_value && `R$ ${f.min_order_value}`], ["Qtd. mínima", f.min_quantity], ["Preparação", f.prep_days && `${f.prep_days} dias`], ["Expedição", f.ship_days && `${f.ship_days} dias`]]} />
            <Review title="Financeiro e acesso" rows={[["Recebimento", f.payout_method ? PAYOUT_LABEL[f.payout_method] ?? "" : "Definir depois"], ["Chave Pix", f.payout_method === "pix" ? maskTail(f.pix_key) : ""], ["Acesso", f.access === "invite" ? `Convite para ${f.inviteEmail || f.email}` : "Somente cadastro"]]} />
          </div>
        )}

        {(err || m.error) && <div className="mt-4"><ErrorNote error={err ? new Error(err) : m.error} /></div>}
        <div className="mt-6 flex justify-between gap-2 border-t border-border-subtle pt-4">
          <Btn variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Voltar</Btn>
          {step < STEPS.length - 1 ? (
            <Btn onClick={next}>Continuar</Btn>
          ) : (
            <Btn onClick={() => m.mutate()} disabled={m.isPending}>{m.isPending ? "Criando..." : "Criar fornecedor"}</Btn>
          )}
        </div>
      </Panel>
    </>
  );
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn("flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors", on ? "border-primary bg-primary-soft text-primary" : "border-border hover:border-foreground/30")}>
      {children}
    </button>
  );
}
function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn("flex items-center gap-3 rounded-xl border p-3.5 text-left text-sm font-semibold transition-all", on ? "border-primary bg-primary-soft" : "border-border hover:border-foreground/30")}>
      <span className={cn("grid h-5 w-5 place-items-center rounded-md border", on ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
        {on && <Check className="h-3 w-3" />}
      </span>
      {children}
    </button>
  );
}
function Review({ title, rows }: { title: string; rows: [string, string | null | undefined | false][] }) {
  return (
    <div className="rounded-xl border border-border-subtle p-4">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</h3>
      <dl className="grid gap-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-semibold">{v || "—"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
