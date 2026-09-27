import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Constants, type Database } from "@/integrations/supabase/types";
import { PageHeader, Panel, DataTable, Pager, Badge, Btn, Field, TextInput, SelectInput, SearchBox } from "@/components/admin/ui";
import { FormModal } from "@/components/admin/Modal";
import { pageRange, slugify, STATUS_LABEL } from "@/lib/admin/format";
import { useCatalogRefs } from "@/lib/admin/queries";

export const Route = createFileRoute("/_authenticated/admin/produtos")({ component: Products });
type CStatus = Database["public"]["Enums"]["catalog_status"];

function Products() {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatusF] = useState<"" | CStatus>("");
  const [open, setOpen] = useState(false);
  const [skuFor, setSkuFor] = useState<{ id: string; name: string } | null>(null);
  const list = useQuery({
    queryKey: ["products", page, q, status],
    queryFn: async () => {
      let query = supabase.from("products").select("id,name,slug,status,categories(name),brands(name),product_variants(count)", { count: "exact" })
        .order("created_at", { ascending: false }).range(...pageRange(page));
      if (q.trim()) query = query.ilike("name", `%${q.trim()}%`);
      if (status) query = query.eq("status", status);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data, count };
    },
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CStatus }) => {
      const { error } = await supabase.from("products").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
  type Row = NonNullable<typeof list.data>["rows"][number];
  return (
    <>
      <PageHeader eyebrow="Catálogo" title="Produtos" description="Catálogo mestre: a identidade do item. Custos e condições ficam nas ofertas dos fornecedores."
        actions={<Btn onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Novo produto</Btn>} />
      <Panel>
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          <SearchBox value={q} onChange={(v) => { setQ(v); setPage(0); }} />
          <SelectInput value={status} onChange={(e) => { setStatusF(e.target.value as CStatus); setPage(0); }} className="w-44">
            <option value="">Todos os status</option>
            {Constants.public.Enums.catalog_status.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </SelectInput>
        </div>
        <DataTable<Row> rowKey={(r) => r.id} rows={list.data?.rows} loading={list.isLoading} empty="Nenhum produto no catálogo." columns={[
          { key: "n", label: "Produto", render: (r) => <span className="font-semibold">{r.name}</span> },
          { key: "c", label: "Categoria", render: (r) => r.categories?.name ?? "—" },
          { key: "b", label: "Marca", render: (r) => r.brands?.name ?? "—" },
          { key: "v", label: "SKUs", render: (r) => r.product_variants?.[0]?.count ?? 0 },
          { key: "s", label: "Status", render: (r) => <Badge value={r.status} /> },
          { key: "a", label: "", className: "text-right whitespace-nowrap", render: (r) => (
            <div className="flex justify-end gap-2">
              <Btn variant="outline" className="h-8 text-xs" onClick={() => setSkuFor({ id: r.id, name: r.name })}>+ SKU</Btn>
              <SelectInput aria-label="Status" value={r.status} className="h-8 w-32 text-xs" onChange={(e) => setStatus.mutate({ id: r.id, status: e.target.value as CStatus })}>
                {Constants.public.Enums.catalog_status.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </SelectInput>
            </div>) },
        ]} />
        <Pager page={page} setPage={setPage} total={list.data?.count} />
      </Panel>
      {open && <CreateProduct onClose={() => setOpen(false)} />}
      {skuFor && <CreateSku product={skuFor} onClose={() => setSkuFor(null)} />}
    </>
  );
}

function CreateProduct({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const refs = useCatalogRefs();
  const [f, setF] = useState({ name: "", description: "", category_id: "", brand_id: "" });
  const m = useMutation({
    mutationFn: async () => {
      const base = slugify(f.name);
      if (!base) throw new Error("Informe o nome.");
      const { error } = await supabase.from("products").insert({
        name: f.name.trim(), slug: `${base}-${Math.random().toString(36).slice(2, 6)}`, description: f.description || null,
        category_id: f.category_id || null, brand_id: f.brand_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["product-options"] }); onClose(); },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <FormModal open onOpenChange={(v) => !v && onClose()} title="Novo produto" onSubmit={() => m.mutate()} submitting={m.isPending} error={m.error}>
      <Field label="Nome"><TextInput value={f.name} onChange={set("name")} required maxLength={160} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Categoria"><SelectInput value={f.category_id} onChange={set("category_id")}><option value="">—</option>{refs.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectInput></Field>
        <Field label="Marca"><SelectInput value={f.brand_id} onChange={set("brand_id")}><option value="">—</option>{refs.data?.brands.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectInput></Field>
      </div>
      <Field label="Descrição"><TextInput value={f.description} onChange={set("description")} maxLength={2000} /></Field>
      <p className="text-xs text-muted-foreground">O produto nasce como rascunho.</p>
    </FormModal>
  );
}

function CreateSku({ product, onClose }: { product: { id: string; name: string }; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ sku: "", color: "", size: "", barcode: "" });
  const m = useMutation({
    mutationFn: async () => {
      if (!f.sku.trim()) throw new Error("Informe o código SKU.");
      const attributes: Record<string, string> = {};
      if (f.color) attributes.cor = f.color;
      if (f.size) attributes.tamanho = f.size;
      const { error } = await supabase.from("product_variants").insert({ product_id: product.id, sku: f.sku.trim(), barcode: f.barcode || null, attributes });
      if (error) throw error.code === "23505" ? new Error("SKU já existe.") : error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["products"] }); onClose(); },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <FormModal open onOpenChange={(v) => !v && onClose()} title={`Novo SKU — ${product.name}`} onSubmit={() => m.mutate()} submitting={m.isPending} error={m.error}>
      <Field label="SKU"><TextInput value={f.sku} onChange={set("sku")} required maxLength={60} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cor"><TextInput value={f.color} onChange={set("color")} maxLength={40} /></Field>
        <Field label="Tamanho"><TextInput value={f.size} onChange={set("size")} maxLength={20} /></Field>
      </div>
      <Field label="Código de barras"><TextInput value={f.barcode} onChange={set("barcode")} maxLength={40} /></Field>
    </FormModal>
  );
}
