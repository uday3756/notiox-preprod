/**
 * NX-15: push current git index to notiox-preprod main via Git Data API.
 * Avoids git HTTP pack 408s on this Windows uplink.
 * Usage: node scripts/nx15-api-push.mjs
 * Auth: `gh auth token` (never logged).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OWNER = "uday3756";
const REPO = "notiox-preprod";
const BRANCH = "main";
const ROOT = process.cwd();

const token = execSync("gh auth token", { encoding: "utf8" }).trim();
if (!token) {
  console.error("No gh auth token");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "nx15-api-push",
};

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function api(method, urlPath, body, attempt = 1) {
  const res = await fetch(`https://api.github.com${urlPath}`, {
    method,
    headers: {
      ...headers,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const retryable = res.status === 400 || res.status === 502 || res.status === 503 || res.status === 429;
    if (retryable && attempt < 5) {
      const wait = attempt * 1500;
      console.warn(`retry ${attempt} ${method} ${urlPath} status=${res.status} wait=${wait}ms`);
      await sleep(wait);
      return api(method, urlPath, body, attempt + 1);
    }
    const msg = typeof json === "object" ? JSON.stringify(json).slice(0, 500) : text.slice(0, 500);
    throw new Error(`${method} ${urlPath} -> ${res.status}: ${msg}`);
  }
  return json;
}

function listFiles() {
  return execSync("git ls-files -z", { encoding: "buffer" })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function isProbablyBinary(filePath, buf) {
  if (/\.(png|jpe?g|webp|gif|ico|mov|mp4|woff2?|ttf|otf|apk|aab|jar|zip|pdf|bin)$/i.test(filePath)) {
    return true;
  }
  const sample = buf.subarray(0, Math.min(buf.length, 8000));
  return sample.includes(0);
}

async function createBlob(filePath) {
  const abs = path.join(ROOT, filePath);
  const buf = fs.readFileSync(abs);
  const binary = isProbablyBinary(filePath, buf);
  const payload = binary
    ? { content: buf.toString("base64"), encoding: "base64" }
    : { content: buf.toString("utf8"), encoding: "utf-8" };
  try {
    const blob = await api("POST", `/repos/${OWNER}/${REPO}/git/blobs`, payload);
    return blob.sha;
  } catch (err) {
    throw new Error(`blob failed for ${filePath}: ${err.message}`);
  }
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return out;
}

const files = listFiles();
console.log(`files=${files.length}`);

const shas = await mapPool(files, 2, async (file, idx) => {
  const sha = await createBlob(file);
  if ((idx + 1) % 25 === 0 || idx === files.length - 1) {
    console.log(`blobs ${idx + 1}/${files.length}`);
  }
  return { path: file.replace(/\\/g, "/"), sha };
});

const tree = shas.map(({ path: p, sha }) => ({
  path: p,
  mode: "100644",
  type: "blob",
  sha,
}));

console.log("creating tree...");
const treeRes = await api("POST", `/repos/${OWNER}/${REPO}/git/trees`, { tree });
console.log(`tree=${treeRes.sha}`);

console.log("creating commit...");
const commitRes = await api("POST", `/repos/${OWNER}/${REPO}/git/commits`, {
  message:
    "CEO handoff remaining wiring on notiox-preprod\n\nCanonical task upserts, capture preview/save, draft-mode mindmap, onboarding resolver, owner-scoped reminders, Canvas/Google identity guards. Flags stay OFF. Migrations not applied to shared Supabase.",
  tree: treeRes.sha,
  parents: [],
});
console.log(`commit=${commitRes.sha}`);

console.log(`force-updating refs/heads/${BRANCH}...`);
try {
  await api("PATCH", `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    sha: commitRes.sha,
    force: true,
  });
} catch (err) {
  // create ref if missing
  console.log(`patch failed (${err.message}); trying create...`);
  await api("POST", `/repos/${OWNER}/${REPO}/git/refs`, {
    ref: `refs/heads/${BRANCH}`,
    sha: commitRes.sha,
  });
}

console.log(`DONE commit=${commitRes.sha} tree=${treeRes.sha}`);
