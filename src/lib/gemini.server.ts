import { GoogleGenerativeAI } from "@google/generative-ai";

/** Fast fallback model — mirrors Claude Haiku tier. Override via GEMINI_MODEL. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

/**
 * Server-only Gemini client. Reads GEMINI_API_KEY from the environment.
 * Used as fallback when Anthropic is unavailable or rate-limited.
 */
export function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Add it to your .env file (fallback AI provider)."
    );
  }
  return new GoogleGenerativeAI(apiKey);
}
