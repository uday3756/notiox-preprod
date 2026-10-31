/**
 * Capacitor shell bootstrap — call once from the app root on native.
 */
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";
import { App as CapApp } from "@capacitor/app";

let bootstrapped = false;

export async function bootstrapNativeShell(): Promise<void> {
  if (bootstrapped || !Capacitor.isNativePlatform()) return;
  bootstrapped = true;

  try {
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#090D15" });
  } catch {
    /* web or unsupported */
  }

  try {
    await SplashScreen.hide();
  } catch {
    /* ignore */
  }

  CapApp.addListener("backButton", ({ canGoBack }) => {
    if (document.querySelector('[data-notio-fullscreen="true"]')) {
      window.dispatchEvent(new Event("notio:exit-fullscreen"));
      return;
    }
    if (canGoBack) {
      window.history.back();
    } else {
      void CapApp.exitApp();
    }
  });

  CapApp.addListener("appUrlOpen", ({ url }) => {
    try {
      const parsed = new URL(url);
      // Support notio://maps, https://notiolive.com/maps, etc.
      const path = parsed.pathname || parsed.host;
      const search = parsed.search || "";
      const hash = parsed.hash || "";
      const target =
        path.startsWith("/") ? `${path}${search}${hash}` : `/${path}${search}${hash}`;
      if (target && target !== "/") {
        window.location.assign(target);
      }
    } catch {
      /* ignore malformed */
    }
  });
}
