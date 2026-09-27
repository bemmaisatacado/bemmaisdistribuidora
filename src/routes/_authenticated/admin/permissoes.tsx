import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel } from "@/components/admin/ui";

export const Route = createFileRoute("/_authenticated/admin/permissoes")({ component: Perms });

function Perms() {
  const q = useQuery({
    queryKey: ["rbac"],
    queryFn: async () => {
      const [r, p, rp] = await Promise.all([
        supabase.from("roles").select("key,name,scope").order("scope"),
        supabase.from("permissions").select("key,description").order("key"),
        supabase.from("role_permissions").select("role_key,permission_key"),
      ]);
      if (r.error || p.error || rp.error) throw r.error ?? p.error ?? rp.error;
      return { roles: r.data, perms: p.data, set: new Set(rp.data.map((x) => `${x.role_key}:${x.permission_key}`)) };
    },
  });
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Papéis & Permissões" description="Matriz aplicada pelo banco (RLS). Papéis de plataforma têm acesso total; papéis de empresa valem só dentro da própria organização." />
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-border bg-secondary/60 text-xs">
              <th className="px-4 py-2.5 text-left">Permissão</th>
              {q.data?.roles.map((r) => <th key={r.key} className="px-2 py-2.5 text-center font-semibold">{r.name}</th>)}
            </tr></thead>
            <tbody>
              {q.data?.perms.map((p) => (
                <tr key={p.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-2"><p className="font-medium">{p.description}</p><code className="text-[11px] text-muted-foreground">{p.key}</code></td>
                  {q.data.roles.map((r) => (
                    <td key={r.key} className="text-center">
                      {r.scope === "platform" || q.data.set.has(`${r.key}:${p.key}`) ? <Check className="mx-auto h-4 w-4 text-primary" aria-label="Sim" /> : <span className="text-muted-foreground">·</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
