import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveAppOrigin } from "@/lib/app-origin.server";

const RequestResetInput = z.object({
  email: z.string().trim().email().max(320),
  /** Browser origin so local reset links open localhost, not production. */
  redirectOrigin: z.string().trim().url().max(200).optional(),
});

/**
 * Public password-reset request.
 * Prefer Resend + admin.generateLink (branded OTP email we control).
 * Email button links into our /auth page with token_hash so tap → set new password.
 * Always returns success to avoid email enumeration.
 */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((input: unknown) => RequestResetInput.parse(input))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase();
    const appOrigin = resolveAppOrigin(data.redirectOrigin);
    const redirectTo = `${appOrigin}/auth?reset=1`;

    try {
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const { sendPasswordResetEmail } = await import("@/lib/email.server");

      const { data: linkData, error: linkErr } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo },
        });

      if (linkErr) {
        console.warn("[requestPasswordReset] generateLink:", linkErr.message);
        return { ok: true as const };
      }

      const props = linkData?.properties as
        | {
            email_otp?: string;
            action_link?: string;
            hashed_token?: string;
          }
        | undefined;
      const otp = props?.email_otp?.trim() ?? "";
      const hashedToken = props?.hashed_token?.trim() ?? "";

      const actionLink = hashedToken
        ? `${appOrigin}/auth?reset=1&type=recovery&token_hash=${encodeURIComponent(hashedToken)}`
        : props?.action_link?.trim() || redirectTo;

      if (otp) {
        const sent = await sendPasswordResetEmail(email, otp, actionLink);
        if (sent.success) {
          return { ok: true as const, via: "resend" as const, emailed: true as const };
        }
        console.warn(
          "[requestPasswordReset] Resend failed, falling back:",
          sent.error,
        );
        return {
          ok: true as const,
          via: "resend_failed" as const,
          emailed: false as const,
          reason:
            typeof sent.error === "string"
              ? sent.error
              : "Resend rejected the password-reset email",
        };
      } else {
        console.warn("[requestPasswordReset] generateLink returned no email_otp");
      }

      const { createClient } = await import("@supabase/supabase-js");
      const url = process.env.SUPABASE_URL;
      const anon =
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (url && anon) {
        const anonClient = createClient(url, anon);
        const { error } = await anonClient.auth.resetPasswordForEmail(email, {
          redirectTo,
        });
        if (error) {
          console.warn(
            "[requestPasswordReset] resetPasswordForEmail:",
            error.message,
          );
          return {
            ok: true as const,
            via: "supabase" as const,
            emailed: false as const,
            reason: error.message,
          };
        }
      }
      return { ok: true as const, via: "supabase" as const, emailed: true as const };
    } catch (err) {
      console.error("[requestPasswordReset]", err);
      return { ok: true as const };
    }
  });
