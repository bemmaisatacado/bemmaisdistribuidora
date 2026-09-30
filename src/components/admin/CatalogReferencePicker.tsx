import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  catalogReferenceKey,
  categoryPath,
  categorySlugForParent,
  equivalentBrand,
  equivalentCategory,
  isCategoryParentAllowed,
  normalizeCatalogReferenceName,
  type CatalogReference,
} from "@/lib/catalog/quick-references";
import { Btn, ErrorNote, SelectInput, TextInput } from "./ui";

type Kind = "brand" | "category";

export function CatalogReferencePicker({
  kind,
  items,
  value,
  onChange,
}: {
  kind: Kind;
  items: CatalogReference[];
  value: string;
  onChange: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [created, setCreated] = useState<CatalogReference[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = useMemo(
    () => [
      ...items,
      ...created.filter((item) => !items.some((existing) => existing.id === item.id)),
    ],
    [created, items],
  );
  const selected = options.find((item) => item.id === value);
  const normalized = normalizeCatalogReferenceName(query);
  const filtered = options.filter((item) =>
    catalogReferenceKey(item.name).includes(catalogReferenceKey(normalized)),
  );
  const create = async () => {
    setError(null);
    setMessage(null);
    if (!normalized) {
      setError(`Informe o nome da ${kind === "brand" ? "marca" : "categoria"}.`);
      return;
    }
    const currentParentId = kind === "category" ? parentId || null : null;
    if (!isCategoryParentAllowed(options, null, currentParentId)) {
      setError("A categoria pai selecionada não é válida.");
      return;
    }
    const existing =
      kind === "brand"
        ? equivalentBrand(options, normalized)
        : equivalentCategory(options, normalized, currentParentId);
    if (existing) {
      onChange(existing.id);
      setMessage(`${kind === "brand" ? "Marca" : "Categoria"} existente selecionada.`);
      return;
    }
    setSaving(true);
    if (kind === "brand") {
      const { data, error: createError } = await supabase
        .from("brands")
        .insert({ name: normalized, slug: categorySlugForParent(normalized, null, options) })
        .select("id,name,slug")
        .single();
      setSaving(false);
      if (createError) {
        setError(createError.message);
        return;
      }
      const next = { ...data, parent_id: null };
      setCreated((current) => [...current, next]);
      onChange(next.id);
    } else {
      const sortOrder =
        Math.max(
          -1,
          ...options
            .filter((item) => (item.parent_id ?? null) === currentParentId)
            .map((item) => item.sort_order ?? 0),
        ) + 1;
      const { data, error: createError } = await supabase
        .from("categories")
        .insert({
          name: normalized,
          slug: categorySlugForParent(normalized, currentParentId, options),
          parent_id: currentParentId,
          sort_order: sortOrder,
        })
        .select("id,name,slug,parent_id,sort_order")
        .single();
      setSaving(false);
      if (createError) {
        setError(createError.message);
        return;
      }
      setCreated((current) => [...current, data]);
      onChange(data.id);
    }
    setQuery("");
    setMessage(`${kind === "brand" ? "Marca" : "Categoria"} criada e selecionada.`);
    queryClient.invalidateQueries({ queryKey: ["catalog-refs"] });
  };
  const label = kind === "brand" ? "marca" : "categoria";
  return (
    <div className="grid gap-2 rounded-xl border border-border-subtle bg-secondary/30 p-3">
      <TextInput
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setError(null);
          setMessage(null);
        }}
        placeholder={`Buscar ou criar ${label}`}
      />
      {kind === "category" && (
        <SelectInput value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="">Sem categoria pai</option>
          {options.map((category) => (
            <option key={category.id} value={category.id}>
              {categoryPath(category, options)}
            </option>
          ))}
        </SelectInput>
      )}
      <div className="max-h-40 overflow-auto rounded-lg bg-surface-elevated">
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              onChange(item.id);
              setQuery("");
              setMessage(`${kind === "brand" ? "Marca" : "Categoria"} selecionada.`);
            }}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-primary-soft"
          >
            <span>{kind === "category" ? categoryPath(item, options) : item.name}</span>
            {item.id === selected?.id && (
              <span className="text-xs font-semibold text-primary">Selecionada</span>
            )}
          </button>
        ))}
        {!filtered.length && normalized && (
          <Btn variant="ghost" disabled={saving} onClick={create} className="w-full justify-start">
            <Plus className="h-4 w-4" /> {saving ? "Criando…" : `Criar “${normalized}”`}
          </Btn>
        )}
      </div>
      {normalized && filtered.length > 0 && (
        <Btn variant="outline" disabled={saving} onClick={create}>
          <Plus className="h-4 w-4" /> Criar “{normalized}”
        </Btn>
      )}
      {!query && selected && (
        <p className="text-xs text-muted-foreground">
          Selecionada: {kind === "category" ? categoryPath(selected, options) : selected.name}
        </p>
      )}
      {message && <p className="text-xs text-success">{message}</p>}
      <ErrorNote error={error} />
    </div>
  );
}
