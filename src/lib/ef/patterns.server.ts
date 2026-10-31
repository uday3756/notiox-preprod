/**
 * Pattern + nudge copy generation.
 *
 * Handoff §6a — no vector DB. "RAG" here is retrieving the last 4 weekly rollup
 * rows plus this week's aggregates: four rows by user_id, not a similarity search.
 * Embeddings cost money and open a privacy surface for no accuracy gain at this scale.
 *
 * Handoff §6b — the safety filter runs AFTER generation, BEFORE storage. The
 * prompt below also asks for safe output, but the prompt is not the control;
 * filterPatterns() is.
 */
import { createAnthropicClient, Notio_MODEL } from "@/lib/anthropic.server";
import { filterPatterns, isBlockedTopic } from "./topic-filter";
import { PILLAR_LABELS, type PatternItem, type PillarKey, type WeekAggregates } from "./types";

const SAFETY = `Write only about BEHAVIOUR: timing, task density, completion, rollover, map structure.
Never mention mood, feelings, substances, medication, health, sleep, weight, exercise, or relationships.
Never quote or paraphrase the user's own words. Never say "you failed", "you missed", or "you didn't".
Never compare the user to other people.`;

function textOf(content: Array<{ type: string; text?: string }>): string {
  return content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
}

export async function generatePatterns(ctx: {
  weeks: WeekAggregates[];
  current: WeekAggregates;
  habitModel?: string | null;
}): Promise<PatternItem[]> {
  try {
    const anthropic = createAnthropicClient();
    const msg = await anthropic.messages.create({
      model: Notio_MODEL,
      max_tokens: 600,
      messages: [{
        role: "user",
        content: `${SAFETY}

From these weekly aggregates, write behavioural patterns.
Return ONLY JSON: {"working":[string,string],"worth_trying":[string]}
- max 2 "working" (patterns helping them), max 1 "worth_trying" (one gentle suggestion)
- ONE sentence each, no paragraphs
- describe observable behaviour and its effect, e.g. "Tasks you record before 10am get finished about twice as often."

Prior weeks: ${JSON.stringify(ctx.weeks)}
This week: ${JSON.stringify(ctx.current)}
${ctx.habitModel ? `Habit summary: ${ctx.habitModel}` : ""}`,
      }],
    });

    const raw = textOf(msg.content as Array<{ type: string; text?: string }>)
      .replace(/^```(?:json)?\s*|\s*```$/g, "").trim();

    let parsed: { working?: string[]; worth_trying?: string[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[ef] pattern JSON parse failed");
      return [];
    }

    const items: PatternItem[] = [
      ...(parsed.working ?? []).map((body) => ({ kind: "working" as const, body })),
      ...(parsed.worth_trying ?? []).map((body) => ({ kind: "worth_trying" as const, body })),
    ];

    // The real control. Sources are empty because transcripts never reach the
    // model, so there is nothing to quote — the guard stays as defence in depth.
    return filterPatterns(items, []);
  } catch (err) {
    console.error("[ef] generatePatterns failed", err);
    return [];
  }
}

/**
 * Handoff §5 — the EF suggestion REPLACES the generic nudge; they never both render.
 * Lowest pillar in, one sentence out. Never punitive, never comparative.
 */
export async function generateNudge(
  lowest: PillarKey,
  agg: WeekAggregates,
): Promise<string | null> {
  try {
    const anthropic = createAnthropicClient();
    const msg = await anthropic.messages.create({
      model: Notio_MODEL,
      max_tokens: 150,
      messages: [{
        role: "user",
        content: `${SAFETY}

The user's weakest area this week was "${PILLAR_LABELS[lowest]}".
Aggregates: ${JSON.stringify(agg)}
Write ONE sentence: an observed pattern plus a gentle suggestion.
No preamble, no quotation marks, plain text only.`,
      }],
    });

    const text = textOf(msg.content as Array<{ type: string; text?: string }>).trim();
    return text && !isBlockedTopic(text) ? text : null;
  } catch (err) {
    console.error("[ef] generateNudge failed", err);
    return null;
  }
}
