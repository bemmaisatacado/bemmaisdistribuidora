import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, Users, CheckCircle2, Sparkles, Store, Truck, ShoppingBag, AlertTriangle, PauseCircle,
  LayoutGrid, LayoutList, CalendarClock, Lock, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  PageHeader, MetricCard, Btn, TextInput, SelectInput, Badge, EntityAvatar, Empty, Pager, DataTable, Panel, type Column,
} from "@/components/admin/ui";
import { num } from "@/lib/admin/format";
import { formatDocument, ORG_STATUSES, ORG_STATUS_LABEL, UF } from "@/lib/admin/orgs";
import {
  COMMERCIAL_LABEL, COMMERCIAL_STATUSES, COMMERCIAL_TONE, OPERATION_OPTIONS, CAP_SHORT, ORIGINS,
  usePlatformTeam, useOrgTags, isLate, shortDate, type CustomerRow,
} from "@/lib/admin/customers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/clientes/")({ component: CustomersPage });

const SIZE = 24;
type F = {
  q: string; status: string; commercial: string; manager: string; origin: string; tag: string;
  capability: string; hasStore: string; storeActive: string; state: string; from: string; to: string;
};
const EMPTY: F = { q: "", status: "", commercial: "", manager: "", origin: "", tag: "", capability: "", hasStore: "", storeActive: "", state: "", from: "", to: "" };
const SEGMENTS: { label: string; f: Partial<F> }[] = [
  { label: "Drop", f: { capability: "use_dropshipping" } },
  { label: "Grade", f: { capability: "buy_closed_grade" } },
  { label: "Atacado variado", f: { capability: "buy_mixed_wholesale" } },
  { label: "Com loja", f: { hasStore: "true" } },
  { label: "Sem loja", f: { hasStore: "false" } },
  { label: "Ativos", f: { commercial: "ativo" } },
  { label: "Inativos", f: { commercial: "inativo" } },
  { label: "Em onboarding", f: { commercial: "onboarding" } },
];
const bool = (v: string) => (v === "" ? null : v === "true");

