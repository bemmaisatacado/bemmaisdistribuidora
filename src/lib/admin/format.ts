export const brl = (v: number | string | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));

export const num = (v: number | null | undefined) => new Intl.NumberFormat("pt-BR").format(v ?? 0);

export const dateTime = (v: string | null | undefined) =>
  v
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
        new Date(v),
      )
    : "—";

export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export const CAPABILITY_LABEL: Record<string, string> = {
  supply_products: "Fornece produtos",
  buy_wholesale: "Compra atacado",
  buy_mixed_wholesale: "Atacado variado",
  buy_closed_grade: "Grade fechada",
  use_dropshipping: "Usa Drop",
  sell_retail: "Vende varejo",
  sell_wholesale: "Vende atacado",
  operate_store: "Opera loja",
};

export const MODALITY_LABEL: Record<string, string> = {
  drop: "Drop",
  mixed_wholesale: "Atacado variado",
  closed_grade: "Grade fechada",
  retail: "Varejo",
  wholesale: "Atacado",
};

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  active: "Ativo",
  suspended: "Suspenso",
  blocked: "Bloqueado",
  invited: "Convidado",
  archived: "Arquivado",
  draft: "Rascunho",
  pending_review: "Em análise",
  approved: "Aprovado",
  rejected: "Rejeitado",
  paused: "Pausado",
  disabled: "Desativado",
  paid: "Pago",
  failed: "Falhou",
  processing: "Processando",
  cancelled: "Cancelado",
  available: "Disponível",
  settled: "Liquidado",
  retail: "Varejo",
  wholesale: "Atacado",
  hybrid: "Híbrido",
};

export const PAGE_SIZE = 20;
export const pageRange = (page: number) =>
  [page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1] as const;
