import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Badge,
  Btn,
  EntityHeader,
  ErrorNote,
  Field,
  Panel,
  SelectInput,
  TextInput,
} from "@/components/admin/ui";
import { ProductRichContent } from "@/components/storefront/ProductRichContent";
import {
  duplicateContentBlockPosition,
  moveContentBlock,
  visibleContentBlocks,
} from "@/lib/product-rich-content";
import { uploadProductMedia } from "@/lib/catalog/media";
import {
  initialProductMediaFields,
  moveProductMedia,
  primaryProductMediaUpdate,
  productMediaRemovalPlan,
  productMediaUploadErrorMessage,
  productMediaVariantUpdate,
  updateProductMediaUploadStatus,
  type ProductMediaUploadStatus,
} from "@/lib/catalog/product-media";
import { useCatalogRefs } from "@/lib/admin/queries";
import {
  editableVariantAttributes,
  isCategoryChangeBlocked,
  isDuplicateVariantCombination,
  mergeVariantAttributes,
  productMasterUpdate,
  readVariantDimensions,
  validateVariantEdit,
  variantAttributeDefinitions,
  variantDimensionsUpdate,
  variantUpdateTarget,
  type EditableProductVariant,
  type VariantAttributeDefinition,
} from "@/lib/catalog/product-editing";
import {
  isCategoryAttributeType,
  readCategoryAttributeOptions,
} from "@/lib/catalog/category-attributes";

type ContentBlockType =
  | "text"
  | "image"
  | "banner"
  | "image_text"
  | "two_images"
  | "benefits"
  | "size_guide"
  | "faq"
  | "spacer";
type ContentConfig = Record<
  string,
  string | boolean | number | string[] | Record<string, string>[] | string[][]
