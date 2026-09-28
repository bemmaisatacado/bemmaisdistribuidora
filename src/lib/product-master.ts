const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export type AttributeValues = Record<string, string[]>;

export function productSlug(name: string) {
  return slugify(name);
}

export function variantMatrix(values: AttributeValues) {
  const entries = Object.entries(values).filter(([, options]) => options.length);
  if (!entries.length) return [{}] as Record<string, string>[];
  return entries.reduce<Record<string, string>[]>(
    (matrix, [key, options]) =>
      matrix.flatMap((row) => options.map((value) => ({ ...row, [key]: value }))),
    [{}],
  );
}

export function variantKey(attributes: Record<string, string>) {
  return Object.entries(attributes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value.trim().toLowerCase()}`)
    .join("|");
}

export function productSku(prefix: string, attributes: Record<string, string>, ordinal: number) {
  const stem = slugify(prefix).replace(/-/g, "").slice(0, 8).toUpperCase() || "SKU";
  const suffix = Object.values(attributes)
    .map((value) => slugify(value).replace(/-/g, "").slice(0, 4).toUpperCase())
    .filter(Boolean)
    .join("-");
  return `${stem}-${suffix || "PADRAO"}-${String(ordinal).padStart(3, "0")}`;
}

export function possibleDuplicate(
  name: string,
  brand: string | null,
  candidates: { name: string; brand?: string | null; reference?: string | null }[],
) {
  const normalized = slugify(name);
  return candidates.filter((candidate) => {
    const sameName = slugify(candidate.name) === normalized;
    const sameBrand = !brand || !candidate.brand || slugify(candidate.brand) === slugify(brand);
    return sameName && sameBrand;
  });
}
