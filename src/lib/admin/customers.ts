import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Cap } from "@/lib/admin/orgs";

export type CommercialStatus = Database["public"]["Enums"]["customer_status"];

export const COMMERCIAL_STATUSES: CommercialStatus[] = [
  "novo",
  "onboarding",
  "ativo",
  "inativo",
  "em_risco",
];
export const COMMERCIAL_LABEL: Record<CommercialStatus, string> = {
  novo: "Novo",
  onboarding: "Onboarding",
  ativo: "Ativo",
  inativo: "Inativo",
  em_risco: "Em risco",
};
export const COMMERCIAL_TONE: Record<CommercialStatus, "ok" | "warn" | "bad" | "info" | "neutral"> =
  {
    novo: "info",
    onboarding: "warn",
    ativo: "ok",
    inativo: "neutral",
    em_risco: "bad",
  };

export const INTERACTION_KINDS = [
  ["ligacao", "Ligação"],
  ["whatsapp", "WhatsApp"],
  ["reuniao", "Reunião"],
  ["observacao", "Observação"],
  ["followup", "Follow-up"],
  ["outro", "Outro"],
] as const;
export const INTERACTION_LABEL: Record<string, string> = Object.fromEntries(INTERACTION_KINDS);

export const ORIGINS = [
  "Indicação",
  "Instagram",
  "WhatsApp",
  "Site",
  "Evento",
  "Equipe comercial",
  "Outro",
];

/** "How will this customer operate?" — each answer maps to a real capability. */
export const OPERATION_OPTIONS: { cap: Cap; label: string; short: string }[] = [
  { cap: "use_dropshipping", label: "Vender sem estoque / Drop", short: "Drop" },
  { cap: "buy_mixed_wholesale", label: "Comprar produtos variados", short: "Variado" },
  { cap: "buy_closed_grade", label: "Comprar grades fechadas", short: "Grade" },
  { cap: "sell_retail", label: "Vender no varejo", short: "Varejo" },
  { cap: "sell_wholesale", label: "Vender no atacado", short: "Atacado" },
  { cap: "operate_store", label: "Ter loja virtual", short: "Loja" },
  { cap: "own_inventory", label: "Ter estoque próprio", short: "Estoque próprio" },
];
export const CAP_SHORT: Partial<Record<string, string>> = Object.fromEntries(
  OPERATION_OPTIONS.map((o) => [o.cap, o.short]),
);

export const JOURNEY_LABEL: Record<string, string> = {
  registered: "Cadastrado",
  access: "Acesso ativado",
  store: "Loja criada",
  first_product: "Primeiro produto",
  first_order: "Primeiro pedido",
  active: "Cliente ativo",
  growing: "Em crescimento",
};

export const PENDENCY_LABEL: Record<string, { title: string; level: "attention" | "pending" }> = {
  access: { title: "Acesso ainda não ativado (sem usuários nem convite)", level: "pending" },
  invite: { title: "Convite pendente de aceite", level: "pending" },
  no_store: { title: "Habilitado para loja, mas ainda sem loja", level: "pending" },
  store_draft: { title: "Loja em rascunho", level: "pending" },
  no_account: { title: "Valores a receber sem conta de recebimento ativa", level: "attention" },
  incomplete: { title: "Cadastro incompleto (documento ou contato)", level: "pending" },
  followup_late: { title: "Follow-up vencido", level: "attention" },
  next_action_late: { title: "Próxima ação vencida", level: "attention" },
};

export type Customer360 = {
  relationship: {
    exists: boolean;
    since: string;
    origin: string | null;
    manager_id: string | null;
    manager_name: string | null;
    commercial_status: CommercialStatus;
    next_action: string | null;
    next_action_at: string | null;
    next_action_owner_id: string | null;
    next_action_owner_name: string | null;
    last_activity: string | null;
  };
  operation: {
    members: number;
    invites_pending: number;
    stores: number;
    stores_active: number;
    stores_draft: number;
    listings: number;
    products: number;
  };
  finance: {
    receivables_open: number;
    payouts_open: number;
    active_accounts: number;
    paid_payments: number;
  };
  journey: { key: string; done: boolean; future?: boolean; at?: string }[];
  pendencies: { key: string }[];
};

export type CustomerRow = {
  id: string;
  name: string;
  legal_name: string | null;
  document: string | null;
  email: string | null;
  whatsapp: string | null;
  city: string | null;
  state: string | null;
  status: string;
  logo_url: string | null;
  created_at: string;
  commercial_status: CommercialStatus;
  manager_id: string | null;
  manager_name: string | null;
  origin: string | null;
  next_action: string | null;
  next_action_at: string | null;
  caps: string[];
  stores_count: number;
  stores_active: number;
  invites_pending: number;
  members_active: number;
};

export type TimelineItem = {
  type: "interaction" | "note" | "followup";
  id: string;
  sub: string;
  body: string;
  at: string;
  author: string | null;
  next_action: string | null;
  next_action_at: string | null;
};

export function useCustomer360(orgId: string) {
  return useQuery({
    queryKey: ["customer-360", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("customer_360", { _org: orgId });
      if (error) throw error;
      return data as unknown as Customer360 | null;
    },
  });
}

export function usePlatformTeam() {
  return useQuery({
    queryKey: ["platform-team"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_team");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 300_000,
  });
}

export function useOrgTags() {
  return useQuery({
    queryKey: ["org-tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("org_tags").select("id,name,color").order("name");
      if (error) throw error;
      return data;
    },
  });
}

export const isLate = (d: string | null | undefined) =>
  !!d && d < new Date().toISOString().slice(0, 10);
export const shortDate = (d: string | null | undefined) =>
  d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("pt-BR") : "—";
