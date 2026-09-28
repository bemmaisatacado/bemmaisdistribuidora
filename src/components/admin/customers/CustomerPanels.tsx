import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  HeartHandshake, Workflow, TrendingUp, Wallet, Activity, Check, Lock, CalendarClock, Phone, MessageCircle,
  Users, StickyNote, ListTodo, CircleDot, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, DarkPanel, Btn, Field, TextInput, SelectInput, Badge, Empty, ErrorNote } from "@/components/admin/ui";
import { brl, dateTime } from "@/lib/admin/format";
import type { OrgCtx } from "@/lib/admin/orgs";
import {
  COMMERCIAL_LABEL, COMMERCIAL_STATUSES, COMMERCIAL_TONE, INTERACTION_KINDS, INTERACTION_LABEL, JOURNEY_LABEL,
  PENDENCY_LABEL, CAP_SHORT, ORIGINS, isLate, shortDate, usePlatformTeam, type Customer360, type TimelineItem, type CommercialStatus,
} from "@/lib/admin/customers";
import { cn } from "@/lib/utils";

type Go = (t: "relacionamento" | "loja" | "usuarios" | "financeiro" | "atividade" | "permissoes") => void;

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 py-1.5 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-right font-semibold">{v}</span></div>;
}
function BlockTitle({ icon: I, children }: { icon: typeof Activity; children: React.ReactNode }) {
  return <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground"><I className="h-3.5 w-3.5 text-primary" />{children}</h3>;
}

export function useTimeline(orgId: string) {
  return useQuery({
    queryKey: ["customer-timeline", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("customer_timeline", { _org: orgId });
      if (error) throw error;
      return (data ?? []) as unknown as TimelineItem[];
    },
  });
}

export function Journey({ c }: { c: Customer360 }) {
  return (
    <DarkPanel className="mb-5 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.2em]">Jornada BemMais</h3>
        <span className="text-[11px] opacity-60">Somente etapas com evidência real são marcadas</span>
      </div>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {c.journey.map((j, i) => (
          <li key={j.key} className="relative">
            <div className={cn("flex h-full flex-col gap-2 rounded-xl p-3 ring-1", j.done ? "bg-primary/15 ring-primary/40" : "ring-white/10")}>
              <span className={cn("grid h-7 w-7 place-items-center rounded-full text-xs font-bold", j.done ? "bg-primary text-primary-foreground" : "bg-white/10")}>
                {j.done ? <Check className="h-3.5 w-3.5" /> : j.future ? <Lock className="h-3 w-3" /> : i + 1}
              </span>
              <span className="text-xs font-semibold leading-tight">{JOURNEY_LABEL[j.key] ?? j.key}</span>
              <span className="text-[10px] opacity-60">{j.done ? (j.at ? shortDate(j.at) : "Concluído") : j.future ? "Aguarda módulo Pedidos" : "Pendente"}</span>
            </div>
          </li>
        ))}
      </ol>
    </DarkPanel>
  );
}