>;
type BenefitItem = { title: string; text: string };
type FaqItem = { question: string; answer: string };
type SizeGuideRows = string[][];
type ProductContentBlock = {
  id: string;
  product_id: string;
  type: ContentBlockType;
  position: number;
  is_visible: boolean;
  config: ContentConfig;
};
type ProductMedia = {
  id: string;
  storage_path: string;
  alt_text: string | null;
  variant_id: string | null;
  sort_order: number;
  is_primary: boolean;
};
type ProductVariant = {
  id: string;
  product_id: string;
  sku: string;
  internal_code?: string | null;
  gtin?: string | null;
  barcode?: string | null;
  attributes: Record<string, string>;
  is_active: boolean;
  weight_grams?: number | null;
  dimensions?: unknown;
};
type ProductMaster = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description?: string | null;
  reference?: string | null;
  audience?: string | null;
  tags?: string[] | null;
  category_id: string | null;
  brand_id: string | null;
  status: string;
  updated_at: string;
};
type UploadItem = { id: string; file: File; status: ProductMediaUploadStatus; message?: string };
type Update = Record<string, string | boolean | number | null | ContentConfig>;
const db = supabase;
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
    !d.variants.some((v: ProductVariant) => v.is_active) && "Sem SKU ativo",
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
                health.map((x: ProductMedia) => (
                  <Badge key={x} value="warning">
                    {x}
                  </Badge>
                ))
              ) : (
                <Badge value="active">Cadastro completo</Badge>
              )}
            </div>
          </Panel>
          <ProductMasterEditor
            product={p as ProductMaster}
            variants={d.variants as ProductVariant[]}
            reload={q.refetch}
          />
        </div>
      ) : null}
      {tab === "Variantes/SKUs" ? (
        <VariantManager
          categoryId={p.category_id}
          variants={d.variants as ProductVariant[]}
          reload={q.refetch}
        />
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
            {d.offers.map(
              (o: {
                id: string;
                status: string;
                moq: number;
                organizations?: { name?: string } | null;
              }) => (
                <div key={o.id} className="flex justify-between rounded-lg border p-3">
                  <span>
                    {o.organizations?.name || "Fornecedor"} · MOQ {o.moq}
                  </span>
                  <Badge value={o.status} />
                </div>
              ),
            ) || <p>Sem ofertas.</p>}
          </div>
        </Panel>
      ) : null}
      {tab === "Lojas" ? (
        <Panel title="Lojas que usam este produto">
          <div className="space-y-2 p-5">
            {d.listings.map(
              (l: {
                id: string;
                status: string;
                visibility: string;
                stores?: { name?: string } | null;
              }) => (
                <div key={l.id} className="flex justify-between rounded-lg border p-3">
                  <span>
                    {l.stores?.name || "Loja"} · {l.visibility}
                  </span>
                  <Badge value={l.status} />
                </div>
              ),
            ) || <p>Sem listings.</p>}
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
            {d.activity.map((a: { id: string; action: string; occurred_at: string }) => (
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

function ProductMasterEditor({
  product,
  variants,
  reload,
}: {
  product: ProductMaster;
  variants: ProductVariant[];
  reload: () => unknown;
}) {
  const refs = useCatalogRefs();
  const initialDraft = () => ({
    name: product.name,
    shortDescription: product.short_description ?? "",
    description: product.description ?? "",
    reference: product.reference ?? "",
    audience: product.audience ?? "",
    tags: (product.tags ?? []).join(", "),
    categoryId: product.category_id ?? "",
    brandId: product.brand_id ?? "",
  });
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const set = (key: keyof ReturnType<typeof initialDraft>, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setError(null);
    setSuccess(null);
    if (!draft.name.trim()) {
      setError("Informe o nome do Product Master.");
      return;
    }
    if (isCategoryChangeBlocked(product.category_id, draft.categoryId || null, variants)) {
      setError(
        "A categoria não pode ser alterada enquanto as variantes possuem atributos estruturais. Preserve a categoria ou revise as variantes em uma operação segura.",
      );
      return;
    }
    setSaving(true);
    const { data, error: updateError } = await db
      .from("products")
      .update(productMasterUpdate(draft))
      .eq("id", product.id)
      .eq("updated_at", product.updated_at)
      .select("id")
      .maybeSingle();
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    if (!data) {
      setError(
        "Este produto foi alterado em outra sessão. Atualize a página antes de tentar novamente.",
      );
      return;
    }
    setSuccess("Product Master atualizado.");
    reload();
  };
  return (
    <Panel
      title="Editar Product Master"
      description="Identidade comercial e dados descritivos. SKU e código interno pertencem às variantes."
      actions={
        <div className="flex gap-2">
          <Btn variant="ghost" disabled={saving} onClick={() => setDraft(initialDraft())}>
            Cancelar
          </Btn>
          <Btn disabled={saving} onClick={save}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </Btn>
        </div>
      }
    >
      <div className="grid gap-4 p-5">
        <ErrorNote error={error} />
        {success && (
          <p className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">{success}</p>
        )}
        <Field label="Nome">
          <TextInput value={draft.name} onChange={(event) => set("name", event.target.value)} />
        </Field>
        <Field label="Descrição curta">
          <TextInput
            value={draft.shortDescription}
            onChange={(event) => set("shortDescription", event.target.value)}
          />
        </Field>
        <Field label="Descrição">
          <textarea
            className="min-h-28 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm"
            value={draft.description}
            onChange={(event) => set("description", event.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Modelo / referência">
            <TextInput
              value={draft.reference}
              onChange={(event) => set("reference", event.target.value)}
            />
          </Field>
          <Field label="Público / gênero">
            <TextInput
              value={draft.audience}
              onChange={(event) => set("audience", event.target.value)}
            />
          </Field>
          <Field
            label="Categoria"
            hint="Categorias com variantes estruturadas exigem preservação dos atributos atuais."
          >
            <SelectInput
              value={draft.categoryId}
              onChange={(event) => set("categoryId", event.target.value)}
            >
              <option value="">Sem categoria</option>
              {refs.data?.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Marca">
            <SelectInput
              value={draft.brandId}
              onChange={(event) => set("brandId", event.target.value)}
            >
              <option value="">Sem marca</option>
              {refs.data?.brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <Field label="Tags" hint="Separe tags por vírgula.">
          <TextInput value={draft.tags} onChange={(event) => set("tags", event.target.value)} />
        </Field>
      </div>
    </Panel>
  );
}

function VariantManager({
  categoryId,
  variants,
  reload,
}: {
  categoryId: string | null;
  variants: ProductVariant[];
  reload: () => unknown;
}) {
  const [editing, setEditing] = useState<ProductVariant | null>(null);
  const attributes = useQuery({
    queryKey: ["product-variant-attributes", categoryId],
    enabled: Boolean(categoryId),
    queryFn: async () => {
      const { data, error } = await db
        .from("category_attributes")
        .select("code,name,type,options,is_required,is_variant,sort_order")
        .eq("category_id", categoryId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).flatMap((attribute): VariantAttributeDefinition[] =>
        isCategoryAttributeType(attribute.type)
          ? [
              {
                ...attribute,
                type: attribute.type,
              },
            ]
          : [],
      );
    },
  });
  const definitions = variantAttributeDefinitions(attributes.data ?? []);
  return (
    <div className="space-y-5">
      <Panel
        title="Variantes e SKUs"
        description="Edite apenas dados operacionais seguros. SKU BemMais e código interno são identificadores automáticos."
      >
        <div className="overflow-x-auto p-5">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th>SKU BemMais</th>
                <th>Código interno</th>
                <th>GTIN/EAN oficial</th>
                <th>Atributos</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {variants.map((variant) => (
                <tr key={variant.id} className="border-t">
                  <td className="py-3 font-mono">{variant.sku}</td>
                  <td className="font-mono">{variant.internal_code || "—"}</td>
                  <td>{variant.gtin || variant.barcode || "—"}</td>
                  <td>
                    {Object.entries(variant.attributes || {})
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(" · ") || "Padrão"}
                  </td>
                  <td>
                    <Badge value={variant.is_active ? "active" : "paused"} />
                  </td>
                  <td className="text-right">
                    <Btn variant="outline" onClick={() => setEditing(variant)}>
                      Editar
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      {editing && (
        <VariantEditor
          variant={editing}
          variants={variants}
          definitions={definitions}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function VariantEditor({
  variant,
  variants,
  definitions,
  onClose,
  onSaved,
}: {
  variant: ProductVariant;
  variants: ProductVariant[];
  definitions: readonly VariantAttributeDefinition[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [gtin, setGtin] = useState(variant.gtin ?? variant.barcode ?? "");
  const [weight, setWeight] = useState(variant.weight_grams?.toString() ?? "");
  const [dimensions, setDimensions] = useState(() => readVariantDimensions(variant.dimensions));
  const [attributes, setAttributes] = useState(() =>
    editableVariantAttributes(variant.attributes ?? {}, definitions),
  );
  const [isActive, setIsActive] = useState(variant.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const mergedAttributes = mergeVariantAttributes(
      variant.attributes ?? {},
      attributes,
      definitions,
    );
    const validation = validateVariantEdit(gtin, attributes, definitions);
    if (validation) {
      setError(validation);
      return;
    }
    const editableVariants: EditableProductVariant[] = variants.map((item) => ({
      id: item.id,
      product_id: variant.product_id,
      sku: item.sku,
      internal_code: item.internal_code ?? null,
      gtin: item.gtin ?? item.barcode ?? null,
      attributes: item.attributes ?? {},
      is_active: item.is_active,
    }));
    if (
      isDuplicateVariantCombination(editableVariants, variant.id, mergedAttributes, definitions)
    ) {
      setError("Já existe uma variante com esta combinação de atributos.");
      return;
    }
    if (weight.trim() && (!Number.isInteger(Number(weight)) || Number(weight) < 0)) {
      setError("Peso deve ser um número inteiro em gramas.");
      return;
    }
    setSaving(true);
    setError(null);
    const target = variantUpdateTarget(variant);
    const { error: updateError } = await db
      .from("product_variants")
      .update({
        gtin: gtin.trim() || null,
        weight_grams: weight.trim() ? Number(weight) : null,
        dimensions,
        attributes: mergedAttributes,
        is_active: isActive,
      })
      .eq("id", target.id)
      .eq("product_id", target.productId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onSaved();
  };
  return (
    <Panel
      title={`Editar variante ${variant.sku}`}
      description="A atualização preserva o mesmo ID, SKU BemMais, código interno e todas as referências operacionais."
      actions={
        <div className="flex gap-2">
          <Btn variant="ghost" disabled={saving} onClick={onClose}>
            Cancelar
          </Btn>
          <Btn disabled={saving} onClick={save}>
            {saving ? "Salvando…" : "Salvar variante"}
          </Btn>
        </div>
      }
    >
      <div className="grid gap-4 p-5">
        <ErrorNote error={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="SKU BemMais" hint="Gerado automaticamente; não é editável nesta tela.">
            <TextInput value={variant.sku} disabled className="font-mono" />
          </Field>
          <Field
            label="Código interno BemMais"
            hint="Gerado automaticamente; não é editável nesta tela."
          >
            <TextInput value={variant.internal_code ?? ""} disabled className="font-mono" />
          </Field>
          <Field
            label="GTIN/EAN oficial"
            hint="Opcional; informe somente o código oficial do fabricante."
          >
            <TextInput
              value={gtin}
              inputMode="numeric"
              onChange={(event) => setGtin(event.target.value)}
            />
          </Field>
          <Field label="Peso (gramas)">
            <TextInput
              value={weight}
              inputMode="numeric"
              onChange={(event) => setWeight(event.target.value)}
            />
          </Field>
        </div>
        <fieldset className="grid gap-3 rounded-xl bg-secondary/40 p-4">
          <legend className="text-xs font-semibold">Dimensões (cm)</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["length_cm", "Comprimento"],
              ["width_cm", "Largura"],
              ["height_cm", "Altura"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <TextInput
                  value={dimensions[key]?.toString() ?? ""}
                  inputMode="decimal"
                  onChange={(event) =>
                    setDimensions((current) =>
                      variantDimensionsUpdate(current, key, event.target.value),
                    )
                  }
                />
              </Field>
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-3 rounded-xl bg-secondary/40 p-4">
          <legend className="text-xs font-semibold">Atributos que geram variante</legend>
          {!definitions.length ? (
            <p className="text-sm text-muted-foreground">
              Esta categoria não possui atributos estruturais de variante. Esta é a variante base do
              produto.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {definitions.map((definition) => {
                const options = readCategoryAttributeOptions(definition.options);
                const value = attributes[definition.code] ?? "";
                const selectable = definition.type === "select" || definition.type === "color";
                return (
                  <Field
                    key={definition.code}
                    label={definition.name}
                    hint={definition.is_required ? "Obrigatório" : "Opcional"}
                  >
                    {definition.type === "boolean" ? (
                      <SelectInput
                        value={value}
                        onChange={(event) =>
                          setAttributes((current) => ({
                            ...current,
                            [definition.code]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Selecionar</option>
                        <option value="true">Sim</option>
                        <option value="false">Não</option>
                      </SelectInput>
                    ) : selectable && options.length ? (
                      <SelectInput
                        value={value}
                        onChange={(event) =>
                          setAttributes((current) => ({
                            ...current,
                            [definition.code]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Selecionar</option>
                        {options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </SelectInput>
                    ) : (
                      <TextInput
                        value={value}
                        inputMode={definition.type === "number" ? "decimal" : undefined}
                        placeholder={
                          definition.type === "multi_select"
                            ? "Separe opções por vírgula"
                            : undefined
                        }
                        onChange={(event) =>
                          setAttributes((current) => ({
                            ...current,
                            [definition.code]: event.target.value,
                          }))
                        }
                      />
                    )}
                  </Field>
                );
              })}
            </div>
          )}
        </fieldset>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            checked={isActive}
            type="checkbox"
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Variante ativa
        </label>
      </div>
    </Panel>
  );
}

function MediaManager({
  productId,
  media,
  variants,
  reload,
}: {
  productId: string;
  media: ProductMedia[];
  variants: ProductVariant[];
  reload: () => unknown;
}) {
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const upload = async (files: FileList | null) => {
    if (!files) return;
    const batch = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending" as const,
    }));
    setUploads((current) => [...current, ...batch]);
    await Promise.all(
      batch.map(async (item) => {
        setUploads((current) => updateProductMediaUploadStatus(current, item.id, "uploading"));
        try {
          const path = await uploadProductMedia(productId, item.file);
          await db.from("product_media").insert({
            product_id: productId,
            storage_path: path,
            ...initialProductMediaFields(media.length),
          });
          setUploads((current) =>
            updateProductMediaUploadStatus(current, item.id, "success", "Concluído"),
          );
        } catch (error) {
          const message = productMediaUploadErrorMessage(error);
          setUploads((current) =>
            updateProductMediaUploadStatus(current, item.id, "error", message),
          );
        }
      }),
    );
    reload();
  };
  const update = (id: string, v: Update) =>
    db.from("product_media").update(v).eq("id", id).then(reload);
  const remove = async (m: ProductMedia) => {
    if (!confirm("Remover esta imagem?")) return;
    const plan = productMediaRemovalPlan(media, m.id);
    if (plan.promoteId) {
      await db.from("product_media").update({ is_primary: true }).eq("id", plan.promoteId);
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
          <Btn>Adicionar imagens</Btn>
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
        {uploads.map((item) => (
          <p key={item.id} className="col-span-full text-sm">
            {item.file.name} —{" "}
            {item.status === "pending"
              ? "Pendente"
              : item.status === "uploading"
                ? "Enviando"
                : item.status === "success"
                  ? "Concluído"
                  : `Erro: ${item.message}`}
          </p>
        ))}
        {media.map((m: ProductMedia, i: number) => (
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
              onChange={(e) => update(m.id, productMediaVariantUpdate(e.target.value || null))}
            >
              <option value="">Sem variante</option>
              {variants.map((v: ProductVariant) => (
                <option key={v.id} value={v.id}>
                  {v.sku}
                </option>
              ))}
            </select>
            <div className="mt-2 flex gap-1">
              <Btn variant="outline" onClick={() => update(m.id, primaryProductMediaUpdate(m.id))}>
                Principal
              </Btn>
              <Btn
                variant="ghost"
                disabled={!i}
                onClick={() => {
                  const updates = moveProductMedia(media, m.id, "up");
                  if (updates) {
                    update(updates[0].id, { sort_order: updates[0].sort_order }).then(() =>
                      update(updates[1].id, { sort_order: updates[1].sort_order }),
                    );
                  }
                }}
              >
                ↑
              </Btn>
              <Btn
                variant="ghost"
                disabled={i === media.length - 1}
                onClick={() => {
                  const updates = moveProductMedia(media, m.id, "down");
                  if (updates) {
                    update(updates[0].id, { sort_order: updates[0].sort_order }).then(() =>
                      update(updates[1].id, { sort_order: updates[1].sort_order }),
                    );
                  }
                }}
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
function ContentManager({
  productId,
  blocks,
  media,
  reload,
}: {
  productId: string;
  blocks: ProductContentBlock[];
  media: ProductMedia[];
  reload: () => unknown;
}) {
  const [type, setType] = useState("text");
  const [editing, setEditing] = useState<ProductContentBlock | null>(null);
  const add = async () => {
    await db.from("product_content_blocks").insert({
      product_id: productId,
      type,
      position: blocks.length,
      config: type === "faq" ? { items: [] } : type === "benefits" ? { items: [] } : {},
    });
    reload();
  };
  const upd = (id: string, v: Update) =>
    db.from("product_content_blocks").update(v).eq("id", id).then(reload);
  const move = async (id: string, direction: "up" | "down") => {
    const updates = moveContentBlock(blocks, id, direction);
    if (!updates) return;
    for (const update of updates) {
      const { error } = await db
        .from("product_content_blocks")
        .update({ position: update.position })
        .eq("id", update.id);
      if (error) throw error;
    }
    reload();
  };
  const duplicate = async (b: ProductContentBlock) => {
    const plan = duplicateContentBlockPosition(blocks, b.id);
    if (!plan) return;
    for (const update of plan.positionUpdates) {
      const { error } = await db
        .from("product_content_blocks")
        .update({ position: update.position })
        .eq("id", update.id);
      if (error) throw error;
    }
    const { error } = await db.from("product_content_blocks").insert({
      product_id: productId,
      type: b.type,
      position: plan.copyPosition,
      is_visible: b.is_visible,
      config: b.config,
    });
    if (error) throw error;
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
            blocks.map((b: ProductContentBlock, i: number) => (
              <div key={b.id} className="rounded-xl border p-3">
                <div className="flex justify-between">
                  <b>{b.type}</b>
                  <div>
                    <Btn variant="ghost" disabled={!i} onClick={() => move(b.id, "up")}>
                      ↑
                    </Btn>
                    <Btn
                      variant="ghost"
                      disabled={i === blocks.length - 1}
                      onClick={() => move(b.id, "down")}
                    >
                      ↓
                    </Btn>
                    <Btn variant="ghost" onClick={() => upd(b.id, { is_visible: !b.is_visible })}>
                      {b.is_visible ? "Ocultar" : "Mostrar"}
                    </Btn>
                    <Btn variant="ghost" onClick={() => setEditing(b)}>
                      Editar
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
                    {media.map((m: ProductMedia) => (
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
      {editing && (
        <BasicBlockForm
          block={editing}
          media={media}
          onClose={() => setEditing(null)}
          onSave={(config) => upd(editing.id, { config })}
        />
      )}
      <Panel title="Preview">
        <div className="p-5">
          <ProductRichContent blocks={visibleContentBlocks(blocks)} />
        </div>
      </Panel>
    </div>
  );
}

function BasicBlockForm({
  block,
  media,
  onClose,
  onSave,
}: {
  block: ProductContentBlock;
  media: ProductMedia[];
  onClose: () => void;
  onSave: (config: ContentConfig) => unknown;
}) {
  const [config, setConfig] = useState<ContentConfig>(block.config);
  const benefits = (): BenefitItem[] => {
    const items = config.items;
    if (!Array.isArray(items)) return [];
    return items.flatMap((item): BenefitItem[] => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
      const title = item.title;
      const text = item.text;
      return typeof title === "string"
        ? [{ title, text: typeof text === "string" ? text : "" }]
        : [];
    });
  };
  const setBenefits = (items: BenefitItem[]) => setConfig({ ...config, items });
  const faqs = (): FaqItem[] => {
    const items = config.items;
    if (!Array.isArray(items)) return [];
    return items.flatMap((item): FaqItem[] => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
      const question = item.question;
      const answer = item.answer;
      return typeof question === "string"
        ? [{ question, answer: typeof answer === "string" ? answer : "" }]
        : [];
    });
  };
  const setFaqs = (items: FaqItem[]) => setConfig({ ...config, items });
  const sizeRows = (): SizeGuideRows =>
    Array.isArray(config.rows)
      ? config.rows.filter(
          (row): row is string[] =>
            Array.isArray(row) && row.every((cell) => typeof cell === "string"),
        )
      : [];
  const setSizeRows = (rows: SizeGuideRows) => setConfig({ ...config, rows });
  const set = (key: string, value: string) => setConfig({ ...config, [key]: value });
  const visual = block.type === "image" || block.type === "banner";
  return (
    <Panel
      title={`Editar ${block.type}`}
      actions={
        <Btn
          onClick={() => {
            onSave(config);
            onClose();
          }}
        >
          Salvar
        </Btn>
      }
    >
      <div className="grid gap-3 p-5">
        {block.type === "text" && (
          <>
            <input
              placeholder="Título"
              value={String(config.title || "")}
              onChange={(e) => set("title", e.target.value)}
            />
            <input
              placeholder="Subtítulo"
              value={String(config.subtitle || "")}
              onChange={(e) => set("subtitle", e.target.value)}
            />
            <textarea
              placeholder="Texto"
              value={String(config.text || "")}
              onChange={(e) => set("text", e.target.value)}
            />
          </>
        )}
        {visual && (
          <>
            <select
              value={String(config.image || "")}
              onChange={(e) => set("image", e.target.value)}
            >
              <option value="">Selecionar imagem</option>
              {media.map((m) => (
                <option key={m.id} value={m.storage_path}>
                  {m.alt_text || "Imagem"}
                </option>
              ))}
            </select>
            {config.image && (
              <img src={String(config.image)} alt="" className="h-24 w-24 object-cover" />
            )}
            <input
              placeholder="Alt text"
              value={String(config.alt || "")}
              onChange={(e) => set("alt", e.target.value)}
            />
            <input
              placeholder="Link opcional"
              value={String(config.link || "")}
              onChange={(e) => set("link", e.target.value)}
            />
          </>
        )}
        {block.type === "spacer" && (
          <select
            value={String(config.size || "medium")}
            onChange={(e) => set("size", e.target.value)}
          >
            <option value="small">Pequeno</option>
            <option value="medium">Médio</option>
            <option value="large">Grande</option>
          </select>
        )}
        {block.type === "image_text" && (
          <>
            <label>
              Imagem
              <select
                value={String(config.image || "")}
                onChange={(e) => set("image", e.target.value)}
              >
                <option value="">
                  {media.length
                    ? "Selecionar imagem"
                    : "Este produto ainda não possui imagens. Adicione imagens na aba Mídia."}
                </option>
                {media.map((m) => (
                  <option key={m.id} value={m.storage_path}>
                    {m.alt_text || "Imagem"}
                  </option>
                ))}
              </select>
            </label>
            {config.image && (
              <img src={String(config.image)} alt="" className="h-24 w-24 object-cover" />
            )}
            <label>
              Posição
              <select
                value={config.reverse === true ? "right" : "left"}
                onChange={(e) => setConfig({ ...config, reverse: e.target.value === "right" })}
              >
                <option value="left">Imagem à esquerda</option>
                <option value="right">Imagem à direita</option>
              </select>
            </label>
            <input
              placeholder="Título"
              value={String(config.title || "")}
              onChange={(e) => set("title", e.target.value)}
            />
            <textarea
              placeholder="Texto"
              value={String(config.text || "")}
              onChange={(e) => set("text", e.target.value)}
            />
          </>
        )}
        {block.type === "two_images" && (
          <>
            <label>
              Imagem 1
              <select
                value={String(config.left_image || "")}
                onChange={(e) => set("left_image", e.target.value)}
              >
                <option value="">
                  {media.length
                    ? "Selecionar imagem"
                    : "Este produto ainda não possui imagens. Adicione imagens na aba Mídia."}
                </option>
                {media.map((m) => (
                  <option key={m.id} value={m.storage_path}>
                    {m.alt_text || "Imagem"}
                  </option>
                ))}
              </select>
            </label>
            {config.left_image && (
              <img src={String(config.left_image)} alt="" className="h-24 w-24 object-cover" />
            )}
            <input
              placeholder="Alt da imagem 1"
              value={String(config.left_alt || "")}
              onChange={(e) => set("left_alt", e.target.value)}
            />
            <label>
              Imagem 2
              <select
                value={String(config.right_image || "")}
                onChange={(e) => set("right_image", e.target.value)}
              >
                <option value="">
                  {media.length
                    ? "Selecionar imagem"
                    : "Este produto ainda não possui imagens. Adicione imagens na aba Mídia."}
                </option>
                {media.map((m) => (
                  <option key={m.id} value={m.storage_path}>
                    {m.alt_text || "Imagem"}
                  </option>
                ))}
              </select>
            </label>
            {config.right_image && (
              <img src={String(config.right_image)} alt="" className="h-24 w-24 object-cover" />
            )}
            <input
              placeholder="Alt da imagem 2"
              value={String(config.right_alt || "")}
              onChange={(e) => set("right_alt", e.target.value)}
            />
          </>
        )}
        {block.type === "benefits" && (
          <div className="grid gap-3">
            <Btn
              variant="outline"
              onClick={() => setBenefits([...benefits(), { title: "", text: "" }])}
            >
              + Adicionar benefício
            </Btn>
            {!benefits().length && (
              <p className="text-sm text-muted-foreground">Nenhum benefício adicionado.</p>
            )}
            {benefits().map((item, index, items) => (
              <div key={index} className="grid gap-2 rounded-xl border border-border-subtle p-3">
                <b className="text-xs">Benefício {index + 1}</b>
                <input
                  placeholder="Título"
                  value={item.title}
                  onChange={(e) =>
                    setBenefits(
                      items.map((current, i) =>
                        i === index ? { ...current, title: e.target.value } : current,
                      ),
                    )
                  }
                />
                <textarea
                  placeholder="Descrição"
                  value={item.text}
                  onChange={(e) =>
                    setBenefits(
                      items.map((current, i) =>
                        i === index ? { ...current, text: e.target.value } : current,
                      ),
                    )
                  }
                />
                <div className="flex gap-1">
                  <Btn
                    variant="ghost"
                    disabled={!index}
                    onClick={() => {
                      const next = [...items];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      setBenefits(next);
                    }}
                  >
                    ↑
                  </Btn>
                  <Btn
                    variant="ghost"
                    disabled={index === items.length - 1}
                    onClick={() => {
                      const next = [...items];
                      [next[index], next[index + 1]] = [next[index + 1], next[index]];
                      setBenefits(next);
                    }}
                  >
                    ↓
                  </Btn>
                  <Btn
                    variant="ghost"
                    onClick={() => setBenefits(items.filter((_, i) => i !== index))}
                  >
                    Remover
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}
        {block.type === "faq" && (
          <div className="grid gap-3">
            <Btn
              variant="outline"
              onClick={() => setFaqs([...faqs(), { question: "", answer: "" }])}
            >
              + Adicionar pergunta
            </Btn>
            {!faqs().length && (
              <p className="text-sm text-muted-foreground">Nenhuma pergunta adicionada.</p>
            )}
            {faqs().map((item, index, items) => (
              <div key={index} className="grid gap-2 rounded-xl border border-border-subtle p-3">
                <b className="text-xs">Pergunta {index + 1}</b>
                <input
                  placeholder="Pergunta"
                  value={item.question}
                  onChange={(e) =>
                    setFaqs(
                      items.map((current, i) =>
                        i === index ? { ...current, question: e.target.value } : current,
                      ),
                    )
                  }
                />
                <textarea
                  placeholder="Resposta"
                  value={item.answer}
                  onChange={(e) =>
                    setFaqs(
                      items.map((current, i) =>
                        i === index ? { ...current, answer: e.target.value } : current,
                      ),
                    )
                  }
                />
                <div className="flex gap-1">
                  <Btn
                    variant="ghost"
                    disabled={!index}
                    onClick={() => {
                      const next = [...items];
                      [next[index - 1], next[index]] = [next[index], next[index - 1]];
                      setFaqs(next);
                    }}
                  >
                    ↑
                  </Btn>
                  <Btn
                    variant="ghost"
                    disabled={index === items.length - 1}
                    onClick={() => {
                      const next = [...items];
                      [next[index], next[index + 1]] = [next[index + 1], next[index]];
                      setFaqs(next);
                    }}
                  >
                    ↓
                  </Btn>
                  <Btn variant="ghost" onClick={() => setFaqs(items.filter((_, i) => i !== index))}>
                    Remover
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        )}
        {block.type === "size_guide" &&
          (() => {
            const rows = sizeRows();
            const columns = rows[0]?.length ?? 0;
            const addColumn = () =>
              setSizeRows(rows.length ? rows.map((row) => [...row, ""]) : [[""]]);
            const removeColumn = (column: number) =>
              setSizeRows(rows.map((row) => row.filter((_, i) => i !== column)));
            const change = (row: number, column: number, value: string) =>
              setSizeRows(
                rows.map((cells, ri) =>
                  ri === row ? cells.map((cell, ci) => (ci === column ? value : cell)) : cells,
                ),
              );
            return (
              <div className="grid gap-3 overflow-x-auto">
                <div className="flex gap-2">
                  <Btn variant="outline" onClick={addColumn}>
                    + Adicionar coluna
                  </Btn>
                  <Btn
                    variant="outline"
                    disabled={!columns}
                    onClick={() =>
                      setSizeRows([...rows, Array.from({ length: columns }, () => "")])
                    }
                  >
                    + Adicionar linha
                  </Btn>
                </div>
                {!rows.length && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum guia de medidas configurado.
                  </p>
                )}
                {rows.map((row, ri) => (
                  <div key={ri} className="flex min-w-max gap-2">
                    {row.map((cell, ci) => (
                      <div key={ci} className="grid gap-1">
                        <input
                          value={cell}
                          placeholder={ri === 0 ? "Cabeçalho" : "Célula"}
                          onChange={(e) => change(ri, ci, e.target.value)}
                        />
                        {ri === 0 && (
                          <Btn variant="ghost" onClick={() => removeColumn(ci)}>
                            Remover coluna
                          </Btn>
                        )}
                      </div>
                    ))}
                    {ri > 0 && (
                      <Btn
                        variant="ghost"
                        onClick={() => setSizeRows(rows.filter((_, i) => i !== ri))}
                      >
                        Remover linha
                      </Btn>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        <Btn variant="ghost" onClick={onClose}>
          Cancelar
        </Btn>
      </div>
    </Panel>
  );
}
