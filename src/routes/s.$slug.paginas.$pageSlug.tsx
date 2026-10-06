import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyPublishedSeo } from "@/lib/store-seo";
export const Route = createFileRoute("/s/$slug/paginas/$pageSlug")({
  component: InstitutionalPage,
});
type Page = { title: string; content: string; seo?: Record<string, unknown> };
function InstitutionalPage() {
  const { slug, pageSlug } = Route.useParams();
  const q = useQuery({
    queryKey: ["store-page", slug, pageSlug],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("public_storefront_page", {
        _slug: slug,
        _page_slug: pageSlug,
      });
      if (error) throw error;
      return data as unknown as Page | null;
    },
  });
  const store = useQuery({
    queryKey: ["store-page-seo", slug],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("public_storefront", { _slug: slug });
      if (error) throw error;
      return data as unknown as { store?: Parameters<typeof applyPublishedSeo>[0] } | null;
    },
  });
  useEffect(() => {
    if (store.data?.store && q.data) applyPublishedSeo(store.data.store, q.data.seo);
  }, [q.data, store.data]);
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
