import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Factory,
  CheckCircle2,
  Rocket,
  Package,
  BadgeCheck,
  Truck,
  Warehouse,
  AlertTriangle,
  LayoutGrid,
  LayoutList,
  X,
  Store,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  PageHeader,
  MetricCard,
  Btn,
  TextInput,
  SelectInput,
  Badge,
  EntityAvatar,
  Empty,
  Pager,
  DataTable,
  Panel,
  type Column,
} from "@/components/admin/ui";
import { num } from "@/lib/admin/format";
import { formatDocument, ORG_STATUSES, ORG_STATUS_LABEL, UF, CAPABILITY_INFO, CAP_ORDER } from "@/lib/admin/orgs";
import { usePlatformTeam, useOrgTags, shortDate } from "@/lib/admin/customers";
import {
  SUPPLIER_TYPES,
  SUPPLIER_TYPE_LABEL,
  RELATIONSHIP,
  RELATIONSHIP_LABEL,
  RELATIONSHIP_TONE,
  SUPPLY_MODALITIES,
  MODALITY_SHORT,
  type SupplierRow,
} from "@/lib/admin/suppliers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/fornecedores/")({
  head: () => ({ meta: [{ title: "Fornecedores — Super Admin BemMais" }] }),
  component: SuppliersPage,
});

const SIZE = 24;
const EMPTY = {
  q: "",
  status: "",
  type: "",
  state: "",
  manager: "",
  relationship: "",
  capability: "",
  modality: "",
  hasProducts: "",
  hasOffers: "",
  hasStore: "",
  tag: "",
  from: "",
  to: "",
};
type F = typeof EMPTY;
const bool = (v: string) => (v === "" ? null : v === "true");

