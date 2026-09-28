import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, Pencil, UserPlus, Store, MoreHorizontal, Hash, UserCog, Activity, ExternalLink, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { EntityHeader, Btn, Badge, Empty, Panel } from "@/components/admin/ui";
import { StatusDialog } from "@/components/admin/orgs/StatusDialog";
import { CreateStoreModal } from "@/components/admin/orgs/CreateStoreModal";
import { MembersTab, CapabilitiesTab, StoresTab, FinanceTab, ActivityTab, InviteModal, DataTab } from "@/components/admin/orgs/OrgTabs";
import { Supplier360View, SupplierRelationshipTab, SupplierDomainsTab, type SupplierTab } from "@/components/admin/suppliers/SupplierPanels";
import { SupplierProductsTab, SupplierOffersTab, SupplierStockTab, OfferEditor } from "@/components/admin/suppliers/SupplierCatalog";
import { ModChips } from "@/components/admin/suppliers/ModChips";
import { ORG_STATUSES, ORG_STATUS_LABEL, formatDocument, type OrgCtx, type OrgStatus } from "@/lib/admin/orgs";
import { RELATIONSHIP_LABEL, RELATIONSHIP_TONE, SUPPLIER_TYPE_LABEL, useSupplier360 } from "@/lib/admin/suppliers";
import { cn } from "@/lib/utils";

const TABS: [SupplierTab, string][] = [
  ["resumo", "Resumo"],
  ["relacionamento", "Relacionamento"],
  ["produtos", "Produtos"],
  ["ofertas", "Ofertas"],
  ["estoque", "Estoque"],
  ["loja", "Loja"],
  ["dominios", "Domínios"],
  ["financeiro", "Financeiro"],
  ["usuarios", "Usuários"],
  ["permissoes", "Capacidades"],
  ["dados", "Dados"],
  ["atividade", "Atividade"],
];
const TAB_KEYS = TABS.map((t) => t[0]) as [SupplierTab, ...SupplierTab[]];

export const Route = createFileRoute("/_authenticated/admin/fornecedores/$orgId")({
  validateSearch: z.object({ tab: z.enum(TAB_KEYS).catch("resumo").default("resumo") }),
  head: () => ({ meta: [{ title: "Fornecedor · Super Admin BemMais" }] }),
  component: SupplierProfilePage,
});

