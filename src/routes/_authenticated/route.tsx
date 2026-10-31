import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { BottomNav } from "@/components/notio/bottom-nav";
import { AppHeader } from "@/components/notio/app-header";
import { useCanvasSync } from "@/hooks/use-canvas-sync";
import { useReminders } from "@/hooks/use-reminders";
import { useNativeWidget } from "@/hooks/use-native-widget";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { ActionableNudge } from "@/components/notio/actionable-nudge";
import { needsAppRole, readAppRole } from "@/lib/app-role";
import { useEffect } from "react";

function AuthShell() {
  const {user}=Route.useRouteContext();
  useEffect(()=>{
    try { sessionStorage.setItem("notio:owner", user.id); } catch { /* Storage can be unavailable. */ }
    const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{
      if(event==="SIGNED_OUT")try{
        sessionStorage.removeItem(`notio:capture:${user.id}`);
        sessionStorage.removeItem("notio:owner");
      }catch{/* Storage can be unavailable. */}
    });
    return ()=>subscription.unsubscribe();
  },[user.id]);
  useReminders();
  useNativeWidget();
  useCanvasSync();
  return (
    <div className="notiox-app-shell min-h-dvh pb-28">
      <div className="mx-auto max-w-3xl px-5 pt-4">
        <AppHeader />
      </div>
      {FEATURE_FLAGS.workflow&&<ActionableNudge/>}
      <Outlet />
      <BottomNav />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const appRole = await readAppRole(supabase, data.user);
    if (needsAppRole(appRole)) {
      throw redirect({ to: "/onboarding/role" });
    }
    return { user: data.user, appRole };
  },
  component: AuthShell,
});


