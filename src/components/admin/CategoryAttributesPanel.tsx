import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  CATEGORY_ATTRIBUTE_TYPES,
  categoryAttributeHasDestructiveChanges,
  categoryAttributeIsUsed,
  categoryAttributeRequiresOptions,
  categoryAttributeRole,
  isCategoryAttributeType,
  moveCategoryAttribute,
  normalizeCategoryAttributeName,
  readCategoryAttributeOptions,
  validateCategoryAttributeDraft,
  type CategoryAttributeDraft,
  type CategoryAttributeType,
} from "@/lib/catalog/category-attributes";
import { FormModal } from "./Modal";
import { Badge, Btn, Empty, ErrorNote, Field, Panel, SelectInput, TextInput } from "./ui";

type CategoryAttribute = {
  id: string;
  category_id: string;
  name: string;
  code: string;
  type: CategoryAttributeType;
  options: unknown;
  is_required: boolean;
  is_variant: boolean;
  sort_order: number;
};

type AttributeEditorState = CategoryAttributeDraft;
const EMPTY_ATTRIBUTE: AttributeEditorState = {
  name: "",
  type: "text",
  options: [],
  is_required: false,
  is_variant: false,
};
const TYPE_LABEL: Record<CategoryAttributeType, string> = {
  text: "Texto",
  number: "Número",
  boolean: "Sim / não",
  select: "Seleção única",
  multi_select: "Múltipla seleção",
  color: "Cor",
  measurement: "Medida",
};

const draftFromAttribute = (attribute: CategoryAttribute): AttributeEditorState => ({
  name: attribute.name,
  type: attribute.type,
  options: readCategoryAttributeOptions(attribute.options),
  is_required: attribute.is_required,
  is_variant: attribute.is_variant,
});

