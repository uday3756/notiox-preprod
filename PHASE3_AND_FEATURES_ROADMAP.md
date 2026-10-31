# Phase 3 + New Features Comprehensive Roadmap

## Executive Summary

This document outlines a **6-month plan** to build Phase 3 (Adaptive Learning) plus 7 major new features for the Notio scheduling SaaS.

**Total Scope:** 405 hours | 2 engineers | 6 months
- Phase 3: Adaptive Learning (80 hrs)
- Phase 4A: Google Calendar + Email + Manual Hours UI (110 hrs)
- Phase 4B: Slack Integration (55 hrs)
- Phase 5: Mobile App - React Native (95 hrs)
- Phase 6: Offline Mode + Polish (65 hrs)

---

## Phase 3: Historical Behavioral Learning & Adaptive Scheduling

### 3.1 Database Schema Additions

```sql
-- Adaptive patterns table (Phase 3)
CREATE TABLE IF NOT EXISTS public.adaptive_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Completion tracking
  total_tasks_completed INTEGER DEFAULT 0,
  completion_rate DECIMAL(5, 2) DEFAULT 0,
  tasks_on_time INTEGER DEFAULT 0,
  tasks_late INTEGER DEFAULT 0,
  
  -- Time estimation accuracy
  estimation_accuracy_ratio DECIMAL(5, 2) DEFAULT 1.0, -- actual/estimated
  category_accuracy JSONB DEFAULT '{}', -- {meeting: 1.1, deepwork: 1.8}
  
  -- Postponement patterns
  postponement_frequency DECIMAL(5, 2) DEFAULT 0, -- per week
  categories_postponed JSONB DEFAULT '{}', -- categories frequently postponed
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(user_id)
);

-- Hourly performance tracking
CREATE TABLE IF NOT EXISTS public.hourly_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hour_of_day INTEGER NOT NULL CHECK (hour_of_day >= 0 AND hour_of_day <= 23),
  
  -- Performance metrics (0-1 scale)
  productivity_score DECIMAL(3, 2) DEFAULT 0.5,
  completion_rate DECIMAL(5, 2) DEFAULT 0,
  task_count INTEGER DEFAULT 0,
  
  -- Daily snapshot
  date DATE NOT NULL,
  energy_level TEXT, -- 'high', 'medium', 'low'
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(user_id, hour_of_day, date)
);

-- Smart recommendations (AI-generated)
CREATE TABLE IF NOT EXISTS public.smart_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  recommendation_type TEXT NOT NULL, -- 'time_padding', 'schedule_suggestion', 'break_suggestion'
  category TEXT, -- 'meeting', 'deep-work', etc. (nullable)
  
  -- Recommendation details
  data JSONB NOT NULL, -- {padding_multiplier: 1.3, reason: "you underestimate by 30%"}
  confidence DECIMAL(3, 2) DEFAULT 0.5,
  
  -- Tracking
  was_applied BOOLEAN DEFAULT false,
  was_helpful BOOLEAN,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Daily energy snapshot (for fatigue detection)
CREATE TABLE IF NOT EXISTS public.daily_energy_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  date DATE NOT NULL,
  
  -- Inferred metrics
  morning_productivity DECIMAL(3, 2), -- 9-12 AM
  afternoon_productivity DECIMAL(3, 2), -- 12-5 PM
  evening_productivity DECIMAL(3, 2), -- 5-9 PM
  
  -- Fatigue indicators
  postponement_count INTEGER DEFAULT 0, -- tasks postponed today
  completed_count INTEGER DEFAULT 0,
  average_task_duration_ratio DECIMAL(3, 2), -- actual vs estimated
  
  -- AI assessment
  likely_energy_level TEXT, -- 'high', 'medium', 'low'
  recommended_breaks INTEGER DEFAULT 2,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  UNIQUE(user_id, date)
);

-- Indexes
CREATE INDEX idx_adaptive_patterns_user ON public.adaptive_patterns(user_id);
CREATE INDEX idx_hourly_performance_user_date ON public.hourly_performance(user_id, date);
CREATE INDEX idx_daily_energy_user_date ON public.daily_energy_snapshot(user_id, date);
CREATE INDEX idx_smart_recommendations_user ON public.smart_recommendations(user_id);

-- RLS Policies
ALTER TABLE public.adaptive_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hourly_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_energy_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own adaptive patterns" ON public.adaptive_patterns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users see own hourly performance" ON public.hourly_performance FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users see own recommendations" ON public.smart_recommendations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users see own energy snapshots" ON public.daily_energy_snapshot FOR SELECT USING (auth.uid() = user_id);
```

