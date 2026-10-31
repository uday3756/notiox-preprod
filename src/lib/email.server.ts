import { Resend } from "resend";
import { formatInTimeZone } from "date-fns-tz";
import { usesAmPmClock } from "@/lib/time-format";

// Lazy client so a late .env / process.env update is picked up without a stale null.
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

export async function sendTaskReminderEmail(
  toEmail: string,
  taskTitle: string,
  startTime: Date,
  category: string,
  userTimezone = "UTC",
  opts?: { idempotencyKey?: string; kind?: "starts" | "due" },
) {
  const resend = getResend();
  if (!resend) {
    console.warn(`[Email Service] RESEND_API_KEY is not set. Skipping reminder for "${taskTitle}" to ${toEmail}.`);
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const tz = userTimezone?.trim() || "UTC";
  const pat = usesAmPmClock(tz) ? "EEE, MMM d · h:mm a" : "EEE, MMM d · HH:mm";
  const formattedTime = formatInTimeZone(startTime, tz, pat);
  const safeTitle = escapeHtml(taskTitle);
  const safeCategory = escapeHtml(category);
  const kind = opts?.kind ?? "starts";
  const verb = kind === "due" ? "due" : "starts";
  const { defaultAppOrigin } = await import("@/lib/app-origin.server");
  const scheduleUrl = `${defaultAppOrigin()}/scheduling`;

  try {
    const { data, error } = await resend.emails.send(
      {
      // Resend's shared sender works without domain verification (can only
      // deliver to your own Resend account email until you verify a domain).
      from: process.env.RESEND_FROM || "Notio Reminders <onboarding@resend.dev>",
      to: [toEmail],
      subject: `Reminder: ${taskTitle} ${verb} soon`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">Upcoming Task Reminder</h2>
          <p>Hi there,</p>
          <p>This is a quick reminder that your scheduled task ${verb} soon.</p>
          <div style="background-color: #f4f4f5; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #111;">${safeTitle}</h3>
            <p style="margin: 0; color: #555;"><strong>Time:</strong> ${escapeHtml(formattedTime)}</p>
            <p style="margin: 4px 0 0; color: #555;"><strong>Category:</strong> ${safeCategory}</p>
          </div>
          <p style="color: #666; font-size: 14px;">
            <a href="${escapeHtml(scheduleUrl)}" style="color: #0066cc; text-decoration: none;">View your schedule in Notio</a>
          </p>
        </div>
      `,
      },
      opts?.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );

    if (error) {
      console.error("[Email Service] Resend error:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error("[Email Service] Failed to send email:", err);
    return { success: false, error: err };
  }
}

export async function sendWeeklyReportNotification(
  toEmail: string,
  userName: string
) {
  const resend = getResend();
  if (!resend) {
    console.warn(`[Email Service] RESEND_API_KEY is not set. Skipping weekly report notification to ${toEmail}.`);
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || "Notio <onboarding@resend.dev>",
      to: [toEmail],
      subject: "Your week in mind is ready",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #35E0F0;">Your week in mind</h2>
          <p>Hi ${userName},</p>
          <p>Your weekly reflection report is ready. Take 60 seconds to look back at what mattered this week.</p>
          <div style="background-color: #141A26; padding: 20px; border-radius: 16px; margin: 24px 0;">
            <p style="color: #E5E7EB; margin: 0;">
              Built from your wins, completed tasks, and recurring themes. Nothing else.
            </p>
          </div>
          <a href="https://remix-of-pixel-perfect-ten.vercel.app/weekly-report" 
             style="display: inline-block; background-color: #35E0F0; color: #0B0D12; 
                    padding: 12px 24px; border-radius: 24px; text-decoration: none; 
                    font-weight: 600; margin-top: 16px;">
            View your report
          </a>
          <p style="color: #9CA3AF; font-size: 14px; margin-top: 32px;">
            Keep going — your next report will capture the week ahead.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("[Email Service] Resend error:", error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (err) {
    console.error("[Email Service] Failed to send weekly report email:", err);
    return { success: false, error: err };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type AuthOtpEmailKind = "signup" | "recovery";

const AUTH_OTP_COPY: Record<
  AuthOtpEmailKind,
  {
    eyebrow: string;
    title: string;
    body: string;
    button: string;
    subject: string;
    footer: string;
  }
> = {
  signup: {
    eyebrow: "Verify your email",
    title: "Your verification code",
    body: "Enter this 6-digit code in Notio to finish creating your account. It expires soon.",
    button: "Verify email & continue",
    subject: "Your Notio verification code",
    footer: "If you didn't create a Notio account, you can ignore this email.",
  },
  recovery: {
    eyebrow: "Password reset",
    title: "Your reset code",
    body: "Enter this 6-digit code in the Notio app to choose a new password. It expires soon.",
    button: "Open password reset",
    subject: "Your Notio password reset code",
    footer: "If you didn't ask to reset your password, you can ignore this email.",
  },
};

function buildAuthOtpHtml(
  kind: AuthOtpEmailKind,
  otpCode: string,
  actionLink: string,
): string {
  const copy = AUTH_OTP_COPY[kind];
  const otp = escapeHtml(otpCode.replace(/\D/g, "").slice(0, 8));
  const link = escapeHtml(actionLink);
  const accent = kind === "signup" ? "#35E0F0" : "#6EA8FF";
  const buttonBg = kind === "signup" ? "#35E0F0" : "#3B82F6";
  const buttonFg = kind === "signup" ? "#0B0D12" : "#FFFFFF";

  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#0B0D12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0B0D12;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#141820;border:1px solid #2A3140;border-radius:20px;overflow:hidden;">
        <tr><td style="padding:28px 28px 8px 28px;text-align:center;">
          <div style="font-size:22px;font-weight:700;letter-spacing:-0.02em;color:#FFFFFF;">Notio</div>
          <div style="margin-top:6px;font-size:13px;color:#8B93A7;">${escapeHtml(copy.eyebrow)}</div>
        </td></tr>
        <tr><td style="padding:8px 28px 0 28px;text-align:center;">
          <h1 style="margin:0;font-size:22px;line-height:1.3;color:#FFFFFF;font-weight:650;">${escapeHtml(copy.title)}</h1>
          <p style="margin:12px 0 0 0;font-size:14px;line-height:1.55;color:#A7B0C3;">
            ${escapeHtml(copy.body)}
          </p>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <div style="background:#0B0D12;border:1px solid #3B4660;border-radius:16px;padding:20px 12px;text-align:center;">
            <div style="font-size:36px;letter-spacing:0.35em;font-weight:700;color:${accent};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${otp}</div>
          </div>
        </td></tr>
        <tr><td style="padding:0 28px 8px 28px;text-align:center;">
          <p style="margin:0;font-size:13px;color:#8B93A7;">Or tap the button to verify in one step:</p>
          <p style="margin:12px 0 0 0;">
            <a href="${link}" style="display:inline-block;background:${buttonBg};color:${buttonFg};text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px;">${escapeHtml(copy.button)}</a>
          </p>
        </td></tr>
        <tr><td style="padding:24px 28px 28px 28px;text-align:center;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#6B7280;">
            ${escapeHtml(copy.footer)}
          </p>
          <p style="margin:14px 0 0 0;font-size:11px;color:#4B5563;">Sent by Notio</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendAuthOtpEmail(
  kind: AuthOtpEmailKind,
  toEmail: string,
  otpCode: string,
  actionLink: string,
) {
  const resend = getResend();
  if (!resend) {
    console.warn(
      `[Email Service] RESEND_API_KEY is not set. Cannot send ${kind} OTP to ${toEmail}.`,
    );
    return { success: false, error: "RESEND_API_KEY not configured" };
  }

  const preferredFrom =
    process.env.RESEND_FROM?.trim() || "Notio <no-reply@notiolive.com>";
  const fallbackFrom = "Notio <onboarding@resend.dev>";
  const html = buildAuthOtpHtml(kind, otpCode, actionLink);
  const subject = AUTH_OTP_COPY[kind].subject;

  async function attempt(from: string) {
    return resend.emails.send({
      from,
      to: [toEmail],
      subject,
      html,
    });
  }

  try {
    let { data, error } = await attempt(preferredFrom);
    if (error && preferredFrom !== fallbackFrom) {
      console.warn(
        `[Email Service] Preferred from failed for ${kind}, retrying onboarding@resend.dev:`,
        error,
      );
      ({ data, error } = await attempt(fallbackFrom));
    }
    if (error) {
      console.error(`[Email Service] Resend ${kind} OTP error:`, error);
      return { success: false, error };
    }
    return { success: true, data };
  } catch (err) {
    console.error(`[Email Service] Failed to send ${kind} OTP email:`, err);
    return { success: false, error: err };
  }
}

/** Branded signup verification: large 6-digit OTP + verify button. */
export async function sendSignupOtpEmail(
  toEmail: string,
  otpCode: string,
  actionLink: string,
) {
  return sendAuthOtpEmail("signup", toEmail, otpCode, actionLink);
}

/** Branded password-reset email: large 6-digit OTP + working reset button. */
export async function sendPasswordResetEmail(
  toEmail: string,
  otpCode: string,
  actionLink: string,
) {
  return sendAuthOtpEmail("recovery", toEmail, otpCode, actionLink);
}


