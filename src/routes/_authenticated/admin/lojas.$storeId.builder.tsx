import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Monitor, Tablet, Smartphone, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EntityHeader, Panel, Btn, Badge } from "@/components/admin/ui";
import { PLATFORM_STORE_DOMAIN, publicationMissing, sanitizeTheme } from "@/lib/storefront";
import { StoreDomainsPanel } from "@/components/admin/stores/StoreDomainsPanel";

export const Route = createFileRoute("/_authenticated/admin/lojas/$storeId/builder")({
  component: Builder,
});
function Builder() {
  const { storeId } = Route.useParams();
  const q = useQuery({
    queryKey: ["store-builder", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id,name,slug,logo_url,status,mode,theme,organization_id,store_listings(count)")
        .eq("id", storeId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  if (q.isLoading) return <p className="p-8">Carregando Builder…</p>;
  if (!q.data) return <p className="p-8">Loja não encontrada.</p>;
  const s = q.data as typeof q.data & { theme?: unknown; store_listings?: { count: number }[] };
  const missing = publicationMissing(s, s.store_listings?.[0]?.count ?? 0);
  const t = sanitizeTheme(s.theme);
  return (
    <main>
      <EntityHeader
        name={s.name}
        src={s.logo_url}
        status={s.status}
        meta={
          <>
            <span>{s.mode}</span>
            <span>
              {s.slug}.{PLATFORM_STORE_DOMAIN}
            </span>
          </>
        }
        actions={
          <>
            <Link to="/s/$slug" params={{ slug: s.slug }}>
              <Btn variant="outline">
                <ExternalLink className="h-4 w-4" /> Preview
              </Btn>
            </Link>
            <Btn>Salvar alterações</Btn>
          </>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[22rem_1fr]">
        <Panel
          title="Builder"
          description="Seções controladas e responsivas; CSS arbitrário não é permitido."
        >
          <div className="space-y-3 p-5 text-sm">
            <p className="font-semibold">Tema ativo</p>
            {Object.entries(t)
              .slice(0, 8)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b pb-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-mono text-xs">{String(v)}</span>
                </div>
              ))}
            <hr />
            <p className="font-semibold">Seções da home</p>
            <p className="text-muted-foreground">
              Hero, banners, vitrines, benefícios, marcas, WhatsApp e rodapé são configurados em
              blocos persistidos.
            </p>
          </div>
        </Panel>
        <div className="space-y-5">
          <Panel
            title="Checklist de publicação"
            description="Itens obrigatórios antes de disponibilizar a loja."
          >
            <div className="p-5">
              {missing.length ? (
                <ul className="space-y-2 text-sm">
                  {missing.map((x) => (
                    <li key={x} className="rounded-lg bg-warning-soft px-3 py-2">
                      Pendente: {x}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-success">A loja está pronta para publicação.</p>
              )}
            </div>
          </Panel>
          <StoreDomainsPanel storeId={s.id} organizationId={s.organization_id} slug={s.slug} />
          <Panel
            title="Preview responsivo"
            actions={
              <div className="flex gap-1 text-muted-foreground">
                <Monitor className="h-4 w-4" />
                <Tablet className="h-4 w-4" />
                <Smartphone className="h-4 w-4" />
              </div>
            }
          >
            <div
              className="m-5 overflow-hidden rounded-2xl border bg-white"
              style={{ borderColor: t.border }}
            >
              <div
                className="flex items-center justify-between px-5 py-4"
                style={{ color: t.text }}
              >
                <b>{s.name}</b>
                <Badge value="Preview" label="Preview" />
              </div>
              <div className="p-10" style={{ background: t.background, color: t.text }}>
                <p style={{ color: t.accent }} className="text-sm font-bold">
                  STOREFRONT
                </p>
                <h2 className="mt-2 text-3xl font-bold">Sua loja, sua marca.</h2>
                <p className="mt-3 max-w-md text-sm opacity-70">
                  O preview usa o tema e as seções da loja sem exigir publicação.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}