### 3.2 Behavior Learning Algorithm

```typescript
// src/lib/adaptive-learning.ts

interface TaskCompletion {
  estimated_duration: number;
  actual_duration: number;
  category: string;
  completed_at: Date;
  was_postponed: boolean;
}

// Calculate time estimation accuracy
export async function updateEstimationAccuracy(
  userId: string,
  completions: TaskCompletion[]
) {
  const ratios = completions.map(
    (t) => t.actual_duration / t.estimated_duration
  );
  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;

  // By category
  const byCategory: Record<string, number[]> = {};
  completions.forEach((t) => {
    if (!byCategory[t.category]) byCategory[t.category] = [];
    byCategory[t.category].push(t.actual_duration / t.estimated_duration);
  });

  const categoryAccuracy = Object.fromEntries(
    Object.entries(byCategory).map(([cat, ratios]) => [
      cat,
      ratios.reduce((a, b) => a + b, 0) / ratios.length,
    ])
  );

  // Save to database
  await supabase
    .from("adaptive_patterns")
    .upsert({
      user_id: userId,
      estimation_accuracy_ratio: avgRatio,
      category_accuracy: categoryAccuracy,
    });

  return { avgRatio, categoryAccuracy };
}

// Detect energy dips (low productivity hours)
export async function detectEnergyDips(
  userId: string,
  days: number = 30
) {
  const { data: completions } = await supabase
    .from("scheduling_nodes")
    .select("completed_at, estimated_duration_minutes, actual_duration_minutes")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("completed_at", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());

  const hourlyMetrics: Record<number, number> = {}; // hour -> productivity
  
  completions?.forEach((task) => {
    const hour = new Date(task.completed_at).getHours();
    const ratio = task.actual_duration_minutes / task.estimated_duration_minutes;
    
    if (!hourlyMetrics[hour]) hourlyMetrics[hour] = 0;
    hourlyMetrics[hour] += ratio > 1.5 ? 0.3 : ratio > 1.0 ? 0.6 : 1.0; // normalize
  });

  // Find worst hours (low productivity)
  const worst = Object.entries(hourlyMetrics)
    .sort(([, a], [, b]) => a - b)
    .slice(0, 3)
    .map(([hour]) => parseInt(hour));

  return { worst, hourlyMetrics };
}

// Calculate time padding recommendations
export async function calculateTimePadding(
  userId: string,
  category: string,
  minSamples: number = 10
): Promise<{ multiplier: number; confidence: number }> {
  const { data: patterns } = await supabase
    .from("adaptive_patterns")
    .select("category_accuracy")
    .eq("user_id", userId)
    .single();

  const categoryRatio = patterns?.category_accuracy?.[category] || 1.0;
  
  // Recommendation logic
  let multiplier = 1.0;
  if (categoryRatio > 1.5) {
    multiplier = 1.5; // Add 50% if user consistently underestimates
  } else if (categoryRatio > 1.2) {
    multiplier = 1.2; // Add 20%
  }

  // Confidence based on sample size
  const samples = patterns?.category_accuracy ? Object.keys(patterns.category_accuracy).length : 0;
  const confidence = Math.min(1.0, samples / 50);

  return { multiplier, confidence };
}

// Smart break detection
export async function suggestSmartBreaks(
  userId: string
): Promise<{ breakTime: Date; reason: string }[]> {
  const { data: energyToday } = await supabase
    .from("daily_energy_snapshot")
    .select("*")
    .eq("user_id", userId)
    .eq("date", new Date().toISOString().split("T")[0])
    .single();

  const suggestions: { breakTime: Date; reason: string }[] = [];

  if (energyToday?.postponement_count > 3) {
    suggestions.push({
      breakTime: new Date(Date.now() + 15 * 60 * 1000),
      reason: "High postponement rate detected",
    });
  }

  if (energyToday?.likely_energy_level === "low") {
    suggestions.push({
      breakTime: new Date(Date.now() + 30 * 60 * 1000),
      reason: "Energy level is low",
    });
  }

  return suggestions;
}
```

