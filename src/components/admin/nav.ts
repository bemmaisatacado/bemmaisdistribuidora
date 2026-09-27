import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard, Radar, Building2, Users, Factory, Store, UserCog, Package, FolderTree, Tag, Handshake,
  Layers, Percent, Boxes, BadgePercent, ShoppingCart, Truck, MapPin, AlertTriangle, Wallet, ArrowLeftRight,
  Split, Clock, Send, Landmark, Scale, Receipt, FileBarChart, Megaphone, FileText, GraduationCap, Sparkles,
  Workflow, Lightbulb, CreditCard, Plug, ShieldCheck, ScrollText, Settings,
} from "lucide-react";

/** `to` = built screen; `soon` = future module (splat route, no invented data). */
export type NavItem = { label: string; icon: LucideIcon } & ({ to: string } | { soon: string });
export type NavSection = { title: string; items: NavItem[] };

export const ADMIN_NAV: NavSection[] = [
  { title: "Visão geral", items: [
    { label: "Dashboard", icon: LayoutDashboard, to: "/admin" },
    { label: "Central Operacional", icon: Radar, to: "/admin/operacional" },
  ]},
  { title: "Ecossistema", items: [
    { label: "Empresas", icon: Building2, to: "/admin/empresas" },
    { label: "Clientes BemMais", icon: Users, to: "/admin/clientes" },
    { label: "Fornecedores", icon: Factory, to: "/admin/fornecedores" },
    { label: "Lojas", icon: Store, to: "/admin/lojas" },
    { label: "Usuários & Equipe", icon: UserCog, to: "/admin/usuarios" },
  ]},
  { title: "Catálogo", items: [
    { label: "Produtos", icon: Package, to: "/admin/produtos" },
    { label: "Categorias", icon: FolderTree, to: "/admin/categorias" },
    { label: "Marcas", icon: Tag, to: "/admin/marcas" },
    { label: "Ofertas", icon: Handshake, to: "/admin/ofertas" },
    { label: "Modalidades", icon: Layers, to: "/admin/modalidades" },
  ]},
  { title: "Comercial", items: [
    { label: "Preços & Margens", icon: Percent, to: "/admin/precos" },
    { label: "Estoque", icon: Boxes, to: "/admin/estoque" },
    { label: "Promoções", icon: BadgePercent, soon: "promocoes" },
  ]},
  { title: "Operação", items: [
    { label: "Pedidos", icon: ShoppingCart, soon: "pedidos" },
    { label: "Fulfillments", icon: Truck, soon: "fulfillments" },
    { label: "Logística", icon: MapPin, soon: "logistica" },
    { label: "Ocorrências", icon: AlertTriangle, soon: "ocorrencias" },
  ]},
  { title: "Financeiro", items: [
    { label: "Visão Geral", icon: Wallet, to: "/admin/financeiro" },
    { label: "Transações", icon: ArrowLeftRight, to: "/admin/financeiro/transacoes" },
    { label: "Allocations", icon: Split, to: "/admin/financeiro/allocations" },
    { label: "Recebíveis", icon: Clock, to: "/admin/financeiro/recebiveis" },
    { label: "Repasses", icon: Send, to: "/admin/financeiro/repasses" },
    { label: "Contas Recebedoras", icon: Landmark, to: "/admin/financeiro/contas" },
    { label: "Conciliação", icon: Scale, soon: "conciliacao" },
    { label: "Taxas", icon: Receipt, soon: "taxas" },
    { label: "Relatórios", icon: FileBarChart, to: "/admin/financeiro/ledger" },
  ]},
  { title: "Crescimento", items: [
    { label: "Marketing", icon: Megaphone, soon: "marketing" },
    { label: "Conteúdos", icon: FileText, soon: "conteudos" },
    { label: "Academy", icon: GraduationCap, soon: "academy" },
  ]},
  { title: "Inteligência", items: [
    { label: "Central de IA", icon: Sparkles, to: "/admin/ia" },
    { label: "Automações", icon: Workflow, soon: "automacoes" },
    { label: "Insights", icon: Lightbulb, soon: "insights" },
  ]},
  { title: "Plataforma", items: [
    { label: "Planos", icon: CreditCard, soon: "planos" },
    { label: "Integrações", icon: Plug, soon: "integracoes" },
    { label: "Permissões", icon: ShieldCheck, to: "/admin/permissoes" },
    { label: "Auditoria", icon: ScrollText, to: "/admin/auditoria" },
    { label: "Configurações", icon: Settings, to: "/admin/configuracoes" },
  ]},
];
