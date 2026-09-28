/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Copy, Grid2X2, List, PackagePlus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Constants, type Database } from "@/integrations/supabase/types";
import {
  Badge,
  Btn,
  DataTable,
  Empty,
  FilterBar,
  MetricCard,
  PageHeader,
  Panel,
  Pager,
  SearchBox,
  SelectInput,
  TextInput,
} from "@/components/admin/ui";
import { pageRange, STATUS_LABEL } from "@/lib/admin/format";
import {
  isOfficialGtin,
  variantLabel,
  variantMatrix,
  type VariantDraft,
} from "@/lib/catalog/identity";
import { useCatalogRefs } from "@/lib/admin/queries";

type Status = Database["public"]["Enums"]["catalog_status"];
const db: any = supabase;
export const Route = createFileRoute("/_authenticated/admin/produtos")({ component: Products });

function Products() {
  const catalogRefs = useCatalogRefs();
  const [page, setPage] = useState(0),
    [input, setInput] = useState(""),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState<"" | Status>(""),
    [category, setCategory] = useState(""),
    [brand, setBrand] = useState(""),
    [image, setImage] = useState(""),
    [sku, setSku] = useState(""),
    [offer, setOffer] = useState(""),
    [view, setView] = useState<"table" | "cards">(() =>
      localStorage.getItem("catalog-view") === "cards" ? "cards" : "table",
    ),
    [create, setCreate] = useState<"quick" | "full" | null>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(input);
      setPage(0);
    }, 300);
    return () => clearTimeout(id);
  }, [input]);
  useEffect(() => localStorage.setItem("catalog-view", view), [view]);
  const list = useQuery({
    queryKey: ["catalog-central", page, query, status, category, brand, image, sku, offer],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_catalog_search", {
        _query: query || null,
        _status: status || null,
        _category_id: category || null,
        _brand_id: brand || null,
        _image: image || null,
        _sku: sku || null,
        _offer: offer || null,
        _limit: 20,
        _offset: page * 20,
      });
      if (error) throw error;
      return { rows: data ?? [], count: data?.[0]?.total_count ?? 0 };
    },
  });
  const globalMetrics = useQuery({
    queryKey: ["catalog-metrics"],
    queryFn: async () => {
      const { data, error } = await db.rpc("admin_catalog_metrics");
      if (error) throw error;
      return data;
    },
  });
  const rows = useMemo(() => list.data?.rows ?? [], [list.data?.rows]);
  const metrics = useMemo(
    () => ({
      total: globalMetrics.data?.total ?? 0,
      active: rows.filter((r: any) => r.status === "active").length,
      draft: rows.filter((r: any) => r.status === "draft").length,
      noImage: rows.filter((r: any) => !r.product_media?.[0]?.count && !r.images?.length).length,
      noOffer: rows.filter((r: any) => !r.supplier_offers?.[0]?.count).length,
    }),
    [globalMetrics.data, rows],
  );
  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("products").update({ status: "archived" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => list.refetch(),
  });
  const duplicate = useMutation({
    mutationFn: async (r: any) => {
      const { error } = await db.rpc("create_product_master", {
        _name: `${r.name} (cópia)`,
        _slug: `${r.slug}-copia`,
        _variants: r.product_variants.map((v: any) => ({ attributes: {}, is_active: v.is_active })),
      });
      if (error) throw error;
    },
    onSuccess: () => list.refetch(),
  });
  const actions = (r: any) => (
    <div className="flex justify-end gap-1">
      <Link to="/admin/produtos/$productId" params={{ productId: r.id }}>
        <Btn variant="outline" className="h-8 text-xs">
          Ver
        </Btn>
      </Link>
      <Btn variant="ghost" title="Duplicar" onClick={() => duplicate.mutate(r)}>
        <Copy className="h-4 w-4" />
      </Btn>
      <Btn variant="ghost" title="Arquivar" onClick={() => archive.mutate(r.id)}>
        <Archive className="h-4 w-4" />
      </Btn>
    </div>
  );
  return (
    <>
      <PageHeader
        eyebrow="Product Master"
        title="Central de Catálogo"
        description="Identidade global separada de ofertas, custos e lojas."
        actions={
          <>
            <Btn variant="outline" onClick={() => setCreate("quick")}>
              <PackagePlus className="h-4 w-4" /> Cadastro rápido
            </Btn>
            <Btn onClick={() => setCreate("full")}>
              <Plus className="h-4 w-4" /> Cadastro completo
            </Btn>
          </>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Produtos" value={metrics.total} />
        <MetricCard label="Ativos" value={globalMetrics.data?.active ?? "—"} />
        <MetricCard label="Rascunhos" value={globalMetrics.data?.draft ?? "—"} />
        <MetricCard label="Sem imagem" value={globalMetrics.data?.without_image ?? "—"} />
        <MetricCard label="Sem oferta" value={globalMetrics.data?.without_offer ?? "—"} />
      </div>
      <Panel>
        <FilterBar
          active={[status, category, brand, image, sku, offer].filter(Boolean).length}
          onClear={() => {
            setStatus("");
            setInput("");
            setCategory("");
            setBrand("");
            setImage("");
            setSku("");
            setOffer("");
          }}
        >
          <SearchBox
            value={input}
            onChange={setInput}
            placeholder="Nome, referência, marca ou SKU"
          />
          <SelectInput
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status);
              setPage(0);
            }}
            className="w-44"
          >
            <option value="">Todos os status</option>
            {Constants.public.Enums.catalog_status.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </SelectInput>
          <CatalogFilter
            label="Categoria"
            value={category}
            set={setCategory}
            options={catalogRefs.data?.categories ?? []}
          />
          <CatalogFilter
            label="Marca"
            value={brand}
            set={setBrand}
            options={catalogRefs.data?.brands ?? []}
          />
          <SelectInput value={image} onChange={(e) => setImage(e.target.value)} className="w-36">
            <option value="">Imagem</option>
            <option value="yes">Com imagem</option>
            <option value="no">Sem imagem</option>
          </SelectInput>
          <SelectInput value={sku} onChange={(e) => setSku(e.target.value)} className="w-36">
            <option value="">SKU ativo</option>
            <option value="yes">Com SKU ativo</option>
            <option value="no">Sem SKU ativo</option>
          </SelectInput>
          <SelectInput value={offer} onChange={(e) => setOffer(e.target.value)} className="w-32">
            <option value="">Oferta</option>
            <option value="yes">Com oferta</option>
            <option value="no">Sem oferta</option>
          </SelectInput>
          <span className="ml-auto flex rounded-lg bg-secondary p-1">
            <Btn
              variant={view === "table" ? "primary" : "ghost"}
              className="h-8 px-2"
              onClick={() => setView("table")}
            >
              <List className="h-4 w-4" />
            </Btn>
            <Btn
              variant={view === "cards" ? "primary" : "ghost"}
              className="h-8 px-2"
              onClick={() => setView("cards")}
            >
              <Grid2X2 className="h-4 w-4" />
            </Btn>
          </span>
        </FilterBar>
        {view === "table" ? (
          <DataTable<any>
            rowKey={(r) => r.id}
            rows={rows}
            loading={list.isLoading}
            empty="Nenhum produto encontrado para estes filtros."
            columns={[
              {
                key: "p",
                label: "Produto",
                render: (r) => (
                  <div>
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.reference || r.slug}</p>
                  </div>
                ),
              },
              {
                key: "brand",
                label: "Marca / categoria",
                render: (r) => (
                  <span>
                    {r.brands?.name || "Sem marca"}
                    <br />
                    <small>{r.categories?.name || "Sem categoria"}</small>
                  </span>
                ),
              },
              {
                key: "sku",
                label: "Variantes / SKUs",
                render: (r) => r.product_variants?.length ?? 0,
              },
              { key: "offer", label: "Ofertas", render: (r) => r.supplier_offers?.[0]?.count ?? 0 },
              { key: "status", label: "Status", render: (r) => <Badge value={r.status} /> },
              { key: "a", label: "", className: "text-right", render: actions },
            ]}
          />
        ) : (
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {rows.length ? (
              rows.map((r: any) => (
                <article
                  key={r.id}
                  className="rounded-xl border border-border-subtle bg-surface-elevated p-4"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">{r.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {r.brands?.name || "Sem marca"} · {r.categories?.name || "Sem categoria"}
                      </p>
                    </div>
                    <Badge value={r.status} />
                  </div>
                  <p className="mt-5 text-sm">
                    {r.product_variants?.length ?? 0} variantes ·{" "}
                    {r.supplier_offers?.[0]?.count ?? 0} ofertas
                  </p>
                  {actions(r)}
                </article>
              ))
            ) : (
              <Empty text="Nenhum produto encontrado." />
            )}
          </div>
        )}
        <Pager page={page} setPage={setPage} total={list.data?.count} />
      </Panel>
      {create && <ProductWizard mode={create} onClose={() => setCreate(null)} />}
    </>
  );
}