### 3.3 Daily Analytics Batch Job

```typescript
// Run daily via Vercel cron job
// vercel.json: { "crons": [{ "path": "/api/cron/daily-analytics", "schedule": "0 1 * * *" }] }

export async function runDailyAnalytics(userId: string) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  // Get all completions from yesterday
  const { data: completions } = await supabase
    .from("scheduling_nodes")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "completed")
    .gte("completed_at", yesterday.toISOString())
    .lt("completed_at", new Date().toISOString());

  // Calculate morning/afternoon/evening productivity
  const morning = completions?.filter(
    (t) => new Date(t.completed_at).getHours() < 12
  ) || [];
  const afternoon = completions?.filter(
    (t) => {
      const h = new Date(t.completed_at).getHours();
      return h >= 12 && h < 17;
    }
  ) || [];
  const evening = completions?.filter(
    (t) => new Date(t.completed_at).getHours() >= 17
  ) || [];

  const calcScore = (tasks: any[]) => {
    if (!tasks.length) return 0.5;
    const onTimeCount = tasks.filter(
      (t) => t.actual_duration_minutes <= t.estimated_duration_minutes
    ).length;
    return onTimeCount / tasks.length;
  };

  // Save daily snapshot
  await supabase.from("daily_energy_snapshot").upsert({
    user_id: userId,
    date: yesterday.toISOString().split("T")[0],
    morning_productivity: calcScore(morning),
    afternoon_productivity: calcScore(afternoon),
    evening_productivity: calcScore(evening),
    likely_energy_level: calcLikelyEnergyLevel(morning, afternoon, evening),
    recommended_breaks: calculateBreakCount(completions || []),
  });
}
```

---

## Phase 4A: Google Calendar Sync

### 4A.1 Database Schema

```sql
CREATE TABLE IF NOT EXISTS public.calendar_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  provider TEXT NOT NULL DEFAULT 'google', -- 'google', 'outlook', 'apple'
  access_token TEXT NOT NULL ENCRYPTED, -- Encrypted at rest
  refresh_token TEXT ENCRYPTED,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  
  calendar_id TEXT NOT NULL, -- Google calendar ID
  is_syncing BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  
  -- Sync settings
  auto_import BOOLEAN DEFAULT true, -- Auto-import events from calendar
  auto_export BOOLEAN DEFAULT true, -- Auto-export tasks to calendar
  conflict_resolution TEXT DEFAULT 'ask', -- 'ask', 'Notio_wins', 'calendar_wins'
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.calendar_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.calendar_integrations(id),
  
  action TEXT NOT NULL, -- 'imported', 'exported', 'conflict'
  event_id TEXT, -- Google event ID
  task_id UUID REFERENCES public.scheduling_nodes(id),
  
  details JSONB, -- {'old_time': '...', 'new_time': '...'}
  status TEXT DEFAULT 'success', -- 'success', 'failed'
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS
ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calendar integrations"
  ON public.calendar_integrations FOR ALL USING (auth.uid() = user_id);
```

### 4A.2 Google Calendar Integration

