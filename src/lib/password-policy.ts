/**
 * Client-side password rules for signup / forgot-password / change-password.
 * Supabase still enforces its own min length server-side.
 */

export type PasswordValidation = {
  ok: boolean;
  error: string | null;
};

const MIN_LENGTH = 8;

export function validateNewPassword(
  password: string,
  confirm: string,
  email = "",
): PasswordValidation {
  const pwd = password ?? "";
  const conf = confirm ?? "";

  if (pwd.length < MIN_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_LENGTH} characters.`,
    };
  }
  if (pwd !== conf) {
    return { ok: false, error: "Passwords don't match." };
  }

  const emailLocal = email.trim().toLowerCase().split("@")[0] ?? "";
  if (emailLocal.length >= 3 && pwd.toLowerCase().includes(emailLocal)) {
    return {
      ok: false,
      error: "Password shouldn't contain your email address.",
    };
  }

  // Reject obvious single-character / sequential dumps / common weak bases
  const lower = pwd.toLowerCase();
  if (
    /^(.)\1+$/.test(pwd) ||
    lower === "password" ||
    lower.startsWith("password") ||
    lower === "12345678" ||
    lower === "qwertyui" ||
    lower === "abcdefgh"
  ) {
    return { ok: false, error: "Choose a stronger password." };
  }

  return { ok: true, error: null };
}

export const PASSWORD_MIN_LENGTH = MIN_LENGTH;
