import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Constants, type Database } from "@/integrations/supabase/types";
import { Field, TextInput, SelectInput } from "@/components/admin/ui";
import { FormModal } from "@/components/admin/Modal";
import { slugify, STATUS_LABEL } from "@/lib/admin/format";
import { useOrgOptions } from "@/lib/admin/queries";

type Mode = Database["public"]["Enums"]["store_mode"];

/** Single store-creation flow, reused by Lojas and by the organization profile. */
export function CreateStoreModal({
  onClose,
  organizationId,
  organizationName,
}: {
  onClose: () => void;
  organizationId?: string;
  organizationName?: string;
}) {
  const qc = useQueryClient();
  const orgs = useOrgOptions();
  const [f, setF] = useState({
    organization_id: organizationId ?? "",
    name: "",
    slug: "",
    mode: "retail" as Mode,
    whatsapp: "",
    instagram: "",
    email: "",
    primary_color: "#E8641E",
    secondary_color: "#1F1D1B",
  });
  const m = useMutation({
    mutationFn: async () => {
      if (!f.organization_id) throw new Error("Selecione a empresa.");
      const slug = slugify(f.slug || f.name);
      if (!slug || f.name.trim().length < 2) throw new Error("Informe o nome da loja.");
      const { error } = await supabase.from("stores").insert({
        organization_id: f.organization_id,
        name: f.name.trim(),
        slug,
        mode: f.mode,
        whatsapp: f.whatsapp || null,
        instagram: f.instagram || null,
        email: f.email || null,
        primary_color: f.primary_color,
        secondary_color: f.secondary_color,
      });
      if (error) throw error.code === "23505" ? new Error("Esse endereço já está em uso.") : error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stores"] });
      qc.invalidateQueries({ queryKey: ["org"] });
      qc.invalidateQueries({ queryKey: ["orgs"] });
      onClose();
    },
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <FormModal
      open
      onOpenChange={(v) => !v && onClose()}
      title={organizationName ? `Criar loja · ${organizationName}` : "Criar loja para cliente"}
      onSubmit={() => m.mutate()}
      submitting={m.isPending}
      error={m.error}
      submitLabel="Criar loja"
    >
      {!organizationId && (
        <Field label="Empresa">
          <SelectInput value={f.organization_id} onChange={set("organization_id")} required>
            <option value="">Selecione...</option>
            {orgs.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </SelectInput>
        </Field>
      )}
      <Field label="Nome da loja">
        <TextInput value={f.name} onChange={set("name")} required maxLength={80} />
      </Field>
      <Field label="Endereço (slug)" hint="Usado no link da loja. Não pode repetir.">
        <TextInput
          value={f.slug}
          onChange={set("slug")}
          placeholder={slugify(f.name) || "minha-loja"}
          maxLength={60}
        />
      </Field>
      <Field label="Tipo">
        <SelectInput value={f.mode} onChange={set("mode")}>
          {Constants.public.Enums.store_mode.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </SelectInput>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="WhatsApp">
          <TextInput value={f.whatsapp} onChange={set("whatsapp")} maxLength={20} />
        </Field>
        <Field label="Instagram">
          <TextInput value={f.instagram} onChange={set("instagram")} maxLength={60} />
        </Field>
        <Field label="E-mail">
          <TextInput type="email" value={f.email} onChange={set("email")} maxLength={160} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cor principal">
            <TextInput
              type="color"
              value={f.primary_color}
              onChange={set("primary_color")}
              className="p-1"
            />
          </Field>
          <Field label="Secundária">
            <TextInput
              type="color"
              value={f.secondary_color}
              onChange={set("secondary_color")}
              className="p-1"
            />
          </Field>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        A loja nasce como rascunho. Ative quando estiver pronta.
      </p>
    </FormModal>
  );
}