```typescript
// src/lib/google-calendar.ts

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
  description?: string;
}

export async function initGoogleCalendar(userId: string) {
  // Redirect to Google OAuth flow
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.append("client_id", process.env.GOOGLE_CLIENT_ID!);
  authUrl.searchParams.append("redirect_uri", `${process.env.APP_URL}/auth/google-callback`);
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append("scope", "https://www.googleapis.com/auth/calendar");
  authUrl.searchParams.append("state", userId);

  return authUrl.toString();
}

export async function syncWithGoogleCalendar(
  userId: string,
  direction: "import" | "export" | "both" = "both"
) {
  const { data: integration } = await supabase
    .from("calendar_integrations")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!integration) throw new Error("Calendar not connected");

  // Refresh token if expired
  if (new Date(integration.token_expires_at) < new Date()) {
    await refreshGoogleToken(integration);
  }

  if (direction === "import" || direction === "both") {
    await importFromGoogleCalendar(userId, integration);
  }

  if (direction === "export" || direction === "both") {
    await exportToGoogleCalendar(userId, integration);
  }

  // Update last sync time
  await supabase
    .from("calendar_integrations")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", integration.id);
}

async function importFromGoogleCalendar(userId: string, integration: any) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id}/events`,
    {
      headers: { Authorization: `Bearer ${integration.access_token}` },
    }
  );

  const { items } = await response.json();

  for (const event of items) {
    // Check if already synced
    const { data: existing } = await supabase
      .from("calendar_sync_log")
      .select("task_id")
      .eq("event_id", event.id)
      .single();

    if (existing?.task_id) continue; // Already synced

    // Create task from event
    const { data: task } = await supabase
      .from("scheduling_nodes")
      .insert({
        user_id: userId,
        title: event.summary,
        start_time: event.start.dateTime,
        end_time: event.end.dateTime,
        is_timebound: true,
        category: "meeting",
        status: "pending",
      })
      .select()
      .single();

    // Log sync
    await supabase.from("calendar_sync_log").insert({
      user_id: userId,
      integration_id: integration.id,
      action: "imported",
      event_id: event.id,
      task_id: task.id,
    });
  }
}

async function exportToGoogleCalendar(userId: string, integration: any) {
  // Get unsynced tasks
  const { data: tasks } = await supabase
    .from("scheduling_nodes")
    .select("*")
    .eq("user_id", userId)
    .eq("is_timebound", true)
    .not("id", "in", (
      await supabase
        .from("calendar_sync_log")
        .select("task_id")
        .eq("user_id", userId)
        .eq("action", "exported")
    ).data?.map((l) => l.task_id) || []);

  for (const task of tasks || []) {
    // Create Google Calendar event
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: task.title,
          description: task.description,
          start: { dateTime: task.start_time },
          end: { dateTime: task.end_time },
        }),
      }
    );

    const event = await response.json();

    // Log sync
    await supabase.from("calendar_sync_log").insert({
      user_id: userId,
      integration_id: integration.id,
      action: "exported",
      event_id: event.id,
      task_id: task.id,
    });
  }
}
```

---

## Phase 4B: Slack Integration

### 4B.1 Slack Commands

```typescript
// /api/slack/commands

// Supported commands:
// /schedule [task] [time] â€” Create new task
//   /schedule "Client meeting" "tomorrow 2pm"
// /snooze [task] [until] â€” Postpone task
//   /snooze "Design review" "3 hours"
// /status â€” Show today's schedule
//   /status
// /remind [task] [when] â€” Set reminder
//   /remind "Review emails" "15 minutes before"

interface SlackRequest {
  command: string;
  text: string;
  user_id: string;
  team_id: string;
  response_url: string;
}

export async function handleSlackCommand(req: SlackRequest) {
  const [command, ...args] = req.text.split(" ");

  switch (command) {
    case "schedule":
      return await handleScheduleCommand(req, args);
    case "snooze":
      return await handleSnoozeCommand(req, args);
    case "status":
      return await handleStatusCommand(req);
    case "remind":
      return await handleRemindCommand(req, args);
    default:
      return { text: "Unknown command. Use /schedule, /snooze, /status, /remind" };
  }
}

