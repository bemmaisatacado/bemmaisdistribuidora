/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge, Btn, EntityHeader, Panel } from "@/components/admin/ui";
import { ProductRichContent } from "@/components/storefront/ProductRichContent";
import { uploadProductMedia } from "@/lib/catalog/media";

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
      const [product, variants, media, offers, listings, activity, blocks] = await Promise.all([
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
        db.from("product_content_blocks").select("*").eq("product_id", productId).order("position"),
      ]);
      if (product.error) throw product.error;
      return {
        product: product.data,
        variants: variants.data ?? [],
        media: media.data ?? [],
        offers: offers.data ?? [],
        listings: listings.data ?? [],
        activity: activity.data ?? [],
        blocks: blocks.data ?? [],
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
        {[
          "Resumo",
          "Variantes/SKUs",
          "Mídia",
          "Conteúdo da Página",
          "Ofertas",
          "Lojas",
          "Estoque",
          "Atividade",
        ].map((x) => (
          <Btn key={x} variant={tab === x ? "default" : "outline"} onClick={() => setTab(x)}>
            {x}
          </Btn>
        ))}
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
        <MediaManager
          productId={productId}
          media={d.media}
          variants={d.variants}
          reload={q.refetch}
        />
      ) : null}
      {tab === "Conteúdo da Página" ? (
        <ContentManager
          productId={productId}
          blocks={d.blocks}
          media={d.media}
          reload={q.refetch}
        />
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

function MediaManager({ productId, media, variants, reload }: any) {
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    for (const file of Array.from(files)) {
      try {
        const path = await uploadProductMedia(productId, file);
        await db.from("product_media").insert({
          product_id: productId,
          storage_path: path,
          sort_order: media.length,
          is_primary: !media.length,
        });
      } catch {
        // One rejected file must not interrupt the remaining uploads.
      }
    }
    setBusy(false);
    reload();
  };
  const update = (id: string, v: any) =>
    db.from("product_media").update(v).eq("id", id).then(reload);
  const remove = async (m: any) => {
    if (!confirm("Remover esta imagem?")) return;
    if (m.is_primary) {
      const next = media.find((x: any) => x.id !== m.id);
      if (next) await db.from("product_media").update({ is_primary: true }).eq("id", next.id);
    }
    await db.from("product_media").delete().eq("id", m.id);
    await db.storage.from("product-media").remove([m.storage_path]);
    reload();
  };
  return (
    <Panel
      title="Galeria"
      actions={
        <label>
          <Btn disabled={busy}>{busy ? "Enviando…" : "Adicionar imagens"}</Btn>
          <input
            className="hidden"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => upload(e.target.files)}
          />
        </label>
      }
    >
      <div className="grid gap-3 p-5 sm:grid-cols-3">
        {media.map((m: any, i: number) => (
          <div key={m.id} className="rounded-xl border p-3">
            <img
              src={m.storage_path}
              alt=""
              className="aspect-square w-full rounded-lg object-cover"
            />
            <input
              className="mt-2 w-full"
              value={m.alt_text || ""}
              placeholder="Texto alternativo"
              onBlur={(e) => update(m.id, { alt_text: e.target.value })}
              onChange={() => {}}
            />
            <select
              className="mt-2 w-full"
              value={m.variant_id || ""}
              onChange={(e) => update(m.id, { variant_id: e.target.value || null })}
            >
              <option value="">Sem variante</option>
              {variants.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.sku}
                </option>
              ))}
            </select>
            <div className="mt-2 flex gap-1">
              <Btn variant="outline" onClick={() => update(m.id, { is_primary: true })}>
                Principal
              </Btn>
              <Btn
                variant="ghost"
                disabled={!i}
                onClick={() =>
                  update(m.id, { sort_order: media[i - 1].sort_order }).then(() =>
                    update(media[i - 1].id, { sort_order: m.sort_order }),
                  )
                }
              >
                ↑
              </Btn>
              <Btn
                variant="ghost"
                disabled={i === media.length - 1}
                onClick={() =>
                  update(m.id, { sort_order: media[i + 1].sort_order }).then(() =>
                    update(media[i + 1].id, { sort_order: m.sort_order }),
                  )
                }
              >
                ↓
              </Btn>
              <Btn variant="ghost" onClick={() => remove(m)}>
                Remover
              </Btn>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
function ContentManager({ productId, blocks, media, reload }: any) {
  const [type, setType] = useState("text");
  const add = async () => {
    await db.from("product_content_blocks").insert({
      product_id: productId,
      type,
      position: blocks.length,
      config: type === "faq" ? { items: [] } : type === "benefits" ? { items: [] } : {},
    });
    reload();
  };
  const upd = (id: string, v: any) =>
    db.from("product_content_blocks").update(v).eq("id", id).then(reload);
  const duplicate = async (b: any) => {
    await db.from("product_content_blocks").insert({
      product_id: productId,
      type: b.type,
      position: b.position + 1,
      is_visible: b.is_visible,
      config: b.config,
    });
    reload();
  };
  return (
    <div className="space-y-4">
      <Panel
        title="Conteúdo da Página"
        description="Blocos aparecem abaixo da área comercial após a próxima publicação da Store."
        actions={
          <>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {[
                "text",
                "image",
                "banner",
                "image_text",
                "two_images",
                "benefits",
                "size_guide",
                "faq",
                "spacer",
              ].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <Btn onClick={add}>+ Adicionar bloco</Btn>
          </>
        }
      >
        <div className="space-y-2 p-5">
          {blocks.length ? (
            blocks.map((b: any, i: number) => (
              <div key={b.id} className="rounded-xl border p-3">
                <div className="flex justify-between">
                  <b>{b.type}</b>
                  <div>
                    <Btn
                      variant="ghost"
                      disabled={!i}
                      onClick={() =>
                        upd(b.id, { position: b.position - 1 }).then(() =>
                          upd(blocks[i - 1].id, { position: b.position }),
                        )
                      }
                    >
                      ↑
                    </Btn>
                    <Btn variant="ghost" onClick={() => upd(b.id, { is_visible: !b.is_visible })}>
                      {b.is_visible ? "Ocultar" : "Mostrar"}
                    </Btn>
                    <Btn variant="ghost" onClick={() => duplicate(b)}>
                      Duplicar
                    </Btn>
                    <Btn
                      variant="ghost"
                      onClick={() =>
                        confirm("Excluir bloco?") &&
                        db.from("product_content_blocks").delete().eq("id", b.id).then(reload)
                      }
                    >
                      Excluir
                    </Btn>
                  </div>
                </div>
                <textarea
                  className="mt-2 w-full"
                  placeholder="Conteúdo do bloco"
                  value={b.config.text || ""}
                  onChange={(e) => upd(b.id, { config: { ...b.config, text: e.target.value } })}
                />
                {["image", "banner", "image_text"].includes(b.type) && (
                  <select
                    className="mt-2 w-full"
                    value={b.config.image || ""}
                    onChange={(e) => upd(b.id, { config: { ...b.config, image: e.target.value } })}
                  >
                    <option value="">Selecionar mídia</option>
                    {media.map((m: any) => (
                      <option key={m.id} value={m.storage_path}>
                        {m.alt_text || m.storage_path}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))
          ) : (
            <p>Enriqueça a página deste produto com blocos visuais.</p>
          )}
        </div>
      </Panel>
      <Panel title="Preview">
        <div className="p-5">
          <ProductRichContent blocks={blocks.filter((b: any) => b.is_visible)} />
        </div>
      </Panel>
    </div>
  );
}