function SupplierProfilePage() {
  const { orgId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const go = (t: SupplierTab) => navigate({ search: { tab: t } });
  const [statusTarget, setStatusTarget] = useState<OrgStatus | null>(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editOffer, setEditOffer] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["org", orgId],
    queryFn: async () => {
      const [o, c] = await Promise.all([
        supabase.from("organizations").select("*").eq("id", orgId).eq("is_platform", false).maybeSingle(),
        supabase.from("organization_capabilities").select("capability,enabled").eq("organization_id", orgId),
      ]);
      if (o.error) throw o.error;
      if (c.error) throw c.error;
      if (!o.data) return null;
      return { org: o.data, caps: (c.data ?? []).filter((x) => x.enabled).map((x) => x.capability) };
    },
  });
  const s360 = useSupplier360(orgId);

  if (q.isLoading || s360.isLoading)
    return (
      <div className="grid gap-4">
        <div className="h-40 animate-pulse rounded-2xl bg-secondary" />
        <div className="h-64 animate-pulse rounded-2xl bg-secondary" />
      </div>
    );
  if (q.error || s360.error) return <Empty text="Não foi possível carregar este fornecedor." />;
  if (!q.data || !s360.data)
    return <Empty text="Fornecedor não encontrado." action={<Link to="/admin/fornecedores"><Btn variant="outline" tabIndex={-1}>Voltar para Fornecedores</Btn></Link>} />;

  const s = s360.data;
  const ctx: OrgCtx = { org: q.data.org, caps: q.data.caps, managerName: s.relationship?.manager_name ?? null };
  const { org } = ctx;
  const rs = s.relationship?.relationship_status;

  return (
    <>
      <Link to="/admin/fornecedores" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-3.5 w-3.5" /> Fornecedores
      </Link>
      <EntityHeader
        name={org.name}
        src={org.logo_url}
        status={org.status}
        meta={
          <>
            {s.profile && <span>{SUPPLIER_TYPE_LABEL[s.profile.supplier_type] ?? s.profile.supplier_type}</span>}
            <span className="inline-flex items-center gap-1"><Hash className="h-3 w-3" />{formatDocument(org.document) || "Sem documento"}</span>
            <span className="inline-flex items-center gap-1"><UserCog className="h-3 w-3" />Resp. BemMais: {s.relationship?.manager_name ?? "—"}</span>
            {rs && <Badge value={rs} tone={RELATIONSHIP_TONE[rs]} label={`Relacionamento: ${RELATIONSHIP_LABEL[rs] ?? rs}`} />}
          </>
        }
        actions={
          <>
            <Btn variant="outline" onClick={() => go("dados")}><Pencil className="h-4 w-4" /> Editar</Btn>
            <Btn variant="outline" onClick={() => setInviteOpen(true)}><UserPlus className="h-4 w-4" /> Convidar</Btn>
            {!s.operation.stores && <Btn variant="outline" onClick={() => setStoreOpen(true)}><Store className="h-4 w-4" /> Criar loja</Btn>}
            <Btn onClick={() => go("produtos")}><Plus className="h-4 w-4" /> Produto</Btn>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Btn variant="dark" aria-label="Mais ações"><MoreHorizontal className="h-4 w-4" /></Btn>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">Status técnico</DropdownMenuLabel>
                {ORG_STATUSES.filter((x) => x !== org.status).map((x) => (
                  <DropdownMenuItem key={x} onSelect={() => setStatusTarget(x)}>{ORG_STATUS_LABEL[x]}</DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/admin/empresas/$orgId" params={{ orgId }} search={{ tab: "resumo" }}><ExternalLink className="h-4 w-4" /> Ver como empresa</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => go("atividade")}><Activity className="h-4 w-4" /> Ver auditoria</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        <div className="flex flex-wrap gap-1.5 px-5 pb-4">
          {s.profile?.modalities.length ? <ModChips mods={s.profile.modalities} /> : <Badge value="none" tone="warn" label="Modalidades não definidas" />}
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-border-subtle px-3" aria-label="Seções do fornecedor">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => go(k)} aria-current={tab === k ? "page" : undefined}
              className={cn("relative whitespace-nowrap px-3 py-3 text-sm font-semibold transition-colors", tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {l}
              {k === "ofertas" && s.operation.offers_pending > 0 && <span className="ml-1.5 rounded-full bg-warning-soft px-1.5 text-[10px] text-warning">{s.operation.offers_pending}</span>}
              {tab === k && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </nav>
      </EntityHeader>

      {tab === "resumo" && <Supplier360View s={s} go={go} />}
      {tab === "relacionamento" && <SupplierRelationshipTab key={JSON.stringify([s.relationship, s.profile])} orgId={orgId} s={s} />}
      {tab === "produtos" && <SupplierProductsTab orgId={orgId} onEditOffer={setEditOffer} />}
      {tab === "ofertas" && <SupplierOffersTab orgId={orgId} onEditOffer={setEditOffer} />}
      {tab === "estoque" && <SupplierStockTab orgId={orgId} />}
      {tab === "loja" &&
        (s.operation.stores ? (
          <StoresTab ctx={ctx} onCreate={() => setStoreOpen(true)} />
        ) : (
          <Panel><Empty text="Este fornecedor ainda não possui loja." icon={Store} action={<Btn onClick={() => setStoreOpen(true)}><Store className="h-4 w-4" /> Criar loja</Btn>} /></Panel>
        ))}
      {tab === "dominios" && <SupplierDomainsTab orgId={orgId} onCreateStore={() => setStoreOpen(true)} />}
      {tab === "financeiro" && <FinanceTab ctx={ctx} />}
      {tab === "usuarios" && <MembersTab ctx={ctx} onInvite={() => setInviteOpen(true)} />}
      {tab === "permissoes" && <CapabilitiesTab ctx={ctx} />}
      {tab === "dados" && <DataTab ctx={ctx} />}
      {tab === "atividade" && <ActivityTab ctx={ctx} />}

      <StatusDialog org={org} target={statusTarget} onClose={() => setStatusTarget(null)} />
      {storeOpen && <CreateStoreModal organizationId={org.id} organizationName={org.name} onClose={() => setStoreOpen(false)} />}
      {inviteOpen && <InviteModal orgId={org.id} onClose={() => setInviteOpen(false)} />}
      {editOffer && <OfferEditor orgId={orgId} offerId={editOffer} onClose={() => setEditOffer(null)} />}
    </>
  );
}
