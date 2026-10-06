// @ts-nocheck -- generated database types are out of date with the live schema
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard, type PublicListing } from "@/components/storefront/ProductCard";
export const Route = createFileRoute("/s/$slug/colecoes/$collectionSlug")({
  component: Collection,
});
type Collection = { name: string; description: string | null; items: PublicListing[] };
function Collection() {
  const { slug, collectionSlug } = Route.useParams();
  const q = useQuery({
    queryKey: ["store-collection", slug, collectionSlug],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("public_storefront_collection", {
        _slug: slug,
        _collection_slug: collectionSlug,
      });
      if (error) throw error;
      return data as unknown as Collection | null;
    },
  });
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-8 sm:px-6">
      <Link to="/s/$slug/catalogo" params={{ slug }} className="text-sm text-slate-500">
        ← Catálogo
      </Link>
      {q.isLoading ? (
        <p className="mt-8">Carregando…</p>
      ) : q.data ? (
        <>
          <h1 className="mt-7 text-3xl font-bold">{q.data.name}</h1>
          {q.data.description ? <p className="mt-2 text-slate-600">{q.data.description}</p> : null}
          {q.data.items.length ? (
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-5">
              {q.data.items.map((item) => (
                <ProductCard key={item.id} slug={slug} listing={item} />
              ))}
            </div>
          ) : (
            <p className="mt-8 text-slate-500">
              Esta coleção ainda não possui produtos publicados.
            </p>
          )}
        </>
      ) : (
        <p className="mt-8 text-slate-500">Coleção indisponível.</p>
      )}
    </main>
  );
}
