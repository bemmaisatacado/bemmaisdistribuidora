import { Fragment, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Users,
  Store,
  Package,
  FileCheck2,
  ShoppingCart,
  TrendingUp,
  Wallet,
  Send,
  Check,
  X,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Eye,
  AlertTriangle,
  CheckCircle2,
  StickyNote,
  Tag as TagIcon,
  Landmark,
  Plug,
  UserPlus,
  Pencil,
  ToggleRight,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import {
  Panel,
  MetricCard,
  Badge,
  Btn,
  Field,
  TextInput,
  SelectInput,
  ErrorNote,
  Empty,
  DataTable,
  Timeline,
  MoneyValue,
  QuickAction,
  type Column,
} from "@/components/admin/ui";
import { FormModal } from "@/components/admin/Modal";
import { inviteMember } from "@/lib/admin/members.functions";
import { brl, dateTime, MODALITY_LABEL, STATUS_LABEL } from "@/lib/admin/format";
import {
  CAP_ORDER,
  CAPABILITY_INFO,
  ENTITY_LABEL,
  NOTE_KIND,
  ORG_STATUS_LABEL,
  ROLE_OPTIONS,
  UF,
  formatDocument,
  isValidDocument,
  maskTail,
  onlyDigits,
  type Cap,
  type OrgCtx,
  type OrgStatus,
} from "@/lib/admin/orgs";
import { cn } from "@/lib/utils";

type Summary = Record<
  | "members"
  | "members_invited"
  | "stores"
  | "stores_active"
  | "products"
  | "offers"
  | "offers_pending"
  | "gmv"
  | "receivables_pending"
  | "payouts_pending"
  | "payouts_paid"
  | "payment_accounts"
  | "payment_accounts_active",
  number
>;
const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((r) => [r.key, r.label]),
);

function useSummary(orgId: string) {
  return useQuery({
    queryKey: ["org", orgId, "summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("org_summary", { _org: orgId });
      if (error) throw error;
      return data as Summary;
    },
  });
}

/* ================================================================ Activity helpers */

type Log = {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
};

function describe(l: Log): string {
  const a = (l.after_data ?? {}) as Record<string, string>;
  const b = (l.before_data ?? {}) as Record<string, string>;
  switch (l.entity_type) {
    case "organizations":
      if (l.action === "insert") return "Empresa criada";
      if (a["status"] !== b["status"])
        return `Status alterado: ${ORG_STATUS_LABEL[b["status"] as OrgStatus] ?? b["status"]} → ${ORG_STATUS_LABEL[a["status"] as OrgStatus] ?? a["status"]}`;
      return "Dados da empresa atualizados";
    case "organization_capabilities": {
      const t = CAPABILITY_INFO[(a["capability"] ?? b["capability"]) as Cap]?.title ?? "";
      if (l.action === "delete") return `Capacidade removida: ${t}`;
      return `${(l.after_data as { enabled?: boolean })?.enabled ? "Capacidade ativada" : "Capacidade desativada"}: ${t}`;
    }
    case "organization_members":
      if (l.action === "insert")
        return `Usuário adicionado (${ROLE_LABEL[a["role_key"] ?? ""] ?? a["role_key"]})`;
      if (l.action === "delete") return "Acesso de usuário removido";
      if (a["role_key"] !== b["role_key"])
        return `Papel alterado: ${ROLE_LABEL[b["role_key"] ?? ""] ?? b["role_key"]} → ${ROLE_LABEL[a["role_key"] ?? ""] ?? a["role_key"]}`;
      if (a["status"] !== b["status"])
        return `Membro ${STATUS_LABEL[a["status"] ?? ""]?.toLowerCase() ?? a["status"]}`;
      return "Membro atualizado";
    case "stores":
      if (l.action === "insert") return `Loja criada: ${a["name"]}`;
      if (a["status"] !== b["status"])
        return `Loja ${a["name"]}: ${STATUS_LABEL[a["status"] ?? ""] ?? a["status"]}`;
      return `Loja atualizada: ${a["name"] ?? b["name"]}`;
    case "organization_notes":
      return l.action === "insert"
        ? "Nota interna adicionada"
        : l.action === "delete"
          ? "Nota interna removida"
          : "Nota interna editada";
    case "organization_tag_links":
      return l.action === "insert" ? "Tag adicionada" : "Tag removida";
    case "organization_invitations":
      return l.action === "insert" ? `Convite enviado para ${a["email"]}` : "Convite atualizado";
    default:
      return `${ENTITY_LABEL[l.entity_type] ?? l.entity_type}: ${l.action === "insert" ? "criado" : l.action === "delete" ? "removido" : "atualizado"}`;
  }
}

