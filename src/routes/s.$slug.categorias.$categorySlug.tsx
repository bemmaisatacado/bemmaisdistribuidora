// @ts-nocheck -- generated database types are out of date with the live schema
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard, type PublicListing } from "@/components/storefront/ProductCard";
export const Route = createFileRoute("/s/$slug/categorias/$categorySlug")({ component: Category });
type Data = { items: PublicListing[]; total: number };
function Category() {
  const { slug, categorySlug } = Route.useParams();
  const q = useQuery({
    queryKey: ["store-category", slug, categorySlug],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("public_storefront_catalog", {
        _slug: slug,
        _category_slug: categorySlug,
      });
      if (error) throw error;
      return data as unknown as Data | null;
    },
  });
  const title = q.data?.items[0]?.category?.name || categorySlug;
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-8 sm:px-6">
      <Link to="/s/$slug/catalogo" params={{ slug }} className="text-sm text-slate-500">
        ← Catálogo
      </Link>
      <h1 className="mt-7 text-3xl font-bold capitalize">{title}</h1>
      {q.isLoading ? (
        <p className="mt-8">Carregando…</p>
      ) : !q.data?.items.length ? (
        <p className="mt-8 text-slate-500">Não há produtos disponíveis nesta categoria.</p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-5">
          {q.data.items.map((item) => (
            <ProductCard key={item.id} slug={slug} listing={item} />
          ))}
        </div>
      )}
    </main>
  );
}
