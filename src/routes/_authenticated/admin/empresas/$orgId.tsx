import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, Pencil, UserPlus, Store, ToggleRight, MoreHorizontal, Activity, CalendarDays, UserCog, Hash } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { EntityHeader, Btn, Badge, Empty } from "@/components/admin/ui";
import { StatusDialog } from "@/components/admin/orgs/StatusDialog";
import { CreateStoreModal } from "@/components/admin/orgs/CreateStoreModal";
import { SummaryTab, DataTab, MembersTab, CapabilitiesTab, StoresTab, ProductsTab, OffersTab, FinanceTab, ActivityTab, PlaceholderTab, InviteModal } from "@/components/admin/orgs/OrgTabs";
import { dateTime } from "@/lib/admin/format";
import { CAP_ORDER, CAPABILITY_INFO, ORG_STATUSES, ORG_STATUS_LABEL, formatDocument, type Cap, type OrgStatus } from "@/lib/admin/orgs";
import { cn } from "@/lib/utils";

const TABS = [
  ["resumo", "Resumo"], ["dados", "Dados da empresa"], ["usuarios", "Usuários"], ["capacidades", "Capacidades"], ["lojas", "Lojas"],
  ["produtos", "Produtos"], ["ofertas", "Ofertas"], ["pedidos", "Pedidos"], ["financeiro", "Financeiro"], ["integracoes", "Integrações"], ["atividade", "Atividade"],
] as const;
type Tab = (typeof TABS)[number][0];
const TAB_KEYS = TABS.map((t) => t[0]) as [Tab, ...Tab[]];

export const Route = createFileRoute("/_authenticated/admin/empresas/$orgId")({
  validateSearch: z.object({ tab: z.enum(TAB_KEYS).catch("resumo").default("resumo") }),
  component: OrgProfile,
});

export type OrgCtx = { org: NonNullable<ReturnType<typeof useOrg>["data"]>["org"]; caps: Cap[]; managerName: string | null };

function useOrg(id: string) {
  return useQuery({
    queryKey: ["org", id],
    queryFn: async () => {
      const [o, c] = await Promise.all([
        supabase.from("organizations").select("*").eq("id", id).eq("is_platform", false).maybeSingle(),
        supabase.from("organization_capabilities").select("capability,enabled").eq("organization_id", id),
      ]);
      if (o.error) throw o.error;
      if (c.error) throw c.error;
      if (!o.data) return null;
      let managerName: string | null = null;
      if (o.data.account_manager_id) {
        const { data: t } = await supabase.rpc("platform_team");
        const m = t?.find((x) => x.user_id === o.data!.account_manager_id);
        managerName = m ? m.full_name || m.email : null;
      }
      return { org: o.data, caps: (c.data ?? []).filter((x) => x.enabled).map((x) => x.capability), managerName };
    },
  });
}

function OrgProfile() {
  const { orgId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const q = useOrg(orgId);
  const [statusTarget, setStatusTarget] = useState<OrgStatus | null>(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const go = (t: Tab) => navigate({ search: { tab: t } });

  if (q.isLoading) return <div className="grid gap-4"><div className="h-40 animate-pulse rounded-2xl bg-secondary" /><div className="h-64 animate-pulse rounded-2xl bg-secondary" /></div>;
  if (q.error) return <Empty text="Não foi possível carregar esta empresa." />;
  if (!q.data) return <Empty text="Empresa não encontrada ou sem permissão de acesso." action={<Link to="/admin/empresas"><Btn variant="outline" tabIndex={-1}>Voltar para Empresas</Btn></Link>} />;

  const { org, caps, managerName } = q.data;
  const ctx: OrgCtx = { org, caps, managerName };

  return (
    <>
      <Link to="/admin/empresas" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" /> Empresas</Link>
      <EntityHeader name={org.name} src={org.logo_url} status={org.status}
        meta={<>
          {org.legal_name && <span>{org.legal_name}</span>}
          <span className="inline-flex items-center gap-1"><Hash className="h-3 w-3" />{formatDocument(org.document) || "Sem documento"}</span>
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />Desde {dateTime(org.created_at)}</span>
          <span className="inline-flex items-center gap-1"><UserCog className="h-3 w-3" />Resp. BemMais: {managerName ?? "—"}</span>
        </>}
        actions={<>
          <Btn variant="outline" onClick={() => go("dados")}><Pencil className="h-4 w-4" /> Editar</Btn>
          <Btn variant="outline" onClick={() => setInviteOpen(true)}><UserPlus className="h-4 w-4" /> Adicionar usuário</Btn>
          <Btn variant="outline" onClick={() => setStoreOpen(true)}><Store className="h-4 w-4" /> Criar loja</Btn>
          <Btn onClick={() => go("capacidades")}><ToggleRight className="h-4 w-4" /> Capacidades</Btn>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Btn variant="dark" aria-label="Mais ações"><MoreHorizontal className="h-4 w-4" /></Btn></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">Status</DropdownMenuLabel>
              {ORG_STATUSES.filter((s) => s !== org.status).map((s) => <DropdownMenuItem key={s} onSelect={() => setStatusTarget(s)}>{ORG_STATUS_LABEL[s]}</DropdownMenuItem>)}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => go("atividade")}><Activity className="h-4 w-4" /> Ver atividade</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>}>
        <div className="flex flex-wrap gap-1.5 px-5 pb-4">
          {caps.length ? CAP_ORDER.filter((c) => caps.includes(c)).map((c) => { const I = CAPABILITY_INFO[c]; return (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold"><I.icon className="h-3 w-3 text-primary" />{I.title}</span>); })
            : <Badge value="none" tone="warn" label="Nenhuma capacidade ativa" />}
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-border-subtle px-3" aria-label="Seções da empresa">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => go(k)} aria-current={tab === k ? "page" : undefined}
              className={cn("relative whitespace-nowrap px-3 py-3 text-sm font-semibold transition-colors", tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {l}{tab === k && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </nav>
      </EntityHeader>

      {tab === "resumo" && <SummaryTab ctx={ctx} go={go} />}
      {tab === "dados" && <DataTab ctx={ctx} />}
      {tab === "usuarios" && <MembersTab ctx={ctx} onInvite={() => setInviteOpen(true)} />}
      {tab === "capacidades" && <CapabilitiesTab ctx={ctx} />}
      {tab === "lojas" && <StoresTab ctx={ctx} onCreate={() => setStoreOpen(true)} />}
      {tab === "produtos" && <ProductsTab ctx={ctx} />}
      {tab === "ofertas" && <OffersTab ctx={ctx} />}
      {tab === "pedidos" && <PlaceholderTab title="Pedidos" text="O módulo de pedidos ainda não foi construído. Quando existir, os pedidos desta empresa aparecem aqui." />}
      {tab === "financeiro" && <FinanceTab ctx={ctx} />}
      {tab === "integracoes" && <PlaceholderTab title="Integrações" text="Nenhuma integração disponível ainda (WhatsApp oficial, gateway de pagamento, marketplaces). Esta aba será ligada quando cada integração existir." />}
      {tab === "atividade" && <ActivityTab ctx={ctx} />}

      <StatusDialog org={org} target={statusTarget} onClose={() => setStatusTarget(null)} />
      {storeOpen && <CreateStoreModal organizationId={org.id} organizationName={org.name} onClose={() => setStoreOpen(false)} />}
      {inviteOpen && <InviteModal orgId={org.id} onClose={() => setInviteOpen(false)} />}
    </>
  );
}