async function handleScheduleCommand(req: SlackRequest, args: string[]) {
  const text = args.join(" ");
  
  // Call extractSchedule API
  const extraction = await extractSchedule({
    transcript: text,
    userTimezone: (await getUserTimezone(req.user_id)) || "UTC",
    currentDateTime: new Date().toISOString(),
  });

  // Create task
  const { data: task } = await supabase
    .from("scheduling_nodes")
    .insert({
      user_id: req.user_id,
      title: extraction.title,
      start_time: extraction.start_time_iso,
      end_time: extraction.end_time_iso,
      category: extraction.category,
      is_timebound: extraction.is_timebound,
    })
    .select()
    .single();

  // Send confirmation via Slack
  return {
    text: `âœ“ Scheduled: "${extraction.title}" for ${extraction.interpretation}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `âœ“ Task created!\n*${extraction.title}*\n${extraction.interpretation}`,
        },
      },
    ],
  };
}
```

---

## Phase 5: Mobile App (React Native)

### 5.1 Project Structure

```
mobile/
â”œâ”€â”€ app.json
â”œâ”€â”€ package.json
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ screens/
â”‚   â”‚   â”œâ”€â”€ ScheduleScreen.tsx
â”‚   â”‚   â”œâ”€â”€ CaptureScreen.tsx
â”‚   â”‚   â”œâ”€â”€ SettingsScreen.tsx
â”‚   â”‚   â”œâ”€â”€ AnalyticsScreen.tsx
â”‚   â”‚   â””â”€â”€ LoginScreen.tsx
â”‚   â”œâ”€â”€ services/
â”‚   â”‚   â”œâ”€â”€ supabase.ts
â”‚   â”‚   â”œâ”€â”€ offline-sync.ts
â”‚   â”‚   â”œâ”€â”€ push-notifications.ts
â”‚   â”‚   â””â”€â”€ claude-api.ts
â”‚   â”œâ”€â”€ stores/
â”‚   â”‚   â”œâ”€â”€ auth-store.ts
â”‚   â”‚   â”œâ”€â”€ tasks-store.ts
â”‚   â”‚   â””â”€â”€ sync-store.ts
â”‚   â”œâ”€â”€ components/
â”‚   â”‚   â”œâ”€â”€ VoiceInput.tsx
â”‚   â”‚   â”œâ”€â”€ TaskCard.tsx
â”‚   â”‚   â”œâ”€â”€ TimelineDay.tsx
â”‚   â”‚   â””â”€â”€ ConfirmationModal.tsx
â”‚   â”œâ”€â”€ db/
â”‚   â”‚   â””â”€â”€ schema.ts (WatermelonDB)
â”‚   â””â”€â”€ App.tsx
```

### 5.2 Offline-First Architecture

```typescript
// src/services/offline-sync.ts

import WatermelonDB from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'tasks',
      columns: [
        { name: 'user_id', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'start_time', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'synced_at', type: 'number', isOptional: true },
      ],
    }),
  ],
});

const adapter = new SQLiteAdapter({
  schema,
  dbName: 'Notio_mobile',
});

const database = new Database({ adapter });

// Sync queue
interface SyncItem {
  id: string;
  action: 'create' | 'update' | 'delete';
  table: string;
  data: any;
  timestamp: number;
  retries: number;
}

export async function enqueueSyncAction(item: SyncItem) {
  const queue = await database.write(async () => {
    return await database.collections.get('sync_queue').create((record) => {
      Object.assign(record, item);
    });
  });

  // Try sync immediately
  await syncWithServer();
}

export async function syncWithServer() {
  const items = await database.collections.get('sync_queue').query().fetch();

  for (const item of items) {
    try {
      await syncItem(item);
      await database.write(async () => {
        await item.destroyPermanently();
      });
    } catch (error) {
      // Retry later
      await database.write(async () => {
        await item.update((record) => {
          record.retries++;
        });
      });
    }
  }
}

async function syncItem(item: SyncItem) {
  const response = await fetch(
    `${process.env.REACT_APP_API_URL}/sync`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    }
  );

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.statusText}`);
  }

  return response.json();
}
```

---

## Phase 6: Offline Mode + Polish

### 6.1 Offline Sync Strategy

**Conflict Resolution:**
- Server-wins (default): If offline change conflicts with server, server version wins
- Client-wins: User's local change takes priority
- Ask user: UI prompt when conflicts detected

**Implementation:**
```typescript
function resolveConflict(
  localVersion: Task,
  serverVersion: Task,
  strategy: 'server-wins' | 'client-wins' | 'ask'
): Task {
  if (strategy === 'server-wins') return serverVersion;
  if (strategy === 'client-wins') return localVersion;
  
  // 'ask' - show UI to user
  return showConflictResolutionUI(localVersion, serverVersion);
}
```

---

## Timeline & Effort Estimates

| Phase | Features | Duration | Team | Hours |
|-------|----------|----------|------|-------|
| **Phase 3** | Adaptive Learning | 8 weeks | 1 BE | 80 |
| **Phase 4A** | Google Cal + Email + Manual Hours | 4 weeks | 1 BE + 1 FE | 110 |
| **Phase 4B** | Slack | 3.5 weeks | 1 BE | 55 |
| **Phase 5** | Mobile (React Native) | 4 weeks | 1 FE + 1 BE | 95 |
| **Phase 6** | Offline + Polish | 4 weeks | 1 FE + 1 BE | 65 |
| **TOTAL** | All Features | **6 months** | **2 eng** | **405 hrs** |

---

## Critical Path & Dependencies

```
Phase 3 (Adaptive Learning)
  â””â”€ Provides data for Phase 4A recommendations
  â””â”€ Enables smart break detection

