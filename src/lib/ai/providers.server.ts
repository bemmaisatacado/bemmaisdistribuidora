/**
 * AI provider abstraction. Keys live only in server secrets (process.env), never in the DB or browser.
 * Add a provider by implementing AiProvider and registering it in PROVIDERS.
 */
export type AiMessage = { role: "system" | "user" | "assistant"; content: string };
export type AiResult = { text: string; inputTokens?: number; outputTokens?: number };

export interface AiProvider {
  key: string;
  secretName: string;
  complete(opts: { model: string; messages: AiMessage[]; apiKey: string }): Promise<AiResult>;
}

const openai: AiProvider = {
  key: "openai",
  secretName: "OPENAI_API_KEY",
  async complete({ model, messages, apiKey }) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages }),
    });
    if (!res.ok) throw new Error(`AI provider error ${res.status}`);
    const json = (await res.json()) as { choices: { message: { content: string } }[]; usage?: { prompt_tokens: number; completion_tokens: number } };
    return { text: json.choices[0]?.message?.content ?? "", inputTokens: json.usage?.prompt_tokens, outputTokens: json.usage?.completion_tokens };
  },
};

export const PROVIDERS: Record<string, AiProvider> = { openai };
