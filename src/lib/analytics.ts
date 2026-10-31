import mixpanel from "mixpanel-browser";

const MIXPANEL_TOKEN = "f14fa209ff6d4e12d3767f80749c0318";

// Initialize Mixpanel (only in browser)
if (typeof window !== "undefined") {
  mixpanel.init(MIXPANEL_TOKEN, {
    debug: process.env.NODE_ENV === "development",
    track_pageview: false, // We'll track pageviews manually
    batch_requests: true,
  });
}

// ============================================================================
// USER IDENTIFICATION & PROPERTIES
// ============================================================================

export const analytics = {
  /**
   * Call this when user signs in or creates account.
   * Sets a unique identifier and user properties for cohort analysis.
   */
  identifyUser: (userId: string, props: Record<string, any> = {}) => {
    mixpanel.identify(userId);
    mixpanel.people.set({
      $email: props.email,
      $created: new Date().toISOString(),
      timezone: props.timezone || "UTC",
      working_hours_set: false,
      voice_capture_enabled: false,
      first_mindmap_created: null,
      total_tasks_created: 0,
      total_voice_dumps: 0,
      ...props,
    });
  },

  /**
   * Update user properties (e.g., after they complete onboarding)
   */
  updateUserProperties: (props: Record<string, any>) => {
    mixpanel.people.set(props);
  },

  /**
   * Clear user data on logout
   */
  resetUser: () => {
    mixpanel.reset();
  },

  // ============================================================================
  // VOICE CAPTURE EVENTS
  // ============================================================================

  trackVoiceCapturStart: () => {
    mixpanel.track("Voice Capture Started", {
      timestamp: new Date().toISOString(),
    });
  },

  trackVoiceCaptureComplete: (duration_seconds: number, word_count: number) => {
    mixpanel.track("Voice Capture Completed", {
      duration_seconds,
      word_count,
      timestamp: new Date().toISOString(),
    });
    mixpanel.people.increment("total_voice_dumps", 1);
  },

  trackVoiceCaptureFailed: (error: string) => {
    mixpanel.track("Voice Capture Failed", {
      error,
      timestamp: new Date().toISOString(),
    });
  },

  // ============================================================================
  // MINDMAP EVENTS
  // ============================================================================

  trackMindmapCreated: (mapId: string, nodeCount: number = 1) => {
    mixpanel.track("Mindmap Created", {
      map_id: mapId,
      initial_node_count: nodeCount,
      timestamp: new Date().toISOString(),
    });
    mixpanel.people.set({
      first_mindmap_created: new Date().toISOString(),
    });
    mixpanel.people.increment("total_mindmaps_created", 1);
  },

  trackNodeAdded: (mapId: string, nodeType: "idea" | "task" | "note" = "idea") => {
    mixpanel.track("Node Added", {
      map_id: mapId,
      node_type: nodeType,
      timestamp: new Date().toISOString(),
    });
  },

  trackNodeEdited: (mapId: string, nodeId: string) => {
    mixpanel.track("Node Edited", {
      map_id: mapId,
      node_id: nodeId,
      timestamp: new Date().toISOString(),
    });
  },

  trackNodeDeleted: (mapId: string, nodeId: string) => {
    mixpanel.track("Node Deleted", {
      map_id: mapId,
      node_id: nodeId,
      timestamp: new Date().toISOString(),
    });
  },

  trackMindmapViewed: (mapId: string) => {
    mixpanel.track("Mindmap Viewed", {
      map_id: mapId,
      timestamp: new Date().toISOString(),
    });
  },

  trackCanvasDrag: (mapId: string) => {
    // Lower priority — batch these
    mixpanel.track("Canvas Drag", {
      map_id: mapId,
    });
  },

  // ============================================================================
  // TASK SCHEDULING EVENTS
  // ============================================================================

  trackWorkingHoursSet: (timezone: string, start_hour: number, end_hour: number) => {
    mixpanel.track("Working Hours Configured", {
      timezone,
      start_hour,
      end_hour,
      timestamp: new Date().toISOString(),
    });
    mixpanel.people.set({
      timezone,
      working_hours_set: true,
      working_hours_start: start_hour,
      working_hours_end: end_hour,
    });
  },

  trackScheduledTaskCreated: (
    taskId: string,
    scheduledAt: string,
    duration_minutes: number
  ) => {
    mixpanel.track("Scheduled Task Created", {
      task_id: taskId,
      scheduled_at: scheduledAt,
      duration_minutes,
      timestamp: new Date().toISOString(),
    });
    mixpanel.people.increment("total_tasks_created", 1);
  },

  trackScheduledTaskCompleted: (taskId: string, time_to_complete_minutes: number) => {
    mixpanel.track("Scheduled Task Completed", {
      task_id: taskId,
      time_to_complete_minutes,
      on_time: time_to_complete_minutes <= 0, // If negative, they finished early
      timestamp: new Date().toISOString(),
    });
    mixpanel.people.increment("total_tasks_completed", 1);
  },

  trackScheduledTaskRescheduled: (taskId: string, reschedule_count: number) => {
    mixpanel.track("Scheduled Task Rescheduled", {
      task_id: taskId,
      reschedule_count,
      timestamp: new Date().toISOString(),
    });
  },

  trackTaskExtracted: (
    confidence: number,
    is_explicit: boolean,
    extraction_time_ms: number
  ) => {
    mixpanel.track("Task Extracted from Voice", {
      confidence,
      is_explicit,
      extraction_time_ms,
      timestamp: new Date().toISOString(),
    });
  },

  // ============================================================================
  // REMINDER & NOTIFICATION EVENTS
  // ============================================================================

  trackReminderEnabled: () => {
    mixpanel.track("Reminders Enabled", {
      timestamp: new Date().toISOString(),
    });
    mixpanel.people.set({ reminders_enabled: true });
  },

  trackReminderDisabled: () => {
    mixpanel.track("Reminders Disabled", {
      timestamp: new Date().toISOString(),
    });
    mixpanel.people.set({ reminders_enabled: false });
  },

  trackReminderSent: (taskId: string, reminderType: "email" | "push" | "in_app") => {
    mixpanel.track("Reminder Sent", {
      task_id: taskId,
      reminder_type: reminderType,
      timestamp: new Date().toISOString(),
    });
  },

  trackReminderClicked: (taskId: string, reminderType: string) => {
    mixpanel.track("Reminder Clicked", {
      task_id: taskId,
      reminder_type: reminderType,
      timestamp: new Date().toISOString(),
    });
  },

  // ============================================================================
  // PAGE VIEWS & ENGAGEMENT
  // ============================================================================

  trackPageView: (pageName: string, props: Record<string, any> = {}) => {
    mixpanel.track("Page View", {
      page_name: pageName,
      timestamp: new Date().toISOString(),
      ...props,
    });
  },

  trackSessionStart: () => {
    mixpanel.track("Session Started", {
      timestamp: new Date().toISOString(),
    });
  },

  trackSessionEnd: (session_duration_seconds: number) => {
    mixpanel.track("Session Ended", {
      session_duration_seconds,
      timestamp: new Date().toISOString(),
    });
  },

  // ============================================================================
  // ERROR & TROUBLESHOOTING
  // ============================================================================

  trackError: (errorName: string, errorMessage: string, context: Record<string, any> = {}) => {
    mixpanel.track("Error Occurred", {
      error_name: errorName,
      error_message: errorMessage,
      ...context,
      timestamp: new Date().toISOString(),
    });
  },

  // ============================================================================
  // FEATURE FLAGS & EXPERIMENTS (if you want A/B testing later)
  // ============================================================================

  trackFeatureUsed: (featureName: string, success: boolean = true) => {
    mixpanel.track("Feature Used", {
      feature_name: featureName,
      success,
      timestamp: new Date().toISOString(),
    });
  },

  // ============================================================================
  // UTILITY: Flush events to Mixpanel
  // ============================================================================

  flush: () => {
    mixpanel.flush();
  },
};

export default analytics;
