import { describe, it, expect } from "vitest";
import { isBlockedTopic, quotesUser, filterPatterns } from "./topic-filter";

/**
 * Acceptance criterion: "Topic filter runs server-side and is unit-tested against
 * a fixture set of dumps containing disclosures."
 *
 * BLOCKED = plausible model output that leaked a personal disclosure from a dump.
 * Each of these would be a product failure if it reached the user's screen.
 */
const BLOCKED = [
  "Your mood dips on days you record fewer tasks.",
  "You seem more anxious midweek.",
  "Days you mention drinking tend to have lower completion.",
  "Your medication reminders cluster in the morning.",
  "You record more after therapy sessions.",
  "Tasks slip on days you mention your girlfriend.",
  "Your sleep looks shorter before heavy days.",
  "Days you skip the gym have more rollover.",
  "You log less when your depression comes up.",
  "Weight-related goals appear most on Mondays.",
  "Your ADHD symptoms show up in how you plan.",
  "You plan more on days you feel overwhelmed.",
];

/** ALLOWED = purely behavioural: timing, density, completion, rollover, structure. */
const ALLOWED = [
  "Tasks you record before 10am get finished about twice as often.",
  "Shorter maps - under six branches - close out most reliably.",
  "Thursday tends to carry the most rollover.",
  "Your maps ran denser than usual this week.",
  "Fewer branches per dump tends to make the day easier to start.",
];

describe("isBlockedTopic", () => {
  it.each(BLOCKED)("drops disclosure-adjacent pattern: %s", (t) => {
    expect(isBlockedTopic(t)).toBe(true);
  });

  it.each(ALLOWED)("keeps behavioural pattern: %s", (t) => {
    expect(isBlockedTopic(t)).toBe(false);
  });
});

describe("quotesUser", () => {
  const src = ["i really need to call the accountant about the tax thing tomorrow"];

  it("flags a verbatim run lifted from the dump", () => {
    expect(quotesUser("You said call the accountant about the tax thing.", src)).toBe(true);
  });

  it("allows derived rewriting", () => {
    expect(quotesUser("Admin tasks tend to get recorded late in the day.", src)).toBe(false);
  });

  it("is a no-op when there are no sources", () => {
    expect(quotesUser("anything at all goes here friend", [])).toBe(false);
  });
});

describe("filterPatterns", () => {
  it("enforces the 2 + 1 cap and drops blocked items", () => {
    const out = filterPatterns([
      { kind: "working", body: ALLOWED[0] },
      { kind: "working", body: BLOCKED[0] },      // dropped - mood
      { kind: "working", body: ALLOWED[1] },
      { kind: "working", body: ALLOWED[3] },      // over cap
      { kind: "worth_trying", body: ALLOWED[2] },
      { kind: "worth_trying", body: ALLOWED[4] }, // over cap
    ], []);

    expect(out.filter((i) => i.kind === "working")).toHaveLength(2);
    expect(out.filter((i) => i.kind === "worth_trying")).toHaveLength(1);
    expect(out.some((i) => i.body === BLOCKED[0])).toBe(false);
  });

  it("returns fewer items rather than backfilling when all are dropped", () => {
    const out = filterPatterns(BLOCKED.map((b) => ({ kind: "working" as const, body: b })), []);
    expect(out).toHaveLength(0);
  });

  it("skips empty bodies", () => {
    expect(filterPatterns([{ kind: "working", body: "   " }], [])).toHaveLength(0);
  });
});
