import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Panel, Btn, Field, TextInput, ErrorNote } from "@/components/admin/ui";

export const Route = createFileRoute("/_authenticated/admin/configuracoes")({ component: Settings });

type General = { currency: string; timezone: string; offer_review_required: boolean };

function Settings() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", "general"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_settings").select("value").eq("key", "general").maybeSingle();
      if (error) throw error;
      return (data?.value ?? {}) as Partial<General>;
    },
  });
  const [f, setF] = useState<General>({ currency: "BRL", timezone: "America/Sao_Paulo", offer_review_required: true });
  useEffect(() => { if (q.data) setF((p) => ({ ...p, ...q.data })); }, [q.data]);
  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("platform_settings").upsert({ key: "general", value: f });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings"] }),
  });
  return (
    <>
      <PageHeader eyebrow="Plataforma" title="Configurações" description="Parâmetros gerais da plataforma. Segredos (chaves de API) nunca ficam aqui — só no servidor." />
      <Panel className="max-w-xl">
        <form className="grid gap-3 p-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Moeda"><TextInput value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} maxLength={3} /></Field>
            <Field label="Fuso horário"><TextInput value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-[var(--primary)]" checked={f.offer_review_required} onChange={(e) => setF({ ...f, offer_review_required: e.target.checked })} />
            Ofertas de fornecedores exigem aprovação BemMais
          </label>
          <ErrorNote error={m.error} />
          <div><Btn type="submit" disabled={m.isPending}>{m.isSuccess ? "Salvo" : "Salvar"}</Btn></div>
        </form>
      </Panel>
    </>
  );
}
