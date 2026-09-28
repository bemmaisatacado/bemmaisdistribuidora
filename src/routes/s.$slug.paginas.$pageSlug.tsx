import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export const Route = createFileRoute("/s/$slug/paginas/$pageSlug")({
  component: InstitutionalPage,
});
type Page = { title: string; content: string };
function InstitutionalPage() {
  const { slug, pageSlug } = Route.useParams();
  const q = useQuery({
    queryKey: ["store-page", slug, pageSlug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_storefront_page", {
        _slug: slug,
        _page_slug: pageSlug,
      });
      if (error) throw error;
      return data as unknown as Page | null;
    },
  });
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10">
      <Link to="/s/$slug" params={{ slug }} className="text-sm text-slate-500">
        ← Voltar para loja
      </Link>
      {q.isLoading ? (
        <p className="mt-8">Carregando…</p>
      ) : q.data ? (
        <article className="mt-8">
          <h1 className="text-3xl font-bold">{q.data.title}</h1>
          <p className="mt-5 whitespace-pre-line leading-7 text-slate-700">{q.data.content}</p>
        </article>
      ) : (
        <div className="mt-8">
          <h1 className="text-2xl font-bold">Página indisponível</h1>
          <p className="mt-2 text-slate-500">Esta página ainda não foi publicada.</p>
        </div>
      )}
    </main>
  );
}
