import Anthropic from "@anthropic-ai/sdk";

/**
 * Server-only Anthropic client. Reads ANTHROPIC_API_KEY from the environment.
 * Never import this from a route or *.functions.ts top level that ships to the
 * browser - only inside server function handlers.
 */
export function createAnthropicClient() {
  // Trim whitespace/newlines and strip wrapping quotes from .env pastes.
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY. Add it to your .env file.");
  }
  return new Anthropic({ apiKey });
}

/**
 * Primary Claude model for mindmaps + scheduling.
 * Sonnet 5 — supports structured outputs (json_schema), so the mindmap runs on
 * Claude directly instead of the OpenRouter fallback, and handles complex
 * multi-activity day-plans more reliably than 4.6.
 * Override with ANTHROPIC_MODEL if needed (e.g. claude-opus-4-8).
 */
export const Notio_MODEL =
  process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";

