import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useSupabaseAuth } from "@/hooks/use-auth";
import { VoiceCaptureDialog } from "@/components/notio/voice-capture-dialog";
import { ScheduleConfirmationDialog } from "@/components/notio/schedule-confirmation-dialog";
import { TimelineView } from "@/components/notio/timeline-view";
import { WorkingHoursSetup, type WorkingHoursData } from "@/components/notio/working-hours-setup";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";
import { extractSchedule, validateScheduleAgainstWorkingHours } from "@/lib/scheduling.functions";
import type { TimeExtractionResult } from "@/lib/scheduling.functions";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { ActionableTasks } from "@/components/notio/actionable-tasks";

export const Route = createFileRoute("/_authenticated/scheduling")({
  component: PlanEntry,
});

function PlanEntry() {
  return <div>{FEATURE_FLAGS.workflow ? <main className="notiox-screen mx-auto max-w-3xl px-5 py-8 pb-32">
    <h1 className="text-2xl font-semibold">Plan</h1><ActionableTasks title="Tasks and projects"/>
    <details className="mt-8 border-t border-border pt-5"><summary className="cursor-pointer py-3">Calendar and working hours</summary><SchedulingPage/></details>
  </main> : <SchedulingPage/>}</div>;
}

function SchedulingPage() {
  const navigate = useNavigate();
  const { supabase } = useSupabaseAuth();
  const [showVoiceCapture, setShowVoiceCapture] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [extractionResult, setExtractionResult] = useState<TimeExtractionResult | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [userTimezone, setUserTimezone] = useState("UTC");
  const [isProcessing, setIsProcessing] = useState(false);
  const [constraint, setConstraint] = useState<any>(null);
  const [hasWorkingHours, setHasWorkingHours] = useState<boolean | null>(null);
  const [isLoadingHours, setIsLoadingHours] = useState(true);

  // Load user's working hours and tasks on mount
  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    if (!supabase) return;

    setIsLoadingHours(true);
    try {
      // Get user's working hours and timezone
      const { data: workingHours, error: whError } = await supabase
        .from("user_working_hours")
        .select("timezone")
        .maybeSingle();

      if (workingHours) {
        setHasWorkingHours(true);
        if (workingHours.timezone) {
          setUserTimezone(workingHours.timezone);
        }
      } else {
        setHasWorkingHours(false);
      }

      const { data: scheduledTasks, error: tasksError } = await supabase
        .from("scheduling_nodes")
        .select("*")
        .eq("status", "pending")
        .order("start_time", { ascending: true, nullsFirst: false });

      if (tasksError) {
        console.error("Tasks error:", tasksError);
      }

      if (scheduledTasks) {
        setTasks(scheduledTasks);
      }

      if (whError && whError.code !== "PGRST116") {
        console.error("Working hours error:", whError);
      }
    } catch (error) {
      console.error("Error loading user data:", error);
      setHasWorkingHours(false);
    } finally {
      setIsLoadingHours(false);
    }
  };

  const handleWorkingHoursComplete = async (data: WorkingHoursData) => {
    // After setting working hours, redirect to capture page
    setHasWorkingHours(true);
    setUserTimezone(data.timezone);

    // Redirect to capture page for new users to start creating mindmaps
    setTimeout(() => {
      navigate({ to: "/capture" });
    }, 500);
  };

  const handleVoiceSubmit = async (transcript: string) => {
    setIsProcessing(true);
    try {
      // Call extractSchedule server function
      const result = await extractSchedule({
        data: {
          transcript,
          userTimezone,
          currentDateTime: new Date().toISOString(),
        },
      });

      setExtractionResult(result);

      // Validate against working hours
      if (result.start_time_iso && result.end_time_iso) {
        const validationResult = await validateScheduleAgainstWorkingHours({
          data: {
            startTimeISO: result.start_time_iso,
            endTimeISO: result.end_time_iso,
            category: result.category,
            estimatedDurationMinutes: result.estimated_duration_minutes,
          },
        });

        setConstraint(validationResult);
      }

      setShowVoiceCapture(false);
      setShowConfirmation(true);
    } catch (error) {
      console.error("Error processing transcript:", error);
      alert("Error processing your task. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmSchedule = async (
    result: TimeExtractionResult,
    adjustments?: { startTime?: string; endTime?: string }
  ) => {
    if (!supabase) return;

    setIsProcessing(true);
    try {
      const startTime = adjustments?.startTime || result.start_time_iso;
      const endTime = adjustments?.endTime || result.end_time_iso;

      // Save to scheduling_nodes table
      const { data: newTask, error } = await supabase
        .from("scheduling_nodes")
        .insert({
          title: result.title,
          category: result.category,
          status: "pending",
          is_timebound: result.is_timebound,
          start_time: startTime,
          end_time: endTime,
          estimated_duration_minutes: result.estimated_duration_minutes,
          extracted_intent: result,
          original_transcript: "", // Would be the original transcript
          priority: 2, // Default priority
        })
        .select()
        .single();

      if (error) throw error;

      // Log the action
      await supabase.from("scheduling_logs").insert({
        node_id: newTask.id,
        action: "created",
        source: "voice_input",
        reason: "Created from voice capture",
      });

      // Reload tasks
      await loadUserData();
      setShowConfirmation(false);
      setExtractionResult(null);
      setConstraint(null);

      alert(`Task "${result.title}" scheduled successfully!`);
    } catch (error) {
      console.error("Error saving task:", error);
      alert("Error saving task. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTaskClick = (taskId: string) => {
    // TODO: Open task details/edit dialog
    console.log("Task clicked:", taskId);
  };

  // Loading state
  if (isLoadingHours) {
    return (
      <main className="notiox-screen mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center px-5 pb-32">
        <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading your schedule…</p>
      </main>
    );
  }

  // New user - show working hours setup
  if (hasWorkingHours === false) {
    return (
      <main className="notiox-screen mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-5 pb-32">
        <div className="mb-8 w-full text-center">
          <h1 className="font-display text-3xl font-semibold text-foreground">
            Welcome to Notio Scheduling
          </h1>
          <p className="mt-3 text-muted-foreground">
            Let&apos;s set up your working hours so we can schedule tasks intelligently
          </p>
        </div>
        <div className="w-full">
          <WorkingHoursSetup onComplete={handleWorkingHoursComplete} isLoading={isProcessing} />
        </div>
      </main>
    );
  }

  // Existing user - show full scheduling page (same NotioX palette as Home / Maps)
  return (
    <main className="notiox-screen mx-auto max-w-3xl px-5 py-8 pb-32">
      <header className="notiox-screen-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Schedule</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your time-bound tasks</p>
        </div>
        <Button onClick={() => setShowVoiceCapture(true)} className="gap-2" size="lg">
          <Plus className="h-5 w-5" />
          New Task
        </Button>
      </header>

      <TimelineView tasks={tasks} timezone={userTimezone} onTaskClick={handleTaskClick} />

      <VoiceCaptureDialog
        open={showVoiceCapture}
        onOpenChange={setShowVoiceCapture}
        onSubmit={handleVoiceSubmit}
        isLoading={isProcessing}
      />

      <ScheduleConfirmationDialog
        open={showConfirmation}
        onOpenChange={setShowConfirmation}
        extractionResult={extractionResult}
        onConfirm={handleConfirmSchedule}
        isLoading={isProcessing}
        constraint={constraint}
      />
    </main>
  );
}


