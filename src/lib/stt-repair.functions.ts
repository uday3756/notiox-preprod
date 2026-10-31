import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callOpenRouterFreeModels } from "@/lib/openrouter.server";
import { applyQuickSttFixes } from "@/lib/stt-quick-fix";

/**
 * Fix likely mobile STT mishears using OpenRouter FREE models only ($0).
 * Never uses Anthropic/OpenAI paid APIs. Failures return the original text
 * (still run through local quick fixes).
 */
export const repairSpeechTranscript = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        transcript: z.string().min(2).max(12000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const original = applyQuickSttFixes(data.transcript.trim());
    if (original.length < 4) return { transcript: original };

    // Free-tier only — skip LLM silently if OpenRouter isn't configured.
    if (!process.env.OPENROUTER_API_KEY?.trim()) {
      return { transcript: original };
    }

    try {
      const { text } = await callOpenRouterFreeModels({
        maxTokens: 1200,
        messages: [
          {
            role: "system",
            content: `You correct speech-to-text errors in short productivity transcripts.
The speaker often has an Indian English accent. Mobile STT commonly mishears words.

CRITICAL examples (always apply when context fits):
- "waiting" meaning a work gathering → "meeting"
  "I am having waiting" → "I am having a meeting"
  "waiting with my client" → "meeting with my client"
- "calender" → "calendar"

Rules:
- Fix ONLY clear STT mishears. Prefer leaving text unchanged when unsure.
- Do not rewrite style, add ideas, summarize, or remove content.
- Keep roughly the same length and word order.

Respond with ONLY a JSON object (no markdown):
{"transcript":"<corrected plain text>"}`,
          },
          {
            role: "user",
            content: original,
          },
        ],
      });

      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      const json = start !== -1 && end !== -1 ? text.slice(start, end + 1) : text;
      const parsed = JSON.parse(json) as { transcript?: unknown };
      const fixed =
        typeof parsed.transcript === "string" ? parsed.transcript.trim() : "";
      if (!fixed || fixed.length < 2) return { transcript: original };
      // Local quick fixes after free-model pass (defense in depth).
      return { transcript: applyQuickSttFixes(fixed) };
    } catch (err) {
      console.warn("[stt-repair] free-model skipped:", err);
      return { transcript: original };
    }
  });
