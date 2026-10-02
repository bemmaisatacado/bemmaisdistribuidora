export type ProductInventoryVariant = {
  id: string;
  sku: string;
  attributes: Record<string, string>;
};

export type ProductInventoryBalance = {
  organizationId: string;
  organizationName: string | null;
  variantId: string;
  onHand: number | null;
  reserved: number | null;
};

export type ProductInventoryMovement = {
  id: number;
  variantId: string;
  organizationName: string | null;
  movementType: "in" | "out" | "reserve" | "release" | "adjust" | "return";
  quantity: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
};

export type ProductInventoryPosition = ProductInventoryBalance & {
  available: number;
  isZero: boolean;
  hasDivergence: boolean;
};

export type ProductInventoryVariantSummary = ProductInventoryVariant & {
  positions: ProductInventoryPosition[];
  hasPosition: boolean;
};

export type ProductInventorySummary = {
  onHand: number;
  reserved: number;
  available: number;
  skusWithPosition: number;
  skusWithoutPosition: number;
  divergences: number;
};

const balanceNumber = (value: number | null) => value ?? 0;

export const inventoryAvailable = (onHand: number | null, reserved: number | null) =>
  balanceNumber(onHand) - balanceNumber(reserved);

export const inventoryPosition = (balance: ProductInventoryBalance): ProductInventoryPosition => {
  const onHand = balanceNumber(balance.onHand);
  const reserved = balanceNumber(balance.reserved);
  const available = inventoryAvailable(onHand, reserved);
  return {
    ...balance,
    onHand,
    reserved,
    available,
    isZero: onHand === 0 && reserved === 0 && available === 0,
    hasDivergence: onHand < 0 || reserved < 0 || available < 0,
  };
};

export const contextualProductInventory = (
  variants: readonly ProductInventoryVariant[],
  balances: readonly ProductInventoryBalance[],
) => {
  const positions = balances.map(inventoryPosition);
  const rows: ProductInventoryVariantSummary[] = variants.map((variant) => {
    const variantPositions = positions.filter((position) => position.variantId === variant.id);
    return { ...variant, positions: variantPositions, hasPosition: variantPositions.length > 0 };
  });
  const summary: ProductInventorySummary = positions.reduce(
    (totals, position) => ({
      onHand: totals.onHand + position.onHand,
      reserved: totals.reserved + position.reserved,
      available: totals.available + position.available,
      skusWithPosition: totals.skusWithPosition,
      skusWithoutPosition: totals.skusWithoutPosition,
      divergences: totals.divergences + Number(position.hasDivergence),
    }),
    {
      onHand: 0,
      reserved: 0,
      available: 0,
      skusWithPosition: rows.filter((row) => row.hasPosition).length,
      skusWithoutPosition: rows.filter((row) => !row.hasPosition).length,
      divergences: 0,
    },
  );
  return { rows, summary };
};

export const productInventoryMovements = (
  variants: readonly ProductInventoryVariant[],
  movements: readonly ProductInventoryMovement[],
) => {
  const skuByVariant = new Map(variants.map((variant) => [variant.id, variant.sku]));
  return movements
    .filter((movement) => skuByVariant.has(movement.variantId))
    .map((movement) => ({ ...movement, sku: skuByVariant.get(movement.variantId) ?? "—" }));
};
