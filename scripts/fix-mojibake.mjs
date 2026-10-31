// One-off: repair double-decoded UTF-8 (mojibake) in source files.
// Root cause: UTF-8 bytes were read as Latin-1/CP1252, so "…" became "â€¦",
// "·" became "Â·", "—" became "â€"", the brain emoji became "ðŸ§ ", etc.
// Fix: replace the corrupted sequences with clean ASCII so they can never
// re-corrupt (and to satisfy the em-dash ban — em/en dashes become hyphens).
import { readFileSync, writeFileSync } from "node:fs";

const files = [
  "src/routes/_authenticated/capture.tsx",
  "src/routes/auth.tsx",
  "src/routes/auth-setup-hours.tsx",
  "src/routes/_authenticated/profile.tsx",
  "src/routes/_authenticated/pricing.tsx",
  "src/routes/_authenticated/maps.index.tsx",
  "src/routes/_authenticated/maps.$id.tsx",
  "src/routes/_authenticated/journal.tsx",
  "src/routes/_authenticated/hours-settings.tsx",
  "src/lib/scheduling.functions.ts",
  "src/lib/anthropic.server.ts",
  "src/lib/ai-generation.server.ts",
  "src/hooks/use-reminders.ts",
];

// Order matters: longer/emoji sequences first.
const replacements = [
  ['"”', "-"],     // broken em-dash artifact (straight quote + right smart quote)
  ['"“', "-"],     // broken em-dash artifact (other orientation)
  ["”", '"'],       // stray right double smart quote -> straight
  ["“", '"'],       // stray left double smart quote -> straight
  ["’", "'"],        // right single smart quote -> apostrophe
  ["‘", "'"],        // left single smart quote -> apostrophe
  ["ðŸ§ ", ""],     // brain emoji + trailing space
  ["ðŸ§", ""],      // brain emoji (no space)
  ["ðŸŽ‰ ", ""],    // party emoji + trailing space
  ["ðŸŽ‰", ""],     // party emoji
  ["â†’", "->"],    // right arrow
  ["â†", "<-"],      // left arrow
  ["â€¦", "..."],   // ellipsis
  ['â€"', "-"],     // em dash
  ["â€“", "-"],      // en dash
  ["â€™", "'"],      // right single quote
  ["â€˜", "'"],      // left single quote
  ['â€œ', '"'],      // left double quote
  ['â€', '"'],      // right double quote (must come after the more specific ones)
  ["Â·", "·"], // middot stays a real middot (renders fine, not an em dash)
  ["Â ", " "],      // non-breaking space -> regular space
  ["Â", ""],        // stray Â
];

let totalFiles = 0;
for (const rel of files) {
  let txt;
  try {
    txt = readFileSync(rel, "utf8");
  } catch {
    continue;
  }
  const before = txt;
  for (const [bad, good] of replacements) {
    txt = txt.split(bad).join(good);
  }
  if (txt !== before) {
    writeFileSync(rel, txt, "utf8");
    totalFiles++;
    console.log("fixed", rel);
  }
}
console.log(`done: ${totalFiles} files repaired`);
