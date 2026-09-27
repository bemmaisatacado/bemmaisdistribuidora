import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Ops } from "./metrics";

/** Shared operational queue (real counts from admin_ops_queue). */
export function useOps() {
  return useQuery({
    queryKey: ["admin-ops"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_ops_queue");
      if (error) throw error;
      return data as unknown as Ops;
    },
  });
}
