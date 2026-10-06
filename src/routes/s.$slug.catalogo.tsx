import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard, type PublicListing } from "@/components/storefront/ProductCard";

export const Route = createFileRoute("/s/$slug/catalogo")({ component: Catalog });
type CatalogData = { items: PublicListing[]; total: number; page: number; page_size: number };
function Catalog() {
  const { slug } = Route.useParams();
  const q = useQuery({
    queryKey: ["store-catalog", slug],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("public_storefront_catalog", { _slug: slug });
      if (error) throw error;
      return data as unknown as CatalogData | null;
    },
  });
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-8 sm:px-6">
      <Link to="/s/$slug" params={{ slug }} className="text-sm text-slate-500">
        ← Voltar para loja
      </Link>
      <div className="mt-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Catálogo</h1>
          <p className="mt-1 text-sm text-slate-500">{q.data?.total ?? 0} produtos disponíveis</p>
        </div>
        <Link
          to="/s/$slug/busca"
          params={{ slug }}
          className="rounded-full border px-4 py-2 text-sm font-semibold"
        >
          Buscar
        </Link>
      </div>
      {q.isLoading ? (
        <p className="mt-10">Carregando catálogo…</p>
      ) : !q.data?.items.length ? (
        <p className="mt-10 rounded-xl border border-dashed p-8 text-slate-500">
          Ainda não há produtos publicados nesta loja.
        </p>
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
