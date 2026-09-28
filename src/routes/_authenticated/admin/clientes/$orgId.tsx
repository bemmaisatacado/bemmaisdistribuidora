import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, Pencil, UserPlus, Store, ToggleRight, MoreHorizontal, StickyNote, Hash, UserCog, Activity, Lock, ExternalLink } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { EntityHeader, Btn, Badge, Empty, Panel } from "@/components/admin/ui";
import { StatusDialog } from "@/components/admin/orgs/StatusDialog";
import { CreateStoreModal } from "@/components/admin/orgs/CreateStoreModal";
import {
  MembersTab, CapabilitiesTab, StoresTab, ProductsTab, FinanceTab, ActivityTab, InviteModal, DataTab,
} from "@/components/admin/orgs/OrgTabs";
import { Customer360View, RelationshipTab } from "@/components/admin/customers/CustomerPanels";
import { ORG_STATUSES, ORG_STATUS_LABEL, formatDocument, type OrgCtx, type OrgStatus } from "@/lib/admin/orgs";
import { COMMERCIAL_LABEL, COMMERCIAL_TONE, OPERATION_OPTIONS, useCustomer360 } from "@/lib/admin/customers";
import { cn } from "@/lib/utils";

const TABS = [
  ["resumo", "Resumo"], ["relacionamento", "Relacionamento"], ["loja", "Loja"], ["produtos", "Produtos"],
  ["compras", "Compras"], ["vendas", "Vendas"], ["financeiro", "Financeiro"], ["usuarios", "Usuários"],
  ["permissoes", "Capacidades"], ["dados", "Dados"], ["atividade", "Atividade"],
] as const;
type Tab = (typeof TABS)[number][0];
const TAB_KEYS = TABS.map((t) => t[0]) as [Tab, ...Tab[]];

export const Route = createFileRoute("/_authenticated/admin/clientes/$orgId")({
  validateSearch: z.object({ tab: z.enum(TAB_KEYS).catch("resumo").default("resumo") }),
  component: CustomerProfile,
});

