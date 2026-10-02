export type ProductLifecycleStatus =
  "draft" | "pending_review" | "approved" | "rejected" | "active" | "paused" | "archived";

export type ProductLifecycleAction = {
  target: ProductLifecycleStatus;
  label: string;
  requiresReason?: boolean;
  sensitive?: boolean;
};

const TRANSITIONS: Record<ProductLifecycleStatus, ProductLifecycleAction[]> = {
  draft: [{ target: "pending_review", label: "Enviar para análise" }],
  pending_review: [
    { target: "approved", label: "Aprovar" },
    { target: "rejected", label: "Rejeitar", requiresReason: true, sensitive: true },
  ],
  approved: [{ target: "active", label: "Ativar" }],
  rejected: [{ target: "draft", label: "Voltar para rascunho" }],
  active: [
    { target: "paused", label: "Pausar", sensitive: true },
    { target: "archived", label: "Arquivar", sensitive: true },
  ],
  paused: [
    { target: "active", label: "Reativar" },
    { target: "archived", label: "Arquivar", sensitive: true },
  ],
  archived: [],
};

export const availableProductLifecycleActions = (status: ProductLifecycleStatus) =>
  TRANSITIONS[status];

export const isValidProductLifecycleTransition = (
  current: ProductLifecycleStatus,
  target: ProductLifecycleStatus,
) => availableProductLifecycleActions(current).some((action) => action.target === target);

export type ActivationVariant = {
  isActive: boolean;
  sku: string | null | undefined;
  internalCode: string | null | undefined;
};

export type ActivationProduct = {
  name: string;
  categoryId: string | null;
  variants: ActivationVariant[];
};

export const productActivationRequirements = ({
  name,
  categoryId,
  variants,
}: ActivationProduct): string[] => {
  const errors: string[] = [];
  if (!name.trim()) errors.push("Informe o nome do produto.");
  if (!categoryId) errors.push("Selecione uma categoria antes de ativar.");
  const activeVariants = variants.filter((variant) => variant.isActive);
  if (!activeVariants.length) errors.push("Mantenha pelo menos uma variante/SKU ativa.");
  if (activeVariants.some((variant) => !variant.sku?.trim() || !variant.internalCode?.trim())) {
    errors.push("Toda variante ativa precisa ter SKU BemMais e código interno.");
  }
  return errors;
};

export const lifecycleActionByTarget = (
  current: ProductLifecycleStatus,
  target: ProductLifecycleStatus,
) => availableProductLifecycleActions(current).find((action) => action.target === target) ?? null;

export const lifecycleTransitionRequest = (
  productId: string,
  expectedStatus: ProductLifecycleStatus,
  targetStatus: ProductLifecycleStatus,
  reason?: string,
) => {
  if (!isValidProductLifecycleTransition(expectedStatus, targetStatus)) {
    throw new Error("Transição de lifecycle inválida.");
  }
  return {
    _product_id: productId,
    _expected_status: expectedStatus,
    _target_status: targetStatus,
    _reason: reason?.trim() || undefined,
  };
};

/** Lifecycle changes only status; commercial references remain attached to the Product Master. */
export const archivedProductPreservesReferences = <T extends { status: ProductLifecycleStatus }>(
  product: T,
) => ({ ...product, status: "archived" as const });
