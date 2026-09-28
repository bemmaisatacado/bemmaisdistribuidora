import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { money } from "@/components/storefront/ProductCard";
import { readCart, writeCart } from "@/lib/store-cart";

export const Route = createFileRoute("/s/$slug/produtos/$productSlug")({ component: ProductPage });
type Variant = {
  id: string;
  sku: string;
  attributes: Record<string, string>;
  stock_controlled: boolean;
  available: boolean;
  available_quantity: number | null;
};
type ProductData = {
  listing: {
    id: string;
    retail_price: number;
    compare_at_price: number | null;
    modality: string;
    commercial_config?: { moq?: number };
  };
  product: {
    name: string;
    slug: string;
    description: string | null;
    images: string[];
    variants: Variant[];
    category: { name: string; slug: string } | null;
  };
};
function ProductPage() {
  const { slug, productSlug } = Route.useParams();
  const q = useQuery({
    queryKey: ["store-product", slug, productSlug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("public_storefront_product", {
        _slug: slug,
        _product_slug: productSlug,
      });
      if (error) throw error;
      return data as unknown as ProductData | null;
    },
  });
  const [image, setImage] = useState(0);
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState(1);
  if (q.isLoading) return <main className="min-h-screen p-8">Carregando produto…</main>;
  if (!q.data)
    return (
      <main className="grid min-h-screen place-items-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Produto indisponível</h1>
          <Link to="/s/$slug/catalogo" params={{ slug }} className="mt-4 inline-block underline">
            Voltar ao catálogo
          </Link>
        </div>
      </main>
    );
  const { product, listing } = q.data;
  const selected = product.variants.find((v) => v.id === variantId) || product.variants[0];
  const attributes = Object.entries(
    product.variants.reduce<Record<string, Set<string>>>((all, v) => {
      Object.entries(v.attributes || {}).forEach(([key, value]) =>
        (all[key] ??= new Set()).add(value),
      );
      return all;
    }, {}),
  ).map(([key, values]) => [key, [...values]] as const);
  const add = () => {
    if (!selected || !selected.available) return;
    const cart = readCart(slug);
    const key = `${listing.id}:${selected.id}`;
    const existing = cart.items.find((i) => i.key === key);
    const next = {
      ...cart,
      items: existing
        ? cart.items.map((i) =>
            i.key === key
              ? {
                  ...i,
                  quantity: Math.min(i.quantity + qty, selected.available_quantity ?? 999),
                  price: listing.retail_price,
                }
              : i,
          )
        : [
            ...cart.items,
            {
              key,
              listingId: listing.id,
              variantId: selected.id,
              name: product.name,
              sku: selected.sku,
              price: listing.retail_price,
              quantity: Math.min(qty, selected.available_quantity ?? 999),
              available: selected.available_quantity,
            },
          ],
    };
    writeCart(next);
  };
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-7 sm:px-6">
      <Link to="/s/$slug/catalogo" params={{ slug }} className="text-sm text-slate-500">
        ← Catálogo
      </Link>
      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <section>
          <div className="aspect-square overflow-hidden rounded-2xl bg-stone-100">
            {product.images?.[image] ? (
              <img
                src={product.images[image]}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-slate-400">Sem imagem</div>
            )}
          </div>
          {product.images?.length > 1 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto">
              {product.images.map((src, i) => (
                <button
                  key={src}
                  onClick={() => setImage(i)}
                  className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border ${i === image ? "border-black" : "border-transparent"}`}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </section>
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {product.category?.name || "Produto"}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{product.name}</h1>
          <div className="mt-5 flex items-center gap-3">
            <strong className="text-2xl">{money(listing.retail_price)}</strong>
            {listing.compare_at_price && listing.compare_at_price > listing.retail_price ? (
              <s className="text-slate-400">{money(listing.compare_at_price)}</s>
            ) : null}
          </div>
          {listing.modality === "wholesale" &&
          listing.commercial_config?.moq &&
          listing.commercial_config.moq > 1 ? (
            <p className="mt-3 text-sm text-slate-600">
              Pedido mínimo: {listing.commercial_config.moq} unidades.
            </p>
          ) : null}
          {attributes.map(([name, values]) => (
            <fieldset key={name} className="mt-6">
              <legend className="mb-2 text-sm font-semibold capitalize">{name}</legend>
              <div className="flex flex-wrap gap-2">
                {values.map((value) => (
                  <button
                    key={value}
                    onClick={() => {
                      const found = product.variants.find(
                        (v) => v.attributes?.[name] === value && v.available,
                      );
                      if (found) setVariantId(found.id);
                    }}
                    className={`rounded-lg border px-3 py-2 text-sm ${selected?.attributes?.[name] === value ? "border-black bg-black text-white" : "border-slate-200"}`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          {selected ? (
            <p
              className={`mt-5 text-sm ${selected.available ? "text-emerald-700" : "text-red-600"}`}
            >
              {selected.available
                ? selected.stock_controlled
                  ? `${selected.available_quantity} disponível(is)`
                  : "Disponível"
                : "Indisponível"}{" "}
              · SKU {selected.sku}
            </p>
          ) : null}
          <div className="mt-5 flex gap-3">
            <div className="flex items-center rounded-lg border">
              <button
                aria-label="Diminuir quantidade"
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="px-3 py-3"
              >
                −
              </button>
              <span className="min-w-8 text-center">{qty}</span>
              <button
                aria-label="Aumentar quantidade"
                onClick={() => setQty(Math.min(qty + 1, selected?.available_quantity ?? 999))}
                className="px-3 py-3"
              >
                +
              </button>
            </div>
            <button
              disabled={!selected?.available}
              onClick={add}
              className="flex-1 rounded-lg bg-black px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Adicionar ao carrinho
            </button>
          </div>
          {product.description ? (
            <div className="mt-9 border-t pt-6">
              <h2 className="font-bold">Descrição</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">
                {product.description}
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
