import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  LayoutList,
  LayoutGrid,
  MoreHorizontal,
  Eye,
  Pencil,
  Users,
  ToggleRight,
  Store,
  Activity,
  Building2,
  CheckCircle2,
  Clock,
  PauseCircle,
  Factory,
  ShoppingBag,
  Search,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import {
  PageHeader,
  Panel,
  DataTable,
  Pager,
  Badge,
  Btn,
  TextInput,
  SelectInput,
  MetricCard,
  EntityAvatar,
  Empty,
  type Column,
} from "./ui";
import { StatusDialog } from "./orgs/StatusDialog";
import { CreateStoreModal } from "./orgs/CreateStoreModal";
import { dateTime, num, PAGE_SIZE } from "@/lib/admin/format";
import {
  CAP_ORDER,
  CAPABILITY_INFO,
  ORG_STATUSES,
  ORG_STATUS_LABEL,
  PROFILE_OPTIONS,
  formatDocument,
  profileSummary,
  type Cap,
  type OrgStatus,
} from "@/lib/admin/orgs";
import { cn } from "@/lib/utils";

type Kind = "all" | "clients" | "suppliers";
const COPY: Record<Kind, { title: string; desc: string; profile: string }> = {
  all: {
    title: "Empresas",
    desc: "Gerencie todas as organizações que fazem parte do ecossistema BemMais.",
    profile: "",
  },
  clients: {
    title: "Clientes BemMais",
    desc: "Organizações que compram, revendem ou operam loja. Mesma base de Empresas, filtrada por perfil.",
    profile: "client",
  },
  suppliers: {
    title: "Fornecedores",
    desc: "Organizações que fornecem produtos. Mesma base de Empresas, filtrada por perfil.",
    profile: "supplier",
  },
};

type Row = {
  id: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  email: string | null;
  status: OrgStatus;
  logo_url: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
  responsible_name: string | null;
  capabilities: Cap[];
  tags: { id: string; name: string; color: string }[];
  stores: number;
  members: number;
};
type Filters = {
  q: string;
  status: string;
  capability: string;
  profile: string;
  hasStore: string;
  hasProducts: string;
  from: string;
  to: string;
  tag: string;
};
const EMPTY: Filters = {
  q: "",
  status: "",
  capability: "",
  profile: "",
  hasStore: "",
  hasProducts: "",
  from: "",
  to: "",
  tag: "",
};
const TAG_TONE = (c: string) =>
  (["neutral", "brand", "ok", "warn", "bad", "info"].includes(c) ? c : "neutral") as "neutral";

