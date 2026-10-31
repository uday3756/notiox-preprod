import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import analytics from "@/lib/analytics";

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Track session start
    analytics.trackSessionStart();

    // Identify the current user (if already signed in)
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        analytics.identifyUser(user.id, {
          email: user.email,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          signup_date: user.created_at,
        });
      }
    });

    // Re-identify on auth changes (sign in / sign out)
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        analytics.identifyUser(session.user.id, {
          email: session.user.email,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          signup_date: session.user.created_at,
        });
      } else if (event === "SIGNED_OUT") {
        analytics.resetUser();
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  return <>{children}</>;
}
