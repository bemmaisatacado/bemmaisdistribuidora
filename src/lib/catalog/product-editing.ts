import { isOfficialGtin, normalizeVariantValues, variantAttributesKey } from "./identity.ts";
import {
  categoryAttributeRequiresOptions,
  readCategoryAttributeOptions,
  type CategoryAttributeType,
} from "./category-attributes.ts";

export type VariantAttributeDefinition = {
  code: string;
  name: string;
  type: CategoryAttributeType;
  options: unknown;
  is_required: boolean;
  is_variant: boolean;
};

export type EditableProductVariant = {
  id: string;
  product_id: string;
  sku: string;
  internal_code: string | null;
  gtin: string | null;
  attributes: Record<string, string>;
  is_active: boolean;
};

export type ProductMasterEditDraft = {
  name: string;
  shortDescription: string;
  description: string;
  reference: string;
  audience: string;
  tags: string;
  categoryId: string;
  brandId: string;
};

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

export const normalizeProductTags = (value: string) =>
  normalizeVariantValues(value.split(",")).map((tag) => tag.slice(0, 80));

export const productMasterUpdate = (draft: ProductMasterEditDraft) => ({
  name: draft.name.trim(),
  short_description: draft.shortDescription.trim() || null,
  description: draft.description.trim() || null,
  reference: draft.reference.trim() || null,
  audience: draft.audience.trim() || null,
  tags: normalizeProductTags(draft.tags),
  category_id: draft.categoryId || null,
  brand_id: draft.brandId || null,
});

export const isCategoryChangeBlocked = (
  currentCategoryId: string | null,
  nextCategoryId: string | null,
  variants: readonly Pick<EditableProductVariant, "attributes">[],
) =>
  currentCategoryId !== nextCategoryId &&
  variants.some((variant) => Object.keys(variant.attributes).length > 0);

export const variantAttributeDefinitions = (attributes: readonly VariantAttributeDefinition[]) =>
  attributes.filter((attribute) => attribute.is_variant);

export const editableVariantAttributes = (
  attributes: Record<string, string>,
  definitions: readonly VariantAttributeDefinition[],
) =>
  variantAttributeDefinitions(definitions).reduce<Record<string, string>>(
    (result, definition) => ({ ...result, [definition.code]: attributes[definition.code] ?? "" }),
    {},
  );

export const mergeVariantAttributes = (
  current: Record<string, string>,
  values: Record<string, string>,
  definitions: readonly VariantAttributeDefinition[],
) => {
  const next = { ...current };
  for (const definition of variantAttributeDefinitions(definitions)) {
    const value = normalizeText(values[definition.code] ?? "");
    if (value) next[definition.code] = value;
    else delete next[definition.code];
  }
  return next;
};

const normalizedValues = (value: string) => normalizeVariantValues(value.split(","));

export const validateVariantAttributeValues = (
  values: Record<string, string>,
  definitions: readonly VariantAttributeDefinition[],
): string | null => {
  for (const definition of variantAttributeDefinitions(definitions)) {
    const value = normalizeText(values[definition.code] ?? "");
    if (definition.is_required && !value) return `${definition.name} é obrigatório.`;
    if (!value) continue;
    if (definition.type === "number" && !Number.isFinite(Number(value))) {
      return `${definition.name} deve ser numérico.`;
    }
    if (definition.type === "boolean" && value !== "true" && value !== "false") {
      return `${definition.name} deve ser Sim ou Não.`;
    }
    if (categoryAttributeRequiresOptions(definition.type)) {
      const options = readCategoryAttributeOptions(definition.options);
      const allowed = new Set(options.map((option) => option.toLocaleLowerCase("pt-BR")));
      if (normalizedValues(value).some((item) => !allowed.has(item.toLocaleLowerCase("pt-BR")))) {
        return `${definition.name} contém uma opção não configurada para a categoria.`;
      }
    }
  }
  return null;
};

export const isDuplicateVariantCombination = (
  variants: readonly EditableProductVariant[],
  currentVariantId: string,
  candidate: Record<string, string>,
  definitions: readonly VariantAttributeDefinition[],
) => {
  const relevant = variantAttributeDefinitions(definitions).map((definition) => definition.code);
  const key = variantAttributesKey(
    Object.fromEntries(relevant.map((code) => [code, candidate[code] ?? ""])),
  );
  return variants.some(
    (variant) =>
      variant.id !== currentVariantId &&
      variantAttributesKey(
        Object.fromEntries(relevant.map((code) => [code, variant.attributes[code] ?? ""])),
      ) === key,
  );
};

export const readVariantDimensions = (value: unknown) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.entries(value).reduce<Record<string, number>>((dimensions, [key, item]) => {
    if (typeof item === "number" && Number.isFinite(item) && item >= 0) dimensions[key] = item;
    return dimensions;
  }, {});
};

export const variantDimensionsUpdate = (
  current: Record<string, number>,
  key: string,
  value: string,
) => {
  const next = { ...current };
  if (!value.trim()) delete next[key];
  else {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) next[key] = parsed;
  }
  return next;
};

export const validateVariantEdit = (
  gtin: string,
  attributes: Record<string, string>,
  definitions: readonly VariantAttributeDefinition[],
) => {
  if (!isOfficialGtin(gtin.trim())) return "GTIN/EAN deve ter entre 8 e 14 dígitos.";
  return validateVariantAttributeValues(attributes, definitions);
};

export const variantUpdateTarget = (
  variant: Pick<EditableProductVariant, "id" | "product_id">,
) => ({
  id: variant.id,
  productId: variant.product_id,
});
