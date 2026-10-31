import { useEffect } from "react";
import { App } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import {
  clearNativeWidget,
  configureNativeWidget,
  supportsNativeWidget,
  pauseNativeWidget,
} from "@/lib/widget-bridge";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

export function useNativeWidget() {
  useEffect(() => {
    if (!supportsNativeWidget()) return;
    let disposed = false;
    async function publish() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (disposed) return;
      if (!session) await clearNativeWidget();
      else if (!FEATURE_FLAGS.workflow || !FEATURE_FLAGS.nativeWidgets)
        await pauseNativeWidget(session.user.id);
      else await configureNativeWidget(session);
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        void clearNativeWidget().catch(() => undefined);
        return;
      }
      // Run after Supabase releases its auth storage lock.
      setTimeout(() => {
        void publish().catch(() => undefined);
      }, 0);
    });
    const listener = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) void publish().catch(() => undefined);
    });
    void publish().catch(() => undefined);
    return () => {
      disposed = true;
      subscription.unsubscribe();
      void listener.then((handle) => handle.remove());
    };
  }, []);
}
