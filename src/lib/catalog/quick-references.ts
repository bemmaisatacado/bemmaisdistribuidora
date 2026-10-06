// @ts-nocheck -- generated database types are out of date with the live schema
export type CatalogReference = {
  id: string;
  name: string;
  slug?: string | null;
  parent_id?: string | null;
  sort_order?: number;
};

export const normalizeCatalogReferenceName = (value: string) => value.trim().replace(/\s+/g, " ");

export const catalogReferenceKey = (value: string) =>
  normalizeCatalogReferenceName(value).toLocaleLowerCase("pt-BR");

export const catalogReferenceSlug = (value: string) =>
  normalizeCatalogReferenceName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const equivalentBrand = (brands: readonly CatalogReference[], name: string) => {
  const key = catalogReferenceKey(name);
  return brands.find((brand) => catalogReferenceKey(brand.name) === key) ?? null;
};

export const equivalentCategory = (
  categories: readonly CatalogReference[],
  name: string,
  parentId: string | null,
) => {
  const key = catalogReferenceKey(name);
  return (
    categories.find(
      (category) =>
        (category.parent_id ?? null) === parentId && catalogReferenceKey(category.name) === key,
    ) ?? null
  );
};

export const categoryPath = (
  category: CatalogReference,
  categories: readonly CatalogReference[],
) => {
  const byId = new Map(categories.map((item) => [item.id, item]));
  const path: string[] = [category.name];
  const seen = new Set<string>([category.id]);
  let parentId = category.parent_id ?? null;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    path.unshift(parent.name);
    parentId = parent.parent_id ?? null;
  }
  return path.join(" › ");
};

export const categorySlugForParent = (
  name: string,
  parentId: string | null,
  categories: readonly CatalogReference[],
) => {
  const parent = parentId ? categories.find((category) => category.id === parentId) : undefined;
  const base = [parent?.slug, catalogReferenceSlug(name)].filter(Boolean).join("-");
  const used = new Set(categories.map((category) => category.slug).filter(Boolean));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};

export const isCategoryParentAllowed = (
  categories: readonly CatalogReference[],
  categoryId: string | null,
  parentId: string | null,
) => {
  if (!categoryId || !parentId) return true;
  if (categoryId === parentId) return false;
  const byId = new Map(categories.map((category) => [category.id, category]));
  const seen = new Set<string>();
  let current = parentId;
  while (current && !seen.has(current)) {
    if (current === categoryId) return false;
    seen.add(current);
    current = byId.get(current)?.parent_id ?? null;
  }
  return true;
};

export const selectCatalogReference = <T extends Record<string, string>>(
  draft: T,
  field: keyof T,
  value: string,
) => ({ ...draft, [field]: value });
