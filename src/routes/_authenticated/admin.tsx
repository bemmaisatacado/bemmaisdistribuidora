import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/landing/primitives";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Super Admin — BemMais" }, { name: "robots", content: "noindex" }] }),
  component: AdminHome,
});

function AdminHome() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["platform-admin", user.id],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("is_platform_admin", { _uid: user.id });
      if (error) throw error;
      return Boolean(data);
    },
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/entrar", replace: true });
  }

  return (
    <main className="min-h-screen bg-secondary">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <Logo className="h-10" />
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">{user.email}</span>
          <button onClick={signOut} className="rounded-lg border border-border px-3 py-1.5 font-semibold hover:bg-muted">Sair</button>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-6 py-12">
        {isLoading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : data ? (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Super Admin</p>
            <h1 className="mt-2 text-2xl font-bold">Fundação da plataforma ativa</h1>
            <p className="mt-3 text-muted-foreground">
              Empresas, membros, papéis, permissões e auditoria já estão protegidos no banco. O painel completo
              chega na próxima etapa.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Conta criada</h1>
            <p className="mt-3 text-muted-foreground">Seu acesso ainda não foi liberado pela equipe BemMais.</p>
          </>
        )}
      </section>
    </main>
  );
}
