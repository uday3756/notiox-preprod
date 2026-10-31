import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { NotioLogo } from "@/components/notio/logo";
import { DolphinCompanion } from "@/components/notio/dolphin-companion";
import { CanvasConnectionCard } from "@/components/notio/canvas-connection-card";
import { useSupabaseAuth } from "@/hooks/use-auth";
import {
  APP_ROLE_OPTIONS,
  type AppRole,
  needsAppRole,
  readAppRole,
  writeAppRole,
} from "@/lib/app-role";
import { loadOnboardingSnapshot, persistCanvasDecision, resolveOnboardingPath } from "@/lib/onboarding-resolve";
import { nextOnboardingStep } from "@/lib/onboarding-state";
import type { DolphinEmotion } from "@/lib/dolphin-progression";
import type { SupabaseClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/onboarding/role")({
  head: () => ({
    meta: [
      { title: "Your role - Notio" },
      {
        name: "description",
        content: "Choose Student or Other. Students can connect Canvas on Notiolive.",
      },
    ],
  }),
  component: RoleOnboardingPage,
});

/**
 * First-login role picker on the same Notiolive.com app.
 * Student → Canvas connect step (CEO handoff pilot); Other → continue onboarding.
 * Role remains editable in Profile.
 */
function RoleOnboardingPage() {
  const navigate = useNavigate();
  const { user, userId, supabase, loading } = useSupabaseAuth();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"pick" | "canvas">("pick");
  const [selected, setSelected] = useState<AppRole | null>(null);
  const [previewRole, setPreviewRole] = useState<AppRole | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!userId || !user) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    let cancelled = false;
    void (async () => {
      const role = await readAppRole(supabase as unknown as SupabaseClient, user);
      if (cancelled) return;
      if (!needsAppRole(role)) {
        const snapshot = await loadOnboardingSnapshot(supabase as unknown as SupabaseClient, user);
        if (cancelled) return;
        const step = nextOnboardingStep(snapshot);
        if (step === "canvas") {
          setSelected(role);
          setStep("canvas");
          setReady(true);
          return;
        }
        navigate({ to: await resolveOnboardingPath(supabase as unknown as SupabaseClient, user), replace: true });
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, userId, user, supabase, navigate]);

  const activeRole = selected ?? previewRole;
  const dolphinState: DolphinEmotion =
    activeRole === "student"
      ? "welcome_student"
      : activeRole === "other"
        ? "welcome_other"
        : "welcome";

  async function choose(role: AppRole) {
    if (!userId) return;
    setBusy(true);
    setSelected(role);
    try {
      const [{ error }] = await Promise.all([
        writeAppRole(supabase as unknown as SupabaseClient, userId, role),
        // Let the dolphin reaction play briefly so the user sees it
        new Promise((r) => setTimeout(r, 1400)),
      ]);
      if (error) throw new Error(error);
      if (role === "student") {
        setStep("canvas");
        return;
      }
      navigate({ to: "/onboarding/persona", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your role");
      setSelected(null);
    } finally {
      setBusy(false);
    }
  }

  async function continueAfterCanvas(decision: "connected" | "skipped") {
    if (userId) await persistCanvasDecision(supabase as unknown as SupabaseClient, userId, decision);
    if (user) {
      navigate({ to: await resolveOnboardingPath(supabase as unknown as SupabaseClient, user), replace: true });
      return;
    }
    navigate({ to: "/onboarding/persona", replace: true });
  }

  if (loading || !ready) {
    return (
      <main className="notiox-screen mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6">
        <p role="status" className="text-sm text-muted-foreground">
          Loading…
        </p>
      </main>
    );
  }

  return (
    <main className="notiox-screen mx-auto flex min-h-dvh max-w-lg flex-col px-6 py-10">
      <NotioLogo />
      <div className="notiox-role-companion">
        <DolphinCompanion state={dolphinState} />
      </div>

      {step === "pick" ? (
        <section className="mt-6 space-y-6">
          <div>
            <h1 className="font-display text-3xl font-semibold break-words">
              How will you use Notio?
            </h1>
            <p className="mt-3 break-words text-muted-foreground">
              One app on Notiolive — no separate student site. You can change this anytime in
              Profile.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            {APP_ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={busy}
                onMouseEnter={() => setPreviewRole(opt.value)}
                onMouseLeave={() => setPreviewRole(null)}
                onFocus={() => setPreviewRole(opt.value)}
                onBlur={() => setPreviewRole(null)}
                onClick={() => void choose(opt.value)}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  selected === opt.value
                    ? "border-primary bg-primary/15"
                    : "border-border bg-surface hover:border-primary/50"
                } disabled:opacity-60`}
              >
                <span className="block text-base font-semibold">{opt.label}</span>
                <span className="mt-1 block break-words text-sm text-muted-foreground">
                  {opt.hint}
                </span>
              </button>
            ))}
          </div>
          {busy && (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </p>
          )}
        </section>
      ) : (
        <section className="mt-6 space-y-4">
          <div>
            <h1 className="font-display text-3xl font-semibold break-words">Connect Canvas</h1>
            <p className="mt-3 break-words text-muted-foreground">
              Paste your school Canvas domain and a student access token. This stays on Notiolive —
              we never submit coursework for you.
            </p>
          </div>
          <CanvasConnectionCard active />
          <button
            type="button"
            onClick={() => void continueAfterCanvas("connected")}
            className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={() => void continueAfterCanvas("skipped")}
            className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Skip for now — connect later in Profile
          </button>
        </section>
      )}
    </main>
  );
}
