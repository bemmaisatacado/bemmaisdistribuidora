export type VariantDraft = {
  attributes: Record<string, string>;
  sku?: string;
  internal_code?: string;
  gtin?: string;
  weight_grams?: number;
  dimensions?: Record<string, number>;
  is_active?: boolean;
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
