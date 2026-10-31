/**
 * Push env vars from local .env to Vercel (production + preview + development).
 * Never prints secret values — only key names and status.
 *
 * Usage (from repo root, after `npx vercel link`):
 *   node scripts/push-env-to-vercel.mjs
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const VERCEL_BIN = process.platform === "win32" ? "vercel.cmd" : "vercel";

const SKIP = new Set([
  // Local-only / not needed on Vercel
  "VERCEL_OIDC_TOKEN",
]);

/** Production overrides (localhost values must not ship). */
const PROD_OVERRIDES = {
  VITE_PUBLIC_APP_URL: "https://notiolive.com",
  GOOGLE_CALENDAR_REDIRECT_URI:
    "https://notiolive.com/api/integrations/google-calendar/callback",
};

function loadEnv(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing ${path}`);
  const raw = fs.readFileSync(path, "utf8");
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    // Strip accidental trailing escaped newlines from some editors
    v = v.replace(/\\n$/, "").trim();
    if (k) out[k] = v;
  }
  return out;
}

function upsertVercel(name, value, targets) {
  for (const target of targets) {
    try {
      execFileSync(VERCEL_BIN, ["env", "rm", name, target, "--yes"], {
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      });
    } catch {
      /* may not exist */
    }
    execFileSync(VERCEL_BIN, ["env", "add", name, target, "--force"], {
      input: value + "\n",
      stdio: ["pipe", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
  }
}

const env = loadEnv(".env");
const keys = Object.keys(env).filter((k) => !SKIP.has(k) && env[k]);

console.log(`Pushing ${keys.length} env keys to Vercel (values hidden)…`);

let ok = 0;
let fail = 0;
for (const k of keys) {
  let value = env[k];
  if (PROD_OVERRIDES[k]) value = PROD_OVERRIDES[k];
  // Prefer a real CRON_SECRET in production if local is a placeholder
  if (k === "CRON_SECRET" && value.includes("dev-only")) {
    console.log(`Skip ${k} (local placeholder — set a real secret in Vercel dashboard)`);
    continue;
  }
  try {
    upsertVercel(k, value, ["production", "preview", "development"]);
    console.log(`OK  ${k}`);
    ok++;
  } catch (e) {
    console.error(`FAIL ${k}: ${e?.message || e}`);
    fail++;
  }
}

// Ensure public app URL exists even if missing from .env
if (!env.VITE_PUBLIC_APP_URL) {
  try {
    upsertVercel(
      "VITE_PUBLIC_APP_URL",
      PROD_OVERRIDES.VITE_PUBLIC_APP_URL,
      ["production", "preview", "development"],
    );
    console.log("OK  VITE_PUBLIC_APP_URL (override)");
    ok++;
  } catch (e) {
    console.error(`FAIL VITE_PUBLIC_APP_URL: ${e?.message || e}`);
    fail++;
  }
}

console.log(`\nDone. ${ok} pushed, ${fail} failed.`);
console.log("Redeploy with: npx vercel --prod");