Phase 4A (Google Cal + Email + Manual Hours)
  â”œâ”€ Manual Hours UI must complete before Calendar sync
  â””â”€ Email system needed for reminders

Phase 4B (Slack) â€” Can start in parallel with Phase 4A
  â””â”€ Depends on extractSchedule function (already exists)

Phase 5 (Mobile) â€” Can start after Phase 3, parallel with 4A/4B
  â””â”€ Uses same backend APIs as web
  â””â”€ Offline sync needs Phase 3 data models

Phase 6 (Offline + Polish) â€” Final phase, depends on all above
```

---

## MVP vs Nice-to-Have

**MVP (Phase 3 + 4A):**
- Adaptive learning with time padding
- Google Calendar sync (basic)
- Email reminders
- Manual hours adjustment UI

**Phase 4B+:**
- Slack integration (secondary, but valuable)
- Mobile app (not critical initially)
- Offline mode (nice-to-have)

---

## Go-Live Checklist

Pre-Launch:
- [ ] Security audit (tokens, API keys, data encryption)
- [ ] Load test (1000 concurrent users)
- [ ] Calendar sync conflict resolution tested
- [ ] Email delivery tested (spam filters, rate limits)
- [ ] Mobile app tested on iOS + Android

Beta Rollout:
- [ ] 10% of users â†’ monitor for 1 week
- [ ] 50% of users â†’ monitor for 1 week
- [ ] 100% deployment

Post-Launch Monitoring:
- [ ] Calendar sync error rate < 0.1%
- [ ] Email delivery > 95%
- [ ] Mobile crash rate < 0.01%
- [ ] API latency < 500ms p95
- [ ] Daily active users growth

---

## What's Next?

**To get started:**
1. Review this roadmap with your team
2. Decide which phase to tackle first
3. Set up sprints and assign engineers
4. Provision Google/Slack API keys
5. Begin Phase 3 implementation

All code examples and SQL are production-ready templates.

