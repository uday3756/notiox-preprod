/**
 * Apply Notio password-reset email template (OTP + branded button) to Supabase Auth.
 *
 * Requires a Supabase personal access token:
 *   set SUPABASE_ACCESS_TOKEN=sbp_...
 *   node scripts/apply-recovery-email-template.mjs
 *
 * Or: Dashboard → Authentication → Email Templates → Reset password
 *     Subject: Your Notio password reset code
 *     Paste scripts/recovery-email-template.html
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = process.env.SUPABASE_PROJECT_ID || "tfklcyinjvpvfyxltbzz";
const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();

if (!token) {
  console.error(
    "Missing SUPABASE_ACCESS_TOKEN.\n" +
      "Create one at https://supabase.com/dashboard/account/tokens\n" +
      "Then run:\n" +
      "  $env:SUPABASE_ACCESS_TOKEN='sbp_...'; node scripts/apply-recovery-email-template.mjs",
  );
  process.exit(1);
}

const html = fs.readFileSync(
  path.join(__dirname, "recovery-email-template.html"),
  "utf8",
);

const payload = {
  mailer_subjects_recovery: "Your Notio password reset code",
  mailer_templates_recovery_content: html,
};

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  },
);

if (!res.ok) {
  const body = await res.text();
  console.error("PATCH failed", res.status, body);
  process.exit(1);
}

console.log("OK — recovery email template updated (OTP {{ .Token }} + reset button).");
console.log(
  "Also confirm Auth → URL Configuration allow-list includes:\n" +
    "  http://localhost:8080/**\n" +
    "  https://www.notiolive.com/**\n" +
    "  https://notiolive.com/**\n" +
    "  https://remix-of-pixel-perfect-ten.vercel.app/**",
);
