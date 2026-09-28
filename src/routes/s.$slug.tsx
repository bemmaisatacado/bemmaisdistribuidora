import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Menu, Search, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeTheme } from "@/lib/storefront";
import { ProductCard, type PublicListing } from "@/components/storefront/ProductCard";

export const Route = createFileRoute("/s/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    preview: typeof search.preview === "string" ? search.preview : undefined,
  }),
  component: Storefront,
});
type Section = { id: string; type: string; config: Record<string, unknown> };
type StorefrontData = {
  store: {
    name: string;
    slug: string;
    logo_url: string | null;
    description: string | null;
    theme: unknown;
    whatsapp: string | null;
  };
  sections: Section[];
  listings: (PublicListing & { product?: { name: string; slug: string; images: string[] } })[];
};
const text = (v: unknown) => (typeof v === "string" ? v : "");

function Storefront() {
  const { slug } = Route.useParams();
  const { preview } = Route.useSearch();
  const q = useQuery({
    queryKey: ["public-store", slug, preview],
    queryFn: async () => {
      const { data, error } = preview
        ? await supabase.rpc("preview_storefront", { _store_id: preview })
        : await supabase.rpc("public_storefront", { _slug: slug });
      if (error) throw error;
      return data as unknown as StorefrontData | null;
    },
  });
  if (q.isLoading) return <main className="min-h-screen bg-white p-8">Carregando loja…</main>;
  if (!q.data)
    return (
      <main className="grid min-h-screen place-items-center bg-white p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Loja indisponível</h1>
          <p className="mt-2 text-slate-500">Este endereço não está publicado.</p>
        </div>
      </main>
    );
  const { store } = q.data,
    t = sanitizeTheme(store.theme);
  const listings: PublicListing[] = q.data.listings.map((l) => ({
    ...l,
    name: l.product?.name ?? l.name,
    images: l.product?.images ?? l.images,
    slug: l.product?.slug ?? l.slug ?? "",
  }));
  return (
    <main
      style={{ background: t.background, color: t.text, fontFamily: t.fontBody }}
      className="min-h-screen"
    >
      {preview ? (
        <div className="bg-amber-400 px-4 py-2 text-center text-xs font-bold text-amber-950">
          PREVIEW DE RASCUNHO — alterações ainda não estão públicas.
        </div>
      ) : null}
      <header className="sticky top-0 z-10 border-b border-black/5 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/s/$slug" params={{ slug }} className="flex min-w-0 items-center gap-3">
            {store.logo_url ? (
              <img src={store.logo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : null}
            <b className="truncate text-base sm:text-lg">{store.name}</b>
          </Link>
          <nav className="hidden items-center gap-6 text-sm sm:flex">
            <Link to="/s/$slug/catalogo" params={{ slug }}>
              Catálogo
            </Link>
            <Link to="/s/$slug/busca" params={{ slug }}>
              Buscar
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link aria-label="Buscar" to="/s/$slug/busca" params={{ slug }}>
              <Search className="h-5 w-5" />
            </Link>
            <Link aria-label="Carrinho" to="/s/$slug/carrinho" params={{ slug }}>
              <ShoppingBag className="h-5 w-5" />
            </Link>
            <Menu className="h-5 w-5 sm:hidden" />
          </div>
        </div>
      </header>
      {q.data.sections.length ? (
        q.data.sections.map((section) => (
          <HomeSection
            key={section.id}
            section={section}
            slug={slug}
            store={store}
            listings={listings}
            accent={t.accent}
          />
        ))
      ) : (
        <Hero
          slug={slug}
          headline={store.name}
          subheadline={store.description ?? ""}
          accent={t.accent}
        />
      )}
      <footer className="border-t border-black/10 px-5 py-10 text-center text-sm opacity-65">
        {store.name}
      </footer>
    </main>
  );
}
function Hero({
  slug,
  headline,
  subheadline,
  accent,
}: {
  slug: string;
  headline: string;
  subheadline: string;
  accent: string;
}) {
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 sm:py-24">
      <p className="text-xs font-bold tracking-[.18em]" style={{ color: accent }}>
        NOVIDADES
      </p>
      <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">{headline}</h1>
      {subheadline ? <p className="mt-5 max-w-xl text-lg opacity-70">{subheadline}</p> : null}
      <Link
        to="/s/$slug/catalogo"
        params={{ slug }}
        className="mt-8 inline-flex rounded-full px-5 py-3 text-sm font-bold text-white"
        style={{ background: accent }}
      >
        Ver catálogo
      </Link>
    </section>
  );
}
function HomeSection({
  section,
  slug,
  store,
  listings,
  accent,
}: {
  section: Section;
  slug: string;
  store: StorefrontData["store"];
  listings: PublicListing[];
  accent: string;
}) {
  const c = section.config;
  if (section.type === "hero")
    return (
      <Hero
        slug={slug}
        headline={text(c.headline) || store.name}
        subheadline={text(c.subheadline) || store.description || ""}
        accent={accent}
      />
    );
  if (["featured_products", "product_carousel", "promotion"].includes(section.type))
    return (
      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {text(c.title) || (section.type === "promotion" ? "Promoções" : "Destaques")}
          </h2>
          <Link
            className="text-sm font-semibold"
            style={{ color: accent }}
            to="/s/$slug/catalogo"
            params={{ slug }}
          >
            Ver todos
          </Link>
        </div>
        {listings.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
            {listings.slice(0, 8).map((l) => (
              <ProductCard key={l.id} slug={slug} listing={l} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed p-6 text-sm opacity-60">
            Esta vitrine ainda não possui produtos publicados.
          </p>
        )}
      </section>
    );
  if (section.type === "whatsapp_cta" && store.whatsapp)
    return (
      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-6">
        <a
          className="block rounded-2xl p-7 text-white"
          style={{ background: accent }}
          href={`https://wa.me/${store.whatsapp.replace(/\D/g, "")}`}
          target="_blank"
          rel="noreferrer"
        >
          <b>{text(c.headline) || "Fale com a nossa equipe"}</b>
          <p className="mt-1 text-sm text-white/80">Atendimento direto pelo WhatsApp.</p>
        </a>
      </section>
    );
  if (
    section.type === "image_text" ||
    section.type === "banner" ||
    section.type === "benefits" ||
    section.type === "brands" ||
    section.type === "categories" ||
    section.type === "newsletter" ||
    section.type === "footer"
  )
    return (
      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
        <div className="rounded-2xl bg-black/[.035] p-6">
          <h2 className="text-xl font-bold">{text(c.headline) || text(c.title) || ""}</h2>
          {text(c.subheadline) || text(c.description) ? (
            <p className="mt-2 max-w-2xl opacity-70">
              {text(c.subheadline) || text(c.description)}
            </p>
          ) : null}
        </div>
      </section>
    );
  return null;
}
