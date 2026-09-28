type SeoInput = {
  title?: unknown;
  description?: unknown;
  social_image?: unknown;
  noindex?: unknown;
};
type StoreSeoInput = {
  name: string;
  description?: string | null;
  logo_url?: string | null;
  favicon_url?: string | null;
  canonical_url?: string | null;
  seo?: unknown;
};

const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function publishedSeo(store: StoreSeoInput, page?: Partial<SeoInput>) {
  const global = (store.seo && typeof store.seo === "object" ? store.seo : {}) as SeoInput;
  const source = { ...global, ...page };
  const title = asText(source.title) || store.name;
  const description = asText(source.description) || store.description || "";
  const image = asText(source.social_image) || store.logo_url || "";
  return {
    title,
    description,
    image,
    canonical: store.canonical_url || "",
    noindex: source.noindex === true,
    favicon: store.favicon_url || "",
  };
}

export function applyPublishedSeo(store: StoreSeoInput, page?: Partial<SeoInput>) {
  if (typeof document === "undefined") return;
  const seo = publishedSeo(store, page);
  document.title = seo.title;
  const setMeta = (
    selector: string,
    attribute: "name" | "property",
    key: string,
    value: string,
  ) => {
    let node = document.head.querySelector<HTMLMetaElement>(selector);
    if (!node) {
      node = document.createElement("meta");
      node.setAttribute(attribute, key);
      document.head.appendChild(node);
    }
    node.content = value;
  };
  setMeta('meta[name="description"]', "name", "description", seo.description);
  setMeta('meta[property="og:title"]', "property", "og:title", seo.title);
  setMeta('meta[property="og:description"]', "property", "og:description", seo.description);
  setMeta('meta[property="og:image"]', "property", "og:image", seo.image);
  setMeta(
    'meta[name="robots"]',
    "name",
    "robots",
    seo.noindex ? "noindex,nofollow" : "index,follow",
  );
  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = seo.canonical;
  if (seo.favicon) {
    let icon = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.href = seo.favicon;
  }
}
