import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, DataTable, Btn, Field, TextInput, Badge } from "./ui";
import { FormModal } from "./Modal";
import { slugify } from "@/lib/admin/format";

/** Categories & brands: platform-managed reference lists. */
export function SimpleRefPage({ table, title, description }: { table: "categories" | "brands"; title: string; description: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const list = useQuery({
    queryKey: [table],
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select("id,name,slug,is_active").order("name").limit(500);
      if (error) throw error;
      return data;
    },
  });
  const toggle = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from(table).update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [table] }),
  });
  const create = useMutation({
    mutationFn: async () => {
      const slug = slugify(name);
      if (!slug) throw new Error("Informe o nome.");
      const { error } = await supabase.from(table).insert({ name: name.trim(), slug });
      if (error) throw error.code === "23505" ? new Error("Já existe um item com esse nome.") : error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [table] }); qc.invalidateQueries({ queryKey: ["catalog-refs"] }); setOpen(false); setName(""); },
  });
  type Row = NonNullable<typeof list.data>[number];
  return (
    <>
      <PageHeader eyebrow="Catálogo" title={title} description={description} actions={<Btn onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Adicionar</Btn>} />
      <Panel>
        <DataTable<Row> rowKey={(r) => r.id} rows={list.data} loading={list.isLoading} columns={[
          { key: "n", label: "Nome", render: (r) => <span className="font-semibold">{r.name}</span> },
          { key: "s", label: "Slug", render: (r) => <span className="text-xs text-muted-foreground">{r.slug}</span> },
          { key: "a", label: "Status", render: (r) => <Badge value={r.is_active ? "active" : "disabled"} /> },
          { key: "t", label: "", className: "text-right", render: (r) => <Btn variant="outline" className="h-8 text-xs" onClick={() => toggle.mutate({ id: r.id, is_active: !r.is_active })}>{r.is_active ? "Desativar" : "Ativar"}</Btn> },
        ]} />
      </Panel>
      <FormModal open={open} onOpenChange={setOpen} title={`Adicionar — ${title}`} onSubmit={() => create.mutate()} submitting={create.isPending} error={create.error}>
        <Field label="Nome"><TextInput value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} /></Field>
      </FormModal>
    </>
  );
}
