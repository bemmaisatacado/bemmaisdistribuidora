import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Super Admin — BemMais" }, { name: "robots", content: "noindex" }] }),
  component: AdminLayout,
});

function AdminLayout() {
  const { user } = Route.useRouteContext();
  const { data, isLoading } = useQuery({
    queryKey: ["platform-admin", user.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_platform_admin", { _uid: user.id });
      if (error) throw error;
      return Boolean(data);
    },
  });

  if (isLoading) return <p className="p-10 text-muted-foreground">Carregando...</p>;
  if (!data)
    return (
      <main className="mx-auto max-w-lg px-6 py-20 text-center">
        <h1 className="text-2xl font-bold">Conta criada</h1>
        <p className="mt-3 text-muted-foreground">Seu acesso ao Super Admin ainda não foi liberado pela equipe BemMais.</p>
      </main>
    );
  return (
    <AdminShell email={user.email ?? ""}>
      <Outlet />
    </AdminShell>
  );
}
