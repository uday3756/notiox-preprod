import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSupabaseAuth } from "@/hooks/use-auth";
import {
  WorkingHoursSetup,
  type WorkingHoursData,
} from "@/components/notio/working-hours-setup";
import { applyAuthCode } from "@/lib/referral.functions";

export const Route = createFileRoute("/auth-setup-hours")({
  component: AuthSetupHoursPage,
});

const PENDING_CODE_KEY = "notio_pending_auth_code";

function AuthSetupHoursPage() {
  const navigate = useNavigate();
  const { supabase, userId, loading } = useSupabaseAuth();
  const applyFn = useServerFn(applyAuthCode);
  const [isLoading, setIsLoading] = useState(false);
  // Until we've checked for existing hours, don't flash the welcome screen.
  const [checkingExisting, setCheckingExisting] = useState(true);

  // Apply promo/referral code stashed before Google OAuth (if any).
  useEffect(() => {
    if (loading || !userId) return;
    let code = "";
    try {
      code = sessionStorage.getItem(PENDING_CODE_KEY)?.trim() ?? "";
    } catch {
      return;
    }
    if (!code) return;
    void (async () => {
      try {
        await applyFn({ data: { code } });
        sessionStorage.removeItem(PENDING_CODE_KEY);
      } catch {
        /* leave code for retry; attribution is best-effort */
      }
    })();
  }, [loading, userId, applyFn]);

  // Skip hours welcome if already set; still require persona quiz for brand-new users.
  useEffect(() => {
    if (loading) return;
    if (!supabase || !userId) {
      setCheckingExisting(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: onboarding } = await supabase
        .from("onboarding_responses")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (!onboarding && !FEATURE_FLAGS.workflow) {
        const { data: hours } = await supabase
          .from("user_working_hours")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelled) return;
        // New users without quiz → persona first. Legacy users with hours skip.
        if (!hours) {
          navigate({ to: "/onboarding/persona", replace: true });
          return;
        }
      }

      const { data: existing } = await supabase
        .from("user_working_hours")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (existing) {
        const { data: auth } = await supabase.auth.getUser();
        if (auth.user) {
          const { resolveOnboardingPath } = await import("@/lib/onboarding-resolve");
          navigate({ to: await resolveOnboardingPath(supabase, auth.user), replace: true });
          return;
        }
        navigate({ to: "/home", replace: true });
      } else {
        setCheckingExisting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, supabase, userId, navigate]);

  const handleComplete = async (data: WorkingHoursData) => {
    if (!supabase || !userId) {
      alert("Not authenticated. Please sign in again.");
      navigate({ to: "/auth", replace: true });
      return;
    }

    setIsLoading(true);
    try {
      // Prepare working hours data
      const workingHoursData = {
        timezone: data.timezone,
        monday_start: data.workingDays.monday.enabled
          ? data.workingDays.monday.start
          : null,
        monday_end: data.workingDays.monday.enabled
          ? data.workingDays.monday.end
          : null,
        tuesday_start: data.workingDays.tuesday.enabled
          ? data.workingDays.tuesday.start
          : null,
        tuesday_end: data.workingDays.tuesday.enabled
          ? data.workingDays.tuesday.end
          : null,
        wednesday_start: data.workingDays.wednesday.enabled
          ? data.workingDays.wednesday.start
          : null,
        wednesday_end: data.workingDays.wednesday.enabled
          ? data.workingDays.wednesday.end
          : null,
        thursday_start: data.workingDays.thursday.enabled
          ? data.workingDays.thursday.start
          : null,
        thursday_end: data.workingDays.thursday.enabled
          ? data.workingDays.thursday.end
          : null,
        friday_start: data.workingDays.friday.enabled
          ? data.workingDays.friday.start
          : null,
        friday_end: data.workingDays.friday.enabled
          ? data.workingDays.friday.end
          : null,
        saturday_start: data.workingDays.saturday.enabled
          ? data.workingDays.saturday.start
          : null,
        saturday_end: data.workingDays.saturday.enabled
          ? data.workingDays.saturday.end
          : null,
        sunday_start: data.workingDays.sunday.enabled
          ? data.workingDays.sunday.start
          : null,
        sunday_end: data.workingDays.sunday.enabled
          ? data.workingDays.sunday.end
          : null,
        break_start_time: data.breakStartTime,
        break_duration_minutes: data.breakDurationMinutes,
        min_focus_block_minutes: data.minFocusBlockMinutes,
        max_daily_hours: data.maxDailyHours,
        protect_evenings: data.protectEvenings,
      };

      // Check if working hours already exists for this user
      const { data: existingWH } = await supabase
        .from("user_working_hours")
        .select("id")
        .eq("user_id", userId)
        .single();

      let whError;
      if (existingWH) {
        // Update existing record
        const result = await supabase
          .from("user_working_hours")
          .update(workingHoursData)
          .eq("user_id", userId);
        whError = result.error;
      } else {
        // Insert new record
        const result = await supabase
          .from("user_working_hours")
          .insert({
            user_id: userId,
            ...workingHoursData,
          });
        whError = result.error;
      }

      if (whError) {
        console.error("Working hours save error:", JSON.stringify(whError));
        throw new Error(whError.message || JSON.stringify(whError));
      }

      // Create or update task_analytics record
      const { data: existingAnalytics } = await supabase
        .from("task_analytics")
        .select("id")
        .eq("user_id", userId)
        .single();

      if (!existingAnalytics) {
        const { error: analyticsError } = await supabase
          .from("task_analytics")
          .insert({
            user_id: userId,
          });

        if (analyticsError) {
          console.error("Analytics insert error:", JSON.stringify(analyticsError));
          throw new Error(analyticsError.message || JSON.stringify(analyticsError));
        }
      }

      // Redirect to main app
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { resolveOnboardingPath } = await import("@/lib/onboarding-resolve");
        navigate({ to: await resolveOnboardingPath(supabase, auth.user) });
      } else {
        navigate({ to: "/home" });
      }
    } catch (error) {
      console.error("Error saving working hours:", error);
      const msg = error instanceof Error ? error.message : JSON.stringify(error);
      alert(`Failed to save working hours: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Show a loading spinner while auth session is being resolved OR while we
  // check for existing hours (prevents the welcome screen from flashing before
  // we redirect a returning user to Capture).
  if (loading || checkingExisting) {
    return (
      <div className="min-h-screen bg-background bg-glow flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Loading your session...</p>
        </div>
      </div>
    );
  }

  // If auth loaded but no user, redirect to login
  if (!userId) {
    navigate({ to: "/auth", replace: true });
    return null;
  }

  return (
    <div className="min-h-screen bg-background bg-glow flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="font-display text-3xl font-bold text-foreground mb-2">
            Welcome to Notio Scheduling
          </h1>
          <p className="text-muted-foreground">
            Let's set up your working hours so we can schedule tasks intelligently
          </p>
        </div>

        {/* Setup component */}
        <WorkingHoursSetup onComplete={handleComplete} isLoading={isLoading} />
      </div>
    </div>
  );
}


import { FEATURE_FLAGS } from "@/lib/feature-flags";