function CustomerProfile() {
  const { orgId } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const go = (t: Tab) => navigate({ search: { tab: t } });
  const [statusTarget, setStatusTarget] = useState<OrgStatus | null>(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

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
  const c360 = useCustomer360(orgId);

  if (q.isLoading || c360.isLoading) return <div className="grid gap-4"><div className="h-40 animate-pulse rounded-2xl bg-secondary" /><div className="h-64 animate-pulse rounded-2xl bg-secondary" /></div>;
  if (q.error || c360.error) return <Empty text="Não foi possível carregar este cliente." />;
  if (!q.data || !c360.data)
    return <Empty text="Cliente não encontrado." action={<Link to="/admin/clientes"><Btn variant="outline" tabIndex={-1}>Voltar para Clientes</Btn></Link>} />;

  const c = c360.data;
  const ctx: OrgCtx = { org: q.data.org, caps: q.data.caps, managerName: c.relationship.manager_name };
  const { org, caps } = ctx;
  const rs = c.relationship.commercial_status;

  return (
    <>
      <Link to="/admin/clientes" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" /> Clientes</Link>
      <EntityHeader
        name={org.name} src={org.logo_url} status={org.status}
        meta={
          <>
            {org.legal_name && <span>{org.legal_name}</span>}
            <span className="inline-flex items-center gap-1"><Hash className="h-3 w-3" />{formatDocument(org.document) || "Sem documento"}</span>
            <span className="inline-flex items-center gap-1"><UserCog className="h-3 w-3" />Resp. BemMais: {c.relationship.manager_name ?? "—"}</span>
            <Badge value={rs} tone={COMMERCIAL_TONE[rs]} label={`Relacionamento: ${COMMERCIAL_LABEL[rs]}`} />
          </>
        }
        actions={
          <>
            <Btn variant="outline" onClick={() => go("dados")}><Pencil className="h-4 w-4" /> Editar</Btn>
            {c.operation.stores ? <Btn variant="outline" onClick={() => go("loja")}><Store className="h-4 w-4" /> Abrir loja</Btn> : <Btn variant="outline" onClick={() => setStoreOpen(true)}><Store className="h-4 w-4" /> Criar loja</Btn>}
            <Btn variant="outline" onClick={() => setInviteOpen(true)}><UserPlus className="h-4 w-4" /> Enviar convite</Btn>
            <Btn variant="outline" onClick={() => go("permissoes")}><ToggleRight className="h-4 w-4" /> Capacidades</Btn>
            <Btn onClick={() => go("relacionamento")}><StickyNote className="h-4 w-4" /> Adicionar nota</Btn>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Btn variant="dark" aria-label="Mais ações"><MoreHorizontal className="h-4 w-4" /></Btn></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">Status técnico</DropdownMenuLabel>
                {ORG_STATUSES.filter((s) => s !== org.status).map((s) => <DropdownMenuItem key={s} onSelect={() => setStatusTarget(s)}>{ORG_STATUS_LABEL[s]}</DropdownMenuItem>)}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/admin/empresas/$orgId" params={{ orgId }} search={{ tab: "resumo" }}><ExternalLink className="h-4 w-4" /> Ver como empresa</Link></DropdownMenuItem>
                <DropdownMenuItem onSelect={() => go("atividade")}><Activity className="h-4 w-4" /> Ver auditoria</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        <div className="flex flex-wrap gap-1.5 px-5 pb-4">
          {OPERATION_OPTIONS.filter((o) => caps.includes(o.cap)).map((o) => (
            <span key={o.cap} className="rounded-md bg-surface-dark px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-ink-foreground">{o.short}</span>
          ))}
          {!OPERATION_OPTIONS.some((o) => caps.includes(o.cap)) && <Badge value="none" tone="warn" label="Nenhuma modalidade habilitada" />}
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-border-subtle px-3" aria-label="Seções do cliente">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => go(k)} aria-current={tab === k ? "page" : undefined}
              className={cn("relative whitespace-nowrap px-3 py-3 text-sm font-semibold transition-colors", tab === k ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {l}{tab === k && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </nav>
      </EntityHeader>

      {tab === "resumo" && <Customer360View ctx={ctx} c={c} go={go} />}
      {tab === "relacionamento" && <RelationshipTab key={JSON.stringify(c.relationship)} ctx={ctx} c={c} />}
      {tab === "loja" && (c.operation.stores ? <StoresTab ctx={ctx} onCreate={() => setStoreOpen(true)} /> : (
        <Panel><Empty text="Este cliente ainda não possui uma loja." icon={Store} action={<Btn onClick={() => setStoreOpen(true)}><Store className="h-4 w-4" /> Criar loja para o cliente</Btn>} /></Panel>
      ))}
      {tab === "produtos" && <ProductsTab ctx={ctx} />}
      {tab === "compras" && <FutureTab title="Compras" text="As compras do cliente na BemMais (Drop, atacado variado e grade) aparecerão aqui quando o módulo Pedidos estiver ativo." />}
      {tab === "vendas" && <FutureTab title="Vendas" text="As vendas da loja do cliente para os consumidores aparecerão aqui quando o módulo Pedidos estiver ativo." />}
      {tab === "financeiro" && <FinanceTab ctx={ctx} />}
      {tab === "usuarios" && <MembersTab ctx={ctx} onInvite={() => setInviteOpen(true)} />}
      {tab === "permissoes" && <CapabilitiesTab ctx={ctx} />}
      {tab === "dados" && <DataTab ctx={ctx} />}
      {tab === "atividade" && <ActivityTab ctx={ctx} />}

      <StatusDialog org={org} target={statusTarget} onClose={() => setStatusTarget(null)} />
      {storeOpen && <CreateStoreModal organizationId={org.id} organizationName={org.name} onClose={() => setStoreOpen(false)} />}
      {inviteOpen && <InviteModal orgId={org.id} onClose={() => setInviteOpen(false)} />}
    </>
  );
}

function FutureTab({ title, text }: { title: string; text: string }) {
  return (
    <Panel>
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-secondary"><Lock className="h-5 w-5 text-muted-foreground" /></span>
        <h3 className="font-display font-bold">{title}</h3>
        <p className="max-w-md text-sm text-muted-foreground">{text}</p>
      </div>
    </Panel>
  );
}