function SuppliersPage() {
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
    queryKey: ["supplier-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_supplier_stats");
      if (error) throw error;
      return data as Record<string, number>;
    },
  });
  const list = useQuery({
    queryKey: ["suppliers", f, page],
    queryFn: async () => {
      const args = Object.fromEntries(
        Object.entries({
          _q: f.q || null,
          _status: f.status || null,
          _type: f.type || null,
          _state: f.state || null,
          _manager: f.manager || null,
          _relationship: f.relationship || null,
          _capability: f.capability || null,
          _modality: f.modality || null,
          _has_products: bool(f.hasProducts),
          _has_offers: bool(f.hasOffers),
          _has_store: bool(f.hasStore),
          _tag: f.tag || null,
          _from: f.from || null,
          _to: f.to || null,
          _page: page,
          _size: SIZE,
        }).filter(([, v]) => v !== null),
      );
      const { data, error } = await supabase.rpc("admin_supplier_list", args);
      if (error) throw error;
      return data as unknown as { total: number; rows: SupplierRow[] };
    },
    placeholderData: (p) => p,
  });

  const s = stats.data;
  const active = Object.entries(f).filter(([k, v]) => k !== "q" && v).length;
  const set = (k: keyof F) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const cols: Column<SupplierRow>[] = [
    {
      key: "n",
      label: "Fornecedor",
      render: (r) => (
        <Link
          to="/admin/fornecedores/$orgId"
          params={{ orgId: r.id }}
          search={{ tab: "resumo" }}
          className="flex items-center gap-3 font-semibold hover:text-primary"
        >
          <EntityAvatar name={r.name} src={r.logo_url} size="sm" />
          <span>
            <span className="block">{r.name}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {r.supplier_type ? SUPPLIER_TYPE_LABEL[r.supplier_type] : "Perfil não definido"}
            </span>
          </span>
        </Link>
      ),
    },
    { key: "l", label: "Cidade/UF", render: (r) => (r.city ? `${r.city}/${r.state ?? ""}` : "—") },
    { key: "m", label: "Modalidades", render: (r) => <ModChips mods={r.modalities} /> },
    { key: "p", label: "Produtos", className: "metric", render: (r) => num(r.products_count) },
    {
      key: "o",
      label: "Ofertas",
      render: (r) => (
        <span className="metric">
          {num(r.offers_active)}
          <span className="text-muted-foreground">/{num(r.offers_count)}</span>
        </span>
      ),
    },
    { key: "s", label: "Status", render: (r) => <Badge value={r.status} /> },
    { key: "r", label: "Responsável", render: (r) => r.manager_name ?? "—" },
    { key: "a", label: "Última atividade", render: (r) => shortDate(r.last_activity) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Supply chain · Catálogo · Operação"
        title="Fornecedores"
        description="Gerencie parceiros, catálogo, condições comerciais, estoque e operação de fornecimento."
        actions={
          <Link to="/admin/fornecedores/novo">
            <Btn tabIndex={-1}>
              <Plus className="h-4 w-4" /> Novo fornecedor
            </Btn>
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Total" value={num(s?.["total"])} icon={Factory} tone="brand" />
        <MetricCard label="Ativos" value={num(s?.["active"])} icon={CheckCircle2} />
        <MetricCard label="Em onboarding" value={num(s?.["onboarding"])} icon={Rocket} />
        <MetricCard label="Com produtos" value={num(s?.["with_products"])} icon={Package} />
        <MetricCard label="Com ofertas ativas" value={num(s?.["with_active_offers"])} icon={BadgeCheck} />
        <MetricCard label="Com Drop" value={num(s?.["drop"])} icon={Truck} />
        <MetricCard label="Com estoque disponível" value={num(s?.["with_stock"])} icon={Warehouse} />
        <MetricCard
          label="Com pendências"
          value={num(s?.["pending"])}
          icon={AlertTriangle}
          hint="Sem conta de recebimento ativa, follow-up vencido ou cadastro incompleto"
        />
      </div>

      <Panel className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, razão social, CPF/CNPJ, e-mail, WhatsApp ou cidade"
            className="min-w-[16rem] flex-1"
            aria-label="Buscar fornecedores"
          />
          <div className="flex rounded-lg border border-border p-0.5">
            <button aria-label="Cartões" onClick={() => setView("cards")} className={cn("rounded-md p-2", view === "cards" && "bg-secondary")}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button aria-label="Lista" onClick={() => setView("list")} className={cn("rounded-md p-2", view === "list" && "bg-secondary")}>
              <LayoutList className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
          <SelectInput value={f.status} onChange={set("status")} aria-label="Status">
            <option value="">Status</option>
            {ORG_STATUSES.map((x) => <option key={x} value={x}>{ORG_STATUS_LABEL[x]}</option>)}
          </SelectInput>
          <SelectInput value={f.type} onChange={set("type")} aria-label="Perfil">
            <option value="">Perfil</option>
            {SUPPLIER_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </SelectInput>
          <SelectInput value={f.relationship} onChange={set("relationship")} aria-label="Relacionamento">
            <option value="">Relacionamento</option>
            {RELATIONSHIP.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </SelectInput>
          <SelectInput value={f.state} onChange={set("state")} aria-label="Estado">
            <option value="">Estado</option>
            {UF.map((u) => <option key={u}>{u}</option>)}
          </SelectInput>
          <SelectInput value={f.manager} onChange={set("manager")} aria-label="Responsável">
            <option value="">Responsável</option>
            {team.data?.map((t) => <option key={t.user_id} value={t.user_id}>{t.full_name || t.email}</option>)}
          </SelectInput>
          <SelectInput value={f.modality} onChange={set("modality")} aria-label="Modalidade">
            <option value="">Modalidade</option>
            {SUPPLY_MODALITIES.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </SelectInput>
          <SelectInput value={f.capability} onChange={set("capability")} aria-label="Capacidade">
            <option value="">Capacidade</option>
            {CAP_ORDER.map((c) => <option key={c} value={c}>{CAPABILITY_INFO[c].title}</option>)}
          </SelectInput>
          <SelectInput value={f.hasProducts} onChange={set("hasProducts")} aria-label="Possui produtos">
            <option value="">Produtos?</option>
            <option value="true">Com produtos</option>
            <option value="false">Sem produtos</option>
          </SelectInput>
          <SelectInput value={f.hasOffers} onChange={set("hasOffers")} aria-label="Ofertas ativas">
            <option value="">Ofertas ativas?</option>
            <option value="true">Com ofertas ativas</option>
            <option value="false">Sem ofertas ativas</option>
          </SelectInput>
          <SelectInput value={f.hasStore} onChange={set("hasStore")} aria-label="Possui loja">
            <option value="">Loja?</option>
            <option value="true">Com loja</option>
            <option value="false">Sem loja</option>
          </SelectInput>
          <SelectInput value={f.tag} onChange={set("tag")} aria-label="Tag">
            <option value="">Tag</option>
            {tags.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </SelectInput>
          <TextInput type="date" value={f.from} onChange={set("from")} aria-label="Cadastro desde" />
          <TextInput type="date" value={f.to} onChange={set("to")} aria-label="Cadastro até" />
          {active > 0 && (
            <button
              onClick={() => { setF(EMPTY); setQ(""); }}
              className="inline-flex items-center justify-center gap-1 text-xs font-semibold text-primary"
            >
              <X className="h-3 w-3" /> Limpar {active}
            </button>
          )}
        </div>
      </Panel>

      {list.error ? (
        <Empty text="Não foi possível carregar os fornecedores." />
      ) : view === "list" ? (
        <DataTable columns={cols} rows={list.data?.rows ?? []} loading={list.isLoading} rowKey={(r) => r.id} empty="Nenhum fornecedor encontrado." />
      ) : list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-secondary" />)}
        </div>
      ) : !list.data?.rows.length ? (
        <Empty
          text="Nenhum fornecedor encontrado."
          icon={Factory}
          action={<Link to="/admin/fornecedores/novo"><Btn tabIndex={-1}><Plus className="h-4 w-4" /> Novo fornecedor</Btn></Link>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.data.rows.map((r) => (
            <Link
              key={r.id}
              to="/admin/fornecedores/$orgId"
              params={{ orgId: r.id }}
              search={{ tab: "resumo" }}
              className="admin-card admin-in group flex flex-col gap-3 p-4 transition-all hover:-translate-y-0.5 hover:shadow-float"
            >
              <div className="flex items-start gap-3">
                <EntityAvatar name={r.name} src={r.logo_url} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display font-bold group-hover:text-primary">{r.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.supplier_type ? SUPPLIER_TYPE_LABEL[r.supplier_type] : "Perfil não definido"}
                    {r.city ? ` · ${r.city}/${r.state ?? ""}` : ""}
                  </p>
                </div>
                {r.relationship_status ? (
                  <Badge value={r.relationship_status} tone={RELATIONSHIP_TONE[r.relationship_status]} label={RELATIONSHIP_LABEL[r.relationship_status]} />
                ) : (
                  <Badge value={r.status} />
                )}
              </div>
              <ModChips mods={r.modalities} />
              <div className="grid grid-cols-3 gap-2 rounded-xl bg-secondary/60 p-2.5 text-center">
                <Mini label="Produtos" v={r.products_count} />
                <Mini label="Ofertas ativas" v={r.offers_active} />
                <Mini label="Ofertas" v={r.offers_count} />
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle pt-3 text-xs text-muted-foreground">
                <span className="truncate">Resp.: {r.manager_name ?? "—"}</span>
                <span className="flex items-center gap-2">
                  {r.stores_count > 0 && <Store className="h-3.5 w-3.5 text-primary" aria-label="Possui loja" />}
                  {r.status !== "active" && <Badge value={r.status} />}
                  <span>{shortDate(r.last_activity)}</span>
                </span>
              </div>
              <span className="sr-only">{formatDocument(r.document)}</span>
            </Link>
          ))}
        </div>
      )}
      <div className="mt-4">
        <Pager page={page} setPage={setPage} total={list.data ? Math.ceil(list.data.total / SIZE) : null} />
      </div>
    </>
  );
}

function Mini({ label, v }: { label: string; v: number }) {
  return (
    <div>
      <p className="metric text-base font-bold">{num(v)}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

export function ModChips({ mods }: { mods: string[] }) {
  const shown = mods.filter((m) => MODALITY_SHORT[m]);
  if (!shown.length) return <span className="text-xs text-muted-foreground">Sem modalidades</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((m) => (
        <span key={m} className="rounded-md bg-surface-dark px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-foreground">
          {MODALITY_SHORT[m]}
        </span>
      ))}
    </div>
  );
}
