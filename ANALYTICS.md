# Analytics Setup for Notio

## Overview

Notio now tracks user behavior via **Mixpanel** to measure:
- Feature ROI and usage patterns
- User retention & LTV (Lifetime Value)
- Engagement metrics
- Error tracking

Token: `f14fa209ff6d4e12d3767f80749c0318`

---

## Architecture

### 1. Core Analytics Module
**File:** `src/lib/analytics.ts`

The main analytics utility provides methods for:
- User identification & properties
- Event tracking (voice capture, scheduling, mindmap, reminders)
- Page views & sessions
- Error reporting

### 2. Analytics Provider
**File:** `src/providers/analytics-provider.tsx`

Initializes Mixpanel on app load and identifies users on login.

### 3. Integration
The AnalyticsProvider wraps the app in `src/routes/__root.tsx` to ensure analytics initialization on every session.

---

## Key Events Being Tracked

### Voice Capture
- `Voice Capture Started` — user initiates voice input
- `Voice Capture Completed` — successful transcription with duration & word count
- `Voice Capture Failed` — error during recording
- `Total voice dumps` — user property incremented per dump

### Mindmap
- `Mindmap Created` — new map with initial node count
- `Node Added` — user adds a node (tracks type: idea/task/note)
- `Node Edited` — user modifies node content
- `Node Deleted` — user removes a node
- `Mindmap Viewed` — user opens a map
- `Canvas Drag` — interaction tracking (lower priority)

### Task Scheduling
- `Working Hours Configured` — user sets timezone + working hours
- `Scheduled Task Created` — task added to schedule
- `Scheduled Task Completed` — task marked done (tracks if on-time)
- `Scheduled Task Rescheduled` — user reschedules a task
- `Task Extracted from Voice` — AI extraction with confidence score

### Reminders & Notifications
- `Reminders Enabled / Disabled` — user toggles notifications
- `Reminder Sent` — notification delivery (email/push/in_app)
- `Reminder Clicked` — user engages with reminder

### Sessions & Pages
- `Session Started` — user opens app
- `Session Ended` — user closes app (session duration)
- `Page View` — navigation tracking
- `Error Occurred` — error tracking with context

---

## User Properties Tracked

Per user, Mixpanel stores:

| Property | Type | Updated When |
|----------|------|--------------|
| `$email` | string | User signs up |
| `$created` | date | User creates account |
| `timezone` | string | User sets working hours |
| `working_hours_set` | boolean | User completes onboarding |
| `working_hours_start` | int | User sets hours |
| `working_hours_end` | int | User sets hours |
| `reminders_enabled` | boolean | User toggles notifications |
| `first_mindmap_created` | date | First map created |
| `total_mindmaps_created` | int | Incremented on creation |
| `total_voice_dumps` | int | Incremented on completion |
| `total_tasks_created` | int | Incremented on creation |
| `total_tasks_completed` | int | Incremented on completion |

---

## How to Add Tracking

### 1. Import Analytics
```tsx
import analytics from "@/lib/analytics";
```

### 2. Call Tracking Method
```tsx
// Voice capture
analytics.trackVoiceCapturStart();
analytics.trackVoiceCaptureComplete(duration_seconds, word_count);

// Mindmap operations
analytics.trackMindmapCreated(mapId, nodeCount);
analytics.trackNodeAdded(mapId, "task");
analytics.trackNodeEdited(mapId, nodeId);

// Scheduling
analytics.trackWorkingHoursSet(timezone, 9, 17);
analytics.trackScheduledTaskCreated(taskId, scheduledAt, duration);
analytics.trackScheduledTaskCompleted(taskId, time_to_complete);

// Reminders
analytics.trackReminderEnabled();
analytics.trackReminderSent(taskId, "email");
analytics.trackReminderClicked(taskId, "email");
```

### 3. Examples in Context

**Voice Capture Dialog:**
```tsx
const handleStartRecording = () => {
  analytics.trackVoiceCapturStart();
  // ... recording logic
};

const handleSubmit = async (transcript: string) => {
  analytics.trackVoiceCaptureComplete(recordingDuration, wordCount);
  await onSubmit(transcript);
};
```

**Mindmap Canvas:**
```tsx
useEffect(() => {
  if (mapId && nodes.length > 0) {
    analytics.trackMindmapViewed(mapId);
  }
}, [mapId, nodes]);

const handleAddNode = () => {
  analytics.trackNodeAdded(mapId, "task");
  // ... add logic
};
```

**Scheduling Setup:**
```tsx
const handleSaveWorkingHours = (tz: string, start: number, end: number) => {
  analytics.trackWorkingHoursSet(tz, start, end);
  // ... save logic
};
```

---

## Viewing Analytics in Mixpanel

1. **Go to:** https://mixpanel.com
2. **Login** with your account
3. **Select Project:** Find the token `f14fa209ff6d4e12d3767f80749c0318`
4. **View Reports:**
   - **Retention:** Insights → Retention (cohort analysis by first mindmap date)
   - **Events:** Events → filter by event name
   - **Users:** People → search by email
   - **Funnels:** Insights → Funnels (e.g., signup → voice capture → task creation)
   - **Dashboards:** Create custom dashboards for ROI tracking

---

## Key Metrics to Watch

### For ROI & Feature Value
- **Voice Capture Adoption:** % of users who complete first voice dump
- **Task Scheduling ROI:** correlation between "working hours set" → task creation → retention
- **Mindmap Engagement:** nodes created per user per week
- **Reminder Engagement:** reminder click-through rate

### For Retention & LTV
- **Day 1 Retention:** % of users returning after day 1
- **Day 7, 30 Retention:** cohort retention curves
- **Feature Combination:** users who enable reminders + voice capture = higher retention
- **Session Duration:** average session length by feature usage

### For Funnel Optimization
1. Signup → 2. Working Hours Set → 3. First Voice Dump → 4. Task Created → 5. Reminder Engaged

Drop-off at each stage shows where to improve onboarding.

---

## Privacy & Data

- Mixpanel data is not shared with third parties
- User PII is minimal ($email only; no passwords or sensitive content)
- RLS is enabled on all Supabase tables (analytics doesn't access user data beyond events)
- Compliance: GDPR-ready (delete user data via analytics.resetUser() on account deletion)

---

## Next Steps

1. ✅ Analytics infrastructure is set up
2. ⬜ Add tracking calls to remaining components (scheduling, reminders)
3. ⬜ Create Mixpanel dashboard for real-time monitoring
4. ⬜ Set up cohort analysis for retention calculations
5. ⬜ Monitor funnel drop-offs and iterate on UX

All tracking is **non-blocking** — failed API calls don't affect user experience.
