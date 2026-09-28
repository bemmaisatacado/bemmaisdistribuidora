import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Modality = Database["public"]["Enums"]["commercial_modality"];
export type SupplierProfile = Database["public"]["Tables"]["supplier_profiles"]["Row"];
export type SupplierRelationship = Database["public"]["Tables"]["supplier_relationships"]["Row"];

export const SUPPLIER_TYPES = [
  ["factory", "Fábrica"],
  ["distributor", "Distribuidora"],
  ["wholesaler", "Atacadista"],
  ["importer", "Importador"],
  ["representative", "Representante"],
  ["other", "Outro"],
] as const;
export const SUPPLIER_TYPE_LABEL: Record<string, string> = Object.fromEntries(SUPPLIER_TYPES);

export const RELATIONSHIP = [
  ["prospeccao", "Prospecção"],
  ["onboarding", "Onboarding"],
  ["ativo", "Ativo"],
  ["pausado", "Pausado"],
  ["inativo", "Inativo"],
] as const;
export const RELATIONSHIP_LABEL: Record<string, string> = Object.fromEntries(RELATIONSHIP);
export const RELATIONSHIP_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "neutral"> = {
  prospeccao: "info",
  onboarding: "warn",
  ativo: "ok",
  pausado: "neutral",
  inativo: "bad",
};

/** Modalities a supplier can serve (stored on supplier_profiles.modalities). */
export const SUPPLY_MODALITIES: { key: Modality; label: string; short: string }[] = [
  { key: "drop", label: "Drop", short: "Drop" },
  { key: "mixed_wholesale", label: "Atacado variado", short: "Variado" },
  { key: "closed_grade", label: "Grade fechada", short: "Grade" },
  { key: "retail", label: "Venda unitária", short: "Unitária" },
];
export const MODALITY_SHORT: Record<string, string> = Object.fromEntries(
  SUPPLY_MODALITIES.map((m) => [m.key, m.short]),
);

export const FULFILLMENT = [
  ["supplier", "Fornecedor despacha"],
  ["bemmais", "BemMais despacha"],
  ["third_party", "Terceiro despacha"],
] as const;
export const FULFILLMENT_LABEL: Record<string, string> = Object.fromEntries(FULFILLMENT);

export const PAYOUT_METHODS = [
  ["pix", "Pix"],
  ["gateway", "Conta / gateway"],
  ["other", "Manual / outro"],
] as const;
export const PAYOUT_LABEL: Record<string, string> = Object.fromEntries(PAYOUT_METHODS);

export const FINANCE_STATUS = [
  ["not_configured", "Não configurado"],
  ["pending", "Pendente"],
  ["approved", "Aprovado"],
  ["active", "Ativo"],
  ["problem", "Com problema"],
  ["blocked", "Bloqueado"],
] as const;
export const FINANCE_STATUS_LABEL: Record<string, string> = Object.fromEntries(FINANCE_STATUS);
export const FINANCE_STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "info" | "neutral"> = {
  not_configured: "neutral",
  pending: "warn",
  approved: "info",
  active: "ok",
  problem: "bad",
  blocked: "bad",
};

export const PIX_KEY_TYPES = [
  ["cpf", "CPF"],
  ["cnpj", "CNPJ"],
  ["email", "E-mail"],
  ["phone", "Telefone"],
  ["random", "Chave aleatória"],
] as const;

export const DOMAIN_STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando configuração",
  verifying: "Verificando",
  active: "Ativo",
  error: "Erro",
};
export const DOMAIN_STATUS_TONE: Record<string, "ok" | "warn" | "bad" | "info"> = {
  pending: "warn",
  verifying: "info",
  active: "ok",
  error: "bad",
};
export const PLATFORM_DOMAIN = "bemmaisdistribuidora.com.br";

export type SupplierRow = {
  id: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  city: string | null;
  state: string | null;
  status: string;
  logo_url: string | null;
  created_at: string;
  supplier_type: string | null;
  modalities: string[];
  relationship_status: string | null;
  manager_id: string | null;
  manager_name: string | null;
  caps: string[];
  products_count: number;
  offers_count: number;
  offers_active: number;
  stores_count: number;
  last_activity: string | null;
};

export type Supplier360 = {
  profile: SupplierProfile | null;
  relationship: (SupplierRelationship & { manager_name: string | null }) | null;
  categories: string[];
  operation: {
    products: number;
    skus: number;
    offers: number;
    offers_active: number;
    offers_pending: number;
    offers_rejected: number;
    on_hand: number;
    reserved: number;
    negative_skus: number;
    stores: number;
  };
  finance: {
    active_accounts: number;
    accounts: number;
    receivables_open: number;
    payouts_pending: number;
    payouts_paid: number;
  };
  access: { members: number; invites_pending: number; last_sign_in: string | null };
  last_activity: string | null;
};

export function useSupplier360(orgId: string) {
  return useQuery({
    queryKey: ["supplier-360", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("supplier_360", { _org: orgId });
      if (error) throw error;
      return data as unknown as Supplier360 | null;
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
}

/** Validates a store subdomain label: lowercase, 3–50 chars, not reserved. */
const RESERVED = new Set(
  "www admin app api login entrar cadastro criar-conta mail email smtp imap pop ftp suporte ajuda help checkout pagamento pagamentos financeiro bemmais bemmaisdistribuidora static cdn assets img media dev staging test painel dashboard loja lojas store stores status blog docs auth oauth webhook webhooks ns1 ns2 root sistema fornecedor fornecedores academy".split(
    " ",
  ),
);
export function subdomainError(slug: string): string | null {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(slug))
    return "Use 3 a 50 letras minúsculas, números ou hífen (sem começar/terminar com hífen).";
  if (slug.includes("--")) return "Evite hífens seguidos.";
  if (RESERVED.has(slug)) return "Este nome é reservado pelo sistema.";
  return null;
}
export const isHostname = (h: string) =>
  /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(h.trim().toLowerCase());
