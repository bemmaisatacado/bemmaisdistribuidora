import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export const Route = createFileRoute("/s/$slug/paginas/$pageSlug")({
  component: InstitutionalPage,
});
function InstitutionalPage() {
  const { slug, pageSlug } = Route.useParams();
  const q = useQuery({
    queryKey: ["public-store", slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_storefront", { _slug: slug });
      if (error) throw error;
      return data as unknown as {
        store: { name: string };
        sections: { type: string; config: Record<string, unknown> }[];
      } | null;
    },
  });
  const page = q.data?.sections.find(
    (x) => x.type === "footer" && x.config.slug === pageSlug,
  )?.config;
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-10">
      <Link to="/s/$slug" params={{ slug }} className="text-sm text-slate-500">
        ← {q.data?.store.name || "Loja"}
      </Link>
      {q.isLoading ? (
        <p className="mt-8">Carregando…</p>
      ) : page ? (
        <article className="mt-8">
          <h1 className="text-3xl font-bold">{String(page.title || pageSlug)}</h1>
          <p className="mt-5 whitespace-pre-line leading-7 text-slate-700">
            {String(page.content || "")}
          </p>
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
