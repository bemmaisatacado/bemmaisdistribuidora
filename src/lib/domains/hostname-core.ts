export const PLATFORM_STORE_DOMAIN = "bemmaisdistribuidora.com.br";
export const RESERVED_STORE_SLUGS = new Set([
  "www",
  "admin",
  "app",
  "api",
  "login",
  "auth",
  "mail",
  "email",
  "smtp",
  "ftp",
  "cdn",
  "assets",
  "static",
  "storage",
  "status",
  "support",
  "suporte",
  "financeiro",
  "checkout",
  "pagamento",
  "payments",
  "webhook",
  "webhooks",
  "bemmais",
]);
export function normalizeHostname(input: string): string | null {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split(/[/?#]/, 1)[0]
    .replace(/\.+$/, "")
    .replace(/:\d+$/, "");
  return !value ||
    value.includes("@") ||
    value.includes(":") ||
    !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value)
    ? null
    : value;
}
export function normalizeStoreSlug(input: string): string | null {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length >= 3 && slug.length <= 50 && !RESERVED_STORE_SLUGS.has(slug) ? slug : null;
}
export function platformHostname(slug: string) {
  return `${slug}.${PLATFORM_STORE_DOMAIN}`;
}
export function canonicalStoreUrl(
  store: { slug: string },
  domains: { hostname: string; status: string; is_primary: boolean; type: string }[],
  development = false,
) {
  const primary = domains.find((d) => d.status === "active" && d.is_primary),
    platform = domains.find((d) => d.status === "active" && d.type === "platform_subdomain");
  return primary
    ? `https://${primary.hostname}`
    : platform
      ? `https://${platform.hostname}`
      : development
        ? `/s/${store.slug}`
        : `https://${platformHostname(store.slug)}`;
}
