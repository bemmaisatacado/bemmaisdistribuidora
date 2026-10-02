import { productSlug } from "../product-master.ts";

export type ProductDuplicateInput = {
  name: string;
  brandId: string | null;
  reference: string | null;
  categoryId: string | null;
  gtin: string | null;
};

export type ProductDuplicateCandidate = {
  id: string;
  name: string;
  status: string;
  brand_id: string | null;
  brand_name: string | null;
  category_id: string | null;
  category_name: string | null;
  reference: string | null;
  image_path: string | null;
  matching_gtin: string | null;
  score: number;
  gtin_match: boolean;
};

export const normalizeProductDuplicateName = (value: string) => productSlug(value);

const normalizeReference = (value: string | null) => productSlug(value ?? "");

export const duplicateSignals = (
  input: ProductDuplicateInput,
  candidate: ProductDuplicateCandidate,
) => {
  const sameGtin =
    candidate.gtin_match ||
    Boolean(input.gtin?.trim() && input.gtin.trim() === candidate.matching_gtin);
  const sameReference = Boolean(
    input.reference?.trim() &&
    candidate.reference?.trim() &&
    normalizeReference(input.reference) === normalizeReference(candidate.reference),
  );
  const sameName =
    Boolean(input.name.trim()) &&
    normalizeProductDuplicateName(input.name) === normalizeProductDuplicateName(candidate.name);
  const sameBrand = Boolean(input.brandId && input.brandId === candidate.brand_id);
  const sameCategory = Boolean(input.categoryId && input.categoryId === candidate.category_id);
  return { sameGtin, sameReference, sameName, sameBrand, sameCategory };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** Narrows the RPC response before it reaches the Product Wizard UI. */
export const readProductDuplicateCandidates = (value: unknown): ProductDuplicateCandidate[] => {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = readString(item.id);
    const name = readString(item.name);
    const status = readString(item.status);
    const score = item.score;
    const gtinMatch = item.gtin_match;
    if (!id || !name || !status || typeof score !== "number" || typeof gtinMatch !== "boolean")
      return [];

    return [
      {
        id,
        name,
        status,
        brand_id: readString(item.brand_id),
        brand_name: readString(item.brand_name),
        category_id: readString(item.category_id),
        category_name: readString(item.category_name),
        reference: readString(item.reference),
        image_path: readString(item.image_path),
        matching_gtin: readString(item.matching_gtin),
        score,
        gtin_match: gtinMatch,
      },
    ];
  });
};

export const isPossibleProductDuplicate = (
  input: ProductDuplicateInput,
  candidate: ProductDuplicateCandidate,
) => {
  const signals = duplicateSignals(input, candidate);
  return (
    signals.sameGtin ||
    signals.sameReference ||
    (signals.sameName && (signals.sameBrand || signals.sameCategory))
  );
};

/** The warning requires an explicit human decision; candidates never hard-block creation. */
export const canContinueProductCreation = () => true;

export const duplicateCandidateSummary = (
  input: ProductDuplicateInput,
  candidate: ProductDuplicateCandidate,
) => {
  const signals = duplicateSignals(input, candidate);
  if (signals.sameGtin) return "GTIN/EAN oficial idêntico";
  if (signals.sameReference && signals.sameBrand) return "Mesma referência e marca";
  if (signals.sameReference) return "Mesma referência/modelo";
  if (signals.sameName && signals.sameBrand) return "Mesmo nome e marca";
  return "Possível correspondência";
};
