import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSupabaseAuth } from "@/hooks/use-auth";
import { hasCompletedPersonaQuiz } from "@/lib/persona-quiz-persist";
import { DolphinCompanion } from "./dolphin-companion";
import { NotioLogo } from "./logo";
import { useServerFn } from "@tanstack/react-start";
import { applyAuthCode } from "@/lib/referral.functions";
import { workflowEntry } from "@/lib/workflow-onboarding";
import { needsAppRole, readAppRole } from "@/lib/app-role";

export function QuickOnboarding() {
  const { user, userId, supabase, loading } = useSupabaseAuth();
  const navigate = useNavigate();
  const applyCode = useServerFn(applyAuthCode);
  const [checking, setChecking] = useState(true),
    [busy, setBusy] = useState(false);
  const [resume, setResume] = useState(false);
  useEffect(() => {
    if (loading) return;
    if (!userId || !user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const code = sessionStorage.getItem("notio_pending_auth_code");
        if (code) {
          await applyCode({ data: { code } });
          sessionStorage.removeItem("notio_pending_auth_code");
        }
      } catch {
        /* Retain pending attribution for a later retry. */
      }
      const client = supabase as unknown as SupabaseClient;
      const appRole = await readAppRole(client, user);
      if (cancelled) return;
      if (needsAppRole(appRole)) {
        navigate({ to: "/onboarding/role", replace: true });
        return;
      }
      const [done, { data: hours }, { data: maps }, { data: tasks }] = await Promise.all([
        hasCompletedPersonaQuiz(userId),
        client.from("user_working_hours").select("id").eq("user_id", userId).maybeSingle(),
        client.from("maps").select("id").eq("user_id", userId).limit(1),
        client.from("scheduling_nodes").select("id").eq("user_id", userId).limit(1),
      ]);
      if (cancelled) return;
      const destination = workflowEntry({
        started: !!user?.user_metadata?.notio_workflow_started,
        hasQuiz: done,
        hasHours: !!hours,
        hasMap: !!maps?.length,
        hasTask: !!tasks?.length,
      });
      if (destination === "home") {
        navigate({ to: "/home", replace: true });
        return;
      }
      setResume(destination === "resume");
      setChecking(false);
    })().catch(() => {
      if (!cancelled) setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loading, userId, user, supabase, navigate, applyCode, user?.user_metadata?.notio_workflow_started]);
  async function start() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { notio_workflow_started: true } });
      if (error) throw error;
      navigate({ to: "/capture" });
    } catch {
      toast.error("Couldn't save your place. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="notiox-screen mx-auto flex min-h-dvh max-w-lg flex-col px-6 py-10">
      <NotioLogo />
      {checking || loading ? (
        <p className="mt-16" role="status">
          Loading...
        </p>
      ) : (
        <section className="my-auto py-12">
          <DolphinCompanion state="welcome" />
          <h1 className="mt-6 text-3xl font-semibold">
            {resume ? "Pick up where you left off" : "One thought. One next step."}
          </h1>
          <p className="mt-4 text-muted-foreground">
            Say what's on your mind. Choose a next step when you're ready.
          </p>
          <button
            type="button"
            onClick={() => void start()}
            disabled={busy}
            className="mt-8 inline-flex min-h-12 items-center gap-3 rounded-md bg-primary px-5 text-primary-foreground"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}{" "}
            {resume ? "Continue" : "Let's start"}
          </button>
          <div className="mt-6 flex flex-wrap gap-5 text-sm text-muted-foreground">
            <Link to="/home">Go to Home</Link>
            <Link to="/auth-setup-hours">Set working hours</Link>
          </div>
        </section>
      )}
    </main>
  );
}
