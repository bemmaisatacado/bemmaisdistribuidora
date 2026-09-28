/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge, Btn, EntityHeader, Panel } from "@/components/admin/ui";

const db: any = supabase;
export const Route = createFileRoute("/_authenticated/admin/produtos/$productId")({
  component: Product360,
});

function Product360() {
  const { productId } = Route.useParams();
  const [tab, setTab] = useState("Resumo");
  const q = useQuery({
    queryKey: ["product-360", productId],
    queryFn: async () => {
      const [product, variants, media, offers, listings, activity] = await Promise.all([
        db
          .from("products")
          .select("*,categories(name,slug),brands(name,logo_url)")
          .eq("id", productId)
          .single(),
        db.from("product_variants").select("*").eq("product_id", productId).order("sku"),
        db
          .from("product_media")
          .select("*")
          .eq("product_id", productId)
          .order("is_primary", { ascending: false })
          .order("sort_order"),
        db
          .from("supplier_offers")
          .select("id,status,modalities,moq,lead_time_days,organizations(name)")
          .eq("product_id", productId),
        db
          .from("store_listings")
          .select("id,status,visibility,retail_price,stores(name,slug,status)")
          .eq("product_id", productId),
        db
          .from("audit_logs")
          .select("id,occurred_at,action,actor_id")
          .eq("entity_id", productId)
          .order("occurred_at", { ascending: false })
          .limit(30),
      ]);
      if (product.error) throw product.error;
      return {
        product: product.data,
        variants: variants.data ?? [],
        media: media.data ?? [],
        offers: offers.data ?? [],
        listings: listings.data ?? [],
        activity: activity.data ?? [],
      };
    },
  });
  if (q.isLoading) return <main className="p-8">Carregando produto…</main>;
  if (!q.data) return <main className="p-8">Produto não encontrado.</main>;
  const d = q.data,
    p = d.product,
    primary = d.media[0]?.storage_path || p.images?.[0];
  const health = [
    !d.media.length && "Sem imagem",
    !d.variants.some((v: any) => v.is_active) && "Sem SKU ativo",
    !d.offers.length && "Sem oferta",
    !p.description && "Descrição incompleta",
  ].filter(Boolean);
  return (
    <main className="space-y-5">
      <EntityHeader
        name={p.name}
        src={primary}
        status={p.status}
        meta={
          <>
            <span>{p.brands?.name || "Sem marca"}</span>
            <span>{p.categories?.name || "Sem categoria"}</span>
            <span>{p.reference || "Sem referência"}</span>
          </>
        }
        actions={
          <Link to="/admin/produtos">
            <Btn variant="outline">Voltar ao catálogo</Btn>
          </Link>
        }
      />
      <div className="flex gap-2 overflow-x-auto border-b pb-2">
        {["Resumo", "Variantes/SKUs", "Mídia", "Ofertas", "Lojas", "Estoque", "Atividade"].map(
          (x) => (
            <Btn key={x} variant={tab === x ? "default" : "outline"} onClick={() => setTab(x)}>
              {x}
            </Btn>
          ),
        )}
      </div>
      {tab === "Resumo" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Informações">
            <div className="space-y-2 p-5 text-sm">
              <p>{p.short_description || p.description || "Sem descrição."}</p>
              <p>
                Variantes: <b>{d.variants.length}</b> · Ofertas: <b>{d.offers.length}</b> · Lojas:{" "}
                <b>{d.listings.length}</b>
              </p>
              <p>Atualizado: {new Date(p.updated_at).toLocaleString("pt-BR")}</p>
            </div>
          </Panel>
          <Panel title="Saúde do cadastro">
            <div className="flex flex-wrap gap-2 p-5">
              {health.length ? (
                health.map((x: any) => (
                  <Badge key={x} value="warning">
                    {x}
                  </Badge>
                ))
              ) : (
                <Badge value="active">Cadastro completo</Badge>
              )}
            </div>
          </Panel>
        </div>
      ) : null}
      {tab === "Variantes/SKUs" ? (
        <Panel title="Variantes e SKUs">
          <div className="overflow-x-auto p-5">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th>SKU BemMais</th>
                  <th>Código interno</th>
                  <th>GTIN/EAN oficial</th>
                  <th>Atributos</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {d.variants.map((v: any) => (
                  <tr key={v.id} className="border-t">
                    <td className="py-3 font-mono">{v.sku}</td>
                    <td className="font-mono">{v.internal_code || "—"}</td>
                    <td>{v.gtin || v.barcode || "—"}</td>
                    <td>
                      {Object.entries(v.attributes || {})
                        .map(([k, val]) => `${k}: ${val}`)
                        .join(" · ") || "Padrão"}
                    </td>
                    <td>
                      <Badge value={v.is_active ? "active" : "paused"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
      {tab === "Mídia" ? (
        <Panel title="Galeria">
          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4">
            {d.media.length ? (
              d.media.map((m: any) => (
                <figure key={m.id}>
                  <img
                    src={m.storage_path}
                    alt={m.alt_text || ""}
                    className="aspect-square w-full rounded-xl object-cover"
                  />
                  <figcaption className="mt-1 text-xs">
                    {m.is_primary ? "Principal" : m.alt_text || "Imagem"}
                  </figcaption>
                </figure>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma imagem cadastrada.</p>
            )}
          </div>
        </Panel>
      ) : null}
      {tab === "Ofertas" ? (
        <Panel title="Ofertas de fornecedores">
          <div className="space-y-2 p-5">
            {d.offers.map((o: any) => (
              <div key={o.id} className="flex justify-between rounded-lg border p-3">
                <span>
                  {o.organizations?.name || "Fornecedor"} · MOQ {o.moq}
                </span>
                <Badge value={o.status} />
              </div>
            )) || <p>Sem ofertas.</p>}
          </div>
        </Panel>
      ) : null}
      {tab === "Lojas" ? (
        <Panel title="Lojas que usam este produto">
          <div className="space-y-2 p-5">
            {d.listings.map((l: any) => (
              <div key={l.id} className="flex justify-between rounded-lg border p-3">
                <span>
                  {l.stores?.name || "Loja"} · {l.visibility}
                </span>
                <Badge value={l.status} />
              </div>
            )) || <p>Sem listings.</p>}
          </div>
        </Panel>
      ) : null}
      {tab === "Estoque" ? (
        <Panel title="Estoque">
          <p className="p-5 text-sm text-muted-foreground">
            O estoque permanece no módulo operacional por SKU; não há ajuste direto nesta tela.
          </p>
        </Panel>
      ) : null}
      {tab === "Atividade" ? (
        <Panel title="Atividade">
          <div className="space-y-2 p-5">
            {d.activity.map((a: any) => (
              <p key={a.id} className="rounded-lg border p-3 text-sm">
                {a.action} · {new Date(a.occurred_at).toLocaleString("pt-BR")}
              </p>
            )) || <p>Sem atividade.</p>}
          </div>
        </Panel>
      ) : null}
    </main>
  );
}
