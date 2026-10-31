import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveAppOrigin } from "@/lib/app-origin.server";
import { validateSignupEmail } from "@/lib/email-validation";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

const SignUpInput = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(128),
  redirectOrigin: z.string().trim().url().max(200).optional(),
});

const ResendInput = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(128).optional(),
  redirectOrigin: z.string().trim().url().max(200).optional(),
});

type LinkProps = {
  email_otp?: string;
  hashed_token?: string;
  action_link?: string;
};

async function sendBrandedSignupMail(
  email: string,
  password: string | undefined,
  redirectOrigin?: string,
): Promise<{ emailed: boolean; reason?: string }> {
  const appOrigin = resolveAppOrigin(redirectOrigin);
  const redirectTo = `${appOrigin}/auth?verify=1`;

  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  const { sendSignupOtpEmail } = await import("@/lib/email.server");

  const { data: linkData, error: linkErr } = password
    ? await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email,
        password,
        options: { redirectTo },
      })
    : await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });

  if (linkErr) {
    console.warn("[signup] generateLink:", linkErr.message);
    return { emailed: false, reason: linkErr.message };
  }

  const props = linkData?.properties as LinkProps | undefined;
  const otp = props?.email_otp?.trim() ?? "";
  const hashedToken = props?.hashed_token?.trim() ?? "";
  // signup hashed_token → verifyOtp type "signup"; magiclink → "email"
  const verifyType = password ? "signup" : "email";
  const actionLink = hashedToken
    ? `${appOrigin}/auth?verify=1&type=${verifyType}&token_hash=${encodeURIComponent(hashedToken)}`
    : props?.action_link?.trim() || redirectTo;

  if (!otp) {
    console.warn("[signup] generateLink returned no email_otp");
    return { emailed: false, reason: "No OTP from Supabase" };
  }

  const sent = await sendSignupOtpEmail(email, otp, actionLink);
  if (!sent.success) {
    return {
      emailed: false,
      reason:
        typeof sent.error === "string"
          ? sent.error
          : "Resend rejected the signup email",
    };
  }
  return { emailed: true };
}

/**
 * Create account (unconfirmed) and send branded Resend OTP — skips Supabase's
 * default confirmation mailer so users only get the Notio template.
 */
export const startEmailSignup = createServerFn({ method: "POST" })
  .validator((input: unknown) => SignUpInput.parse(input))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const emailErr = validateSignupEmail(email);
    if (emailErr) {
      throw new Error(emailErr);
    }

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    const { data: created, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: false,
      });

    if (createErr) {
      const msg = createErr.message.toLowerCase();
      if (
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists") ||
        createErr.status === 422
      ) {
        throw new Error(
          "An account with this email already exists. Sign in, or use Forgot password.",
        );
      }
      if (msg.includes("disposable")) {
        throw new Error(
          "Temporary or disposable emails aren't allowed. Please use a permanent email.",
        );
      }
      throw new Error(createErr.message);
    }

    if (!created.user) {
      throw new Error("Couldn't create account. Try again.");
    }

    const mail = await sendBrandedSignupMail(
      email,
      data.password,
      data.redirectOrigin,
    );

    if (!mail.emailed) {
      console.warn("[signup] Resend failed, falling back to Supabase:", mail.reason);
      const { createClient } = await import("@supabase/supabase-js");
      const url = process.env.SUPABASE_URL;
      const anon =
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (url && anon) {
        const anonClient = createClient(url, anon);
        const appOrigin = resolveAppOrigin(data.redirectOrigin);
        await anonClient.auth.resend({
          type: "signup",
          email,
          options: {
            emailRedirectTo: `${appOrigin}/onboarding/persona`,
          },
        });
      }
    }

    return {
      ok: true as const,
      needsOtp: true as const,
      via: mail.emailed ? ("resend" as const) : ("supabase" as const),
    };
  });

/** Resend branded signup OTP for an unconfirmed account. */
export const resendSignupVerification = createServerFn({ method: "POST" })
  .validator((input: unknown) => ResendInput.parse(input))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const mail = await sendBrandedSignupMail(
      email,
      data.password,
      data.redirectOrigin,
    );

    if (!mail.emailed) {
      const { createClient } = await import("@supabase/supabase-js");
      const url = process.env.SUPABASE_URL;
      const anon =
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (url && anon) {
        const anonClient = createClient(url, anon);
        const appOrigin = resolveAppOrigin(data.redirectOrigin);
        const { error } = await anonClient.auth.resend({
          type: "signup",
          email,
          options: {
            emailRedirectTo: `${appOrigin}/onboarding/persona`,
          },
        });
        if (error) {
          console.warn("[signup] resend fallback:", error.message);
        }
      }
    }

    return { ok: true as const };
  });
