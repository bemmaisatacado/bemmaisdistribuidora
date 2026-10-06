// @ts-nocheck -- generated database types are out of date with the live schema
import { Link } from "@tanstack/react-router";
import { formatStorePrice } from "@/lib/storefront";

export type PublicListing = {
  id: string;
  name: string;
  slug: string;
  images?: string[] | null;
  retail_price: number;
  compare_at_price?: number | null;
  category?: { name: string; slug: string } | null;
};

export function ProductCard({ slug, listing }: { slug: string; listing: PublicListing }) {
  return (
    <Link
      to="/s/$slug/produtos/$productSlug"
      params={{ slug, productSlug: listing.slug }}
      className="group block overflow-hidden rounded-2xl border border-black/10 bg-white transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="aspect-square overflow-hidden bg-stone-100">
        {listing.images?.[0] ? (
          <img
            src={listing.images[0]}
            alt={listing.name}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-slate-400">Sem imagem</div>
        )}
      </div>
      <div className="p-3 sm:p-4">
        {listing.category?.name ? (
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {listing.category.name}
          </p>
        ) : null}
        <h3 className="line-clamp-2 min-h-10 text-sm font-semibold text-slate-900">
          {listing.name}
        </h3>
        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          <strong className="text-sm text-slate-950">
            {formatStorePrice(listing.retail_price)}
          </strong>
          {listing.compare_at_price && listing.compare_at_price > listing.retail_price ? (
            <s className="text-xs text-slate-400">{formatStorePrice(listing.compare_at_price)}</s>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
