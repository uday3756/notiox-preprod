// Client-side disposable-email guard. Gives instant feedback before we even
// hit Supabase. This is the friendly UX layer — the DB trigger
// (reject_disposable_email) is the hard enforcement that can't be bypassed.
import disposableDomains from "disposable-email-domains";

// Build a Set once for O(1) lookups.
const DISPOSABLE = new Set(disposableDomains);

/** Extract the lowercased domain from an email, or null if malformed. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/** True if the email uses a known disposable / temporary provider. */
export function isDisposableEmail(email: string): boolean {
  const domain = emailDomain(email);
  if (!domain) return false;
  return DISPOSABLE.has(domain);
}

/**
 * Validate an email for signup. Returns an error message string if invalid,
 * or null if it passes.
 */
export function validateSignupEmail(email: string): string | null {
  const trimmed = email.trim();
  // Basic shape check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return "Please enter a valid email address.";
  }
  if (isDisposableEmail(trimmed)) {
    return "Temporary or disposable emails aren't allowed. Please use a permanent email.";
  }
  return null;
}
