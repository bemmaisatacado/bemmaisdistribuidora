export const CATEGORY_ATTRIBUTE_TYPES = [
  "text",
  "number",
  "boolean",
  "select",
  "multi_select",
  "color",
  "measurement",
] as const;

export type CategoryAttributeType = (typeof CATEGORY_ATTRIBUTE_TYPES)[number];
export type CategoryAttributeDraft = {
  name: string;
  type: CategoryAttributeType;
  options: string[];
  is_required: boolean;
  is_variant: boolean;
};
export type CategoryAttributeOrderItem = { id: string; sort_order: number };

const optionTypes = new Set<CategoryAttributeType>(["select", "multi_select", "color"]);

export const isCategoryAttributeType = (value: string): value is CategoryAttributeType =>
  CATEGORY_ATTRIBUTE_TYPES.some((type) => type === value);

export const normalizeCategoryAttributeName = (value: string) => value.trim().replace(/\s+/g, " ");
export const categoryAttributeCode = (value: string) =>
  normalizeCategoryAttributeName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const normalizeCategoryAttributeOptions = (options: readonly string[]) => {
  const seen = new Set<string>();
  return options.reduce<string[]>((result, option) => {
    const normalized = normalizeCategoryAttributeName(option);
    const key = normalized.toLocaleLowerCase("pt-BR");
    if (normalized && !seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
    return result;
  }, []);
};

export const categoryAttributeRequiresOptions = (type: CategoryAttributeType) =>
  optionTypes.has(type);
export const categoryAttributeRole = (isVariant: boolean) =>
  isVariant ? "variant" : "descriptive";

export const validateCategoryAttributeDraft = (
  draft: CategoryAttributeDraft,
  existingCodes: readonly string[],
  currentCode?: string,
): { value: CategoryAttributeDraft & { code: string } } | { error: string } => {
  const name = normalizeCategoryAttributeName(draft.name);
  const code = categoryAttributeCode(name);
  const options = normalizeCategoryAttributeOptions(draft.options);
  if (!name || !code) return { error: "Informe o nome do atributo." };
  if (existingCodes.some((item) => item === code && item !== currentCode)) {
    return { error: "Já existe um atributo com esse nome nesta categoria." };
  }
  if (categoryAttributeRequiresOptions(draft.type) && !options.length) {
    return { error: "Este tipo de atributo exige ao menos uma opção." };
  }
  return { value: { ...draft, name, code, options } };
};

export const readCategoryAttributeOptions = (value: unknown) =>
  Array.isArray(value)
    ? normalizeCategoryAttributeOptions(
        value.filter((option): option is string => typeof option === "string"),
      )
    : [];

export const categoryAttributeHasDestructiveChanges = (
  current: Pick<CategoryAttributeDraft, "type" | "options" | "is_variant">,
  next: Pick<CategoryAttributeDraft, "type" | "options" | "is_variant">,
) =>
  current.type !== next.type ||
  current.is_variant !== next.is_variant ||
  JSON.stringify(normalizeCategoryAttributeOptions(current.options)) !==
    JSON.stringify(normalizeCategoryAttributeOptions(next.options));

export const moveCategoryAttribute = <T extends CategoryAttributeOrderItem>(
  attributes: readonly T[],
  id: string,
  direction: "up" | "down",
) => {
  const index = attributes.findIndex((attribute) => attribute.id === id);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= attributes.length) return null;
  const current = attributes[index];
  const target = attributes[targetIndex];
  return [
    { id: current.id, sort_order: target.sort_order },
    { id: target.id, sort_order: current.sort_order },
  ];
};

export const categoryAttributeIsUsed = (attributes: unknown, code: string) =>
  typeof attributes === "object" &&
  attributes !== null &&
  !Array.isArray(attributes) &&
  Object.prototype.hasOwnProperty.call(attributes, code);
