import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard, type PublicListing } from "@/components/storefront/ProductCard";

export const Route = createFileRoute("/s/$slug/busca")({ component: SearchPage });
type CatalogData = { items: PublicListing[]; total: number };
function SearchPage() {
  const { slug } = Route.useParams();
  const [term, setTerm] = useState("");
  const q = useQuery({
    queryKey: ["store-search", slug, term],
    enabled: term.trim().length > 1,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("public_storefront_catalog", {
        _slug: slug,
        _query: term,
      });
      if (error) throw error;
      return data as unknown as CatalogData | null;
    },
  });
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-8 sm:px-6">
      <Link to="/s/$slug" params={{ slug }} className="text-sm text-slate-500">
        ← Voltar para loja
      </Link>
      <h1 className="mt-7 text-3xl font-bold">Buscar produtos</h1>
      <input
        autoFocus
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Digite o que procura"
        className="mt-6 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-black/20"
      />
      {term.trim().length < 2 ? (
        <p className="mt-7 text-sm text-slate-500">
          Digite pelo menos 2 caracteres para buscar no catálogo desta loja.
        </p>
      ) : q.isLoading ? (
        <p className="mt-7">Buscando…</p>
      ) : !q.data?.items.length ? (
        <p className="mt-7 text-slate-500">Nenhum produto encontrado.</p>
      ) : (
        <>
          <p className="mt-5 text-sm text-slate-500">{q.data.total} resultado(s)</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-5">
            {q.data.items.map((item) => (
              <ProductCard key={item.id} slug={slug} listing={item} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
