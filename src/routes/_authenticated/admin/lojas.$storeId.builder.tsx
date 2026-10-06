import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EntityHeader, Panel, Btn } from "@/components/admin/ui";
import { PLATFORM_STORE_DOMAIN, publicationMissing } from "@/lib/storefront";
import { StoreDomainsPanel } from "@/components/admin/stores/StoreDomainsPanel";
import { StoreBuilderWorkspace } from "@/components/admin/stores/StoreBuilderWorkspace";
export const Route = createFileRoute("/_authenticated/admin/lojas/$storeId/builder")({
  component: Builder,
});
function Builder() {
  const { storeId } = Route.useParams();
  const qc = useQueryClient();
  const [publishError, setPublishError] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["store-builder", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select(
          "id,name,slug,logo_url,favicon_url,status,mode,theme,seo,organization_id,published_revision,draft_revision,store_listings(count)",
        )
        .eq("id", storeId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const publish = useMutation({
    mutationFn: async () => {
      setPublishError(null);
      const { error } = await (supabase as any).rpc("publish_store", { _store_id: storeId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store-builder", storeId] }),
    onError: (error) =>
      setPublishError(error instanceof Error ? error.message : "Não foi possível publicar a loja."),
  });
  if (q.isLoading) return <p className="p-8">Carregando Builder…</p>;
  if (!q.data) return <p className="p-8">Loja não encontrada.</p>;
  const s = q.data as typeof q.data & {
    favicon_url?: string | null;
    seo?: unknown;
    theme?: unknown;
    published_revision?: number;
    draft_revision?: number;
    store_listings?: { count: number }[];
  };
  const missing = publicationMissing(s, s.store_listings?.[0]?.count ?? 0);
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
            <Link to="/s/$slug" params={{ slug: s.slug }} search={{ preview: storeId }}>
              <Btn variant="outline">
                <ExternalLink className="h-4 w-4" /> Preview do rascunho
              </Btn>
            </Link>
            <Btn disabled={!!missing.length || publish.isPending} onClick={() => publish.mutate()}>
              Publicar
            </Btn>
          </>
        }
      />
      <div className="space-y-5">
        <Panel
          title="Checklist de publicação"
          description="Somente requisitos essenciais bloqueiam a publicação."
        >
          <div className="p-5">
            {s.status === "published" ? (
              <p className="mb-3 text-sm text-muted-foreground">
                {s.draft_revision !== s.published_revision
                  ? "Alterações não publicadas"
                  : "Versão pública atualizada"}
              </p>
            ) : null}
            {publishError ? <p className="mb-3 text-sm text-destructive">{publishError}</p> : null}
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
        <StoreBuilderWorkspace store={s} />
        <StoreDomainsPanel storeId={s.id} organizationId={s.organization_id} slug={s.slug} />
      </div>
    </main>
  );
}