function CatalogFilter({
  label,
  value,
  set,
  options,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <SelectInput value={value} onChange={(e) => set(e.target.value)} className="w-40">
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </SelectInput>
  );
}

function ProductWizard({ mode, onClose }: { mode: "quick" | "full"; onClose: () => void }) {
  const qc = useQueryClient(),
    refs = useCatalogRefs();
  const [step, setStep] = useState(0),
    [name, setName] = useState(""),
    [reference, setReference] = useState(""),
    [category, setCategory] = useState(""),
    [brand, setBrand] = useState(""),
    [color, setColor] = useState(""),
    [sizes, setSizes] = useState(""),
    [variants, setVariants] = useState<VariantDraft[]>([]),
    [gtin, setGtin] = useState("");
  const finalStep = mode === "quick" ? 1 : 2;
  const generate = () =>
    setVariants(
      color || sizes
        ? variantMatrix([
            { code: "cor", values: color ? color.split(",").map((x) => x.trim()) : ["Padrão"] },
            { code: "tamanho", values: sizes ? sizes.split(",").map((x) => x.trim()) : ["Padrão"] },
          ]).map((v) => ({
            ...v,
            attributes: Object.fromEntries(
              Object.entries(v.attributes).filter(([, x]) => x !== "Padrão"),
            ),
          }))
        : [{ attributes: {} }],
    );
  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe o nome do produto.");
      if (!isOfficialGtin(gtin))
        throw new Error("GTIN/EAN oficial deve ter 8 a 14 dígitos; código interno não é GTIN.");
      const { error } = await db.rpc("create_product_master", {
        _name: name,
        _slug: name,
        _category_id: category || null,
        _brand_id: brand || null,
        _reference: reference || null,
        _variants: (variants.length ? variants : [{ attributes: {} }]).map((v) => ({
          ...v,
          gtin: v.gtin ?? (gtin || null),
        })),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog-central"] });
      onClose();
    },
  });
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <section className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-surface-elevated p-6 shadow-float">
        <header className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">
              {mode === "quick" ? "Cadastro rápido" : `Cadastro completo · etapa ${step + 1}/3`}
            </p>
            <h2 className="mt-1 text-xl font-bold">Novo Product Master</h2>
          </div>
          <Btn variant="ghost" onClick={onClose}>
            Cancelar
          </Btn>
        </header>
        {step === 0 && (
          <div className="grid gap-4">
            <label>
              Nome
              <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
            <label>
              Modelo / referência
              <TextInput value={reference} onChange={(e) => setReference(e.target.value)} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                Categoria
                <SelectInput value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Selecionar</option>
                  {refs.data?.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectInput>
              </label>
              <label>
                Marca
                <SelectInput value={brand} onChange={(e) => setBrand(e.target.value)}>
                  <option value="">Selecionar</option>
                  {refs.data?.brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </SelectInput>
              </label>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-4">
            <p className="text-sm">Valores separados por vírgula geram a matriz comercial.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                Cor
                <TextInput
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="Preto, Branco"
                />
              </label>
              <label>
                Numeração
                <TextInput
                  value={sizes}
                  onChange={(e) => setSizes(e.target.value)}
                  placeholder="38, 39, 40"
                />
              </label>
            </div>
            <Btn variant="outline" onClick={generate}>
              Gerar combinações
            </Btn>
            {variants.length > 0 && (
              <div className="rounded-xl bg-secondary p-3 text-sm">
                {variants.length} variante(s): {variants.map(variantLabel).join(" · ")}
              </div>
            )}
            <label>
              GTIN/EAN oficial (opcional)
              <TextInput
                value={gtin}
                onChange={(e) => setGtin(e.target.value)}
                placeholder="Nunca use o código interno aqui"
              />
            </label>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-3 text-sm">
            <p>
              <b>{name}</b> · {variants.length || 1} variante(s)
            </p>
            <p>
              SKU BemMais e código interno serão gerados de forma única. GTIN oficial:{" "}
              {gtin || "não informado"}.
            </p>
            <p className="rounded-lg bg-warning-soft p-3 text-warning">
              Produto será salvo como rascunho. Mídias podem ser adicionadas no Product 360.
            </p>
          </div>
        )}
        <footer className="mt-6 flex justify-between">
          <Btn variant="outline" disabled={!step} onClick={() => setStep(step - 1)}>
            Voltar
          </Btn>
          {step < finalStep ? (
            <Btn onClick={() => setStep(step + 1)}>Continuar</Btn>
          ) : (
            <Btn onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Criar produto"}
            </Btn>
          )}
        </footer>
        {save.error && <p className="mt-3 text-sm text-danger">{save.error.message}</p>}
      </section>
    </div>
  );
}
