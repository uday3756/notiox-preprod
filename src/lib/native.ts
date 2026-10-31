/**
 * Native shell helpers (Capacitor). Safe to import from web — all checks are no-ops in browser.
 */
import { Capacitor } from "@capacitor/core";

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function nativePlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  try {
    const p = Capacitor.getPlatform();
    if (p === "ios" || p === "android") return p;
    return "web";
  } catch {
    return "web";
  }
}

/** Stripe web checkout is blocked on store builds — use IAP instead. */
export function useStoreBilling(): boolean {
  return isNativeApp();
}