export function OrgsPage({ kind }: { kind: Kind }) {
  const copy = COPY[kind];
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [f, setF] = useState<Filters>({ ...EMPTY, profile: copy.profile });
  const [debouncedQ, setDebouncedQ] = useState("");
  const [view, setView] = useState<"list" | "cards">("list");
  const [statusTarget, setStatusTarget] = useState<{ org: Row; status: OrgStatus } | null>(null);
  const [storeFor, setStoreFor] = useState<Row | null>(null);

  useEffect(() => {
    const v = sessionStorage.getItem("orgs-view");
    if (v === "cards" || v === "list") setView(v);
  }, []);
  useEffect(() => {
    sessionStorage.setItem("orgs-view", view);
  }, [view]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(f.q), 300);
    return () => clearTimeout(t);
  }, [f.q]);

  const stats = useQuery({
    queryKey: ["org-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_org_stats");
      if (error) throw error;
      return data as Record<
        | "total"
        | "active"
        | "pending"
        | "suspended"
        | "suppliers"
        | "clients"
        | "with_active_store",
        number
      >;
    },
  });
  const tags = useQuery({
    queryKey: ["org-tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("org_tags").select("id,name,color").order("name");
      if (error) throw error;
      return data;
    },
  });

  const bool = (v: string) => (v === "" ? undefined : v === "yes");
  const list = useQuery({
    queryKey: [
      "orgs",
      page,
      debouncedQ,
      f.status,
      f.capability,
      f.profile,
      f.hasStore,
      f.hasProducts,
      f.from,
      f.to,
      f.tag,
    ],
    queryFn: async () => {
      const args: Record<string, unknown> = { _page: page, _size: PAGE_SIZE };
      if (debouncedQ.trim()) args["_q"] = debouncedQ.trim();
      if (f.status) args["_status"] = f.status;
      if (f.capability) args["_capability"] = f.capability;
      if (f.profile) args["_profile"] = f.profile;
      if (bool(f.hasStore) !== undefined) args["_has_store"] = bool(f.hasStore);
      if (bool(f.hasProducts) !== undefined) args["_has_products"] = bool(f.hasProducts);
      if (f.from) args["_from"] = f.from;
      if (f.to) args["_to"] = f.to;
      if (f.tag) args["_tag"] = f.tag;
      const { data, error } = await supabase.rpc("admin_search_organizations", args as never);
      if (error) throw error;
      const d = data as { total: number; rows: Row[] };
      return { rows: d.rows, count: d.total };
    },
  });

  const set = <K extends keyof Filters>(k: K, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setPage(0);
  };
  const chips: { key: keyof Filters; label: string }[] = [];
  if (f.q) chips.push({ key: "q", label: `Busca: “${f.q}”` });
  if (f.status)
    chips.push({ key: "status", label: `Status: ${ORG_STATUS_LABEL[f.status as OrgStatus]}` });
  if (f.capability)
    chips.push({
      key: "capability",
      label: `Capacidade: ${CAPABILITY_INFO[f.capability as Cap].title}`,
    });
  if (f.profile)
    chips.push({
      key: "profile",
      label: `Perfil: ${PROFILE_OPTIONS.find((p) => p.key === f.profile)?.label}`,
    });
  if (f.hasStore)
    chips.push({ key: "hasStore", label: f.hasStore === "yes" ? "Com loja" : "Sem loja" });
  if (f.hasProducts)
    chips.push({
      key: "hasProducts",
      label: f.hasProducts === "yes" ? "Com produtos" : "Sem produtos",
    });
  if (f.from) chips.push({ key: "from", label: `Desde ${f.from.split("-").reverse().join("/")}` });
  if (f.to) chips.push({ key: "to", label: `Até ${f.to.split("-").reverse().join("/")}` });
  if (f.tag)
    chips.push({ key: "tag", label: `Tag: ${tags.data?.find((t) => t.id === f.tag)?.name ?? ""}` });

  const open = (id: string, tab?: string) =>
    navigate({
      to: "/admin/empresas/$orgId",
      params: { orgId: id },
      search: { tab: tab ?? "resumo" },
    });

  const Actions = ({ r }: { r: Row }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-secondary"
          aria-label={`Ações de ${r.name}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => open(r.id)}>
          <Eye className="h-4 w-4" /> Visualizar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open(r.id, "dados")}>
          <Pencil className="h-4 w-4" /> Editar
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open(r.id, "usuarios")}>
          <Users className="h-4 w-4" /> Gerenciar usuários
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => open(r.id, "capacidades")}>
          <ToggleRight className="h-4 w-4" /> Gerenciar capacidades
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setStoreFor(r)}>
          <Store className="h-4 w-4" /> Criar loja
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <PauseCircle className="h-4 w-4" /> Alterar status
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {ORG_STATUSES.filter((s) => s !== r.status).map((s) => (
              <DropdownMenuItem key={s} onSelect={() => setStatusTarget({ org: r, status: s })}>
                {ORG_STATUS_LABEL[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => open(r.id, "atividade")}>
          <Activity className="h-4 w-4" /> Ver atividade
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const Caps = ({ caps, max = 3 }: { caps: Cap[]; max?: number }) => (
    <div className="flex flex-wrap gap-1">
      {caps.slice(0, max).map((c) => (
        <span key={c} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium">
          {CAPABILITY_INFO[c].title}
        </span>
      ))}
      {caps.length > max && (
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
          +{caps.length - max}
        </span>
      )}
      {!caps.length && <span className="text-xs text-muted-foreground">—</span>}
    </div>
  );

  const cols: Column<Row>[] = [
    {
      key: "name",
      label: "Empresa",
      render: (r) => (
        <Link
          to="/admin/empresas/$orgId"
          params={{ orgId: r.id }}
          search={{ tab: "resumo" }}
          className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <EntityAvatar name={r.name} src={r.logo_url} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-semibold hover:text-primary">{r.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {formatDocument(r.document) || r.email || "Sem documento"}
            </p>
          </div>
        </Link>
      ),
    },
    {
      key: "profile",
      label: "Perfil",
      render: (r) => (
        <div>
          <p className="text-xs font-semibold">{profileSummary(r.capabilities)}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {r.tags.map((t) => (
              <Badge key={t.id} value={t.name} label={t.name} tone={TAG_TONE(t.color)} />
            ))}
          </div>
        </div>
      ),
    },
    { key: "caps", label: "Capacidades", render: (r) => <Caps caps={r.capabilities} /> },
    {
      key: "status",
      label: "Status",
      render: (r) => <Badge value={r.status} label={ORG_STATUS_LABEL[r.status]} />,
    },
    {
      key: "resp",
      label: "Responsável",
      render: (r) => <span className="text-xs">{r.responsible_name || "—"}</span>,
    },
    {
      key: "counts",
      label: "Lojas · Usuários",
      render: (r) => (
        <span className="metric text-xs">
          <b>{r.stores}</b> · <b>{r.members}</b>
        </span>
      ),
    },
    {
      key: "created",
      label: "Cadastro",
      render: (r) => (
        <span className="text-xs text-muted-foreground">{dateTime(r.created_at)}</span>
      ),
    },
    { key: "act", label: "", className: "text-right", render: (r) => <Actions r={r} /> },
  ];

  const s = stats.data;
  const v = (n: number | undefined) => (stats.isLoading ? "…" : num(n ?? 0));

  return (
    <>
      <PageHeader
        eyebrow="Ecossistema"
        title={copy.title}
        description={copy.desc}
        actions={
          <Link to="/admin/empresas/nova">
            <Btn tabIndex={-1}>
              <Plus className="h-4 w-4" /> Nova empresa
            </Btn>
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <MetricCard label="Total" value={v(s?.total)} icon={Building2} tone="brand" />
        <MetricCard label="Ativas" value={v(s?.active)} icon={CheckCircle2} />
        <MetricCard label="Pendentes" value={v(s?.pending)} icon={Clock} />
        <MetricCard
          label="Suspensas"
          value={v(s?.suspended)}
          icon={PauseCircle}
          hint="Inclui bloqueadas"
        />
        <MetricCard label="Fornecedores" value={v(s?.suppliers)} icon={Factory} />
        <MetricCard label="Clientes" value={v(s?.clients)} icon={ShoppingBag} />
        <MetricCard label="Loja ativa" value={v(s?.with_active_store)} icon={Store} />
      </div>

      <Panel>
        <div className="grid gap-2 px-5 pb-2 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <TextInput
                value={f.q}
                onChange={(e) => set("q", e.target.value)}
                placeholder="Nome, razão social, CPF/CNPJ, e-mail ou telefone"
                className="pl-9"
                aria-label="Buscar empresas"
              />
            </div>
            <div
              className="flex rounded-lg bg-secondary p-0.5"
              role="group"
              aria-label="Visualização"
            >
              {(["list", "cards"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setView(m)}
                  aria-pressed={view === m}
                  aria-label={m === "list" ? "Lista" : "Cards"}
                  className={cn(
                    "grid h-8 w-9 place-items-center rounded-md transition-all",
                    view === m
                      ? "bg-surface-elevated text-primary shadow-card"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "list" ? (
                    <LayoutList className="h-4 w-4" />
                  ) : (
                    <LayoutGrid className="h-4 w-4" />
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 xl:grid-cols-8">
            <SelectInput
              aria-label="Status"
              value={f.status}
              onChange={(e) => set("status", e.target.value)}
              className="h-9 text-xs"
            >
              <option value="">Todos status</option>
              {ORG_STATUSES.map((x) => (
                <option key={x} value={x}>
                  {ORG_STATUS_LABEL[x]}
                </option>
              ))}
            </SelectInput>
            <SelectInput
              aria-label="Capacidade"
              value={f.capability}
              onChange={(e) => set("capability", e.target.value)}
              className="h-9 text-xs"
            >
              <option value="">Toda capacidade</option>
              {CAP_ORDER.map((c) => (
                <option key={c} value={c}>
                  {CAPABILITY_INFO[c].title}
                </option>
              ))}
            </SelectInput>
            <SelectInput
              aria-label="Perfil"
              value={f.profile}
              onChange={(e) => set("profile", e.target.value)}
              className="h-9 text-xs"
            >
              <option value="">Todo perfil</option>
              {PROFILE_OPTIONS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </SelectInput>
            <SelectInput
              aria-label="Possui loja"
              value={f.hasStore}
              onChange={(e) => set("hasStore", e.target.value)}
              className="h-9 text-xs"
            >
              <option value="">Loja: todas</option>
              <option value="yes">Com loja</option>
              <option value="no">Sem loja</option>
            </SelectInput>
            <SelectInput
              aria-label="Possui produtos"
              value={f.hasProducts}
              onChange={(e) => set("hasProducts", e.target.value)}
              className="h-9 text-xs"
            >
              <option value="">Produtos: todas</option>
              <option value="yes">Com produtos</option>
              <option value="no">Sem produtos</option>
            </SelectInput>
            <SelectInput
              aria-label="Tag"
              value={f.tag}
              onChange={(e) => set("tag", e.target.value)}
              className="h-9 text-xs"
            >
              <option value="">Toda tag</option>
              {tags.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </SelectInput>
            <TextInput
              type="date"
              aria-label="Cadastro desde"
              value={f.from}
              onChange={(e) => set("from", e.target.value)}
              className="h-9 text-xs"
            />
            <TextInput
              type="date"
              aria-label="Cadastro até"
              value={f.to}
              onChange={(e) => set("to", e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {chips.map((c) => (
                <button
                  key={c.key}
                  onClick={() => set(c.key, "")}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15"
                >
                  {c.label} <X className="h-3 w-3" />
                </button>
              ))}
              <button
                onClick={() => {
                  setF(EMPTY);
                  setPage(0);
                }}
                className="ml-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-primary"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </div>

        {list.error ? (
          <p className="px-5 py-4 text-sm text-danger">Não foi possível carregar as empresas.</p>
        ) : view === "list" ? (
          <DataTable
            columns={cols}
            rows={list.data?.rows}
            loading={list.isLoading}
            rowKey={(r) => r.id}
            empty={
              chips.length ? "Nenhuma empresa com esses filtros." : "Nenhuma empresa cadastrada."
            }
          />
        ) : (
          <div className="grid gap-3 px-5 pb-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-44 animate-pulse rounded-2xl bg-secondary" />
              ))}
            {!list.isLoading && !list.data?.rows.length && (
              <div className="sm:col-span-2 xl:col-span-3">
                <Empty text="Nenhuma empresa encontrada." icon={Building2} />
              </div>
            )}
            {list.data?.rows.map((r) => (
              <article
                key={r.id}
                className="group relative rounded-2xl border border-border-subtle bg-surface-elevated p-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-float"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to="/admin/empresas/$orgId"
                    params={{ orgId: r.id }}
                    search={{ tab: "resumo" }}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <EntityAvatar name={r.name} src={r.logo_url} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold group-hover:text-primary">{r.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDocument(r.document) || r.email || "Sem documento"}
                      </p>
                    </div>
                  </Link>
                  <Actions r={r} />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Badge value={r.status} label={ORG_STATUS_LABEL[r.status]} />
                  <span className="text-xs font-semibold text-muted-foreground">
                    {profileSummary(r.capabilities)}
                  </span>
                </div>
                <div className="mt-3">
                  <Caps caps={r.capabilities} max={4} />
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border-subtle pt-3 text-center text-xs">
                  <div>
                    <p className="metric text-base font-bold">{r.stores}</p>
                    <p className="text-muted-foreground">Lojas</p>
                  </div>
                  <div>
                    <p className="metric text-base font-bold">{r.members}</p>
                    <p className="text-muted-foreground">Usuários</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold">
                      {r.city ? `${r.city}${r.state ? `/${r.state}` : ""}` : "—"}
                    </p>
                    <p className="text-muted-foreground">Local</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        <Pager page={page} setPage={setPage} total={list.data?.count} />
      </Panel>

      {statusTarget && (
        <StatusDialog
          org={statusTarget.org}
          target={statusTarget.status}
          onClose={() => setStatusTarget(null)}
        />
      )}
      {storeFor && (
        <CreateStoreModal
          organizationId={storeFor.id}
          organizationName={storeFor.name}
          onClose={() => setStoreFor(null)}
        />
      )}
    </>
  );
}
