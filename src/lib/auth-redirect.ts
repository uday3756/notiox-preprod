import { Browser } from "@capacitor/browser";
import { isNativeApp } from "@/lib/native";

/** Canonical web origin for OAuth redirects (must be allow-listed in Supabase). */
export const AUTH_REDIRECT_ORIGIN =
  (typeof import.meta !== "undefined" &&
    (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim()) ||
  "https://notiolive.com";

/**
 * OAuth redirect target. Native apps use the production HTTPS callback so
 * Supabase + Google can complete the flow; Capacitor App Links open the app.
 */
/**
 * Default path after OAuth when the caller does not pass one.
 * Role picker first (Student → Canvas); then `/onboarding/persona`
 * (QuickOnboarding when FEATURE_WORKFLOW is on; legacy quiz via ?legacy=true).
 */
export function oauthRedirectTo(path = "/onboarding/role"): string {
  if (typeof window === "undefined") return `${AUTH_REDIRECT_ORIGIN}${path}`;
  if (isNativeApp()) return `${AUTH_REDIRECT_ORIGIN}${path}`;
  return `${window.location.origin}${path}`;
}

/** Open an external URL — system browser on native (better for Google OAuth). */
export async function openExternalUrl(url: string): Promise<void> {
  if (isNativeApp()) {
    await Browser.open({ url });
    return;
  }
  window.location.href = url;
}
