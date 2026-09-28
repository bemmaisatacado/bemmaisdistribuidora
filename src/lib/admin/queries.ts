import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Tenant organizations for pickers (excludes the platform org). */
export function useOrgOptions(capability?: "supply_products") {
  return useQuery({
    queryKey: ["org-options", capability ?? "all"],
    queryFn: async () => {
      if (capability) {
        const { data, error } = await supabase
          .from("organizations")
          .select("id,name,organization_capabilities!inner(capability)")
          .eq("is_platform", false)
          .eq("organization_capabilities.capability", capability)
          .order("name")
          .limit(500);
        if (error) throw error;
        return data.map((o) => ({ id: o.id, name: o.name }));
      }
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name")
        .eq("is_platform", false)
        .order("name")
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
}

export function useCatalogRefs() {
  return useQuery({
    queryKey: ["catalog-refs"],
    queryFn: async () => {
      const [c, b] = await Promise.all([
        supabase.from("categories").select("id,name").order("name").limit(500),
        supabase.from("brands").select("id,name").order("name").limit(500),
      ]);
      if (c.error) throw c.error;
      if (b.error) throw b.error;
      return { categories: c.data, brands: b.data };
    },
  });
}

export function useProductOptions() {
  return useQuery({
    queryKey: ["product-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name")
        .neq("status", "archived")
        .order("name")
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
}
