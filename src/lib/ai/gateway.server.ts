import { PROVIDERS, type AiMessage } from "./providers.server";

/**
 * Internal AI Gateway: user → BemMais backend → gateway → provider.
 * Checks feature enablement, calls the provider, logs usage metadata only (no prompt/response content).
 * Callers must already have verified the user and organization server-side.
 */
export async function runAiFeature(opts: { featureKey: string; organizationId: string | null; userId: string; messages: AiMessage[] }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: feature } = await supabaseAdmin.from("ai_features").select("key,enabled,model,provider_key,monthly_quota_per_org").eq("key", opts.featureKey).maybeSingle();
  if (!feature?.enabled || !feature.provider_key) throw new Error("Recurso de IA desativado.");
  const { data: prov } = await supabaseAdmin.from("ai_providers").select("key,enabled,default_model").eq("key", feature.provider_key).maybeSingle();
  const provider = PROVIDERS[feature.provider_key];
  if (!prov?.enabled || !provider) throw new Error("Provedor de IA indisponível.");
  const apiKey = process.env[provider.secretName];
  if (!apiKey) throw new Error("Provedor de IA não configurado.");

  if (feature.monthly_quota_per_org && opts.organizationId) {
    const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
    const { count } = await supabaseAdmin.from("ai_usage_logs").select("id", { count: "exact", head: true })
      .eq("organization_id", opts.organizationId).eq("feature_key", feature.key).gte("created_at", since.toISOString());
    if ((count ?? 0) >= feature.monthly_quota_per_org) throw new Error("Cota mensal de IA atingida.");
  }

  const model = feature.model || prov.default_model || "gpt-4o-mini";
  const started = Date.now();
  let status = "ok";
  try {
    const r = await provider.complete({ model, messages: opts.messages, apiKey });
    await log(r.inputTokens, r.outputTokens);
    return r.text;
  } catch (e) {
    status = "error";
    await log();
    throw e;
  }

  async function log(input?: number, output?: number) {
    await supabaseAdmin.from("ai_usage_logs").insert({
      organization_id: opts.organizationId, user_id: opts.userId, feature_key: feature!.key, provider_key: provider.key, model,
      input_tokens: input ?? null, output_tokens: output ?? null, latency_ms: Date.now() - started, status,
    });
  }
}
