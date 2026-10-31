const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Free-only OpenRouter models. Every ID must be $0 on OpenRouter.
 * Order: auto-router first, then specific :free variants.
 * @see https://openrouter.ai/docs/guides/routing/model-variants/free
 */
export const OPENROUTER_FREE_MODELS = [
  "openrouter/free",
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "qwen/qwen-2.5-7b-instruct:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "deepseek/deepseek-r1:free",
] as const;

export type OpenRouterFreeModel = (typeof OPENROUTER_FREE_MODELS)[number];

/** Site URL sent to OpenRouter for attribution (optional but recommended). */
export const OPENROUTER_SITE_URL =
  process.env.OPENROUTER_SITE_URL ??
  "https://remix-of-pixel-perfect-ten.vercel.app";

export function getOpenRouterApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENROUTER_API_KEY. Add it to .env and Vercel env (free-tier fallback)."
    );
  }
  return apiKey;
}

/** Reject any model that is not on OpenRouter's free tier. */
export function assertFreeOpenRouterModel(model: string): string {
  if (model === "openrouter/free") return model;
  if (!model.endsWith(":free")) {
    throw new Error(
      `OpenRouter is configured for free models only. Use ":free" suffix or "openrouter/free". Got: ${model}`
    );
  }
  return model;
}

/** Models to try, in order. OPENROUTER_MODEL override must still be free-only. */
export function getOpenRouterFreeModelList(): string[] {
  const override = process.env.OPENROUTER_MODEL?.trim();
  if (override) return [assertFreeOpenRouterModel(override)];
  return [...OPENROUTER_FREE_MODELS];
}

export type OpenRouterChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenRouterCompletionOptions = {
  messages: OpenRouterChatMessage[];
  maxTokens?: number;
  /** Per-model fetch timeout (ms). Default 12s. */
  timeoutMs?: number;
};

export type OpenRouterCompletionResult = {
  text: string;
  model: string;
};

export async function callOpenRouterFreeModels(
  options: OpenRouterCompletionOptions
): Promise<OpenRouterCompletionResult> {
  const apiKey = getOpenRouterApiKey();
  // Cap fallbacks so a cold path cannot walk 6 models for minutes.
  const models = getOpenRouterFreeModelList().slice(0, 2);
  let lastError: unknown;
  const perModelMs = options.timeoutMs ?? 12_000;

  for (const model of models) {
    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": OPENROUTER_SITE_URL,
          "X-Title": "Notio",
        },
        body: JSON.stringify({
          model,
          messages: options.messages,
          max_tokens: options.maxTokens ?? 2048,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(perModelMs),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(
          `OpenRouter ${model} HTTP ${response.status}: ${body.slice(0, 300)}`
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };

      if (data.error?.message) {
        throw new Error(`OpenRouter ${model}: ${data.error.message}`);
      }

      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new Error(`OpenRouter ${model} returned an empty response`);
      }

      return { text, model };
    } catch (err) {
      lastError = err;
      console.warn(
        `[openrouter] ${model} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All OpenRouter free models failed");
}

