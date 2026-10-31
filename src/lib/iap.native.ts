/**
 * Store IAP via RevenueCat (Capacitor). No-ops on web — use Stripe there.
 *
 * Env (build-time, VITE_):
 *   VITE_REVENUECAT_IOS_KEY
 *   VITE_REVENUECAT_ANDROID_KEY
 *
 * Entitlement id defaults to "pro" (configure the same id in RevenueCat).
 */
import { Purchases, LOG_LEVEL, type PurchasesPackage } from "@revenuecat/purchases-capacitor";
import { isNativeApp, nativePlatform } from "@/lib/native";

const ENTITLEMENT_ID = "pro";

let configured = false;

export async function configureIap(appUserId?: string): Promise<boolean> {
  if (!isNativeApp() || configured) return configured;
  const platform = nativePlatform();
  const apiKey =
    platform === "ios"
      ? (import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined)?.trim()
      : (import.meta.env.VITE_REVENUECAT_ANDROID_KEY as string | undefined)?.trim();

  if (!apiKey) {
    console.warn("[iap] Missing VITE_REVENUECAT_*_KEY — store purchases disabled.");
    return false;
  }

  try {
    await Purchases.setLogLevel({ level: LOG_LEVEL.INFO });
    await Purchases.configure({
      apiKey,
      appUserID: appUserId ?? null,
    });
    configured = true;
    return true;
  } catch (e) {
    console.error("[iap] configure failed", e);
    return false;
  }
}

export async function identifyIapUser(userId: string): Promise<void> {
  if (!configured) return;
  try {
    await Purchases.logIn({ appUserID: userId });
  } catch (e) {
    console.warn("[iap] logIn failed", e);
  }
}

export type StorePackage = {
  identifier: string;
  packageType: string;
  product: { identifier: string; title: string; priceString: string };
  raw: PurchasesPackage;
};

export async function getStorePackages(): Promise<StorePackage[]> {
  if (!configured && !(await configureIap())) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current?.availablePackages?.length) return [];
    return current.availablePackages.map((p) => ({
      identifier: p.identifier,
      packageType: String(p.packageType),
      product: {
        identifier: p.product.identifier,
        title: p.product.title,
        priceString: p.product.priceString,
      },
      raw: p,
    }));
  } catch (e) {
    console.error("[iap] getOfferings failed", e);
    return [];
  }
}

export async function purchaseStorePackage(
  pkg: StorePackage,
): Promise<{ active: boolean; customerInfoJson: string }> {
  if (!configured && !(await configureIap())) {
    throw new Error("In-app purchases aren't configured yet.");
  }
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg.raw });
  const active = Boolean(customerInfo.entitlements.active[ENTITLEMENT_ID]);
  return { active, customerInfoJson: JSON.stringify(customerInfo) };
}

export async function restoreStorePurchases(): Promise<{
  active: boolean;
  customerInfoJson: string;
}> {
  if (!configured && !(await configureIap())) {
    throw new Error("In-app purchases aren't configured yet.");
  }
  const { customerInfo } = await Purchases.restorePurchases();
  const active = Boolean(customerInfo.entitlements.active[ENTITLEMENT_ID]);
  return { active, customerInfoJson: JSON.stringify(customerInfo) };
}

export async function hasProEntitlement(): Promise<boolean> {
  if (!configured && !(await configureIap())) return false;
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    return Boolean(customerInfo.entitlements.active[ENTITLEMENT_ID]);
  } catch {
    return false;
  }
}

export function isIapConfiguredInEnv(): boolean {
  const ios = (import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined)?.trim();
  const android = (import.meta.env.VITE_REVENUECAT_ANDROID_KEY as string | undefined)?.trim();
  const platform = nativePlatform();
  if (platform === "ios") return Boolean(ios);
  if (platform === "android") return Boolean(android);
  return Boolean(ios || android);
}
