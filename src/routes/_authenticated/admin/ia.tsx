import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getAiSecretStatus } from "@/lib/ai/status.functions";
import { PageHeader, Panel, DataTable, Badge, Btn } from "@/components/admin/ui";
import { dateTime } from "@/lib/admin/format";

export const Route = createFileRoute("/_authenticated/admin/ia")({ component: AiCenter });

function AiCenter() {
  const qc = useQueryClient();
  const secretFn = useServerFn(getAiSecretStatus);
  const secrets = useQuery({ queryKey: ["ai-secrets"], queryFn: () => secretFn() });
  const providers = useQuery({ queryKey: ["ai-providers"], queryFn: async () => { const { data, error } = await supabase.from("ai_providers").select("*"); if (error) throw error; return data; } });
  const features = useQuery({ queryKey: ["ai-features"], queryFn: async () => { const { data, error } = await supabase.from("ai_features").select("*").order("name"); if (error) throw error; return data; } });
  const usage = useQuery({ queryKey: ["ai-usage"], queryFn: async () => { const { data, error } = await supabase.from("ai_usage_logs").select("id,feature_key,model,input_tokens,output_tokens,latency_ms,status,created_at").order("created_at", { ascending: false }).limit(20); if (error) throw error; return data; } });

  const toggle = useMutation({
    mutationFn: async ({ table, key, enabled }: { table: "ai_providers" | "ai_features"; key: string; enabled: boolean }) => {
      const { error } = await supabase.from(table).update({ enabled }).eq("key", key);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ai-providers"] }); qc.invalidateQueries({ queryKey: ["ai-features"] }); },
  });

  type P = NonNullable<typeof providers.data>[number];
  type F = NonNullable<typeof features.data>[number];
  type U = NonNullable<typeof usage.data>[number];
  return (
    <>
      <PageHeader eyebrow="Inteligência" title="Central de IA" description="Todas as chamadas passam pelo gateway interno da BemMais. As chaves ficam somente no servidor; registramos apenas metadados de uso." />
      <Panel title="Provedores">
        <DataTable<P> rowKey={(r) => r.key} rows={providers.data} loading={providers.isLoading} columns={[
          { key: "n", label: "Provedor", render: (r) => <span className="font-semibold">{r.name}</span> },
          { key: "m", label: "Modelo padrão", render: (r) => r.default_model ?? "—" },
          { key: "k", label: "Chave no servidor", render: (r) => (secrets.data?.[r.key as "openai"] ? <Badge value="active" /> : <span className="text-xs text-destructive">Não configurada ({r.secret_name})</span>) },
          { key: "e", label: "Status", render: (r) => <Badge value={r.enabled ? "active" : "disabled"} /> },
          { key: "a", label: "", className: "text-right", render: (r) => <Btn variant="outline" className="h-8 text-xs" onClick={() => toggle.mutate({ table: "ai_providers", key: r.key, enabled: !r.enabled })}>{r.enabled ? "Desativar" : "Ativar"}</Btn> },
        ]} />
      </Panel>
      <Panel title="Recursos" className="mt-4">
        <DataTable<F> rowKey={(r) => r.key} rows={features.data} loading={features.isLoading} columns={[
          { key: "n", label: "Recurso", render: (r) => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-muted-foreground">{r.description}</p></div> },
          { key: "q", label: "Cota/empresa/mês", render: (r) => r.monthly_quota_per_org ?? "Sem limite" },
          { key: "e", label: "Status", render: (r) => <Badge value={r.enabled ? "active" : "disabled"} /> },
          { key: "a", label: "", className: "text-right", render: (r) => <Btn variant="outline" className="h-8 text-xs" onClick={() => toggle.mutate({ table: "ai_features", key: r.key, enabled: !r.enabled })}>{r.enabled ? "Desativar" : "Ativar"}</Btn> },
        ]} />
      </Panel>
      <Panel title="Uso recente" className="mt-4">
        <DataTable<U> rowKey={(r) => String(r.id)} rows={usage.data} loading={usage.isLoading} empty="Nenhuma chamada de IA registrada." columns={[
          { key: "d", label: "Quando", render: (r) => dateTime(r.created_at) },
          { key: "f", label: "Recurso", render: (r) => r.feature_key },
          { key: "m", label: "Modelo", render: (r) => r.model },
          { key: "t", label: "Tokens", render: (r) => `${r.input_tokens ?? 0} / ${r.output_tokens ?? 0}` },
          { key: "l", label: "Latência", render: (r) => (r.latency_ms ? `${r.latency_ms} ms` : "—") },
          { key: "s", label: "Status", render: (r) => r.status },
        ]} />
      </Panel>
    </>
  );
}
