import type { LucideIcon } from "lucide-react";
import { Factory, ShoppingBag, Truck, Shuffle, Boxes, Store, Tag, Building } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

export type Cap = Database["public"]["Enums"]["org_capability"];
export type OrgStatus = Database["public"]["Enums"]["org_status"];
export type OrgRow = Database["public"]["Tables"]["organizations"]["Row"];
export type OrgCtx = { org: OrgRow; caps: Cap[]; managerName: string | null };

/** Descriptive copy only — authorization never relies on these texts. */
export const CAPABILITY_INFO: Record<Cap, { title: string; desc: string; profile: string; icon: LucideIcon }> = {
  supply_products: { title: "Fornecedor", desc: "Pode disponibilizar produtos no ecossistema.", profile: "fornece produtos", icon: Factory },
  buy_wholesale: { title: "Compra atacado", desc: "Pode comprar no atacado da BemMais.", profile: "compra no atacado", icon: ShoppingBag },
  use_dropshipping: { title: "Drop", desc: "Pode operar produtos através de dropshipping.", profile: "aceita Drop", icon: Truck },
  buy_mixed_wholesale: { title: "Atacado variado", desc: "Pode comprar/vender utilizando regras de atacado variado.", profile: "compra atacado variado", icon: Shuffle },
  buy_closed_grade: { title: "Grade fechada", desc: "Pode operar grades fechadas.", profile: "compra grade fechada", icon: Boxes },
  sell_retail: { title: "Varejo", desc: "Pode vender ao consumidor final.", profile: "vende no varejo", icon: Tag },
  sell_wholesale: { title: "Atacado", desc: "Pode vender para outras empresas.", profile: "vende no atacado", icon: Building },
  operate_store: { title: "Loja", desc: "Pode possuir loja dentro da plataforma.", profile: "opera loja", icon: Store },
};

export const CAP_ORDER: Cap[] = ["supply_products", "buy_wholesale", "use_dropshipping", "buy_mixed_wholesale", "buy_closed_grade", "sell_retail", "sell_wholesale", "operate_store"];

export const ORG_STATUSES: OrgStatus[] = ["pending", "active", "suspended", "blocked", "archived"];
export const ORG_STATUS_LABEL: Record<OrgStatus, string> = { pending: "Pendente", active: "Ativa", suspended: "Suspensa", blocked: "Bloqueada", archived: "Arquivada" };
export const ORG_STATUS_HELP: Record<OrgStatus, string> = {
  pending: "Aguardando validação. Nenhum dado é alterado.",
  active: "A empresa volta a operar normalmente.",
  suspended: "Operação pausada temporariamente. Nenhum dado é apagado.",
  blocked: "Bloqueio por risco ou irregularidade. Nenhum dado é apagado.",
  archived: "Empresa encerrada. Todo o histórico é preservado.",
};

export const ROLE_OPTIONS = [
  { key: "org_owner", label: "Proprietário" },
  { key: "org_manager", label: "Gerente" },
  { key: "org_operator", label: "Operador" },
  { key: "org_viewer", label: "Visualizador" },
] as const;

export const PROFILE_OPTIONS = [
  { key: "supplier", label: "Fornecedor" },
  { key: "client", label: "Cliente BemMais" },
  { key: "hybrid", label: "Fornecedor + Cliente" },
  { key: "none", label: "Sem capacidades" },
] as const;

export const NOTE_KIND: Record<string, string> = { general: "Geral", negotiation: "Negociação", pending: "Pendência", operational: "Operacional" };

export const ENTITY_LABEL: Record<string, string> = {
  organizations: "Empresa", organization_members: "Membro", organization_capabilities: "Capacidade", stores: "Loja",
  organization_notes: "Nota interna", organization_tag_links: "Tag", organization_invitations: "Convite", payment_accounts: "Conta recebedora",
  products: "Produto", supplier_offers: "Oferta",
};

export function profileSummary(caps: Cap[]): string {
  const supplier = caps.includes("supply_products");
  const client = caps.some((c) => c !== "supply_products");
  if (supplier && client) return "Fornecedor + Cliente";
  if (supplier) return "Fornecedor";
  if (client) return "Cliente BemMais";
  return "Sem perfil";
}

export const onlyDigits = (s: string) => s.replace(/\D/g, "");

export function formatDocument(v: string | null | undefined) {
  if (!v) return "";
  const d = onlyDigits(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return v;
}

/** Brazilian CPF/CNPJ check-digit validation. */
export function isValidDocument(v: string): boolean {
  const d = onlyDigits(v);
  if (/^(\d)\1+$/.test(d)) return false;
  if (d.length === 11) {
    const calc = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
  }
  if (d.length === 14) {
    const calc = (n: number) => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * w[i]!; const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
  }
  return false;
}

export const maskTail = (v: string | null | undefined, keep = 4) => (!v ? "—" : v.length <= keep ? v : `${"•".repeat(Math.min(6, v.length - keep))}${v.slice(-keep)}`);

export const UF = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
