export type StoreNavigationItem = {
  id: string;
  label: string;
  kind: string;
  target: string;
  position?: number;
  is_enabled?: boolean;
};

export function publishedNavigation(items: StoreNavigationItem[]) {
  return items
    .filter((item) => item.is_enabled !== false)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export function storeNavigationHref(item: StoreNavigationItem, slug: string) {
  const target = item.target.trim().replace(/^\/+/, "");
  if (item.kind === "home") return `/s/${slug}`;
  if (item.kind === "catalog") return `/s/${slug}/catalogo`;
  if (item.kind === "category" && target) return `/s/${slug}/categorias/${target}`;
  if (item.kind === "collection" && target) return `/s/${slug}/colecoes/${target}`;
  if (item.kind === "page" && target) return `/s/${slug}/paginas/${target}`;
  if (
    item.kind === "external" &&
    (item.target.startsWith("https://") ||
      item.target.startsWith("http://") ||
      item.target.startsWith("/"))
  )
    return item.target;
  return null;
}