export function CategoryAttributesPanel({ category }: { category: { id: string; name: string } }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CategoryAttribute | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AttributeEditorState>(EMPTY_ATTRIBUTE);
  const [option, setOption] = useState("");
  const [operationError, setOperationError] = useState<string | null>(null);
  const attributes = useQuery({
    queryKey: ["category-attributes", category.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_attributes")
        .select("id,category_id,name,code,type,options,is_required,is_variant,sort_order")
        .eq("category_id", category.id)
        .order("sort_order")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const rows: CategoryAttribute[] = (attributes.data ?? []).flatMap((attribute) =>
    isCategoryAttributeType(attribute.type) ? [{ ...attribute, type: attribute.type }] : [],
  );

  const attributeInUse = async (attribute: CategoryAttribute) => {
    const { data, error } = await supabase
      .from("product_variants")
      .select("attributes,products!inner(category_id)")
      .eq("products.category_id", category.id);
    if (error) throw error;
    return (data ?? []).some((variant) =>
      categoryAttributeIsUsed(variant.attributes, attribute.code),
    );
  };
  const blockDestructiveChange = async (attribute: CategoryAttribute) => {
    if (await attributeInUse(attribute)) {
      throw new Error(
        "Este atributo já está em uso por produtos ou variantes e não pode ser alterado de forma destrutiva.",
      );
    }
  };
  const closeEditor = (value: boolean) => {
    setOpen(value);
    if (!value) {
      setEditing(null);
      setDraft(EMPTY_ATTRIBUTE);
      setOption("");
    }
  };
  const openEditor = (attribute?: CategoryAttribute) => {
    setOperationError(null);
    setEditing(attribute ?? null);
    setDraft(attribute ? draftFromAttribute(attribute) : EMPTY_ATTRIBUTE);
    setOption("");
    setOpen(true);
  };
  const save = useMutation({
    mutationFn: async () => {
      const validation = validateCategoryAttributeDraft(
        draft,
        rows.map((attribute) => attribute.code),
        editing?.code,
      );
      if ("error" in validation) throw new Error(validation.error);
      const value = validation.value;
      if (editing) {
        const current = draftFromAttribute(editing);
        if (categoryAttributeHasDestructiveChanges(current, value))
          await blockDestructiveChange(editing);
        const { error } = await supabase
          .from("category_attributes")
          .update({
            name: value.name,
            type: value.type,
            options: value.options,
            is_required: value.is_required,
            is_variant: value.is_variant,
          })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("category_attributes").insert({
          category_id: category.id,
          name: value.name,
          code: value.code,
          type: value.type,
          options: value.options,
          is_required: value.is_required,
          is_variant: value.is_variant,
          sort_order: Math.max(-1, ...rows.map((attribute) => attribute.sort_order)) + 1,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["category-attributes", category.id] });
      closeEditor(false);
    },
  });
  const remove = useMutation({
    mutationFn: async (attribute: CategoryAttribute) => {
      await blockDestructiveChange(attribute);
      const { error } = await (supabase as any).from("category_attributes").delete().eq("id", attribute.id);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["category-attributes", category.id] }),
    onError: (error) =>
      setOperationError(
        error instanceof Error ? error.message : "Não foi possível remover o atributo.",
      ),
  });
  const reorder = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) => {
      const updates = moveCategoryAttribute(rows, id, direction);
      if (!updates) return;
      for (const update of updates) {
        const { error } = await supabase
          .from("category_attributes")
          .update({ sort_order: update.sort_order })
          .eq("id", update.id);
        if (error) throw error;
      }
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["category-attributes", category.id] }),
    onError: (error) =>
      setOperationError(
        error instanceof Error ? error.message : "Não foi possível reordenar os atributos.",
      ),
  });
  const addOption = () => {
    const normalized = normalizeCategoryAttributeName(option);
    if (!normalized) return;
    setDraft((current) => ({
      ...current,
      options: readCategoryAttributeOptions([...current.options, normalized]),
    }));
    setOption("");
  };
  const optionEnabled = categoryAttributeRequiresOptions(draft.type);

  return (
    <Panel
      title={`Atributos — ${category.name}`}
      description="Defina os dados descritivos e os que poderão gerar variantes nesta categoria."
      actions={
        <Btn onClick={() => openEditor()}>
          <Plus className="h-4 w-4" /> Adicionar atributo
        </Btn>
      }
    >
      <div className="space-y-3 p-5">
        <ErrorNote error={operationError} />
        {attributes.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando atributos...</p>
        ) : !rows.length ? (
          <Empty
            text="Esta categoria ainda não possui atributos configurados."
            action={<Btn onClick={() => openEditor()}>Adicionar atributo</Btn>}
          />
        ) : (
          <div className="space-y-2">
            {rows.map((attribute, index) => {
              const options = readCategoryAttributeOptions(attribute.options);
              return (
                <article
                  key={attribute.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border-subtle bg-surface-elevated p-3"
                >
                  <span className="metric w-6 text-center text-xs text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-40 flex-1">
                    <p className="font-semibold">{attribute.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Código: {attribute.code} · {options.length} opção(ões)
                    </p>
                  </div>
                  <Badge value="info" label={TYPE_LABEL[attribute.type]} />
                  <Badge
                    value={attribute.is_required ? "active" : "disabled"}
                    label={attribute.is_required ? "Obrigatório" : "Opcional"}
                  />
                  <Badge
                    value={attribute.is_variant ? "active" : "disabled"}
                    label={
                      categoryAttributeRole(attribute.is_variant) === "variant"
                        ? "Gera variante"
                        : "Descritivo"
                    }
                  />
                  <div className="ml-auto flex flex-wrap gap-1">
                    <Btn
                      variant="ghost"
                      disabled={!index || reorder.isPending}
                      onClick={() => reorder.mutate({ id: attribute.id, direction: "up" })}
                    >
                      ↑
                    </Btn>
                    <Btn
                      variant="ghost"
                      disabled={index === rows.length - 1 || reorder.isPending}
                      onClick={() => reorder.mutate({ id: attribute.id, direction: "down" })}
                    >
                      ↓
                    </Btn>
                    <Btn
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => openEditor(attribute)}
                    >
                      Editar
                    </Btn>
                    <Btn
                      variant="ghost"
                      className="h-8 text-xs text-danger"
                      disabled={remove.isPending}
                      onClick={() =>
                        window.confirm(`Remover ${attribute.name}?`) && remove.mutate(attribute)
                      }
                    >
                      Remover
                    </Btn>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
      <FormModal
        open={open}
        onOpenChange={closeEditor}
        title={editing ? `Editar atributo — ${editing.name}` : "Adicionar atributo"}
        onSubmit={() => save.mutate()}
        submitting={save.isPending}
        error={save.error}
      >
        <Field label="Nome do atributo">
          <TextInput
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            required
            maxLength={80}
            placeholder="Ex.: Material"
          />
        </Field>
        <Field label="Tipo">
          <SelectInput
            value={draft.type}
            onChange={(event) => {
              const type = event.target.value;
              if (!isCategoryAttributeType(type)) return;
              setDraft((current) => ({
                ...current,
                type,
                options: categoryAttributeRequiresOptions(type) ? current.options : [],
              }));
            }}
          >
            {CATEGORY_ATTRIBUTE_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABEL[type]}
              </option>
            ))}
          </SelectInput>
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 rounded-lg bg-secondary/60 p-3 text-sm">
            <input
              type="checkbox"
              checked={draft.is_required}
              onChange={(event) =>
                setDraft((current) => ({ ...current, is_required: event.target.checked }))
              }
            />{" "}
            Obrigatório
          </label>
          <label className="flex items-center gap-2 rounded-lg bg-secondary/60 p-3 text-sm">
            <input
              type="checkbox"
              checked={draft.is_variant}
              onChange={(event) =>
                setDraft((current) => ({ ...current, is_variant: event.target.checked }))
              }
            />{" "}
            Gera variante
          </label>
        </div>
        {optionEnabled && (
          <div className="grid gap-2 rounded-xl bg-secondary/40 p-3">
            <p className="text-xs font-semibold">Opções</p>
            <div className="flex gap-2">
              <TextInput
                value={option}
                onChange={(event) => setOption(event.target.value)}
                placeholder="Adicionar opção"
                maxLength={80}
              />
              <Btn type="button" variant="outline" onClick={addOption}>
                Adicionar
              </Btn>
            </div>
            {draft.options.length ? (
              <div className="flex flex-wrap gap-2">
                {draft.options.map((item, index) => (
                  <span
                    key={`${item}-${index}`}
                    className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2 py-1 text-xs shadow-card"
                  >
                    {item}
                    <button
                      type="button"
                      className="text-danger"
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          options: current.options.filter(
                            (_, optionIndex) => optionIndex !== index,
                          ),
                        }))
                      }
                      aria-label={`Remover ${item}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Adicione ao menos uma opção.</p>
            )}
          </div>
        )}
      </FormModal>
    </Panel>
  );
}
