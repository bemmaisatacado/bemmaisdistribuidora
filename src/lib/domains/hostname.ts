import { supabase } from "@/integrations/supabase/client";
import { normalizeHostname } from "./hostname-core";
export {
  normalizeHostname,
  normalizeStoreSlug,
  platformHostname,
  canonicalStoreUrl,
  RESERVED_STORE_SLUGS,
} from "./hostname-core";
export type ResolvedStore = {
  store: {
    id: string;
    slug: string;
    name: string;
    logo_url: string | null;
    theme: unknown;
    seo: unknown;
  };
  domain: { hostname: string; type: "platform_subdomain" | "custom_domain"; is_primary: boolean };
};
/** Central public resolver; active domains and published stores only. */
export async function resolveStoreByHostname(hostname: string): Promise<ResolvedStore | null> {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return null;
  const { data, error } = await (supabase as any).rpc("resolve_store_by_hostname", {
    _hostname: normalized,
  });
  if (error) throw error;
  return data as unknown as ResolvedStore | null;
}
