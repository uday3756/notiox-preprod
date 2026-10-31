/**
 * Loads RevenueCat IAP only on the client. Avoids SSR import-protection
 * denials for *.client.* modules (Vercel production build).
 */
import { createIsomorphicFn } from "@tanstack/react-start";

export const loadIap = createIsomorphicFn()
  .client(() => import("@/lib/iap.native"))
  .server(() => Promise.resolve(null));
