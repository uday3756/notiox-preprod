/**
 * Apply Notio signup confirmation email template (OTP + branded button) to Supabase Auth.
 * Backup if Resend branded mail fails — primary path is app-controlled Resend.
 *
 *   $env:SUPABASE_ACCESS_TOKEN='sbp_...'; node scripts/apply-signup-email-template.mjs
 *
 * Or: Dashboard → Authentication → Email Templates → Confirm signup
 *     Subject: Your Notio verification code
 *     Paste scripts/signup-email-template.html
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
      "  $env:SUPABASE_ACCESS_TOKEN='sbp_...'; node scripts/apply-signup-email-template.mjs",
  );
  process.exit(1);
}

const html = fs.readFileSync(
  path.join(__dirname, "signup-email-template.html"),
  "utf8",
);

const payload = {
  mailer_subjects_confirmation: "Your Notio verification code",
  mailer_templates_confirmation_content: html,
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

console.log(
  "OK — confirmation email template updated (OTP {{ .Token }} + verify button).",
);