export function Customer360View({ ctx, c, go }: { ctx: OrgCtx; c: Customer360; go: Go }) {
  const tl = useTimeline(ctx.org.id);
  const r = c.relationship;
  return (
    <>
      <Journey c={c} />
      {c.pendencies.length > 0 && (
        <Panel className="mb-5" title="Pendências">
          <ul className="grid gap-2 sm:grid-cols-2">
            {c.pendencies.map((p) => {
              const info = PENDENCY_LABEL[p.key] ?? { title: p.key, level: "pending" as const };
              return (
                <li key={p.key} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm", info.level === "attention" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
                  <AlertTriangle className="h-4 w-4 shrink-0" />{info.title}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <BlockTitle icon={HeartHandshake}>Relacionamento</BlockTitle>
          <Row k="Cliente desde" v={shortDate(r.since)} />
          <Row k="Origem" v={r.origin ?? "—"} />
          <Row k="Responsável BemMais" v={r.manager_name ?? "—"} />
          <Row k="Status comercial" v={<Badge value={r.commercial_status} tone={COMMERCIAL_TONE[r.commercial_status]} label={COMMERCIAL_LABEL[r.commercial_status]} />} />
          <Row k="Última atividade" v={r.last_activity ? dateTime(r.last_activity) : "—"} />
          <NextActionCard c={c} onEdit={() => go("relacionamento")} />
        </Panel>
        <Panel>
          <BlockTitle icon={Workflow}>Operação</BlockTitle>
          <Row k="Modalidades" v={ctx.caps.filter((x) => CAP_SHORT[x]).map((x) => CAP_SHORT[x]).join(", ") || "Nenhuma"} />
          <Row k="Loja" v={c.operation.stores ? `${c.operation.stores} (${c.operation.stores_active} ativa)` : <button onClick={() => go("loja")} className="text-primary">Sem loja</button>} />
          <Row k="Estoque próprio" v={ctx.caps.includes("own_inventory") ? "Habilitado" : "Não habilitado"} />
          <Row k="Produtos na loja" v={c.operation.listings} />
          <Row k="Usuários ativos" v={<button onClick={() => go("usuarios")} className="hover:text-primary">{c.operation.members}{c.operation.invites_pending ? ` · ${c.operation.invites_pending} convite(s)` : ""}</button>} />
        </Panel>
        <Panel>
          <BlockTitle icon={TrendingUp}>Comercial</BlockTitle>
          <div className="flex items-start gap-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            Compras, vendas, pedidos e GMV aparecerão aqui quando o módulo Pedidos estiver ativo. Nenhum número é estimado.
          </div>
          <Row k="Pagamentos confirmados" v={c.finance.paid_payments} />
        </Panel>
        <Panel>
          <BlockTitle icon={Wallet}>Financeiro</BlockTitle>
          <Row k="Recebíveis em aberto" v={brl(c.finance.receivables_open)} />
          <Row k="Repasses em aberto" v={brl(c.finance.payouts_open)} />
          <Row k="Conta recebedora" v={c.finance.active_accounts ? "Ativa" : "Não cadastrada"} />
          <Row k="Pendências financeiras" v={c.pendencies.some((p) => p.key === "no_account") ? "Sem conta para receber" : "Nenhuma"} />
        </Panel>
      </div>
      <Panel className="mt-5" title="Atividade recente" actions={<Btn variant="ghost" onClick={() => go("relacionamento")}>Ver timeline</Btn>}>
        <TimelineList items={(tl.data ?? []).slice(0, 5)} loading={tl.isLoading} />
      </Panel>
    </>
  );
}

function NextActionCard({ c, onEdit }: { c: Customer360; onEdit: () => void }) {
  const r = c.relationship;
  const late = isLate(r.next_action_at);
  return (
    <div className={cn("mt-3 rounded-xl p-3", late ? "bg-danger-soft" : "bg-primary-soft")}>
      <div className="flex items-center justify-between">
        <span className={cn("flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest", late ? "text-danger" : "text-primary")}><CalendarClock className="h-3.5 w-3.5" /> Próxima ação{late && " · vencida"}</span>
        <button onClick={onEdit} className="text-xs font-semibold text-primary">Editar</button>
      </div>
      {r.next_action ? (
        <>
          <p className="mt-1 text-sm font-semibold">{r.next_action}</p>
          <p className="text-xs text-muted-foreground">{shortDate(r.next_action_at)} · {r.next_action_owner_name ?? "Sem responsável"}</p>
        </>
      ) : <p className="mt-1 text-sm text-muted-foreground">Nenhuma próxima ação definida.</p>}
    </div>
  );
}

const KIND_ICON: Record<string, typeof Phone> = { ligacao: Phone, whatsapp: MessageCircle, reuniao: Users, observacao: StickyNote, followup: ListTodo, outro: CircleDot };

export function TimelineList({ items, loading }: { items: TimelineItem[]; loading?: boolean }) {
  if (loading) return <div className="h-24 animate-pulse rounded-xl bg-secondary" />;
  if (!items.length) return <Empty text="Nenhuma interação registrada ainda." />;
  return (
    <ol className="relative space-y-4 border-l border-border-subtle pl-5">
      {items.map((it) => {
        const I = it.type === "note" ? StickyNote : it.type === "followup" ? (it.sub === "done" ? CheckCircle2 : ListTodo) : (KIND_ICON[it.sub] ?? CircleDot);
        const label = it.type === "note" ? "Nota interna" : it.type === "followup" ? (it.sub === "done" ? "Follow-up concluído" : it.sub === "cancelled" ? "Follow-up cancelado" : "Follow-up criado") : INTERACTION_LABEL[it.sub] ?? it.sub;
        return (
          <li key={`${it.type}-${it.id}`} className="relative">
            <span className="absolute -left-[31px] grid h-6 w-6 place-items-center rounded-full bg-surface-elevated ring-1 ring-border-subtle"><I className="h-3 w-3 text-primary" /></span>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"><span className="font-bold text-foreground">{label}</span><span>{dateTime(it.at)}</span>{it.author && <span>· {it.author}</span>}</div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm">{it.body}</p>
            {(it.next_action || (it.type === "followup" && it.next_action_at)) && (
              <p className="mt-1 text-xs text-muted-foreground">{it.next_action ? `Próxima ação: ${it.next_action} · ` : "Vence: "}{shortDate(it.next_action_at)}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function RelationshipTab({ ctx, c }: { ctx: OrgCtx; c: Customer360 }) {
  const qc = useQueryClient();
  const team = usePlatformTeam();
  const orgId = ctx.org.id;
  const r = c.relationship;
  const tl = useTimeline(orgId);
  const refresh = () => {
    ["customer-360", "customer-timeline", "customer-followups"].forEach((k) => qc.invalidateQueries({ queryKey: [k, orgId] }));
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["customer-queues"] });
  };
  const [rel, setRel] = useState({
    commercial_status: r.commercial_status, account_manager_id: r.manager_id ?? "", origin: r.origin ?? "",
    next_action: r.next_action ?? "", next_action_at: r.next_action_at ?? "", next_action_owner_id: r.next_action_owner_id ?? "",
  });
  const saveRel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customer_relationships").upsert({
        organization_id: orgId, commercial_status: rel.commercial_status as CommercialStatus,
        account_manager_id: rel.account_manager_id || null, origin: rel.origin || null,
        next_action: rel.next_action.trim() || null, next_action_at: rel.next_action_at || null,
        next_action_owner_id: rel.next_action_owner_id || null,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const [it, setIt] = useState({ kind: "ligacao", body: "", occurred_at: "", next_action: "", next_action_at: "" });
  const addIt = useMutation({
    mutationFn: async () => {
      if (!it.body.trim()) throw new Error("Escreva uma nota para o registro.");
      const { error } = await supabase.from("customer_interactions").insert({
        organization_id: orgId, kind: it.kind, body: it.body.trim().slice(0, 4000),
        occurred_at: it.occurred_at ? new Date(it.occurred_at).toISOString() : undefined,
        next_action: it.next_action.trim() || null, next_action_at: it.next_action_at || null,
      });
      if (error) throw error;
      if (it.next_action.trim()) {
        await supabase.from("customer_relationships").upsert({ organization_id: orgId, next_action: it.next_action.trim(), next_action_at: it.next_action_at || null, commercial_status: rel.commercial_status as CommercialStatus });
      }
    },
    onSuccess: () => { setIt({ kind: "ligacao", body: "", occurred_at: "", next_action: "", next_action_at: "" }); refresh(); },
  });

  const fu = useQuery({
    queryKey: ["customer-followups", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customer_followups").select("*").eq("organization_id", orgId).order("status").order("due_at", { nullsFirst: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });
  const [nf, setNf] = useState({ title: "", due_at: "", owner_id: "" });
  const addFu = useMutation({
    mutationFn: async () => {
      if (!nf.title.trim()) throw new Error("Descreva o follow-up.");
      const { error } = await supabase.from("customer_followups").insert({ organization_id: orgId, title: nf.title.trim().slice(0, 300), due_at: nf.due_at || null, owner_id: nf.owner_id || null });
      if (error) throw error;
    },
    onSuccess: () => { setNf({ title: "", due_at: "", owner_id: "" }); refresh(); },
  });
  const setFu = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "done" | "cancelled" }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("customer_followups").update({ status, completed_at: new Date().toISOString(), completed_by: u.user?.id ?? null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const [note, setNote] = useState("");
  const addNote = useMutation({
    mutationFn: async () => {
      if (!note.trim()) throw new Error("Escreva a nota.");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("organization_notes").insert({ organization_id: orgId, body: note.trim().slice(0, 4000), kind: "general", author_id: u.user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => { setNote(""); refresh(); },
  });

  const teamOpts = team.data?.map((t) => <option key={t.user_id} value={t.user_id}>{t.full_name || t.email}</option>);
  const area = "w-full rounded-lg border border-border bg-surface-elevated p-3 text-sm";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-5">
        <Panel title="CRM do cliente" description="Visão comercial privada da BemMais — separada do status técnico da empresa.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status de relacionamento"><SelectInput value={rel.commercial_status} onChange={(e) => setRel({ ...rel, commercial_status: e.target.value as CommercialStatus })}>{COMMERCIAL_STATUSES.map((s) => <option key={s} value={s}>{COMMERCIAL_LABEL[s]}</option>)}</SelectInput></Field>
            <Field label="Responsável BemMais"><SelectInput value={rel.account_manager_id} onChange={(e) => setRel({ ...rel, account_manager_id: e.target.value })}><option value="">Sem responsável</option>{teamOpts}</SelectInput></Field>
            <Field label="Origem"><SelectInput value={rel.origin} onChange={(e) => setRel({ ...rel, origin: e.target.value })}><option value="">Não informada</option>{[...new Set([...ORIGINS, ...(rel.origin ? [rel.origin] : [])])].map((o) => <option key={o}>{o}</option>)}</SelectInput></Field>
            <Field label="Responsável pela próxima ação"><SelectInput value={rel.next_action_owner_id} onChange={(e) => setRel({ ...rel, next_action_owner_id: e.target.value })}><option value="">—</option>{teamOpts}</SelectInput></Field>
            <Field label="Próxima ação"><TextInput value={rel.next_action} maxLength={300} placeholder="Ex.: Ajudar a montar a loja" onChange={(e) => setRel({ ...rel, next_action: e.target.value })} /></Field>
            <Field label="Data da próxima ação"><TextInput type="date" value={rel.next_action_at} onChange={(e) => setRel({ ...rel, next_action_at: e.target.value })} /></Field>
          </div>
          <div className="mt-4 flex items-center justify-end gap-3">
            {saveRel.isSuccess && <span className="text-xs font-semibold text-success">Salvo</span>}
            {saveRel.error && <ErrorNote error={saveRel.error} />}
            <Btn onClick={() => saveRel.mutate()} disabled={saveRel.isPending}>Salvar relacionamento</Btn>
          </div>
        </Panel>

        <Panel title="Follow-ups">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
            <TextInput value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })} placeholder="Nova tarefa" maxLength={300} aria-label="Título do follow-up" />
            <TextInput type="date" value={nf.due_at} onChange={(e) => setNf({ ...nf, due_at: e.target.value })} aria-label="Vencimento" />
            <SelectInput value={nf.owner_id} onChange={(e) => setNf({ ...nf, owner_id: e.target.value })} aria-label="Responsável"><option value="">Responsável</option>{teamOpts}</SelectInput>
            <Btn onClick={() => addFu.mutate()} disabled={addFu.isPending}>Criar</Btn>
          </div>
          {addFu.error && <div className="mt-2"><ErrorNote error={addFu.error} /></div>}
          <ul className="mt-3 divide-y divide-border-subtle">
            {fu.data?.length ? fu.data.map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className={cn("min-w-0 flex-1", x.status !== "open" && "text-muted-foreground line-through")}>{x.title}</span>
                <span className={cn("text-xs", x.status === "open" && isLate(x.due_at) ? "font-bold text-danger" : "text-muted-foreground")}>{shortDate(x.due_at)}</span>
                {x.status === "open" ? (
                  <>
                    <Btn variant="outline" onClick={() => setFu.mutate({ id: x.id, status: "done" })}><Check className="h-3.5 w-3.5" /> Concluir</Btn>
                    <button className="text-xs text-muted-foreground hover:text-danger" onClick={() => setFu.mutate({ id: x.id, status: "cancelled" })}>Cancelar</button>
                  </>
                ) : <Badge value={x.status === "done" ? "completed" : "cancelled"} label={x.status === "done" ? "Concluído" : "Cancelado"} />}
              </li>
            )) : <li className="py-3 text-sm text-muted-foreground">Nenhum follow-up.</li>}
          </ul>
        </Panel>

        <Panel title="Nota interna" description="Somente a equipe BemMais vê. O cliente não tem acesso.">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} className={area} aria-label="Nota interna" />
          <div className="mt-2 flex items-center justify-end gap-2">{addNote.error && <ErrorNote error={addNote.error} />}<Btn variant="outline" onClick={() => addNote.mutate()} disabled={addNote.isPending}>Adicionar nota</Btn></div>
        </Panel>
      </div>

      <div className="space-y-5">
        <Panel title="Registrar contato">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {INTERACTION_KINDS.map(([k, l]) => {
              const I = KIND_ICON[k] ?? CircleDot;
              return <button key={k} type="button" onClick={() => setIt({ ...it, kind: k })} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold", it.kind === k ? "border-primary bg-primary-soft text-primary" : "border-border")}><I className="h-3.5 w-3.5" />{l}</button>;
            })}
          </div>
          <textarea value={it.body} onChange={(e) => setIt({ ...it, body: e.target.value })} rows={3} maxLength={4000} placeholder="O que foi conversado?" className={area} aria-label="Nota do contato" />
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <TextInput type="datetime-local" value={it.occurred_at} onChange={(e) => setIt({ ...it, occurred_at: e.target.value })} aria-label="Data do contato" />
            <TextInput value={it.next_action} onChange={(e) => setIt({ ...it, next_action: e.target.value })} placeholder="Próxima ação (opcional)" maxLength={300} />
            <TextInput type="date" value={it.next_action_at} onChange={(e) => setIt({ ...it, next_action_at: e.target.value })} aria-label="Data da próxima ação" />
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">{addIt.error && <ErrorNote error={addIt.error} />}<Btn onClick={() => addIt.mutate()} disabled={addIt.isPending}>Registrar</Btn></div>
        </Panel>
        <Panel title="Timeline do relacionamento">
          <TimelineList items={tl.data ?? []} loading={tl.isLoading} />
        </Panel>
      </div>
    </div>
  );
}
