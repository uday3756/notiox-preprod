/**
 * Push Stripe env vars from local .env to Vercel Production + Preview.
 *
 * Usage (from repo root):
 *   node scripts/push-stripe-env.mjs
 *
 * Requires: vercel CLI logged in, project linked (.vercel/).
 * Reads STRIPE_* from .env — never prints secret values.
 */
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_ID",
  "STRIPE_PRICE_ID_MONTHLY",
  "STRIPE_PRICE_ID_ANNUAL",
  "STRIPE_PRICE_ID_LIFETIME",
];

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
    out[k] = v;
  }
  return out;
}

const env = loadEnv(".env");
const secret = env.STRIPE_SECRET_KEY?.trim() || "";
const mode = secret.startsWith("sk_live_")
  ? "live"
  : secret.startsWith("sk_test_")
    ? "test"
    : "INVALID";

console.log(`Local STRIPE_SECRET_KEY mode: ${mode}`);
if (mode === "INVALID" || !secret) {
  console.error(
    "Set a real STRIPE_SECRET_KEY in .env (sk_live_… for real charges, or sk_test_… for testing).",
  );
  process.exit(1);
}

if (mode === "test") {
  console.warn(
    "WARNING: secret is TEST mode. Real cards will NOT be charged. Switch to sk_live_ + LIVE price IDs for production.",
  );
}

async function validatePrices(secretKey, priceIds) {
  for (const [name, id] of priceIds) {
    if (!id) {
      console.log(`  ${name}: skipped (unset)`);
      continue;
    }
    const res = await fetch(`https://api.stripe.com/v1/prices/${id}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const body = await res.json();
    if (!res.ok) {
      console.error(`  ${name}: FAIL — ${body?.error?.message || res.statusText}`);
      return false;
    }
    const ok = body.livemode === (mode === "live");
    console.log(
      `  ${name}: ok amount=${body.unit_amount} livemode=${body.livemode} type=${body.type}`,
    );
    if (!ok) {
      console.error(
        `  MODE MISMATCH: ${name} is livemode=${body.livemode} but secret is ${mode}`,
      );
      return false;
    }
  }
  return true;
}

const pairs = KEYS.filter((k) => k !== "STRIPE_SECRET_KEY").map((k) => [
  k,
  env[k]?.trim() || "",
]);

console.log("Validating Price IDs against this secret…");
const ok = await validatePrices(secret, pairs);
if (!ok) {
  console.error(
    "\nFix: In Stripe Dashboard, toggle to Live (top-right), open Products, copy each live price_… ID into .env, then re-run.",
  );
  process.exit(1);
}

function upsertVercel(name, value) {
  // Remove existing then add — vercel env add is interactive otherwise.
  try {
    execFileSync(
      "npx",
      ["vercel", "env", "rm", name, "production", "preview", "--yes"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    /* may not exist yet */
  }
  // Pipe value to stdin for non-interactive add
  execFileSync(
    "npx",
    ["vercel", "env", "add", name, "production", "preview", "--force"],
    {
      input: value + "\n",
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  console.log(`Pushed ${name} → Vercel Production+Preview`);
}

console.log("\nPushing to Vercel…");
for (const k of KEYS) {
  const v = env[k]?.trim();
  if (!v) {
    console.log(`Skip ${k} (unset locally)`);
    continue;
  }
  upsertVercel(k, v);
}

console.log(
  "\nDone. Redeploy production (git push or `npx vercel --prod`) so the new secret is picked up.",
);