function CustomersPage() {
  const [f, setF] = useState<F>(EMPTY);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"cards" | "list">("cards");
  const team = usePlatformTeam();
  const tags = useOrgTags();

  useEffect(() => {
    const t = setTimeout(() => setF((p) => ({ ...p, q })), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(1), [f]);

  const stats = useQuery({
    queryKey: ["customer-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_customer_stats", {});
      if (error) throw error;
      return data as Record<string, number>;
    },
  });
  const list = useQuery({
    queryKey: ["customers", f, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_customer_list", {
        _q: f.q || undefined, _status: f.status || undefined, _commercial: f.commercial || undefined,
        _manager: f.manager || undefined, _origin: f.origin || undefined, _tag: f.tag || undefined,
        _capability: f.capability || undefined, _has_store: bool(f.hasStore) ?? undefined,
        _store_active: bool(f.storeActive) ?? undefined, _state: f.state || undefined,
        _from: f.from || undefined, _to: f.to || undefined, _page: page, _size: SIZE,
      });
      if (error) throw error;
      return data as unknown as { total: number; rows: CustomerRow[] };
    },
    placeholderData: (p) => p,
  });

  const active = Object.entries(f).filter(([k, v]) => k !== "q" && v).length;
  const s = stats.data;
  const set = (k: keyof F) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const cols: Column<CustomerRow>[] = [
    { key: "n", label: "Cliente", render: (r) => (
      <Link to="/admin/clientes/$orgId" params={{ orgId: r.id }} search={{ tab: "resumo" }} className="flex items-center gap-3 font-semibold hover:text-primary">
        <EntityAvatar name={r.name} src={r.logo_url} size="sm" />
        <span><span className="block">{r.name}</span><span className="text-xs font-normal text-muted-foreground">{formatDocument(r.document) || r.email || "—"}</span></span>
      </Link>) },
    { key: "c", label: "Relacionamento", render: (r) => <Badge value={r.commercial_status} tone={COMMERCIAL_TONE[r.commercial_status]} label={COMMERCIAL_LABEL[r.commercial_status]} /> },
    { key: "s", label: "Status técnico", render: (r) => <Badge value={r.status} /> },
    { key: "m", label: "Modalidades", render: (r) => <CapChips caps={r.caps} /> },
    { key: "r", label: "Responsável", render: (r) => r.manager_name ?? "—" },
    { key: "a", label: "Próxima ação", render: (r) => <NextAction r={r} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM · Commerce · Operação"
        title="Clientes BemMais"
        description="Gerencie relacionamento, operação e crescimento dos clientes do ecossistema."
        actions={<Link to="/admin/clientes/novo"><Btn tabIndex={-1}><Plus className="h-4 w-4" /> Novo cliente</Btn></Link>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Total" value={num(s?.total)} icon={Users} tone="brand" />
        <MetricCard label="Ativos" value={num(s?.active)} icon={CheckCircle2} />
        <MetricCard label="Novos (30 dias)" value={num(s?.new_period)} icon={Sparkles} />
        <MetricCard label="Com loja" value={num(s?.with_store)} icon={Store} />
        <MetricCard label="Drop habilitado" value={num(s?.drop)} icon={Truck} />
        <MetricCard label="Atacado habilitado" value={num(s?.wholesale)} icon={ShoppingBag} />
        <MetricCard label="Com pendências" value={num(s?.pending)} icon={AlertTriangle} hint="Convites, follow-ups vencidos ou cadastro incompleto" />
        <MetricCard label="Inativos" value={num(s?.inactive)} icon={PauseCircle} />
      </div>

      <Panel className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, empresa, CPF/CNPJ, WhatsApp ou e-mail" className="min-w-[16rem] flex-1" aria-label="Buscar clientes" />
          <div className="flex rounded-lg border border-border p-0.5">
            <button aria-label="Cartões" onClick={() => setView("cards")} className={cn("rounded-md p-2", view === "cards" && "bg-secondary")}><LayoutGrid className="h-4 w-4" /></button>
            <button aria-label="Lista" onClick={() => setView("list")} className={cn("rounded-md p-2", view === "list" && "bg-secondary")}><LayoutList className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
          <SelectInput value={f.commercial} onChange={set("commercial")} aria-label="Relacionamento"><option value="">Relacionamento</option>{COMMERCIAL_STATUSES.map((x) => <option key={x} value={x}>{COMMERCIAL_LABEL[x]}</option>)}</SelectInput>
          <SelectInput value={f.status} onChange={set("status")} aria-label="Status técnico"><option value="">Status técnico</option>{ORG_STATUSES.map((x) => <option key={x} value={x}>{ORG_STATUS_LABEL[x]}</option>)}</SelectInput>
          <SelectInput value={f.manager} onChange={set("manager")} aria-label="Responsável"><option value="">Responsável BemMais</option>{team.data?.map((t) => <option key={t.user_id} value={t.user_id}>{t.full_name || t.email}</option>)}</SelectInput>
          <SelectInput value={f.origin} onChange={set("origin")} aria-label="Origem"><option value="">Origem</option>{ORIGINS.map((o) => <option key={o}>{o}</option>)}</SelectInput>
          <SelectInput value={f.tag} onChange={set("tag")} aria-label="Tag"><option value="">Tag</option>{tags.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectInput>
          <SelectInput value={f.capability} onChange={set("capability")} aria-label="Modalidade"><option value="">Modalidade / capacidade</option>{OPERATION_OPTIONS.map((o) => <option key={o.cap} value={o.cap}>{o.short}</option>)}<option value="buy_wholesale">Compra atacado</option></SelectInput>
          <SelectInput value={f.hasStore} onChange={set("hasStore")} aria-label="Possui loja"><option value="">Possui loja?</option><option value="true">Com loja</option><option value="false">Sem loja</option></SelectInput>
          <SelectInput value={f.storeActive} onChange={set("storeActive")} aria-label="Loja ativa"><option value="">Loja ativa?</option><option value="true">Loja ativa</option><option value="false">Sem loja ativa</option></SelectInput>
          <SelectInput value={f.state} onChange={set("state")} aria-label="Estado"><option value="">Estado</option>{UF.map((u) => <option key={u}>{u}</option>)}</SelectInput>
          <TextInput type="date" value={f.from} onChange={set("from")} aria-label="Cadastro desde" />
          <TextInput type="date" value={f.to} onChange={set("to")} aria-label="Cadastro até" />
          <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 text-[11px] text-muted-foreground" title="Disponível quando o módulo Pedidos existir">
            <Lock className="h-3 w-3 shrink-0" /> Compras e faturamento: com Pedidos
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Segmentos</span>
          {SEGMENTS.map((sg) => (
            <button key={sg.label} onClick={() => setF({ ...EMPTY, q: f.q, ...sg.f })}
              className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold transition-colors hover:bg-primary-soft hover:text-primary">{sg.label}</button>
          ))}
          {active > 0 && (
            <button onClick={() => { setF(EMPTY); setQ(""); }} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-primary"><X className="h-3 w-3" /> Limpar {active} filtro(s)</button>
          )}
        </div>
      </Panel>

      {list.error ? (
        <Empty text="Não foi possível carregar os clientes." />
      ) : view === "list" ? (
        <DataTable columns={cols} rows={list.data?.rows ?? []} loading={list.isLoading} rowKey={(r) => r.id} empty="Nenhum cliente encontrado." />
      ) : list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-secondary" />)}</div>
      ) : !list.data?.rows.length ? (
        <Empty text="Nenhum cliente encontrado." icon={Users} action={<Link to="/admin/clientes/novo"><Btn tabIndex={-1}><Plus className="h-4 w-4" /> Novo cliente</Btn></Link>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.data.rows.map((r) => (
            <Link key={r.id} to="/admin/clientes/$orgId" params={{ orgId: r.id }} search={{ tab: "resumo" }}
              className="admin-card admin-in group flex flex-col gap-3 p-4 transition-all hover:-translate-y-0.5 hover:shadow-float">
              <div className="flex items-start gap-3">
                <EntityAvatar name={r.name} src={r.logo_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display font-bold group-hover:text-primary">{r.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{formatDocument(r.document) || r.email || "Sem documento"}{r.city ? ` · ${r.city}/${r.state ?? ""}` : ""}</p>
                </div>
                <Badge value={r.commercial_status} tone={COMMERCIAL_TONE[r.commercial_status]} label={COMMERCIAL_LABEL[r.commercial_status]} />
              </div>
              <CapChips caps={r.caps} />
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle pt-3 text-xs text-muted-foreground">
                <span className="truncate">Resp.: {r.manager_name ?? "—"}</span>
                <span className="flex items-center gap-2">
                  {r.stores_count > 0 && <Store className="h-3.5 w-3.5 text-primary" aria-label="Possui loja" />}
                  {r.invites_pending > 0 && <Badge value="pending" label="Convite" />}
                  {r.status !== "active" && <Badge value={r.status} />}
                </span>
              </div>
              <NextAction r={r} />
            </Link>
          ))}
        </div>
      )}
      <div className="mt-4"><Pager page={page} setPage={setPage} total={list.data ? Math.ceil(list.data.total / SIZE) : null} /></div>
    </>
  );
}

function CapChips({ caps }: { caps: string[] }) {
  const shown = caps.filter((c) => CAP_SHORT[c]);
  if (!shown.length) return <span className="text-xs text-muted-foreground">Sem modalidades</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((c) => <span key={c} className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">{CAP_SHORT[c]}</span>)}
    </div>
  );
}

function NextAction({ r }: { r: CustomerRow }) {
  if (!r.next_action) return <span className="text-xs text-muted-foreground">Sem próxima ação</span>;
  const late = isLate(r.next_action_at);
  return (
    <span className={cn("flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs", late ? "bg-danger-soft text-danger" : "bg-secondary")}>
      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{r.next_action}</span>
      <span className="ml-auto shrink-0 font-semibold">{shortDate(r.next_action_at)}</span>
    </span>
  );
}
