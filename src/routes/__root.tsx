import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportError } from "../lib/error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { AnalyticsProvider } from "@/providers/analytics-provider";
import { useTaskNotifications } from "@/hooks/use-task-notifications";
import { useWinsReminder } from "@/hooks/use-wins-reminder";
import { GoogleCalendarPullMount } from "@/hooks/use-google-calendar-pull";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-gradient">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Lost in the map</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This page doesn't exist. Head back home.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. Try again or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
          <a href="/" className="rounded-full border border-border px-5 py-2 text-sm font-medium hover:bg-accent">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Notio — Voice to Mindmap" },
      { name: "description", content: "Speak your thoughts. Notio turns them into a clean, intelligent mindmap." },
      { name: "theme-color", content: "#0B0D12" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Notio" },
      { property: "og:title", content: "Notio — Voice to Mindmap" },
      { property: "og:description", content: "A mobile-first thinking tool: voice in, mindmap out." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:image", content: "/logo.png" },
    ],
    links: [
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "stylesheet", href: appCss },
      // Landing body font (founder handoff). Loaded via <link>, not CSS @import —
      // Lightning CSS rejects @import after Tailwind expands into rules.
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  
  // Enable task notifications
  useTaskNotifications();

  // Feature 1 — End-of-Day "3 Wins" reminder. Gated on the dailyWins flag so
  // production can keep the incomplete feature disabled without unmounting.
  useWinsReminder(FEATURE_FLAGS.dailyWins);

  // Capacitor shell: status bar, splash hide, back button, deep links.
  useEffect(() => {
    void import("@/lib/native-bootstrap").then((m) => m.bootstrapNativeShell());
  }, []);

  // Register the service worker (enables PWA install + basic offline).
  // Skip inside native WebView — SW can conflict with Capacitor routing.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    void import("@/lib/native").then(({ isNativeApp }) => {
      if (isNativeApp()) return;
      const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    });
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event === "SIGNED_OUT") {
          void queryClient.cancelQueries();
          queryClient.clear();
        } else {
          queryClient.invalidateQueries();
        }
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <AnalyticsProvider>
      <QueryClientProvider client={queryClient}>
      {/* Must sit under QueryClientProvider — useQueryClient crashes above it. */}
      <GoogleCalendarPullMount enabled={FEATURE_FLAGS.googleCalendar} />
      <Outlet />
      <Toaster theme="dark" position="top-center" richColors />
    </QueryClientProvider>
    </AnalyticsProvider>
  );
}