function useActivity(orgId: string, limit: number) {
  return useQuery({
    queryKey: ["org", orgId, "activity", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id,occurred_at,actor_id,action,entity_type,before_data,after_data")
        .eq("organization_id", orgId)
        .order("occurred_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const ids = [...new Set(data.map((d) => d.actor_id).filter(Boolean))] as string[];
      const { data: p } = ids.length
        ? await supabase.from("profiles").select("id,full_name").in("id", ids)
        : { data: [] };
      const names = new Map((p ?? []).map((x) => [x.id, x.full_name]));
      return (data as Log[]).map((l) => ({
        ...l,
        actor: l.actor_id ? names.get(l.actor_id) || "Usuário" : "Sistema",
      }));
    },
  });
}

/* ================================================================ Summary */

export function SummaryTab({
  ctx,
  go,
}: {
  ctx: OrgCtx;
  go: (
    t: "dados" | "usuarios" | "capacidades" | "lojas" | "financeiro" | "atividade" | "ofertas",
  ) => void;
}) {
  const s = useSummary(ctx.org.id);
  const act = useActivity(ctx.org.id, 8);
  const d = s.data;
  const v = (n: number | undefined) => (s.isLoading ? "…" : String(n ?? 0));
  const pend: { level: "bad" | "warn"; text: string; action?: () => void }[] = [];
  if (d) {
    if (ctx.org.status === "pending")
      pend.push({ level: "warn", text: "Empresa aguardando ativação." });
    if (!ctx.caps.length)
      pend.push({
        level: "warn",
        text: "Nenhuma capacidade ativa.",
        action: () => go("capacidades"),
      });
    if (!ctx.org.document)
      pend.push({ level: "warn", text: "CPF/CNPJ não informado.", action: () => go("dados") });
    if (d.members === 0)
      pend.push({
        level: "warn",
        text: "Nenhum usuário com acesso.",
        action: () => go("usuarios"),
      });
    if (d.members_invited > 0)
      pend.push({
        level: "warn",
        text: `${d.members_invited} convite(s) aguardando aceite.`,
        action: () => go("usuarios"),
      });
    if (ctx.caps.includes("operate_store") && d.stores === 0)
      pend.push({
        level: "warn",
        text: "Pode operar loja, mas ainda não tem loja.",
        action: () => go("lojas"),
      });
    if (ctx.caps.includes("supply_products") && d.payment_accounts_active === 0)
      pend.push({
        level: "bad",
        text: "Fornecedor sem conta recebedora ativa.",
        action: () => go("financeiro"),
      });
    if (d.offers_pending > 0)
      pend.push({
        level: "warn",
        text: `${d.offers_pending} oferta(s) em análise.`,
        action: () => go("ofertas"),
      });
  }
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="Usuários"
          value={v(d?.members)}
          icon={Users}
          hint={d?.members_invited ? `${d.members_invited} convidado(s)` : undefined}
        />
        <MetricCard
          label="Lojas"
          value={v(d?.stores)}
          icon={Store}
          hint={d ? `${d.stores_active} ativa(s)` : undefined}
        />
        <MetricCard
          label="Produtos"
          value={v(d?.products)}
          icon={Package}
          hint="Cadastrados por esta empresa"
        />
        <MetricCard label="Ofertas" value={v(d?.offers)} icon={FileCheck2} />
        <MetricCard
          label="Pedidos"
          value=""
          icon={ShoppingCart}
          locked="Módulo de pedidos ainda não existe"
        />
        <MetricCard
          label="GMV"
          value={<MoneyValue value={d?.gmv} />}
          icon={TrendingUp}
          hint="Pagamentos confirmados"
        />
        <MetricCard
          label="Recebíveis"
          value={<MoneyValue value={d?.receivables_pending} />}
          icon={Wallet}
          hint="Pendentes + disponíveis"
        />
        <MetricCard
          label="Repasses"
          value={<MoneyValue value={d?.payouts_pending} />}
          icon={Send}
          hint={d ? `${brl(d.payouts_paid)} já pagos` : undefined}
        />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="grid gap-5 lg:col-span-2">
          <OperationalProfile caps={ctx.caps} hasStore={(d?.stores ?? 0) > 0} />
          <Panel
            title="Atividade recente"
            actions={
              <button
                onClick={() => go("atividade")}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Ver tudo
              </button>
            }
          >
            {act.isLoading ? (
              <p className="px-5 pb-4 text-sm text-muted-foreground">Carregando…</p>
            ) : act.data?.length ? (
              <Timeline
                items={act.data.map((l) => ({
                  id: String(l.id),
                  title: (
                    <span>
                      <b className="font-semibold">{describe(l)}</b>{" "}
                      <span className="text-muted-foreground">· {l.actor}</span>
                    </span>
                  ),
                  time: dateTime(l.occurred_at),
                }))}
              />
            ) : (
              <Empty text="Nenhuma atividade registrada." />
            )}
          </Panel>
          <NotesPanel orgId={ctx.org.id} />
        </div>
        <div className="grid content-start gap-5">
          <Panel title="Pendências" description="Calculadas a partir dos dados reais.">
            <ul className="grid gap-1.5 px-4 pb-4">
              {s.isLoading && <li className="text-sm text-muted-foreground">Verificando…</li>}
              {d && !pend.length && (
                <li className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2.5 text-sm font-semibold text-success">
                  <CheckCircle2 className="h-4 w-4" /> Nada pendente
                </li>
              )}
              {pend.map((p, i) => (
                <li key={i}>
                  <button
                    disabled={!p.action}
                    onClick={p.action}
                    className="flex w-full items-start gap-2 rounded-xl bg-secondary/60 px-3 py-2.5 text-left text-sm transition-colors enabled:hover:bg-primary-soft"
                  >
                    <AlertTriangle
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        p.level === "bad" ? "text-danger" : "text-warning",
                      )}
                    />
                    {p.text}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Atalhos">
            <div className="grid gap-1.5 px-4 pb-4">
              <button onClick={() => go("dados")}>
                <QuickAction icon={Pencil} label="Editar dados" />
              </button>
              <button onClick={() => go("usuarios")}>
                <QuickAction icon={UserPlus} label="Gerenciar usuários" />
              </button>
              <button onClick={() => go("capacidades")}>
                <QuickAction icon={ToggleRight} label="Capacidades" />
              </button>
              <button onClick={() => go("lojas")}>
                <QuickAction icon={Store} label="Lojas" />
              </button>
              <button onClick={() => go("financeiro")}>
                <QuickAction icon={Landmark} label="Financeiro" />
              </button>
            </div>
          </Panel>
          <TagsPanel orgId={ctx.org.id} />
        </div>
      </div>
    </div>
  );
}

function OperationalProfile({ caps, hasStore }: { caps: Cap[]; hasStore: boolean }) {
  const items = CAP_ORDER.filter((c) => caps.includes(c)).map((c) => CAPABILITY_INFO[c].profile);
  if (caps.includes("operate_store"))
    items.push(hasStore ? "possui loja criada" : "ainda não criou a loja");
  return (
    <section className="surface-dark admin-in relative overflow-hidden rounded-2xl p-5">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl"
      />
      <p className="relative text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
        Perfil operacional
      </p>
      <p className="relative mt-1 font-display text-lg font-bold text-ink-foreground">
        Esta empresa:
      </p>
      {items.length ? (
        <ul className="relative mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((t) => (
            <li key={t} className="flex items-center gap-2 text-sm text-ink-foreground/90">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3 w-3" />
              </span>
              {t}
            </li>
          ))}
        </ul>
      ) : (
        <p className="relative mt-2 text-sm text-ink-foreground/70">
          Ainda não tem nenhuma capacidade ativa. Ative na aba Capacidades.
        </p>
      )}
    </section>
  );
}

/* ================================================================ Notes & Tags */

