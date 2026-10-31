import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Notio native shell (Play Store / App Store).
 * Loads the production web app in a WebView. Keep webDir as a local placeholder
 * so `cap sync` works even when using server.url.
 */
const config: CapacitorConfig = {
  appId: "com.notio.app",
  appName: "Notio",
  webDir: "www",
  server: {
    // Canonical production domain (custom domain on Vercel).
    url: "https://notiolive.com",
    cleartext: false,
    allowNavigation: [
      "notiolive.com",
      "*.notiolive.com",
      "remix-of-pixel-perfect-ten.vercel.app",
      "*.vercel.app",
      "*.supabase.co",
      "accounts.google.com",
      "*.google.com",
      "checkout.stripe.com",
    ],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: "#090D15",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#090D15",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#090D15",
  },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#090D15",
    scheme: "Notio",
  },
};

export default config;
