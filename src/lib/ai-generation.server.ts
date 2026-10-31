import Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient, Notio_MODEL } from "@/lib/anthropic.server";

export type AiFeature = "mindmap" | "schedule";

export type StructuredGenerationOptions = {
  /** Label for server logs */
  feature: AiFeature;
  userPrompt: string;
  system?: string;
  maxTokens?: number;
  /** Optional schema hint (prompted into the user message for free models). */
  jsonSchema?: Record<string, unknown>;
};

export type GenerationResult = {
  text: string;
  provider: "anthropic";
  model?: string;
};

/** Strip optional ```json fences some models wrap around JSON. */
export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  return trimmed;
}

/**
 * Primary AI path: Claude (Anthropic).
 */
export async function generateStructuredJson(
  options: StructuredGenerationOptions
): Promise<GenerationResult> {
  try {
    const anthropic = createAnthropicClient();
    const message = await anthropic.messages.create({
      model: Notio_MODEL,
      max_tokens: options.maxTokens ?? 2048,
      // Disable Sonnet 5's default thinking for this JSON-generation call.
      thinking: { type: "disabled" },
      ...(options.system ? { system: options.system } : {}),
      messages: [{ role: "user", content: options.userPrompt }],
    });
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    console.info(
      `[ai-generation:${options.feature}] Claude succeeded (model=${Notio_MODEL})`
    );
    return {
      text: extractJsonText(text),
      provider: "anthropic",
      model: Notio_MODEL,
    };
  } catch (err) {
    console.error(`[ai-generation:${options.feature}] Claude failed:`, err);
    throw new Error("AI is busy right now. Try again in a moment.");
  }
}