function NotesPanel({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("general");
  const notes = useQuery({
    queryKey: ["org", orgId, "notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_notes")
        .select("id,body,kind,author_id,created_at")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const ids = [...new Set(data.map((n) => n.author_id).filter(Boolean))] as string[];
      const { data: p } = ids.length
        ? await supabase.from("profiles").select("id,full_name").in("id", ids)
        : { data: [] };
      const m = new Map((p ?? []).map((x) => [x.id, x.full_name]));
      const { data: u } = await supabase.auth.getUser();
      return data.map((n) => ({
        ...n,
        author: (n.author_id && m.get(n.author_id)) || "Equipe BemMais",
        mine: n.author_id === u.user?.id,
      }));
    },
  });
  const add = useMutation({
    mutationFn: async () => {
      const t = body.trim();
      if (!t) throw new Error("Escreva a nota.");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("organization_notes")
        .insert({ organization_id: orgId, body: t.slice(0, 4000), kind, author_id: u.user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["org", orgId] });
    },
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("organization_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org", orgId] }),
  });
  return (
    <Panel
      title="Observações internas"
      description="Só a equipe BemMais vê. A empresa nunca tem acesso."
      actions={<StickyNote className="h-4 w-4 text-muted-foreground" />}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
        className="grid gap-2 px-5 pb-3"
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          rows={2}
          placeholder="Negociação, pendência, informação operacional…"
          aria-label="Nova nota interna"
          className="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm outline-none focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15"
        />
        <div className="flex items-center justify-between gap-2">
          <SelectInput
            aria-label="Tipo da nota"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="h-8 w-40 text-xs"
          >
            {Object.entries(NOTE_KIND).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </SelectInput>
          <Btn type="submit" disabled={add.isPending || !body.trim()} className="h-8">
            Adicionar nota
          </Btn>
        </div>
        <ErrorNote error={add.error ?? del.error} />
      </form>
      <ul className="grid gap-2 px-5 pb-5">
        {notes.data?.map((n) => (
          <li key={n.id} className="rounded-xl bg-secondary/60 p-3">
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>
                <Badge value={n.kind} tone="info" label={NOTE_KIND[n.kind] ?? n.kind} />{" "}
                <b className="ml-1 text-foreground">{n.author}</b> · {dateTime(n.created_at)}
              </span>
              {n.mine && (
                <button
                  onClick={() => del.mutate(n.id)}
                  aria-label="Excluir nota"
                  className="rounded p-1 hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm">{n.body}</p>
          </li>
        ))}
        {notes.data && !notes.data.length && (
          <li className="text-sm text-muted-foreground">Nenhuma nota ainda.</li>
        )}
      </ul>
    </Panel>
  );
}

const TAG_COLORS = ["neutral", "brand", "ok", "warn", "bad", "info"] as const;
function TagsPanel({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState<(typeof TAG_COLORS)[number]>("neutral");
  const all = useQuery({
    queryKey: ["org-tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("org_tags").select("id,name,color").order("name");
      if (error) throw error;
      return data;
    },
  });
  const linked = useQuery({
    queryKey: ["org", orgId, "tags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_tag_links")
        .select("tag_id")
        .eq("organization_id", orgId);
      if (error) throw error;
      return new Set(data.map((d) => d.tag_id));
    },
  });
  const inval = () => {
    qc.invalidateQueries({ queryKey: ["org", orgId] });
    qc.invalidateQueries({ queryKey: ["orgs"] });
    qc.invalidateQueries({ queryKey: ["org-tags"] });
  };
  const toggle = useMutation({
    mutationFn: async (tagId: string) => {
      const on = linked.data?.has(tagId);
      const { error } = on
        ? await supabase
            .from("organization_tag_links")
            .delete()
            .eq("organization_id", orgId)
            .eq("tag_id", tagId)
        : await supabase
            .from("organization_tag_links")
            .insert({ organization_id: orgId, tag_id: tagId });
      if (error) throw error;
    },
    onSuccess: inval,
  });
  const create = useMutation({
    mutationFn: async () => {
      const n = name.trim();
      if (!n) throw new Error("Informe o nome da tag.");
      const { data, error } = await supabase
        .from("org_tags")
        .insert({ name: n.slice(0, 40), color })
        .select("id")
        .single();
      if (error)
        throw error.code === "23505" ? new Error("Já existe uma tag com esse nome.") : error;
      const { error: e2 } = await supabase
        .from("organization_tag_links")
        .insert({ organization_id: orgId, tag_id: data.id });
      if (e2) throw e2;
    },
    onSuccess: () => {
      setName("");
      inval();
    },
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("org_tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: inval,
  });
  return (
    <Panel
      title="Tags"
      description="Etiquetas administrativas. Clique para aplicar/remover."
      actions={<TagIcon className="h-4 w-4 text-muted-foreground" />}
    >
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {all.data?.map((t) => {
          const on = linked.data?.has(t.id);
          return (
            <span key={t.id} className="group inline-flex items-center">
              <button
                onClick={() => toggle.mutate(t.id)}
                aria-pressed={on}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-all",
                  on
                    ? "bg-surface-dark text-ink-foreground"
                    : "bg-secondary hover:bg-primary-soft hover:text-primary",
                )}
              >
                {on && <Check className="mr-1 inline h-3 w-3" />}
                {t.name}
              </button>
              <button
                onClick={() => {
                  if (confirm(`Excluir a tag “${t.name}” de todas as empresas?`))
                    remove.mutate(t.id);
                }}
                aria-label={`Excluir tag ${t.name}`}
                className="ml-0.5 hidden rounded-full p-0.5 text-muted-foreground hover:text-danger group-hover:inline-block"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="flex gap-1.5 px-4 pb-4"
      >
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Nova tag"
          className="h-8 text-xs"
          aria-label="Nome da nova tag"
        />
        <SelectInput
          value={color}
          onChange={(e) => setColor(e.target.value as typeof color)}
          className="h-8 w-24 text-xs"
          aria-label="Cor"
        >
          {TAG_COLORS.map((c) => (
            <option key={c} value={c}>
              {
                {
                  neutral: "Cinza",
                  brand: "Laranja",
                  ok: "Verde",
                  warn: "Amarelo",
                  bad: "Vermelho",
                  info: "Azul",
                }[c]
              }
            </option>
          ))}
        </SelectInput>
        <Btn
          type="submit"
          className="h-8 px-2.5"
          aria-label="Criar tag"
          disabled={create.isPending}
        >
          <Plus className="h-4 w-4" />
        </Btn>
      </form>
      <div className="px-4">
        <ErrorNote error={create.error ?? toggle.error ?? remove.error} />
      </div>
    </Panel>
  );
}

/* ================================================================ Data */

export function DataTab({ ctx }: { ctx: OrgCtx }) {
  const qc = useQueryClient();
  const o = ctx.org;
  const init = {
    name: o.name,
    legal_name: o.legal_name ?? "",
    person_type: o.person_type,
    document: o.document ?? "",
    email: o.email ?? "",
    whatsapp: o.whatsapp ?? "",
    phone: o.phone ?? "",
    website: o.website ?? "",
    logo_url: o.logo_url ?? "",
    responsible_name: o.responsible_name ?? "",
    responsible_email: o.responsible_email ?? "",
    responsible_whatsapp: o.responsible_whatsapp ?? "",
    responsible_document: o.responsible_document ?? "",
    responsible_role: o.responsible_role ?? "",
    postal_code: o.postal_code ?? "",
    street: o.street ?? "",
    street_number: o.street_number ?? "",
    complement: o.complement ?? "",
    district: o.district ?? "",
    city: o.city ?? "",
    state: o.state ?? "",
    country: o.country,
    account_manager_id: o.account_manager_id ?? "",
    origin: o.origin ?? "",
  };
  const [f, setF] = useState(init);
  const [docUnlocked, setDocUnlocked] = useState(false);
  const [confirmDoc, setConfirmDoc] = useState(false);
  const team = useQuery({
    queryKey: ["platform-team"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_team");
      if (error) throw error;
      return data;
    },
  });
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  const email = (s: string) => !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  const save = useMutation({
    mutationFn: async () => {
      if (f.name.trim().length < 2) throw new Error("Nome comercial obrigatório.");
      if (f.document && !isValidDocument(f.document)) throw new Error("CPF/CNPJ inválido.");
      if (f.responsible_document && !isValidDocument(f.responsible_document))
        throw new Error("CPF do responsável inválido.");
      if (!email(f.email) || !email(f.responsible_email)) throw new Error("E-mail inválido.");
      if (f.website && !/^https?:\/\/.+\..+/.test(f.website))
        throw new Error("O site deve começar com http:// ou https://");
      if (f.logo_url && !/^https:\/\/.+/.test(f.logo_url))
        throw new Error("A logo deve ser um link https://");
      if (f.postal_code && onlyDigits(f.postal_code).length !== 8)
        throw new Error("CEP deve ter 8 dígitos.");
      const nz = (v: string) => (v.trim() ? v.trim() : null);
      const patch = {
        name: f.name.trim(),
        legal_name: nz(f.legal_name),
        person_type: f.person_type,
        email: nz(f.email),
        whatsapp: nz(f.whatsapp),
        phone: nz(f.phone),
        website: nz(f.website),
        logo_url: nz(f.logo_url),
        responsible_name: nz(f.responsible_name),
        responsible_email: nz(f.responsible_email),
        responsible_whatsapp: nz(f.responsible_whatsapp),
        responsible_document: f.responsible_document ? onlyDigits(f.responsible_document) : null,
        responsible_role: nz(f.responsible_role),
        postal_code: f.postal_code ? onlyDigits(f.postal_code) : null,
        street: nz(f.street),
        street_number: nz(f.street_number),
        complement: nz(f.complement),
        district: nz(f.district),
        city: nz(f.city),
        state: nz(f.state),
        country: f.country || "BR",
        account_manager_id: f.account_manager_id || null,
        origin: nz(f.origin),
        ...(docUnlocked ? { document: f.document ? onlyDigits(f.document) : null } : {}),
      };
      const { error } = await supabase.from("organizations").update(patch).eq("id", o.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setDocUnlocked(false);
      qc.invalidateQueries({ queryKey: ["org", o.id] });
      qc.invalidateQueries({ queryKey: ["orgs"] });
    },
  });
  const Sec = ({
    title,
    children,
    cols = 2,
  }: {
    title: string;
    children: ReactNode;
    cols?: number;
  }) => (
    <Panel title={title}>
      <div className={cn("grid gap-3 px-5 pb-5", cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {children}
      </div>
    </Panel>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="grid gap-5 pb-20"
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <Sec title="Identificação">
          <Field label="Nome comercial *">
            <TextInput value={f.name} onChange={set("name")} maxLength={120} required />
          </Field>
          <Field label="Razão social">
            <TextInput value={f.legal_name} onChange={set("legal_name")} maxLength={160} />
          </Field>
          <Field label="Tipo de pessoa">
            <SelectInput value={f.person_type} onChange={set("person_type")}>
              <option value="pj">Pessoa jurídica</option>
              <option value="pf">Pessoa física</option>
            </SelectInput>
          </Field>
          <Field
            label="CPF/CNPJ"
            hint={
              docUnlocked
                ? "Edição liberada. Será auditada."
                : "Identificador crítico — protegido contra alteração acidental."
            }
          >
            <div className="flex gap-1.5">
              <TextInput
                value={docUnlocked ? f.document : formatDocument(f.document) || "—"}
                onChange={set("document")}
                disabled={!docUnlocked}
                maxLength={18}
              />
              {!docUnlocked && (
                <Btn
                  type="button"
                  variant="outline"
                  className="h-10 shrink-0"
                  onClick={() => setConfirmDoc(true)}
                  aria-label="Desbloquear CPF/CNPJ"
                >
                  <Lock className="h-4 w-4" />
                </Btn>
              )}
              {docUnlocked && (
                <Btn
                  type="button"
                  variant="ghost"
                  className="h-10 shrink-0"
                  onClick={() => {
                    setDocUnlocked(false);
                    setF({ ...f, document: init.document });
                  }}
                  aria-label="Bloquear novamente"
                >
                  <Unlock className="h-4 w-4" />
                </Btn>
              )}
            </div>
          </Field>
          <Field label="Identificador interno (slug)" hint="Nunca muda.">
            <TextInput value={o.slug} disabled />
          </Field>
          <Field label="Logo (link https)">
            <TextInput
              value={f.logo_url}
              onChange={set("logo_url")}
              maxLength={500}
              placeholder="https://"
            />
          </Field>
        </Sec>
        <Sec title="Contato">
          <Field label="E-mail">
            <TextInput type="email" value={f.email} onChange={set("email")} maxLength={160} />
          </Field>
          <Field label="WhatsApp">
            <TextInput value={f.whatsapp} onChange={set("whatsapp")} maxLength={20} />
          </Field>
          <Field label="Telefone alternativo">
            <TextInput value={f.phone} onChange={set("phone")} maxLength={20} />
          </Field>
          <Field label="Site">
            <TextInput value={f.website} onChange={set("website")} maxLength={200} />
          </Field>
        </Sec>
        <Sec title="Responsável">
          <Field label="Nome">
            <TextInput
              value={f.responsible_name}
              onChange={set("responsible_name")}
              maxLength={120}
            />
          </Field>
          <Field label="Cargo / função">
            <TextInput
              value={f.responsible_role}
              onChange={set("responsible_role")}
              maxLength={80}
            />
          </Field>
          <Field label="E-mail">
            <TextInput
              type="email"
              value={f.responsible_email}
              onChange={set("responsible_email")}
              maxLength={160}
            />
          </Field>
          <Field label="WhatsApp">
            <TextInput
              value={f.responsible_whatsapp}
              onChange={set("responsible_whatsapp")}
              maxLength={20}
            />
          </Field>
          <Field label="CPF">
            <TextInput
              value={f.responsible_document}
              onChange={set("responsible_document")}
              maxLength={14}
            />
          </Field>
        </Sec>
        <Sec title="Endereço" cols={3}>
          <Field label="CEP">
            <TextInput value={f.postal_code} onChange={set("postal_code")} maxLength={9} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Rua">
              <TextInput value={f.street} onChange={set("street")} maxLength={160} />
            </Field>
          </div>
          <Field label="Número">
            <TextInput value={f.street_number} onChange={set("street_number")} maxLength={20} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Complemento">
              <TextInput value={f.complement} onChange={set("complement")} maxLength={80} />
            </Field>
          </div>
          <Field label="Bairro">
            <TextInput value={f.district} onChange={set("district")} maxLength={80} />
          </Field>
          <Field label="Cidade">
            <TextInput value={f.city} onChange={set("city")} maxLength={80} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="UF">
              <SelectInput value={f.state} onChange={set("state")}>
                <option value="">—</option>
                {UF.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="País">
              <TextInput value={f.country} onChange={set("country")} maxLength={2} />
            </Field>
          </div>
        </Sec>
        <Sec title="Dados comerciais">
          <Field label="Capacidades ativas">
            <p className="text-sm">
              {ctx.caps.map((c) => CAPABILITY_INFO[c].title).join(", ") || "Nenhuma"}
            </p>
          </Field>
          <Field label="Status">
            <p className="text-sm">
              {ORG_STATUS_LABEL[o.status]}{" "}
              <span className="text-xs text-muted-foreground">(altere em “Mais ações”)</span>
            </p>
          </Field>
        </Sec>
        <Sec title="Informações internas">
          <Field label="Responsável BemMais">
            <SelectInput value={f.account_manager_id} onChange={set("account_manager_id")}>
              <option value="">Nenhum</option>
              {team.data?.map((t) => (
                <option key={t.user_id} value={t.user_id}>
                  {t.full_name || t.email}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Origem">
            <SelectInput value={f.origin} onChange={set("origin")}>
              <option value="">Não informado</option>
              {[
                "Site",
                "Indicação",
                "WhatsApp",
                "Instagram",
                "Evento",
                "Prospecção ativa",
                "Outro",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Criada em">
            <p className="text-sm">{dateTime(o.created_at)}</p>
          </Field>
          <Field label="Última atualização">
            <p className="text-sm">{dateTime(o.updated_at)}</p>
          </Field>
        </Sec>
      </div>
      <div
        className={cn(
          "sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-2xl bg-surface-dark px-4 py-3 text-ink-foreground shadow-float transition-all",
          dirty || save.error
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <span className="text-sm">
          {save.error ? (
            <span className="text-danger">{(save.error as Error).message}</span>
          ) : (
            "Alterações não salvas"
          )}
        </span>
        <div className="flex gap-2">
          <Btn
            type="button"
            variant="ghost"
            className="text-ink-foreground hover:bg-surface-dark-2"
            onClick={() => {
              setF(init);
              setDocUnlocked(false);
              save.reset();
            }}
          >
            Descartar
          </Btn>
          <Btn type="submit" disabled={save.isPending}>
            {save.isPending ? "Salvando..." : "Salvar alterações"}
          </Btn>
        </div>
      </div>
      <Confirm
        open={confirmDoc}
        onOpenChange={setConfirmDoc}
        title="Desbloquear CPF/CNPJ?"
        text="Alterar o documento afeta a identificação fiscal da empresa. A alteração será registrada na auditoria."
        onConfirm={() => {
          setDocUnlocked(true);
          setConfirmDoc(false);
        }}
      />
    </form>
  );
}

function Confirm({
  open,
  onOpenChange,
  title,
  text,
  onConfirm,
  danger,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  text: string;
  onConfirm: () => void;
  danger?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={danger ? "bg-danger hover:bg-danger/90" : undefined}
            onClick={onConfirm}
          >
            Confirmar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ================================================================ Members */

type Member = {
  member_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  role_key: string;
  status: string;
  created_at: string;
  last_sign_in_at: string | null;
};

export function MembersTab({ ctx, onInvite }: { ctx: OrgCtx; onInvite: () => void }) {
  const qc = useQueryClient();
  const [removing, setRemoving] = useState<Member | null>(null);
  const [viewRole, setViewRole] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["org", ctx.org.id, "members"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("org_member_directory", { _org: ctx.org.id });
      if (error) throw error;
      return data as Member[];
    },
  });
  const invites = useQuery({
    queryKey: ["org", ctx.org.id, "invites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_invitations")
        .select("id,email,role_key,status,created_at")
        .eq("organization_id", ctx.org.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
  const perms = useQuery({
    queryKey: ["role-perms"],
    queryFn: async () => {
      const [rp, p] = await Promise.all([
        supabase.from("role_permissions").select("role_key,permission_key"),
        supabase.from("permissions").select("key,description"),
      ]);
      if (rp.error) throw rp.error;
      if (p.error) throw p.error;
      return { rp: rp.data, p: new Map(p.data.map((x) => [x.key, x.description])) };
    },
  });
  const inval = () => qc.invalidateQueries({ queryKey: ["org", ctx.org.id] });
  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) => {
      const { error } = await supabase
        .from("organization_members")
        .update({ role_key: role })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: inval,
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("organization_members").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: inval,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("organization_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setRemoving(null);
      inval();
    },
  });

  const cols: Column<Member>[] = [
    {
      key: "n",
      label: "Pessoa",
      render: (r) => (
        <div>
          <p className="font-semibold">{r.full_name || "Sem nome"}</p>
          <p className="text-xs text-muted-foreground">{r.email ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "r",
      label: "Papel",
      render: (r) => (
        <div className="flex items-center gap-1">
          <SelectInput
            aria-label="Papel"
            value={r.role_key}
            className="h-8 w-36 text-xs"
            onChange={(e) => setRole.mutate({ id: r.member_id, role: e.target.value })}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </SelectInput>
          <button
            onClick={() => setViewRole(r.role_key)}
            aria-label="Ver permissões"
            className="grid h-8 w-8 place-items-center rounded-lg hover:bg-secondary"
          >
            <Eye className="h-4 w-4" />
          </button>
        </div>
      ),
    },
    { key: "s", label: "Status", render: (r) => <Badge value={r.status} /> },
    {
      key: "l",
      label: "Último acesso",
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.last_sign_in_at ? dateTime(r.last_sign_in_at) : "Nunca acessou"}
        </span>
      ),
    },
    {
      key: "a",
      label: "",
      className: "text-right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          {r.status !== "invited" && (
            <Btn
              variant="ghost"
              className="h-8 text-xs"
              onClick={() =>
                setStatus.mutate({
                  id: r.member_id,
                  status: r.status === "active" ? "suspended" : "active",
                })
              }
            >
              {r.status === "active" ? "Suspender" : "Reativar"}
            </Btn>
          )}
          <Btn
            variant="ghost"
            className="h-8 text-xs text-danger hover:bg-danger-soft"
            onClick={() => setRemoving(r)}
          >
            Remover
          </Btn>
        </div>
      ),
    },
  ];
  return (
    <div className="grid gap-5">
      <Panel
        title="Usuários da empresa"
        description="Acesso ao painel desta empresa. Convites são enviados por e-mail — ninguém define senha por outra pessoa."
        actions={
          <Btn onClick={onInvite}>
            <UserPlus className="h-4 w-4" /> Adicionar membro
          </Btn>
        }
      >
        <ErrorNote error={setRole.error ?? setStatus.error} />
        <DataTable
          columns={cols}
          rows={list.data}
          loading={list.isLoading}
          rowKey={(r) => r.member_id}
          empty="Nenhum usuário ainda. Convide o responsável da empresa."
        />
      </Panel>
      <Panel title="Convites enviados">
        <DataTable
          rows={invites.data}
          loading={invites.isLoading}
          rowKey={(r) => r.id}
          empty="Nenhum convite enviado."
          columns={[
            { key: "e", label: "E-mail", render: (r) => r.email },
            { key: "r", label: "Papel", render: (r) => ROLE_LABEL[r.role_key] ?? r.role_key },
            {
              key: "s",
              label: "Situação",
              render: (r) => (
                <Badge
                  value={r.status}
                  tone={r.status === "accepted" ? "ok" : r.status === "sent" ? "warn" : "neutral"}
                  label={
                    { sent: "Aguardando", accepted: "Aceito", revoked: "Revogado" }[r.status] ??
                    r.status
                  }
                />
              ),
            },
            {
              key: "d",
              label: "Enviado",
              render: (r) => (
                <span className="text-xs text-muted-foreground">{dateTime(r.created_at)}</span>
              ),
            },
          ]}
        />
      </Panel>
      <Confirm
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(null)}
        danger
        title="Remover acesso?"
        text={`${removing?.full_name || removing?.email || "Esta pessoa"} perde o acesso a esta empresa. A conta dela continua existindo e a remoção fica na auditoria.`}
        onConfirm={() => removing && remove.mutate(removing.member_id)}
      />
      <FormModal
        open={!!viewRole}
        onOpenChange={(v) => !v && setViewRole(null)}
        title={`Permissões · ${ROLE_LABEL[viewRole ?? ""] ?? viewRole}`}
        onSubmit={() => setViewRole(null)}
        submitLabel="Fechar"
      >
        <ul className="grid gap-1.5">
          {perms.data?.rp
            .filter((x) => x.role_key === viewRole)
            .map((x) => (
              <li
                key={x.permission_key}
                className="flex items-center gap-2 rounded-lg bg-secondary/60 px-3 py-2 text-sm"
              >
                <Check className="h-4 w-4 text-success" />
                {perms.data.p.get(x.permission_key) ?? x.permission_key}
              </li>
            ))}
        </ul>
      </FormModal>
    </div>
  );
}

export function InviteModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const invite = useServerFn(inviteMember);
  const [f, setF] = useState({
    email: "",
    fullName: "",
    roleKey: "org_owner" as (typeof ROLE_OPTIONS)[number]["key"],
  });
  const [done, setDone] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async () =>
      invite({
        data: {
          organizationId: orgId,
          email: f.email,
          roleKey: f.roleKey,
          redirectTo: window.location.origin,
          ...(f.fullName.trim() ? { fullName: f.fullName.trim() } : {}),
        },
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["org", orgId] });
      qc.invalidateQueries({ queryKey: ["orgs"] });
      setDone(
        r.status === "invited"
          ? "Convite enviado por e-mail. A pessoa define a própria senha ao aceitar."
          : "Essa pessoa já tinha conta e foi adicionada à empresa.",
      );
    },
  });
  if (done)
    return (
      <FormModal
        open
        onOpenChange={(v) => !v && onClose()}
        title="Pronto"
        onSubmit={onClose}
        submitLabel="Fechar"
      >
        <p className="flex items-start gap-2 rounded-xl bg-success-soft p-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {done}
        </p>
      </FormModal>
    );
  return (
    <FormModal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Adicionar membro"
      onSubmit={() => m.mutate()}
      submitting={m.isPending}
      error={m.error}
      submitLabel="Enviar convite"
    >
      <Field label="E-mail *">
        <TextInput
          type="email"
          required
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
          maxLength={160}
          autoFocus
        />
      </Field>
      <Field label="Nome">
        <TextInput
          value={f.fullName}
          onChange={(e) => setF({ ...f, fullName: e.target.value })}
          maxLength={120}
        />
      </Field>
      <Field label="Papel">
        <SelectInput
          value={f.roleKey}
          onChange={(e) => setF({ ...f, roleKey: e.target.value as typeof f.roleKey })}
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </SelectInput>
      </Field>
      <p className="text-xs text-muted-foreground">
        Se a pessoa ainda não tem conta, ela recebe um e-mail para criar a senha. Se já tem, ganha
        acesso na hora.
      </p>
    </FormModal>
  );
}

/* ================================================================ Capabilities */

export function CapabilitiesTab({ ctx }: { ctx: OrgCtx }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: async ({ cap, on }: { cap: Cap; on: boolean }) => {
      const { error } = await supabase
        .from("organization_capabilities")
        .upsert(
          { organization_id: ctx.org.id, capability: cap, enabled: on },
          { onConflict: "organization_id,capability" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org", ctx.org.id] });
      qc.invalidateQueries({ queryKey: ["orgs"] });
      qc.invalidateQueries({ queryKey: ["org-stats"] });
    },
  });
  return (
    <div className="grid gap-5">
      <ErrorNote error={toggle.error} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CAP_ORDER.map((c) => {
          const I = CAPABILITY_INFO[c];
          const on = ctx.caps.includes(c);
          const busy = toggle.isPending && toggle.variables?.cap === c;
          return (
            <label
              key={c}
              className={cn(
                "admin-card group relative cursor-pointer overflow-hidden p-4 transition-all hover:-translate-y-0.5 hover:shadow-float",
                on && "ring-2 ring-primary/60",
              )}
            >
              {on && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/15 blur-2xl"
                />
              )}
              <div className="relative flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-xl transition-colors",
                    on ? "bg-primary text-primary-foreground" : "bg-secondary",
                  )}
                >
                  <I.icon className="h-5 w-5" />
                </span>
                <Switch
                  checked={on}
                  disabled={busy}
                  onCheckedChange={(v) => toggle.mutate({ cap: c, on: v })}
                  aria-label={`${on ? "Desativar" : "Ativar"} ${I.title}`}
                />
              </div>
              <p className="relative mt-3 text-sm font-bold uppercase tracking-wide">{I.title}</p>
              <p className="relative mt-1 text-xs text-muted-foreground">{I.desc}</p>
              <p
                className={cn(
                  "relative mt-3 text-[11px] font-semibold",
                  on ? "text-success" : "text-muted-foreground",
                )}
              >
                {busy ? "Salvando…" : on ? "Ativa" : "Inativa"}
              </p>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Cada alteração é validada no banco (só a equipe BemMais pode alterar) e fica registrada na
        auditoria. As descrições são informativas; as regras de acesso de cada módulo são aplicadas
        no próprio módulo.
      </p>
    </div>
  );
}

/* ================================================================ Stores / Products / Offers */

export function StoresTab({ ctx, onCreate }: { ctx: OrgCtx; onCreate: () => void }) {
  const q = useQuery({
    queryKey: ["org", ctx.org.id, "stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id,name,slug,mode,status,logo_url,primary_color,created_at")
        .eq("organization_id", ctx.org.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  return (
    <Panel
      title="Lojas da empresa"
      actions={
        <Btn onClick={onCreate}>
          <Plus className="h-4 w-4" /> Criar loja
        </Btn>
      }
    >
      {!ctx.caps.includes("operate_store") && (
        <p className="mx-5 mb-3 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
          Esta empresa não tem a capacidade “Loja” ativa. Você ainda pode criar a loja, mas
          considere ativar a capacidade.
        </p>
      )}
      <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
        {q.isLoading && <div className="h-28 animate-pulse rounded-2xl bg-secondary" />}
        {q.data?.map((s) => (
          <article
            key={s.id}
            className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-elevated p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-float"
          >
            {s.logo_url ? (
              <img src={s.logo_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
            ) : (
              <span
                className="grid h-12 w-12 place-items-center rounded-xl font-display font-bold text-primary-foreground"
                style={{ background: s.primary_color ?? undefined }}
              >
                {s.name.slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{s.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                /{s.slug} · {STATUS_LABEL[s.mode]}
              </p>
              <div className="mt-1.5">
                <Badge value={s.status} />
              </div>
            </div>
          </article>
        ))}
        {q.data && !q.data.length && (
          <div className="sm:col-span-2 xl:col-span-3">
            <Empty
              text="Nenhuma loja criada para esta empresa."
              icon={Store}
              action={
                <Btn variant="outline" onClick={onCreate}>
                  <Plus className="h-4 w-4" /> Criar loja
                </Btn>
              }
            />
          </div>
        )}
      </div>
      <p className="px-5 pb-4 text-xs text-muted-foreground">
        Para alterar status ou configurar a loja, use{" "}
        <Link to="/admin/lojas" className="font-semibold text-primary hover:underline">
          Lojas
        </Link>
        .
      </p>
    </Panel>
  );
}

export function ProductsTab({ ctx }: { ctx: OrgCtx }) {
  const q = useQuery({
    queryKey: ["org", ctx.org.id, "products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,slug,status,created_at,categories(name),brands(name)")
        .eq("owner_organization_id", ctx.org.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
  type R = NonNullable<typeof q.data>[number];
  return (
    <Panel
      title="Produtos cadastrados por esta empresa"
      description="Produtos do catálogo mestre cuja origem é esta organização."
    >
      <DataTable<R>
        rows={q.data}
        loading={q.isLoading}
        rowKey={(r) => r.id}
        empty="Nenhum produto cadastrado por esta empresa."
        columns={[
          {
            key: "n",
            label: "Produto",
            render: (r) => <span className="font-semibold">{r.name}</span>,
          },
          { key: "c", label: "Categoria", render: (r) => r.categories?.name ?? "—" },
          { key: "b", label: "Marca", render: (r) => r.brands?.name ?? "—" },
          { key: "s", label: "Status", render: (r) => <Badge value={r.status} /> },
          {
            key: "d",
            label: "Criado",
            render: (r) => (
              <span className="text-xs text-muted-foreground">{dateTime(r.created_at)}</span>
            ),
          },
        ]}
      />
    </Panel>
  );
}

export function OffersTab({ ctx }: { ctx: OrgCtx }) {
  const q = useQuery({
    queryKey: ["org", ctx.org.id, "offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_offers")
        .select("id,status,modalities,moq,lead_time_days,created_at,products(name)")
        .eq("organization_id", ctx.org.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
  type R = NonNullable<typeof q.data>[number];
  return (
    <Panel
      title="Ofertas de fornecimento"
      description="Custos e modalidades que esta empresa oferece à BemMais."
      actions={
        <Link to="/admin/ofertas" className="text-xs font-semibold text-primary hover:underline">
          Gerenciar ofertas
        </Link>
      }
    >
      <DataTable<R>
        rows={q.data}
        loading={q.isLoading}
        rowKey={(r) => r.id}
        empty={
          ctx.caps.includes("supply_products")
            ? "Nenhuma oferta cadastrada ainda."
            : "Esta empresa não é fornecedora."
        }
        columns={[
          {
            key: "p",
            label: "Produto",
            render: (r) => <span className="font-semibold">{r.products?.name ?? "—"}</span>,
          },
          {
            key: "m",
            label: "Modalidades",
            render: (r) => (
              <span className="text-xs">
                {r.modalities.map((m) => MODALITY_LABEL[m]).join(", ")}
              </span>
            ),
          },
          { key: "q", label: "Pedido mín.", render: (r) => r.moq },
          {
            key: "l",
            label: "Prazo",
            render: (r) => (r.lead_time_days != null ? `${r.lead_time_days} dias` : "—"),
          },
          { key: "s", label: "Status", render: (r) => <Badge value={r.status} /> },
        ]}
      />
    </Panel>
  );
}

/* ================================================================ Finance */

export function FinanceTab({ ctx }: { ctx: OrgCtx }) {
  const s = useSummary(ctx.org.id);
  const accounts = useQuery({
    queryKey: ["org", ctx.org.id, "accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_accounts")
        .select(
          "id,kind,provider,provider_account_id,pix_key_type,pix_key,holder_name,status,is_default",
        )
        .eq("organization_id", ctx.org.id)
        .order("is_default", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const ledger = useQuery({
    queryKey: ["org", ctx.org.id, "ledger"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ledger_entries")
        .select("id,entry_type,account,direction,amount,memo,created_at")
        .eq("organization_id", ctx.org.id)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data;
    },
  });
  const def = accounts.data?.find((a) => a.is_default) ?? accounts.data?.[0];
  type L = NonNullable<typeof ledger.data>[number];
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          label="Recebíveis"
          value={<MoneyValue value={s.data?.receivables_pending} />}
          icon={Wallet}
          hint="Pendentes + disponíveis"
        />
        <MetricCard
          label="Repasses pendentes"
          value={<MoneyValue value={s.data?.payouts_pending} />}
          icon={Send}
        />
        <MetricCard
          label="Repasses pagos"
          value={<MoneyValue value={s.data?.payouts_paid} />}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Recebimento preferencial"
          value={
            <span className="text-lg">{def ? (def.kind === "pix" ? "Pix" : "Gateway") : "—"}</span>
          }
          icon={Landmark}
          hint={def ? undefined : "Nenhuma conta configurada"}
        />
      </div>
      <Panel
        title="Contas recebedoras"
        description="Dados sensíveis mascarados."
        actions={
          <Link
            to="/admin/financeiro/contas"
            className="text-xs font-semibold text-primary hover:underline"
          >
            Gerenciar contas
          </Link>
        }
      >
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2">
          {accounts.data?.map((a) => (
            <div
              key={a.id}
              className="rounded-2xl border border-border-subtle bg-surface-elevated p-4 shadow-card"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">
                  {a.kind === "pix" ? "Pix" : `Gateway${a.provider ? ` · ${a.provider}` : ""}`}
                </p>
                <div className="flex gap-1">
                  {a.is_default && <Badge value="default" tone="brand" label="Padrão" />}
                  <Badge value={a.status} />
                </div>
              </div>
              <dl className="mt-2 grid grid-cols-[90px_1fr] gap-y-1 text-xs">
                <dt className="text-muted-foreground">Titular</dt>
                <dd>{a.holder_name ?? "—"}</dd>
                {a.kind === "pix" ? (
                  <>
                    <dt className="text-muted-foreground">Chave ({a.pix_key_type ?? "?"})</dt>
                    <dd className="metric">{maskTail(a.pix_key)}</dd>
                  </>
                ) : (
                  <>
                    <dt className="text-muted-foreground">Conta</dt>
                    <dd className="metric">{maskTail(a.provider_account_id)}</dd>
                  </>
                )}
              </dl>
            </div>
          ))}
          {accounts.data && !accounts.data.length && (
            <div className="sm:col-span-2">
              <Empty text="Nenhuma conta recebedora configurada." icon={Landmark} />
            </div>
          )}
        </div>
      </Panel>
      <Panel
        title="Ledger (últimos lançamentos)"
        description="Imutável. Correções aparecem como estornos."
      >
        <DataTable<L>
          rows={ledger.data}
          loading={ledger.isLoading}
          rowKey={(r) => String(r.id)}
          empty="Nenhum lançamento para esta empresa."
          columns={[
            {
              key: "d",
              label: "Data",
              render: (r) => (
                <span className="text-xs text-muted-foreground">{dateTime(r.created_at)}</span>
              ),
            },
            { key: "t", label: "Tipo", render: (r) => r.entry_type },
            {
              key: "a",
              label: "Conta",
              render: (r) => <code className="text-xs">{r.account}</code>,
            },
            {
              key: "v",
              label: "Valor",
              className: "text-right",
              render: (r) => (
                <span className={r.direction === "credit" ? "text-success" : "text-danger"}>
                  <MoneyValue value={Number(r.amount)} />
                </span>
              ),
            },
          ]}
        />
      </Panel>
    </div>
  );
}

/* ================================================================ Activity / placeholder */

export function ActivityTab({ ctx }: { ctx: OrgCtx }) {
  const q = useActivity(ctx.org.id, 200);
  return (
    <Panel
      title="Atividade"
      description="Tudo o que aconteceu com esta empresa, a partir da auditoria (não editável)."
    >
      {q.isLoading ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">Carregando…</p>
      ) : q.data?.length ? (
        <ol className="grid gap-0 px-5 pb-5">
          {q.data.map((l, i) => (
            <Fragment key={l.id}>
              {(i === 0 ||
                new Date(l.occurred_at).toDateString() !==
                  new Date(q.data[i - 1]!.occurred_at).toDateString()) && (
                <li className="mb-1 mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground first:mt-0">
                  {new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(
                    new Date(l.occurred_at),
                  )}
                </li>
              )}
              <li className="flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-secondary/60">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{describe(l)}</p>
                  <p className="text-xs text-muted-foreground">{l.actor}</p>
                </div>
                <span className="metric text-xs text-muted-foreground">
                  {new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(
                    new Date(l.occurred_at),
                  )}
                </span>
              </li>
            </Fragment>
          ))}
        </ol>
      ) : (
        <Empty text="Nenhuma atividade registrada." />
      )}
    </Panel>
  );
}

export function PlaceholderTab({ title, text }: { title: string; text: string }) {
  return (
    <Panel title={title}>
      <Empty text={text} icon={Plug} />
    </Panel>
  );
}
