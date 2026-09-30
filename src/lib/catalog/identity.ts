export type VariantDraft = {
  attributes: Record<string, string>;
  sku?: string;
  internal_code?: string;
  gtin?: string;
  weight_grams?: number;
  dimensions?: Record<string, number>;
  is_active?: boolean;
};

export type VariantAxis = {
  code: string;
  values: readonly string[];
  is_variant?: boolean;
};
export type ExistingVariant<T = unknown> = {
  attributes: Record<string, string>;
  value: T;
};

/** Central guardrail for the administrative matrix preview and creation flow. */
export const MAX_VARIANT_COMBINATIONS = 100;

export const normalizeVariantValues = (values: readonly string[]) => {
  const seen = new Set<string>();
  return values.reduce<string[]>((result, value) => {
    const normalized = value.trim().replace(/\s+/g, " ");
    const key = normalized.toLocaleLowerCase("pt-BR");
    if (normalized && !seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
    return result;
  }, []);
};

const activeVariantAxes = (axes: readonly VariantAxis[]) =>
  axes
    .filter((axis) => axis.is_variant !== false)
    .map((axis) => ({ ...axis, values: normalizeVariantValues(axis.values) }));

export const variantCombinationCount = (axes: readonly VariantAxis[]) => {
  const active = activeVariantAxes(axes);
  if (!active.length) return 1;
  if (active.some((axis) => !axis.values.length)) return 0;
  return active.reduce((count, axis) => count * axis.values.length, 1);
};

export const variantAttributesKey = (attributes: Record<string, string>) =>
  Object.entries(attributes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, value]) => `${code}:${value.trim().toLocaleLowerCase("pt-BR")}`)
    .join("|");

export const buildVariantMatrix = (
  axes: readonly VariantAxis[],
  limit = MAX_VARIANT_COMBINATIONS,
): { count: number; exceedsLimit: boolean; variants: VariantDraft[] } => {
  const active = activeVariantAxes(axes);
  const count = variantCombinationCount(active);
  if (count > limit) return { count, exceedsLimit: true, variants: [] };
  if (count === 0) return { count, exceedsLimit: false, variants: [] };
  const variants = active.reduce<VariantDraft[]>(
    (rows, axis) =>
      rows.flatMap((row) =>
        axis.values.map((value) => ({
          ...row,
          attributes: { ...row.attributes, [axis.code]: value },
        })),
      ),
    [{ attributes: {} }],
  );
  return { count, exceedsLimit: false, variants };
};

export const newVariantCombinations = <T>(
  existing: readonly ExistingVariant<T>[],
  candidates: readonly VariantDraft[],
) => {
  const keys = new Set(existing.map((variant) => variantAttributesKey(variant.attributes)));
  return candidates.filter((candidate) => {
    const key = variantAttributesKey(candidate.attributes);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
};

/** Client-side preview only. Database trigger is the authoritative concurrent generator. */
export function variantMatrix(keys: { code: string; values: string[] }[]): VariantDraft[] {
  return keys.reduce<VariantDraft[]>(
    (rows, key) =>
      rows.flatMap((row) =>
        key.values
          .filter(Boolean)
          .map((value) => ({ ...row, attributes: { ...row.attributes, [key.code]: value } })),
      ),
    [{ attributes: {} }],
  );
}

export function isOfficialGtin(value: string) {
  return value === "" || /^\d{8,14}$/.test(value);
}
export function variantLabel(variant: VariantDraft) {
  const values = Object.values(variant.attributes);
  return values.length ? values.join(" / ") : "Padrão";
}
