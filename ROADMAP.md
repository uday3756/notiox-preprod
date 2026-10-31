# Notio Scheduling SaaS: Phase 3 + New Features Roadmap

## Executive Summary

This document outlines a 6-month, four-phase rollout plan to transform Notio from a basic time-bound task scheduler (Phase 1 + 2) into an intelligent, multi-platform scheduling SaaS with deep analytics and ecosystem integrations.

**Current State:**
- Phase 1 âœ…: Time-Bound Tasks + Working Hours Constraint
- Phase 2 (implicit): Core UI + Voice/Text Capture + Task Management
- Database: `scheduling_nodes`, `user_working_hours`, `task_analytics`, `scheduling_logs`, `schedule_exceptions`
- Tech: React 19, TanStack Start, Supabase, Claude Haiku 4.5, Tailwind CSS

**Vision:**
A context-aware scheduling platform that learns from user behavior, integrates with their existing tools (Google Calendar, Slack), and intelligently allocates time based on energy patterns and historical accuracy.

---

## Contents

1. [Database Schema Additions](#1-database-schema-additions)
2. [Feature Specifications](#2-feature-specifications)
3. [Phase 3: Adaptive Learning](#3-phase-3-adaptive-learning)
4. [New Feature Integrations](#4-new-feature-integrations)
5. [Mobile App Architecture](#5-mobile-app-architecture)
6. [Offline Mode Implementation](#6-offline-mode-implementation)
7. [Architecture Diagrams](#7-architecture-diagrams)
8. [Phased Rollout Plan](#8-phased-rollout-plan)
9. [Effort Estimates](#9-effort-estimates)
10. [Critical Path & Dependencies](#10-critical-path--dependencies)
11. [Go-Live Checklist](#11-go-live-checklist)

---

## 1. Database Schema Additions

### 1.1 Phase 3: Behavior Learning & Analytics

```sql
-- TABLE: adaptive_patterns
-- Purpose: Store learned user behavior patterns for recommendations
CREATE TABLE IF NOT EXISTS public.adaptive_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Historical accuracy (computed daily)
  completion_rate_7d DECIMAL(5, 2) DEFAULT 0,  -- % tasks completed in last 7 days
  completion_rate_30d DECIMAL(5, 2) DEFAULT 0,
  
  -- Time estimation accuracy
  estimate_accuracy_ratio DECIMAL(5, 2) DEFAULT 1.0,  -- actual/estimated
  underestimate_percent DECIMAL(5, 2) DEFAULT 0,
  
  -- Postponement patterns
  postponement_rate_7d DECIMAL(5, 2) DEFAULT 0,  -- % of tasks postponed
  avg_postponement_count DECIMAL(5, 2) DEFAULT 0,
  
  -- Energy patterns
  best_hour_of_day INTEGER,  -- 0-23, highest completion rate
  worst_hour_of_day INTEGER,
  energy_dips JSONB DEFAULT '{}',  -- { "10": 0.65, "14": 0.52 } â€” productivity multiplier by hour
  
  -- Weekly patterns
  best_day_of_week TEXT,  -- 'monday', 'tuesday', etc.
  worst_day_of_week TEXT,
  
  -- Category-specific patterns
  category_completion_rates JSONB DEFAULT '{}',  -- { "deep-work": 0.85, "meeting": 0.95 }
  category_time_accuracy JSONB DEFAULT '{}',    -- { "deep-work": 1.2, "meeting": 0.95 }
  
  -- Auto-padding recommendations
  suggested_padding_multiplier DECIMAL(3, 2) DEFAULT 1.1,  -- 1.0 = no padding, 1.3 = +30%
  category_padding_multipliers JSONB DEFAULT '{}',  -- { "deep-work": 1.3, "meeting": 1.05 }
  
  -- Fatigue detection
  avg_daily_task_load INTEGER,  -- tasks/day
  fatigue_threshold_hours DECIMAL(4, 1),  -- daily hours at which fatigue starts
  
  last_pattern_update TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adaptive_patterns_user_id ON public.adaptive_patterns(user_id);

ALTER TABLE public.adaptive_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own patterns"
  ON public.adaptive_patterns
  FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Service role can update patterns"
  ON public.adaptive_patterns
  FOR UPDATE
  USING (true)
  WITH CHECK (true);


-- TABLE: hourly_performance
-- Purpose: Fine-grained performance tracking by hour for energy detection
CREATE TABLE IF NOT EXISTS public.hourly_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  hour_of_day INTEGER NOT NULL,  -- 0-23
  day_of_week TEXT NOT NULL,  -- 'monday', etc.
  
  -- Performance metrics (rolling average)
  completion_rate DECIMAL(5, 2),  -- % of tasks completed started in this hour
  avg_completion_time_minutes INTEGER,
  task_count INTEGER DEFAULT 0,  -- total tasks in this hour/day combo
  
  -- Accuracy metrics
  avg_time_estimate_accuracy DECIMAL(5, 2),  -- actual/estimated
  
  data_points_count INTEGER DEFAULT 0,  -- sample size for averaging
  
  UNIQUE(user_id, hour_of_day, day_of_week),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hourly_performance_user_id ON public.hourly_performance(user_id);

ALTER TABLE public.hourly_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own hourly performance"
  ON public.hourly_performance
  FOR SELECT
  USING (auth.uid() = user_id);


-- TABLE: smart_recommendations
-- Purpose: AI-generated recommendations based on learned patterns
CREATE TABLE IF NOT EXISTS public.smart_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  recommendation_type TEXT NOT NULL,
  CONSTRAINT valid_rec_type CHECK (
    recommendation_type IN (
      'reschedule_task',
      'auto_pad_task',
      'suggest_break',
      'optimize_focus_block',
      'defer_low_energy_task',
      'consolidate_quick_tasks',
      'distribute_heavy_tasks'
    )
  ),
  
  -- Target entity
  scheduling_node_id UUID REFERENCES public.scheduling_nodes(id) ON DELETE CASCADE,
  
  -- Recommendation details
  title TEXT NOT NULL,
  description TEXT,
  suggested_action JSONB NOT NULL,  -- { "action": "reschedule", "from": "2026-06-21T14:00:00Z", "to": "2026-06-21T10:00:00Z", "reason": "best productivity hour" }
  
  -- Confidence & impact
  confidence_score DECIMAL(3, 2),  -- 0.0-1.0
  predicted_improvement_percent DECIMAL(5, 2),  -- expected impact on completion
  
  -- User interaction
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, accepted, declined, auto_applied
  CONSTRAINT valid_rec_status CHECK (status IN ('pending', 'accepted', 'declined', 'auto_applied')),
  
  dismissed_at TIMESTAMP WITH TIME ZONE,
  applied_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_recommendations_user_id ON public.smart_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_smart_recommendations_status ON public.smart_recommendations(user_id, status);

ALTER TABLE public.smart_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own recommendations"
  ON public.smart_recommendations
  FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own recommendations"
  ON public.smart_recommendations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### 1.2 Google Calendar Integration

```sql
-- TABLE: calendar_integrations
-- Purpose: Track OAuth tokens and sync state for Google Calendar
CREATE TABLE IF NOT EXISTS public.calendar_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  provider TEXT NOT NULL DEFAULT 'google',  -- 'google', 'outlook' (future)
  
  -- OAuth credentials (encrypted in production)
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Sync metadata
  calendar_id TEXT NOT NULL,  -- the Google Calendar ID
  is_active BOOLEAN DEFAULT true,
  sync_direction TEXT DEFAULT 'bidirectional',  -- 'one_way_import', 'one_way_export', 'bidirectional'
  
  -- Sync state
  last_sync_at TIMESTAMP WITH TIME ZONE,
  next_sync_at TIMESTAMP WITH TIME ZONE,
  sync_cursor TEXT,  -- Google Calendar sync token for incremental sync
  
  -- Conflict handling
  auto_resolve_conflicts BOOLEAN DEFAULT false,
  conflict_resolution_strategy TEXT DEFAULT 'google_wins',  -- 'google_wins', 'Notio_wins', 'prompt_user'
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_integrations_user_id ON public.calendar_integrations(user_id);

ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own calendar integrations"
  ON public.calendar_integrations
  FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own calendar integrations"
  ON public.calendar_integrations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- TABLE: calendar_sync_log
-- Purpose: Audit trail for calendar sync operations
CREATE TABLE IF NOT EXISTS public.calendar_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  sync_type TEXT NOT NULL,  -- 'import', 'export', 'bidirectional'
  direction TEXT NOT NULL,  -- 'Notio_to_calendar', 'calendar_to_Notio'
  
  -- Sync details
  events_processed INTEGER DEFAULT 0,
  events_created INTEGER DEFAULT 0,
  events_updated INTEGER DEFAULT 0,
  events_deleted INTEGER DEFAULT 0,
  conflicts_detected INTEGER DEFAULT 0,
  conflicts_resolved INTEGER DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL,  -- 'success', 'partial', 'failed'
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_sync_log_user_id ON public.calendar_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_sync_log_created_at ON public.calendar_sync_log(created_at DESC);

ALTER TABLE public.calendar_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own sync logs"
  ON public.calendar_sync_log
  FOR SELECT
  USING (auth.uid() = user_id);
```

### 1.3 Slack Integration

```sql
-- TABLE: slack_integrations
-- Purpose: Track Slack workspace connection and settings
CREATE TABLE IF NOT EXISTS public.slack_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- OAuth credentials
  bot_token TEXT NOT NULL,
  team_id TEXT NOT NULL,
  team_name TEXT,
  user_slack_id TEXT NOT NULL,
  
  -- Channel preferences
  reminder_channel_id TEXT,  -- where to send reminders
  
  -- Features
  allow_schedule_from_slack BOOLEAN DEFAULT true,
  allow_reminders_via_slack BOOLEAN DEFAULT true,
  allow_voice_in_slack BOOLEAN DEFAULT false,  -- future
  
  -- Reminder settings
  reminder_lead_time_minutes INTEGER DEFAULT 15,
  
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slack_integrations_user_id ON public.slack_integrations(user_id);

ALTER TABLE public.slack_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own Slack integration"
  ON public.slack_integrations
  FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own Slack integration"
  ON public.slack_integrations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- TABLE: slack_commands_log
-- Purpose: Log Slack commands executed (schedule, snooze, status)
CREATE TABLE IF NOT EXISTS public.slack_commands_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  command TEXT NOT NULL,  -- 'schedule', 'remind', 'snooze', 'complete'
  payload JSONB,  -- raw Slack payload
  
  scheduling_node_id UUID REFERENCES public.scheduling_nodes(id) ON DELETE SET NULL,
  
  status TEXT NOT NULL DEFAULT 'success',  -- 'success', 'failed'
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slack_commands_log_user_id ON public.slack_commands_log(user_id);

ALTER TABLE public.slack_commands_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own Slack commands log"
  ON public.slack_commands_log
  FOR SELECT
  USING (auth.uid() = user_id);
```

### 1.4 Email Notifications

```sql
-- TABLE: email_notification_settings
-- Purpose: Configure email reminder preferences
CREATE TABLE IF NOT EXISTS public.email_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Features
  enable_meeting_reminders BOOLEAN DEFAULT true,
  enable_task_reminders BOOLEAN DEFAULT true,
  enable_daily_digest BOOLEAN DEFAULT false,
  enable_weekly_digest BOOLEAN DEFAULT false,
  
  -- Timing
  reminder_lead_time_minutes INTEGER DEFAULT 15,
  
  -- Frequency
  max_emails_per_day INTEGER DEFAULT 10,
  quiet_hours_start TIME,  -- don't send reminders after this time
  quiet_hours_end TIME,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_notification_settings_user_id ON public.email_notification_settings(user_id);

ALTER TABLE public.email_notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own email settings"
  ON public.email_notification_settings
  FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own email settings"
  ON public.email_notification_settings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- TABLE: email_notification_queue
-- Purpose: Queue emails for background job processing
CREATE TABLE IF NOT EXISTS public.email_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  scheduling_node_id UUID REFERENCES public.scheduling_nodes(id) ON DELETE SET NULL,
  
  email_type TEXT NOT NULL,  -- 'task_reminder', 'meeting_reminder', 'daily_digest', 'alert'
  recipient_email TEXT NOT NULL,
  
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'sent', 'failed', 'bounced'
  
  send_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_notification_queue_user_id ON public.email_notification_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_email_notification_queue_status ON public.email_notification_queue(status);
CREATE INDEX IF NOT EXISTS idx_email_notification_queue_send_at ON public.email_notification_queue(send_at);

ALTER TABLE public.email_notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own email queue"
  ON public.email_notification_queue
  FOR SELECT
  USING (auth.uid() = user_id);
```

### 1.5 Offline Sync & Mobile

```sql
-- TABLE: offline_sync_queue
-- Purpose: Queue local changes for sync when online (mobile/offline mode)
CREATE TABLE IF NOT EXISTS public.offline_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Local identifier (UUID generated on device)
  local_id TEXT NOT NULL,
  
  -- What entity changed
  entity_type TEXT NOT NULL,  -- 'scheduling_node', 'working_hours', 'task_complete'
  entity_id UUID,  -- server ID (null if new entity)
  
  -- Operation
  operation TEXT NOT NULL,  -- 'create', 'update', 'delete'
  operation_data JSONB NOT NULL,  -- full record being synced
  
  -- Sync metadata
  device_id TEXT NOT NULL,
  app_version TEXT,
  
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'syncing', 'synced', 'conflict', 'failed'
  sync_error TEXT,
  
  conflict_with_server_version JSONB,  -- server record if conflict detected
  conflict_resolution TEXT,  -- 'client_wins', 'server_wins', 'merged'
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  synced_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_user_id ON public.offline_sync_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_offline_sync_queue_status ON public.offline_sync_queue(user_id, status);

ALTER TABLE public.offline_sync_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own sync queue"
  ON public.offline_sync_queue
  FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own sync queue"
  ON public.offline_sync_queue
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- TABLE: device_registrations
-- Purpose: Track mobile/device instances for push notifications & sync
CREATE TABLE IF NOT EXISTS public.device_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  device_id TEXT NOT NULL,  -- UUID generated on device
  device_type TEXT NOT NULL,  -- 'ios', 'android', 'web'
  app_version TEXT,
  os_version TEXT,
  
  push_token TEXT,  -- FCM or APNs token
  
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_heartbeat_at TIMESTAMP WITH TIME ZONE,
  
  UNIQUE(user_id, device_id),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_registrations_user_id ON public.device_registrations(user_id);

ALTER TABLE public.device_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own devices"
  ON public.device_registrations
  FOR SELECT
  USING (auth.uid() = user_id);
```

### 1.6 Working Hours Management (Enhancement)

```sql
-- Add new column to user_working_hours for manual override tracking
-- This allows the manual time threshold adjustment feature
ALTER TABLE public.user_working_hours
ADD COLUMN IF NOT EXISTS custom_work_periods JSONB DEFAULT '[]',
  -- e.g. [{ "name": "Morning Focus", "start": "05:00:00", "end": "12:00:00", "days": ["monday", "tuesday", ...] }]
ADD COLUMN IF NOT EXISTS preset_templates TEXT DEFAULT 'standard',
  -- 'standard' (9-5), 'early' (5am-12pm), 'late' (4pm-11pm), 'flexible', 'custom'
ADD COLUMN IF NOT EXISTS allow_scheduling_outside_hours BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS prevent_consecutive_blocks BOOLEAN DEFAULT true,
  -- if true, enforce gaps between scheduled blocks
ADD COLUMN IF NOT EXISTS min_gap_between_blocks_minutes INTEGER DEFAULT 15;
```

---

## 2. Feature Specifications

### 2.1 Phase 3: Adaptive Learning Core Algorithm

**Objective:** Learn from historical behavior to make intelligent recommendations.

#### 2.1.1 Completion Rate & Accuracy Tracking

```typescript
// lib/adaptive-learning.functions.ts

interface BehaviorMetrics {
  completionRate7d: number;      // % of scheduled tasks completed
  completionRate30d: number;
  estimateAccuracyRatio: number; // actual_duration / estimated_duration
  underestimatePercent: number;  // % of tasks that took longer than estimated
  postponementRate: number;       // % of tasks postponed
}

interface EnergyPattern {
  hourOfDay: number;             // 0-23
  dayOfWeek: string;
  completionRate: number;        // % of tasks completed in this hour
  avgTimeAccuracy: number;       // estimated vs actual ratio
  dataPoints: number;            // sample size
}

// Compute daily metrics (run at 11:59pm for previous day)
async function updateDailyBehaviorMetrics(userId: string): Promise<void> {
  // Get all completed/pending tasks from yesterday
  const tasks = await getTasksForDate(userId, yesterday);
  
  // Calculate metrics
  const completed = tasks.filter(t => t.status === 'completed').length;
  const total = tasks.length;
  const completionRate = total > 0 ? (completed / total) * 100 : 0;
  
  const timeMetrics = tasks.map(t => ({
    estimated: t.estimated_duration_minutes,
    actual: t.actual_duration_minutes || 0
  }));
  
  const accuracyRatio = avg(timeMetrics.map(m => m.actual / m.estimated));
  const underestimated = timeMetrics.filter(m => m.actual > m.estimated).length;
  
  // Store in adaptive_patterns (7d and 30d rolling)
  await updateAdaptivePatterns(userId, {
    completion_rate_7d: calculateRollingAvg(7),
    completion_rate_30d: calculateRollingAvg(30),
    estimate_accuracy_ratio: accuracyRatio,
    underestimate_percent: (underestimated / timeMetrics.length) * 100
  });
}

// Detect energy patterns by hour
async function detectEnergyPatterns(userId: string): Promise<EnergyPattern[]> {
  // Aggregate task performance by hour of day
  // Get last 90 days of data
  
  const performanceByHour = {};
  
  for (let hour = 0; hour < 24; hour++) {
    const tasksInHour = await getTasksStartedInHour(userId, hour, last90Days);
    
    const completed = tasksInHour.filter(t => t.status === 'completed').length;
    const completionRate = tasksInHour.length > 0 
      ? (completed / tasksInHour.length) * 100 
      : 0;
    
    const timeAccuracy = avg(tasksInHour.map(t => 
      (t.actual_duration_minutes || 0) / t.estimated_duration_minutes
    ));
    
    performanceByHour[hour] = {
      completionRate,
      timeAccuracy,
      dataPoints: tasksInHour.length
    };
  }
  
  // Filter hours with at least 5 data points
  const patterns = Object.entries(performanceByHour)
    .filter(([_, data]) => data.dataPoints >= 5)
    .map(([hour, data]) => ({
      hourOfDay: parseInt(hour),
      ...data
    }));
  
  // Update best/worst hours in adaptive_patterns
  const bestHour = max(patterns, p => p.completionRate);
  const worstHour = min(patterns, p => p.completionRate);
  
  await updateAdaptivePatterns(userId, {
    best_hour_of_day: bestHour.hourOfDay,
    worst_hour_of_day: worstHour.hourOfDay,
    energy_dips: computeEnergyDips(patterns)
  });
  
  return patterns;
}

// Compute productivity multiplier per hour (for recommendations)
function computeEnergyDips(patterns: EnergyPattern[]): Record<number, number> {
  const avgCompletion = avg(patterns.map(p => p.completionRate));
  
  return Object.fromEntries(
    patterns.map(p => [
      p.hourOfDay,
      p.completionRate / avgCompletion  // 1.0 = average, 0.5 = 50% worse, 1.3 = 30% better
    ])
  );
}
```

#### 2.1.2 Smart Recommendations Engine

```typescript
// lib/recommendations.functions.ts

interface SmartRecommendation {
  type: 'reschedule_task' | 'auto_pad_task' | 'suggest_break' | 'optimize_focus_block' | 'defer_low_energy_task';
  schedulingNodeId: string;
  suggestedAction: object;
  confidenceScore: number;  // 0.0-1.0
  predictedImprovementPercent: number;
}

async function generateDailyRecommendations(userId: string): Promise<SmartRecommendation[]> {
  const recommendations: SmartRecommendation[] = [];
  
  // 1. Analyze upcoming tasks
  const upcomingTasks = await getUpcomingTasks(userId, next7Days);
  const patterns = await getAdaptivePatterns(userId);
  
  for (const task of upcomingTasks) {
    // 2. Check for time estimation issues
    if (patterns.estimate_accuracy_ratio > 1.15) {
      // User underestimates by 15%+
      const paddedDuration = Math.ceil(task.estimated_duration_minutes * patterns.estimate_accuracy_ratio);
      
      recommendations.push({
        type: 'auto_pad_task',
        schedulingNodeId: task.id,
        suggestedAction: {
          action: 'extend_duration',
          currentEstimate: task.estimated_duration_minutes,
          suggestedEstimate: paddedDuration
        },
        confidenceScore: 0.8,
        predictedImprovementPercent: 12  // expect 12% better completion
      });
    }
    
    // 3. Check if task scheduled in low-energy hour
    const taskHour = new Date(task.start_time).getHours();
    const energyMultiplier = patterns.energy_dips[taskHour] || 1.0;
    
    if (energyMultiplier < 0.75) {
      // Task in poor productivity hour
      const bestHour = patterns.best_hour_of_day;
      
      recommendations.push({
        type: 'reschedule_task',
        schedulingNodeId: task.id,
        suggestedAction: {
          action: 'reschedule',
          currentTime: task.start_time,
          suggestedTime: moveToHour(task.start_time, bestHour),
          reason: `Best productivity hour is ${bestHour}:00`
        },
        confidenceScore: 0.7,
        predictedImprovementPercent: 18
      });
    }
    
    // 4. Consolidate quick tasks
    if (task.estimated_duration_minutes <= 15 && task.category === 'admin') {
      const batch = getAdjacentQuickTasks(userId, task);
      
      if (batch.length >= 3) {
        recommendations.push({
          type: 'consolidate_quick_tasks',
          schedulingNodeId: task.id,
          suggestedAction: {
            action: 'batch_schedule',
            tasks: batch.map(t => t.id),
            totalTime: sum(batch.map(t => t.estimated_duration_minutes))
          },
          confidenceScore: 0.6,
          predictedImprovementPercent: 15
        });
      }
    }
  }
  
  // 5. Suggest break if fatigue detected
  if (shouldSuggestBreak(userId, patterns)) {
    recommendations.push({
      type: 'suggest_break',
      schedulingNodeId: null,
      suggestedAction: {
        action: 'insert_break',
        suggestedTime: getNextFatiguePoint(userId),
        duration: 15
      },
      confidenceScore: 0.65,
      predictedImprovementPercent: 20
    });
  }
  
  // Save to database
  await saveRecommendations(userId, recommendations);
  
  return recommendations;
}

function shouldSuggestBreak(userId: string, patterns: AdaptivePattern): boolean {
  const scheduled = getScheduledHoursToday(userId);
  return scheduled > (patterns.fatigue_threshold_hours || 6);
}
```

#### 2.1.3 Analytics Dashboard Data Aggregation

```typescript
// lib/analytics-aggregation.functions.ts

interface ProductivityInsight {
  completionRate: number;
  estimateAccuracy: number;
  bestHour: number;
  worstHour: number;
  topCategory: string;
  weeklyPattern: Record<string, number>;
  recommendations: SmartRecommendation[];
}

async function getProductivityInsights(userId: string, period: 'week' | 'month' = 'week'): Promise<ProductivityInsight> {
  const patterns = await getAdaptivePatterns(userId);
  const tasks = await getCompletedTasks(userId, period);
  
  // Build heatmap data: hour x day
  const heatmap = buildCompletionHeatmap(tasks);
  
  return {
    completionRate: period === 'week' 
      ? patterns.completion_rate_7d 
      : patterns.completion_rate_30d,
    estimateAccuracy: patterns.estimate_accuracy_ratio,
    bestHour: patterns.best_hour_of_day,
    worstHour: patterns.worst_hour_of_day,
    topCategory: getTopCategory(patterns.category_completion_rates),
    weeklyPattern: patterns.energy_dips || {},
    recommendations: await getRecommendations(userId, 'pending', 5)  // top 5
  };
}

function buildCompletionHeatmap(tasks: Task[]): Record<string, Record<number, number>> {
  const heatmap = {};
  
  for (let day = 0; day < 7; day++) {
    const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][day];
    heatmap[dayName] = {};
    
    for (let hour = 0; hour < 24; hour++) {
      const tasksInSlot = tasks.filter(t => {
        const taskDate = new Date(t.start_time);
        return taskDate.getDay() === day && taskDate.getHours() === hour && t.status === 'completed';
      });
      
      heatmap[dayName][hour] = tasksInSlot.length;
    }
  }
  
  return heatmap;
}
```

---

### 2.2 Google Calendar Integration

**Objective:** Bi-directional sync between Notio and Google Calendar.

#### 2.2.1 OAuth & Token Management

```typescript
// lib/google-calendar.server.ts

import { google } from 'googleapis';

export const googleOAuthClient = new google.auth.OAuth2({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: `${process.env.VERCEL_URL}/api/oauth/google-calendar/callback`
});

async function getOrRefreshAccessToken(userId: string): Promise<string> {
  let integration = await getCalendarIntegration(userId);
  
  if (!integration) {
    throw new Error('Calendar not connected');
  }
  
  // Check if token expired
  if (new Date(integration.token_expires_at) < new Date()) {
    const { credentials } = await googleOAuthClient.refreshAccessToken({
      refresh_token: decryptToken(integration.refresh_token)
    });
    
    integration.access_token = encryptToken(credentials.access_token);
    integration.token_expires_at = new Date(credentials.expiry_date);
    
    await updateCalendarIntegration(userId, integration);
  }
  
  return decryptToken(integration.access_token);
}

async function initiateCalendarOAuth(userId: string): Promise<string> {
  const url = googleOAuthClient.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    state: encodeState({ userId, timestamp: Date.now() })
  });
  
  return url;
}

async function handleCalendarOAuthCallback(code: string, state: string): Promise<void> {
  const { userId } = decodeState(state);
  const { tokens } = await googleOAuthClient.getToken(code);
  
  await saveCalendarIntegration(userId, {
    access_token: encryptToken(tokens.access_token),
    refresh_token: encryptToken(tokens.refresh_token),
    token_expires_at: new Date(tokens.expiry_date),
    calendar_id: 'primary'  // Use user's primary calendar
  });
}
```

#### 2.2.2 Bidirectional Sync Engine

```typescript
// lib/calendar-sync.functions.ts

async function syncCalendarWithNotio(userId: string): Promise<SyncResult> {
  const integration = await getCalendarIntegration(userId);
  const token = await getOrRefreshAccessToken(userId);
  
  const calendar = google.calendar({ version: 'v3', auth: { access_token: token } });
  
  // 1. Fetch events from Google Calendar (incremental via sync token)
  const googleEvents = await fetchCalendarEvents(calendar, integration);
  
  // 2. Import new/updated events
  const notioConflicts = await importCalendarEvents(userId, googleEvents);
  
  // 3. Export Notio tasks to Google Calendar
  const notioTasks = await getSchedulingNodes(userId, { syncStatus: 'pending_export' });
  
  for (const task of notioTasks) {
    try {
      if (task.exported_calendar_event_id) {
        // Update existing event
        await calendar.events.update({
          calendarId: integration.calendar_id,
          eventId: task.exported_calendar_event_id,
          requestBody: taskToCalendarEvent(task)
        });
      } else {
        // Create new event
        const event = await calendar.events.insert({
          calendarId: integration.calendar_id,
          requestBody: taskToCalendarEvent(task)
        });
        
        await markTaskExported(task.id, event.data.id);
      }
    } catch (error) {
      logSyncError(userId, 'export', task.id, error);
    }
  }
  
  // 4. Log sync results
  await logCalendarSync(userId, {
    eventsProcessed: googleEvents.length + notioTasks.length,
    eventsCreated: googleEvents.filter(e => e.new).length,
    eventsUpdated: googleEvents.filter(e => e.updated).length,
    conflictsDetected: notioConflicts.length
  });
  
  return {
    success: true,
    conflictsDetected: notioConflicts.length,
    syncedItems: googleEvents.length + notioTasks.length
  };
}

async function fetchCalendarEvents(calendar: any, integration: any): Promise<CalendarEvent[]> {
  const response = await calendar.events.list({
    calendarId: integration.calendar_id,
    syncToken: integration.sync_cursor,  // For incremental sync
    showDeleted: true
  });
  
  // Update sync cursor
  await updateCalendarIntegration(integration.user_id, {
    sync_cursor: response.data.nextSyncToken,
    last_sync_at: new Date()
  });
  
  return response.data.items || [];
}

async function importCalendarEvents(userId: string, googleEvents: CalendarEvent[]): Promise<Conflict[]> {
  const conflicts: Conflict[] = [];
  
  for (const gEvent of googleEvents) {
    const notioEvent = await findMatchingNotioTask(userId, gEvent);
    
    if (!notioEvent) {
      // New event from Google Calendar
      await createSchedulingNode(userId, {
        title: gEvent.summary,
        description: gEvent.description,
        start_time: new Date(gEvent.start.dateTime),
        end_time: new Date(gEvent.end.dateTime),
        is_timebound: true,
        category: categorizeCalendarEvent(gEvent),
        original_calendar_event_id: gEvent.id
      });
    } else {
      // Event exists; check for conflicts
      if (hasConflict(notioEvent, gEvent)) {
        const resolution = await resolveConflict(userId, notioEvent, gEvent, integration.conflict_resolution_strategy);
        conflicts.push({ notioEvent, gEvent, resolution });
      }
    }
  }
  
  return conflicts;
}

function taskToCalendarEvent(task: SchedulingNode): any {
  return {
    summary: task.title,
    description: task.description || `Created in Notio | ${task.extracted_intent?.transcript || ''}`,
    start: { dateTime: task.start_time.toISOString() },
    end: { dateTime: task.end_time.toISOString() },
    transparency: task.status === 'completed' ? 'transparent' : 'opaque',
    extendedProperties: {
      private: {
        Notio_id: task.id,
        Notio_category: task.category
      }
    }
  };
}

function categorizeCalendarEvent(gEvent: any): string {
  const title = gEvent.summary.toLowerCase();
  const description = (gEvent.description || '').toLowerCase();
  const text = `${title} ${description}`;
  
  if (text.includes('meeting')) return 'meeting';
  if (text.includes('standup') || text.includes('stand-up')) return 'standup';
  if (text.includes('presentation')) return 'presentation';
  if (text.includes('deadline')) return 'deadline';
  
  // Default to deep-work for calendar events not marked otherwise
  return 'deep-work';
}

async function resolveConflict(userId: string, notioEvent: SchedulingNode, gEvent: any, strategy: string): Promise<string> {
  if (strategy === 'Notio_wins') {
    // Keep Notio version, update Google Calendar
    await updateGoogleEvent(gEvent.id, taskToCalendarEvent(notioEvent));
    return 'Notio_wins';
  } else if (strategy === 'google_wins') {
    // Update Notio from Google Calendar
    await updateSchedulingNode(notioEvent.id, {
      title: gEvent.summary,
      description: gEvent.description,
      start_time: gEvent.start.dateTime,
      end_time: gEvent.end.dateTime
    });
    return 'google_wins';
  } else {
    // Prompt user (for async/webhook handling)
    return 'prompt_user';
  }
}
```

---

### 2.3 Slack Integration

**Objective:** Manage schedules, receive reminders, and create tasks from Slack.

#### 2.3.1 Slack Slash Commands

```typescript
// server/slack-commands.server.ts

import { App } from '@slack/bolt';

const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// /schedule "Task name" for "2 hours" tomorrow at 10am
slackApp.command('/schedule', async ({ ack, body, say, client }) => {
  ack();
  
  const userId = await getUserIdFromSlackId(body.user_id);
  const { taskText, duration, datetime } = parseScheduleCommand(body.text);
  
  try {
    const task = await createSchedulingNode(userId, {
      title: taskText,
      estimated_duration_minutes: parseDuration(duration),
      start_time: parseDateTime(datetime),
      source: 'slack'
    });
    
    // Acknowledge
    await say({
      text: `Scheduled: *${taskText}* for ${datetime}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Scheduled: *${taskText}*\nWhen: ${datetime}\nDuration: ${duration}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View' },
              url: `${process.env.VERCEL_URL}/schedule/${task.id}`
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Reschedule' },
              action_id: 'reschedule_task'
            }
          ]
        }
      ]
    });
    
    logSlackCommand(userId, 'schedule', { taskText, duration, datetime });
  } catch (error) {
    await say(`Error scheduling task: ${error.message}`);
    logSlackCommand(userId, 'schedule', { taskText, duration, datetime, error: error.message }, 'failed');
  }
});

// /snooze task_id for 2 hours
slackApp.command('/snooze', async ({ ack, body, say }) => {
  ack();
  
  const userId = await getUserIdFromSlackId(body.user_id);
  const { taskId, duration } = parseSnoozeCommand(body.text);
  
  const newTime = addMinutes(new Date(), parseDuration(duration));
  await updateSchedulingNode(taskId, { start_time: newTime });
  
  await say(`Snoozed for ${duration}. I'll remind you at ${newTime.toLocaleTimeString()}.`);
});

// /status
slackApp.command('/status', async ({ ack, body, say }) => {
  ack();
  
  const userId = await getUserIdFromSlackId(body.user_id);
  const { completionRate, nextTask, upcomingCount } = await getTodayStatus(userId);
  
  await say({
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Your Schedule Status\n\nCompletion: ${completionRate}%\nNext: ${nextTask?.title || 'None'}\nUpcoming: ${upcomingCount} tasks`
        }
      }
    ]
  });
});
```

#### 2.3.2 Reminder Delivery via Slack

```typescript
// server/slack-reminders.server.ts

async function sendSlackReminders(): Promise<void> {
  // Background job (runs every 5 minutes)
  
  const upcomingTasks = await getTasksDueInMinutes(15);  // 15-min lead time
  
  for (const task of upcomingTasks) {
    const integration = await getSlackIntegration(task.user_id);
    
    if (!integration?.is_active || !integration?.allow_reminders_via_slack) {
      continue;
    }
    
    try {
      await slackApp.client.chat.postMessage({
        channel: integration.user_slack_id || integration.reminder_channel_id,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Reminder: *${task.title}*\nStarts: ${formatTime(task.start_time)}`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Start Now' },
                action_id: 'mark_in_progress',
                value: task.id
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Snooze 15m' },
                action_id: 'snooze_15m',
                value: task.id
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Done' },
                action_id: 'mark_complete',
                value: task.id
              }
            ]
          }
        ]
      });
      
      logSlackReminder(task.user_id, task.id, 'sent');
    } catch (error) {
      logSlackReminder(task.user_id, task.id, 'failed', error.message);
    }
  }
}

// Handle button interactions
slackApp.action('mark_complete', async ({ ack, body, client }) => {
  ack();
  
  const taskId = body.actions[0].value;
  const userId = await getUserIdFromSlackId(body.user.id);
  
  await completeTask(userId, taskId);
  
  await client.chat.update({
    channel: body.channel.id,
    ts: body.message.ts,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Task completed! âœ…`
        }
      }
    ]
  });
});
```

---

### 2.4 Email Reminders

**Objective:** Send reminder emails before meetings/tasks.

```typescript
// server/email-reminders.server.ts

import nodemailer from 'nodemailer';

const emailTransport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

async function queueEmailReminders(): Promise<void> {
  // Background job (runs every 1 minute)
  
  const reminders = await getEmailNotificationQueue('pending');
  
  for (const reminder of reminders) {
    const timeTillSend = reminder.send_at.getTime() - Date.now();
    
    if (timeTillSend <= 0) {
      await sendEmail(reminder);
    }
  }
}

async function sendEmail(reminder: EmailNotification): Promise<void> {
  try {
    await emailTransport.sendMail({
      from: process.env.EMAIL_FROM,
      to: reminder.recipient_email,
      subject: reminder.subject,
      html: reminder.html_content
    });
    
    await updateEmailNotification(reminder.id, {
      status: 'sent',
      sent_at: new Date()
    });
  } catch (error) {
    // Retry logic
    if (reminder.retry_count < 3) {
      await updateEmailNotification(reminder.id, {
        retry_count: reminder.retry_count + 1,
        error_message: error.message,
        send_at: addMinutes(new Date(), 5 * reminder.retry_count)  // exponential backoff
      });
    } else {
      await updateEmailNotification(reminder.id, {
        status: 'failed',
        error_message: error.message
      });
    }
  }
}

async function scheduleReminderEmails(userId: string): Promise<void> {
  const settings = await getEmailNotificationSettings(userId);
  const tasks = await getUpcomingTasks(userId, next7Days);
  
  for (const task of tasks) {
    if (settings.enable_task_reminders || (settings.enable_meeting_reminders && task.category === 'meeting')) {
      const sendAt = addMinutes(task.start_time, -settings.reminder_lead_time_minutes);
      
      // Check quiet hours
      if (isInQuietHours(sendAt, settings.quiet_hours_start, settings.quiet_hours_end)) {
        continue;  // Skip reminder in quiet hours
      }
      
      const user = await getUser(userId);
      
      const htmlContent = renderReminderEmail(task, user);
      
      await queueEmailNotification(userId, {
        scheduling_node_id: task.id,
        email_type: 'task_reminder',
        recipient_email: user.email,
        subject: `Reminder: ${task.title}`,
        html_content: htmlContent,
        send_at: sendAt
      });
    }
  }
}

function renderReminderEmail(task: SchedulingNode, user: User): string {
  return `
    <html>
      <body style="font-family: sans-serif; color: #333;">
        <h2>Reminder: ${task.title}</h2>
        <p>Hi ${user.name || 'there'},</p>
        <p>Your task <strong>${task.title}</strong> is scheduled to start in 15 minutes.</p>
        <p>
          <strong>When:</strong> ${formatDateTime(task.start_time)}<br>
          <strong>Duration:</strong> ${task.estimated_duration_minutes} minutes<br>
          ${task.description ? `<strong>Details:</strong> ${task.description}` : ''}
        </p>
        <p style="margin-top: 20px;">
          <a href="${process.env.VERCEL_URL}/schedule/${task.id}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
            View Task
          </a>
        </p>
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          Manage email preferences: <a href="${process.env.VERCEL_URL}/settings/notifications">Update settings</a>
        </p>
      </body>
    </html>
  `;
}
```

---

### 2.5 Analytics Dashboard

**Objective:** Visualize productivity patterns, heatmaps, and recommendations.

```typescript
// components/analytics-dashboard.tsx

interface AnalyticsDashboardProps {
  period: 'week' | 'month' | 'quarter';
}

export function AnalyticsDashboard({ period }: AnalyticsDashboardProps) {
  const { data: insights } = useSuspenseQuery({
    queryKey: ['analytics', 'insights', period],
    queryFn: () => getProductivityInsights(period)
  });
  
  return (
    <div className="grid gap-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          label="Completion Rate"
          value={`${insights.completionRate}%`}
          change="+5% from last period"
        />
        <MetricCard
          label="Time Accuracy"
          value={`${(insights.estimateAccuracy * 100).toFixed(0)}%`}
          subtitle="Estimated vs Actual"
        />
        <MetricCard
          label="Best Productivity Hour"
          value={`${insights.bestHour}:00`}
          subtitle="Highest completion rate"
        />
        <MetricCard
          label="Top Category"
          value={insights.topCategory}
          subtitle={`${insights.categoryMetrics[insights.topCategory]}% completion`}
        />
      </div>
      
      {/* Productivity Heatmap */}
      <Card title="Productivity Heatmap (Last 30 Days)">
        <CompletionHeatmap data={insights.heatmapData} />
      </Card>
      
      {/* Weekly Patterns */}
      <Card title="Weekly Patterns">
        <WeeklyChart data={insights.weeklyData} />
      </Card>
      
      {/* Category Performance */}
      <Card title="Category Performance">
        <CategoryBreakdown categories={insights.categoryMetrics} />
      </Card>
      
      {/* Smart Recommendations */}
      <Card title="Smart Recommendations">
        <RecommendationsList recommendations={insights.recommendations} />
      </Card>
      
      {/* Fatigue Trends */}
      <Card title="Energy & Fatigue Patterns">
        <FatigueChart data={insights.fatigueData} />
      </Card>
    </div>
  );
}

// Heatmap component: hours (Y) x days (X)
function CompletionHeatmap({ data }: { data: Record<string, Record<number, number>> }) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  const maxValue = Math.max(...Object.values(data).flatMap(d => Object.values(d)));
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="w-12">Hour</th>
            {days.map(day => <th key={day} className="text-center">{day}</th>)}
          </tr>
        </thead>
        <tbody>
          {hours.map(hour => (
            <tr key={hour}>
              <td className="font-bold">{`${hour}:00`}</td>
              {days.map(day => {
                const dayKey = day.toLowerCase();
                const value = data[dayKey]?.[hour] || 0;
                const intensity = value / maxValue;
                
                return (
                  <td
                    key={`${day}-${hour}`}
                    className="text-center py-2"
                    style={{
                      backgroundColor: `rgba(59, 130, 246, ${intensity})`,
                      color: intensity > 0.5 ? 'white' : 'black'
                    }}
                    title={`${value} tasks completed`}
                  >
                    {value > 0 ? value : '-'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## 3. Phase 3: Adaptive Learning

### 3.1 Implementation Plan

**Timeline:** Months 1-2 (Weeks 1-8)

**Deliverables:**
1. Database schema for adaptive patterns, hourly performance, recommendations
2. Behavior tracking algorithms (completion rate, time accuracy, postponement)
3. Energy detection (best/worst hours per user)
4. Smart recommendations engine (reschedule, auto-pad, suggest breaks)
5. Analytics dashboard
6. Daily batch job for metrics computation

**Key Features:**
- Historical behavior tracking from scheduling_logs
- Energy pattern detection (rolling 7/30/90-day averages)
- Auto-padding for underestimated tasks (via recommendations)
- Category-specific accuracy tracking
- Fatigue/break suggestions
- Productivity heatmap visualization

**API Endpoints:**
- `GET /api/analytics/insights?period=week|month|quarter`
- `GET /api/recommendations/pending`
- `POST /api/recommendations/:id/accept` (apply recommendation)
- `POST /api/recommendations/:id/dismiss`
- `GET /api/patterns/energy-profile`

---

## 4. New Feature Integrations

### 4.1 Google Calendar (Months 2-3, Weeks 9-12)

**MVP Scope:**
- One-way import of Google Calendar events into Notio
- Bidirectional sync with conflict detection
- Conflict resolution strategies (user override)

**Nice-to-Have:**
- Multi-calendar support
- Recurring event expansion
- Free/busy slot optimization

**Implementation:**
```
Week 9: OAuth setup, token storage, encryption
Week 10: Event import pipeline, conflict detection
Week 11: Event export (Notio â†’ Google)
Week 12: Conflict resolution UI, sync status dashboard
```

### 4.2 Slack (Months 3-4, Weeks 13-16)

**MVP Scope:**
- `/schedule` command (create task from Slack)
- Reminder delivery via Slack messages
- Basic task status commands

**Nice-to-Have:**
- Voice/audio input from Slack thread
- Detailed status dashboard
- Integration with thread replies

**Implementation:**
```
Week 13: Slack OAuth, token storage, app setup
Week 14: Slash commands (schedule, snooze, status)
Week 15: Reminder delivery, message interactions
Week 16: Error handling, logging, UI refinement
```

### 4.3 Email Reminders (Months 2-3, Weeks 9-10)

**MVP Scope:**
- Email notification queue
- SMTP delivery (SendGrid or native)
- Quiet hours support
- Lead time configuration

**Implementation:**
```
Week 9: Email queue schema, SMTP setup, templating
Week 10: Background job, retry logic, delivery tracking
```

### 4.4 Manual Time Threshold UI (Months 1-2, Weeks 3-4)

**MVP Scope:**
- Edit working hours per day
- Preset templates (9-5, 5am-12pm, custom ranges)
- Multiple time blocks per day
- Timezone support

**Implementation:**
```
Week 3: UI component for time picker (React)
Week 4: API endpoint to update user_working_hours, validation
```

---

## 5. Mobile App Architecture

### 5.1 Tech Stack

- **Framework:** React Native (Expo for faster iteration)
- **State:** TanStack Query + Zustand (persistent local state)
- **Offline:** SQLite + WatermelonDB (local sync database)
- **UI:** NativeBase or React Native Paper
- **Push Notifications:** Firebase Cloud Messaging (FCM)

### 5.2 Architecture

```
mobile/
  ios/                    # Xcode project (generated by Expo)
  android/                # Android Studio project (generated by Expo)
  app/
    screens/
      schedule/           # Task list + timeline view
      calendar/           # Day/week/month calendar
      capture/            # Voice/text input
      analytics/          # Insights dashboard
      settings/           # Integrations, working hours
    navigation/
      root-navigator.ts   # Stack + bottom tabs
    components/
      task-card.tsx
      time-picker.tsx
      heatmap.tsx
    hooks/
      use-sync.ts         # Offline sync logic
      use-auth.ts         # Supabase auth
      use-notifications.ts # Push notification handling
    services/
      sync-service.ts     # Conflict resolution, merging
      offline-db.ts       # SQLite operations
    store/
      app.store.ts        # Zustand: auth, tasks, working hours

shared/
  types/                  # Shared TS types with web
  api/                    # Shared API client (Supabase SDK)
  lib/                    # Shared utilities
```

### 5.3 Offline-First Sync Strategy

```typescript
// mobile/services/sync-service.ts

interface SyncOperation {
  id: string;
  entityType: 'task' | 'working_hours' | 'completion';
  operation: 'create' | 'update' | 'delete';
  payload: any;
  timestamp: number;
  synced: boolean;
}

class OfflineSyncService {
  private db: SQLiteDatabase;
  private syncQueue: SyncOperation[] = [];
  
  async scheduleTask(task: Partial<SchedulingNode>): Promise<void> {
    // 1. Save locally to SQLite
    const localId = uuid();
    await this.db.batch([
      ['insert', 'scheduling_nodes', {
        local_id: localId,
        ...task,
        synced: false
      }]
    ]);
    
    // 2. Queue for sync
    this.syncQueue.push({
      id: localId,
      entityType: 'task',
      operation: 'create',
      payload: task,
      timestamp: Date.now(),
      synced: false
    });
    
    // 3. Trigger sync if online
    if (isOnline()) {
      await this.sync();
    }
  }
  
  async sync(): Promise<SyncResult> {
    const pending = await this.db.query('SELECT * FROM sync_queue WHERE synced = false');
    
    for (const op of pending) {
      try {
        const result = await this.syncOperation(op);
        
        if (result.success) {
          // Update local record with server ID
          await this.db.update('scheduling_nodes', {
            server_id: result.serverId,
            synced: true
          }, { local_id: op.id });
          
          await this.db.delete('sync_queue', { id: op.id });
        } else if (result.conflict) {
          // Handle conflict
          await this.handleConflict(op, result.serverVersion);
        }
      } catch (error) {
        // Retry later
        console.error('Sync failed:', error);
      }
    }
  }
  
  private async syncOperation(op: SyncOperation): Promise<SyncOpResult> {
    const { entityType, operation, payload } = op;
    
    switch (entityType) {
      case 'task':
        if (operation === 'create') {
          const { data, error } = await supabase
            .from('scheduling_nodes')
            .insert([payload])
            .select();
          
          return {
            success: !error,
            serverId: data?.[0]?.id,
            error: error?.message
          };
        } else if (operation === 'update') {
          const { data, error } = await supabase
            .from('scheduling_nodes')
            .update(payload)
            .eq('id', op.id)
            .select();
          
          return { success: !error };
        } else if (operation === 'delete') {
          const { error } = await supabase
            .from('scheduling_nodes')
            .delete()
            .eq('id', op.id);
          
          return { success: !error };
        }
    }
  }
  
  private async handleConflict(localOp: SyncOperation, serverVersion: any): Promise<void> {
    // Merge logic: server wins for now, log conflict for user review
    await this.db.update('sync_queue', {
      status: 'conflict',
      conflict_with: JSON.stringify(serverVersion)
    }, { id: localOp.id });
  }
}
```

### 5.4 Push Notifications

```typescript
// mobile/hooks/use-notifications.ts

export function useNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string>();
  
  useEffect(() => {
    registerForPushNotifications();
    
    // Listen for notifications
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      handleNotification(notification);
    });
    
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      handleNotificationResponse(response);
    });
    
    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, []);
  
  async function registerForPushNotifications() {
    const { status } = await Notifications.requestPermissionsAsync();
    
    if (status === 'granted') {
      const token = (await Notifications.getExpoPushTokenAsync()).data;
      setExpoPushToken(token);
      
      // Register device with backend
      await registerDevice({
        device_id: Constants.deviceId,
        push_token: token,
        device_type: Platform.OS,
        app_version: Constants.expoVersion
      });
    }
  }
  
  async function handleNotification(notification: Notifications.Notification) {
    const { taskId, type } = notification.request.content.data;
    
    // Update local store
    if (type === 'task_reminder') {
      // Highlight task in UI
    } else if (type === 'sync_needed') {
      // Trigger sync
    }
  }
  
  async function handleNotificationResponse(response: Notifications.NotificationResponse) {
    const { taskId, action } = response.notification.request.content.data;
    
    if (response.actionIdentifier === 'start') {
      await markTaskInProgress(taskId);
    } else if (response.actionIdentifier === 'complete') {
      await completeTask(taskId);
    }
  }
}
```

---

## 6. Offline Mode Implementation

### 6.1 LocalStorage + IndexedDB Sync Queue

```typescript
// lib/offline-sync.ts

interface OfflineChange {
  id: string;
  timestamp: number;
  entity: 'task' | 'working_hours' | 'completion';
  operation: 'create' | 'update' | 'delete';
  data: any;
  synced: boolean;
}

class OfflineSyncManager {
  private db: IDBDatabase;
  
  async initialize(): Promise<void> {
    const request = indexedDB.open('Notio', 1);
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains('changes')) {
        db.createObjectStore('changes', { keyPath: 'id' });
      }
      
      if (!db.objectStoreNames.contains('tasks')) {
        const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
        taskStore.createIndex('user_id', 'user_id');
      }
    };
    
    this.db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async queueChange(change: OfflineChange): Promise<void> {
    const tx = this.db.transaction(['changes'], 'readwrite');
    const store = tx.objectStore('changes');
    
    await store.add({
      ...change,
      id: `${change.entity}_${change.operation}_${Date.now()}`
    });
  }
  
  async getPendingChanges(): Promise<OfflineChange[]> {
    const tx = this.db.transaction(['changes'], 'readonly');
    const store = tx.objectStore('changes');
    const index = store.index('synced');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(false);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  async markSynced(changeId: string): Promise<void> {
    const tx = this.db.transaction(['changes'], 'readwrite');
    const store = tx.objectStore('changes');
    
    const change = await store.get(changeId);
    change.synced = true;
    
    await store.put(change);
  }
  
  async cacheTask(task: SchedulingNode): Promise<void> {
    const tx = this.db.transaction(['tasks'], 'readwrite');
    const store = tx.objectStore('tasks');
    
    await store.put(task);
  }
  
  async getCachedTasks(userId: string): Promise<SchedulingNode[]> {
    const tx = this.db.transaction(['tasks'], 'readonly');
    const store = tx.objectStore('tasks');
    const index = store.index('user_id');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

// Integrate with sync
async function syncWhenOnline(): Promise<void> {
  if (!navigator.onLine) return;
  
  const offline = new OfflineSyncManager();
  const pending = await offline.getPendingChanges();
  
  for (const change of pending) {
    try {
      const result = await supabase.rpc('sync_offline_change', {
        change_id: change.id,
        entity_type: change.entity,
        operation: change.operation,
        data: change.data
      });
      
      if (result.error) throw result.error;
      
      await offline.markSynced(change.id);
    } catch (error) {
      console.error(`Failed to sync ${change.id}:`, error);
      // Retry on next sync
    }
  }
}

// Listen for online/offline
window.addEventListener('online', syncWhenOnline);
window.addEventListener('offline', () => {
  // UI can indicate offline mode
});
```

---

## 7. Architecture Diagrams

### 7.1 System Architecture

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                      User's Devices                              â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”          â”‚
â”‚  â”‚   Web App    â”‚  â”‚  Mobile App  â”‚  â”‚  Slack       â”‚          â”‚
â”‚  â”‚  (React 19)  â”‚  â”‚(React Native)â”‚  â”‚  (via API)   â”‚          â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚                 â”‚                  â”‚
         â”‚ HTTP/WS         â”‚ HTTPS            â”‚ Webhooks
         â”‚                 â”‚                  â”‚
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚              Notio Backend (Vercel Edge + Nitro)                 â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚          TanStack Start (React 19 Full-Stack)             â”‚  â”‚
â”‚  â”‚  - Server Functions (lib/scheduling.functions.ts, etc.)   â”‚  â”‚
â”‚  â”‚  - API Routes (server/slack-*, server/google-*, etc.)     â”‚  â”‚
â”‚  â”‚  - Auth Middleware (Supabase auth validation)             â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚          Background Jobs (Cron via Vercel)                â”‚  â”‚
â”‚  â”‚  - updateDailyBehaviorMetrics (11:59 PM)                  â”‚  â”‚
â”‚  â”‚  - generateDailyRecommendations (7:00 AM)                 â”‚  â”‚
â”‚  â”‚  - sendEmailReminders (every 1 min)                       â”‚  â”‚
â”‚  â”‚  - sendSlackReminders (every 5 min)                       â”‚  â”‚
â”‚  â”‚  - syncCalendarEvents (every 30 min)                      â”‚  â”‚
â”‚  â”‚  - processSyncQueue (every 2 min)                         â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚
â”‚  â”‚          AI Engine (Anthropic Claude Haiku)               â”‚  â”‚
â”‚  â”‚  - structureThought() - voice â†’ mindmap                   â”‚  â”‚
â”‚  â”‚  - extractSchedulingTasks() - text â†’ scheduling_nodes     â”‚  â”‚
â”‚  â”‚  - generateRecommendations() - patterns â†’ suggestions     â”‚  â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”˜
         â”‚                                      â”‚               â”‚
         â”‚ SQL                    REST/GraphQL  â”‚ Webhooks      â”‚
         â”‚                                      â”‚               â”‚
    â”Œâ”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”
    â”‚  Supabase     â”‚    â”‚  External Services     â”‚    â”‚  Message  â”‚
    â”‚  PostgreSQL   â”‚    â”‚  - Google Calendar     â”‚    â”‚  Queue    â”‚
    â”‚  - All tables â”‚    â”‚  - Slack               â”‚    â”‚  (Redis?) â”‚
    â”‚  - RLS        â”‚    â”‚  - Email (SendGrid)    â”‚    â”‚           â”‚
    â”‚  - Realtime   â”‚    â”‚                        â”‚    â”‚           â”‚
    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 7.2 Data Flow: Task Creation â†’ Completion

```
Voice Input / Type
       â”‚
       â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ structureThought() [Claude] â”‚  â† AI extraction
â”‚ (extracts title, time,      â”‚
â”‚  duration, category)        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
       â”‚
       â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ validateAgainstWorkingHoursâ”‚  â† Conflict detection
â”‚ (checks working_hours,      â”‚
â”‚  schedule_exceptions)       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
       â”‚
       â”œâ”€ Conflicts? â”€â”€â†’ Suggest rescheduling
       â”‚
       â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Create scheduling_node      â”‚
â”‚ (save to Supabase)          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
       â”‚
       â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ log scheduling_log 'created'â”‚  â† Audit trail
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
       â”‚
       â”œâ”€â”€â†’ Export to Google Calendar (if integrated)
       â”‚
       â””â”€â”€â†’ Queue email reminder (if enabled)
              (stored in email_notification_queue, sent by bg job)
              
       [User sees task in timeline/calendar]
              â”‚
              â–¼
       [User marks task in_progress / complete]
              â”‚
              â–¼
       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
       â”‚ Update scheduling_node      â”‚
       â”‚ (status, actual_duration)   â”‚
       â”‚ Record completion_at        â”‚
       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
              â”‚
              â–¼
       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
       â”‚ log scheduling_log 'completed'
       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
              â”‚
              â–¼
       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
       â”‚ updateDailyBehaviorMetrics  â”‚  â† Nightly job
       â”‚ (compute completion_rate,   â”‚
       â”‚  time_accuracy, etc.)       â”‚
       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
              â”‚
              â–¼
       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
       â”‚ detectEnergyPatterns()      â”‚  â† Weekly job
       â”‚ (aggregate by hour/day)     â”‚
       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
              â”‚
              â–¼
       â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
       â”‚ generateSmartRecommendationsâ”‚  â† Daily job
       â”‚ (reschedule, auto-pad,      â”‚
       â”‚  suggest breaks)            â”‚
       â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 7.3 Offline Sync Flow (Mobile)

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ User offline â”‚
â”‚ (no internet)â”‚
â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”˜
       â”‚
       â–¼
   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
   â”‚ User creates task on mobile â”‚
   â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
          â”‚
          â–¼
   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
   â”‚ Save to local SQLite DB        â”‚
   â”‚ (task gets local_id UUID)      â”‚
   â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
          â”‚
          â–¼
   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
   â”‚ Queue change to sync_queue     â”‚
   â”‚ { entity: 'task', op: 'create' }
   â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
          â”‚
   [User continues working offline]
   [Can view, edit, complete tasks  ]
   [from local cache]
          â”‚
          â–¼
   [User comes online]
          â”‚
          â–¼
   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
   â”‚ Detect online (navigator.onLine)
   â”‚ Trigger sync()                 â”‚
   â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
          â”‚
          â–¼
   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
   â”‚ Fetch pending changes from     â”‚
   â”‚ sync_queue                     â”‚
   â””â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
          â”‚
          â–¼
          â”‚ For each pending change:
          â”‚
          â”œâ”€â†’ Create: POST /api/scheduling/create
          â”‚           â†“
          â”‚        Server creates & returns server_id
          â”‚           â†“
          â”‚        Update local DB: local_id â†’ server_id
          â”‚           â†“
          â”‚        Mark synced=true in sync_queue
          â”‚
          â”œâ”€â†’ Update: PATCH /api/scheduling/:id
          â”‚           â†“
          â”‚        Check for conflicts (server version changed?)
          â”‚           â†“
          â”‚        If conflict: merge or prompt user
          â”‚           â†“
          â”‚        Mark synced=true
          â”‚
          â””â”€â†’ Delete: DELETE /api/scheduling/:id
                      â†“
                   Server deletes
                      â†“
                   Delete from local DB
                      â†“
                   Mark synced=true
          â”‚
          â–¼
   â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
   â”‚ Sync complete                  â”‚
   â”‚ UI reflects server state       â”‚
   â”‚ Notifications caught up        â”‚
   â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## 8. Phased Rollout Plan

### Phase 3: Adaptive Learning (Months 1-2, Weeks 1-8)

**Goals:**
- Learn from user behavior over time
- Auto-pad tasks based on historical accuracy
- Detect energy patterns (best/worst hours)
- Surface smart recommendations

**Milestones:**

| Week | Deliverable | Status |
|------|-------------|--------|
| 1 | Database schema (adaptive_patterns, hourly_performance, smart_recommendations) | Design |
| 2 | Behavior tracking algorithms (completion rate, accuracy, postponement) | Implementation |
| 3 | Energy pattern detection (hourly/daily aggregation) | Implementation |
| 4 | Smart recommendations engine (reschedule, auto-pad, break suggestion) | Implementation |
| 5 | Analytics dashboard (heatmap, weekly patterns, category breakdown) | Implementation |
| 6 | Daily/weekly batch jobs (update metrics, generate recommendations) | Implementation |
| 7 | Testing, optimization, edge cases | QA |
| 8 | Release Phase 3 (internal beta, monitoring) | Soft Launch |

**Deliverables:**
- [x] Database migrations (4 new tables)
- [x] Behavior tracking logic (daily metrics compute)
- [x] Energy detection (hourly performance aggregation)
- [x] Recommendations engine (5 recommendation types)
- [x] Analytics UI (dashboard with charts)
- [x] Cron jobs (via Vercel's cron)

**Team Effort:**
- Backend: 40 hours (APIs, batch jobs, algorithms)
- Frontend: 30 hours (Analytics UI, recommendation display)
- QA: 10 hours
- Total: 80 hours (~2 weeks full-time)

---

### Phase 4A: Google Calendar + Email + Manual Hours (Months 2-3, Weeks 9-12)

**Goals:**
- Sync with Google Calendar (bidirectional)
- Send email reminders before tasks
- UI for editing working hours

**Milestones:**

| Week | Deliverable | Status |
|------|-------------|--------|
| 9 | Google Calendar OAuth, token storage, encryption | Implementation |
| 10 | Calendar event import, conflict detection | Implementation |
| 11 | Calendar event export (Notio â†’ Google) | Implementation |
| 12 | Email reminders queue, SMTP setup, UI polish | Implementation |
| 9 (parallel) | Manual time threshold UI (preset templates + custom) | Implementation |
| 10 (parallel) | API endpoint for updating working_hours | Implementation |

**Deliverables:**
- [x] `calendar_integrations` table
- [x] Google OAuth flow + token management
- [x] Calendar sync bidirectional engine
- [x] `email_notification_*` tables
- [x] Email queue & SMTP delivery
- [x] Manual working hours UI
- [x] Time threshold presets (9-5, early, custom)

**Team Effort:**
- Backend: 50 hours (OAuth, sync, email)
- Frontend: 25 hours (Calendar UI, time picker)
- QA: 15 hours
- Total: 90 hours (~2.3 weeks full-time)

**External Dependencies:**
- Google Cloud project (OAuth credentials)
- SMTP provider (SendGrid, Mailgun, or native)

---

### Phase 4B: Slack Integration (Months 3-4, Weeks 13-16)

**Goals:**
- Schedule tasks directly from Slack
- Receive reminders via Slack
- Quick task completion actions from Slack

**Milestones:**

| Week | Deliverable | Status |
|------|-------------|--------|
| 13 | Slack app setup, OAuth, token storage | Implementation |
| 14 | Slash commands (/schedule, /snooze, /status) | Implementation |
| 15 | Reminder delivery via Slack, button interactions | Implementation |
| 16 | Logging, error handling, UI refinement | QA |

**Deliverables:**
- [x] `slack_integrations` + `slack_commands_log` tables
- [x] Slack app manifest & OAuth flow
- [x] Slash command handlers
- [x] Message actions (complete, snooze, start)
- [x] Reminder delivery via Slack API
- [x] Interactive button handling

**Team Effort:**
- Backend: 35 hours (OAuth, commands, webhooks)
- Frontend: 10 hours (Slack connect flow)
- QA: 10 hours
- Total: 55 hours (~1.4 weeks full-time)

**External Dependencies:**
- Slack workspace (for testing)
- Slack app credentials

---

### Phase 5: Mobile App (Months 4-5, Weeks 17-20)

**Goals:**
- iOS/Android native apps with offline support
- Push notifications
- Sync queue for offline changes

**Milestones:**

| Week | Deliverable | Status |
|------|-------------|--------|
| 17 | React Native setup (Expo), project structure, auth flow | Implementation |
| 18 | Offline DB setup (SQLite/WatermelonDB), sync queue | Implementation |
| 19 | Core screens (schedule, calendar, capture, settings) | Implementation |
| 20 | Push notifications, sync engine, testing | QA |

**Deliverables:**
- [x] React Native project (Expo)
- [x] Offline database schema (SQLite)
- [x] Sync queue & conflict resolution
- [x] Mobile screens (Schedule, Calendar, Capture, Analytics, Settings)
- [x] Push notification setup (FCM)
- [x] Device registration tracking

**Team Effort:**
- Mobile: 60 hours (setup, screens, sync)
- Backend: 15 hours (sync API, push setup)
- QA: 20 hours
- Total: 95 hours (~2.4 weeks full-time)

**External Dependencies:**
- Apple Developer account (for iOS)
- Google Play account (for Android)
- Firebase project (for FCM)

---

### Phase 6: Offline Mode & Polish (Month 6, Weeks 21-24)

**Goals:**
- Full offline support for web and mobile
- Sync conflict resolution UI
- Analytics export (PDF/CSV)
- Performance optimization

**Milestones:**

| Week | Deliverable | Status |
|------|-------------|--------|
| 21 | IndexedDB setup, offline change tracking | Implementation |
| 22 | Sync conflict UI, user resolution | Implementation |
| 23 | Analytics export, advanced filtering | Implementation |
| 24 | Performance tuning, final QA, release | Release |

**Deliverables:**
- [x] IndexedDB for offline change queueing
- [x] Conflict detection & resolution UI
- [x] PDF/CSV export of analytics
- [x] Advanced filtering & search
- [x] Performance optimization (bundle size, API calls)
- [x] Documentation & help center

**Team Effort:**
- Backend: 10 hours (export APIs)
- Frontend: 40 hours (offline UI, export, filtering)
- QA: 15 hours
- Total: 65 hours (~1.6 weeks full-time)

---

### Release Schedule

```
Jun 2026: Phase 3 (Adaptive Learning) âœ“ Target
Jul 2026: Phase 4A (Google Calendar + Email + Manual Hours)
Aug 2026: Phase 4B (Slack Integration)
Sep 2026: Phase 5 (Mobile App) + Phase 4A/4B refinement
Oct 2026: Phase 6 (Offline Mode + Polish)
Nov 2026: General Availability (GA), marketing launch
```

---

## 9. Effort Estimates

### Summary Table

| Phase | Feature | Backend (hrs) | Frontend (hrs) | QA (hrs) | Total | Duration |
|-------|---------|---------------|----------------|---------|-------|----------|
| 3 | Adaptive Learning | 40 | 30 | 10 | 80 | 2 weeks |
| 4A | Google Calendar | 30 | 25 | 10 | 65 | 1.5 weeks |
| 4A | Email Reminders | 15 | 5 | 5 | 25 | 0.5 weeks |
| 4A | Manual Hours UI | 5 | 10 | 5 | 20 | 0.5 weeks |
| 4B | Slack Integration | 35 | 10 | 10 | 55 | 1.5 weeks |
| 5 | Mobile App | 15 | 60 | 20 | 95 | 2.5 weeks |
| 6 | Offline + Export | 10 | 40 | 15 | 65 | 1.5 weeks |
| **Total** | â€” | **150** | **180** | **75** | **405** | **6 months** |

### Team Composition

**Option A: Lean Team (1 Backend + 1 Frontend)**
- 1 Full-stack engineer (backend + infra): 200 hours
- 1 Frontend/Mobile engineer: 180 hours
- 1 QA/DevOps (part-time): 75 hours
- **Total: 6 months at 40 hrs/week** âœ“

**Option B: Faster Delivery (2 Backend + 2 Frontend)**
- 2 Backend engineers: 150 hours total (~4-5 weeks each)
- 2 Frontend/Mobile engineers: 180 hours total (~4-5 weeks each)
- 1 QA engineer (full-time): 75 hours
- **Timeline: 4-5 months**

**Option C: Maximum Velocity (2 Backend + 2 Frontend + 1 Mobile)**
- 2 Backend engineers: 150 hours
- 2 Frontend engineers: 120 hours (Google Calendar, Email, Manual Hours)
- 1 React Native engineer: 60 hours (Mobile)
- 1 QA engineer: 75 hours
- **Timeline: 3-4 months**

---

## 10. Critical Path & Dependencies

### Dependency Graph

```
Phase 3: Adaptive Learning (independent)
    â”‚
    â”œâ”€ must complete before Phase 4A/4B recommendations can be shown
    â”‚
    â–¼
Phase 4A: Google Calendar + Email (independent)
    â”‚
    â”œâ”€ Manual Hours UI (prerequisite for Calendar conflict resolution)
    â”‚
    â–¼
Phase 4B: Slack Integration (depends on Phase 3)
    â”‚
    â”œâ”€ Slack reminders use Phase 3 scheduling logic
    â”œâ”€ Slack commands create scheduling_nodes (existing)
    â”‚
    â–¼
Phase 5: Mobile App (depends on Phase 3 APIs)
    â”‚
    â”œâ”€ Mobile uses same backend APIs as web
    â”œâ”€ Offline sync (Phase 6) is separate concern
    â”‚
    â–¼
Phase 6: Offline Mode (post-MVP)
    â”‚
    â””â”€ Only critical for mobile; web version optional
```

### Critical Path (Fastest Delivery)

```
Week 1-8:   Phase 3 (Adaptive Learning) â† CRITICAL, blocks recommendations
Week 9-12:  Phase 4A (Google Calendar + Manual Hours) || Phase 4B setup
Week 13-16: Phase 4B (Slack) || Phase 5 foundations
Week 17-20: Phase 5 (Mobile App)
Week 21-24: Phase 6 (Offline) + final polish + GA
```

### Blockers & Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Claude API rate limits (many recommendations computed) | High | Batch job tuning, caching, quota increase with Anthropic |
| Google Calendar sync complexity (recurring events, timezones) | Medium | Start with simple events, add recurring later, thorough testing |
| Slack message rate limits / unfriendly UX | Medium | Rate limiting on client, friendly error messages, retry logic |
| Mobile app testing (iOS + Android) | Medium | Use Expo for code sharing, start with Android-only beta, add iOS later |
| Offline sync conflict handling (complex edge cases) | High | Extensive QA, user documentation, server-wins default strategy |
| Email deliverability (spam filters) | Low | Use reputable SMTP (SendGrid), proper headers, monitoring |

---

## 11. Go-Live Checklist

### Pre-Launch (4 weeks before)

- [ ] **Architecture Review:** Security review of OAuth flows (Google, Slack)
- [ ] **Data Privacy:** Privacy impact assessment for analytics tracking
- [ ] **Compliance:** GDPR/CCPA implications for data retention
- [ ] **Testing:**
  - [ ] Load testing (1000 concurrent users, 100k tasks in DB)
  - [ ] Stress testing email queue (1000 emails/min)
  - [ ] Calendar sync with 100+ overlapping events
  - [ ] Offline sync with 50+ pending changes
  - [ ] Mobile app on real devices (iPhone + Android)
- [ ] **Monitoring:**
  - [ ] DataDog/Sentry setup (error tracking)
  - [ ] Custom metrics: recommendation accuracy, sync success rate, email bounce rate
  - [ ] Alerts for critical failures

### 2 Weeks Before

- [ ] **Documentation:**
  - [ ] API docs (Swagger/OpenAPI for new endpoints)
  - [ ] User guide for each feature (video + written)
  - [ ] Admin/support runbook (how to debug calendar conflicts, email failures, etc.)
  - [ ] Migration guide (for Phase 1 users to Phase 3)
- [ ] **Infrastructure:**
  - [ ] Vercel cron jobs scheduled + tested
  - [ ] Database backups configured (daily)
  - [ ] Disaster recovery plan documented
- [ ] **Security:**
  - [ ] Secrets rotation (Anthropic API key, Slack token, SMTP password)
  - [ ] CORS/CSRF checks
  - [ ] Rate limiting on public endpoints
  - [ ] Encrypted storage of OAuth tokens

### 1 Week Before

- [ ] **Beta Launch (closed group, 50-100 users):**
  - [ ] Invite power users
  - [ ] Monitor error rates, response times
  - [ ] Collect feedback on UX (especially recommendations, calendar conflicts)
  - [ ] Fix critical bugs
- [ ] **Performance Baseline:**
  - [ ] Web dashboard load time < 2 sec
  - [ ] Mobile app cold start < 3 sec
  - [ ] Sync latency < 5 sec (average)
  - [ ] Email delivery < 1 min
- [ ] **Communication:**
  - [ ] Announce feature release on marketing channels
  - [ ] Prepare in-app onboarding (feature walkthrough)
  - [ ] Support team trained on new features

### Launch Day

- [ ] **Deployment:**
  - [ ] Code merged to `main`, deployed to production
  - [ ] Database migrations applied to production
  - [ ] Vercel cron jobs active
  - [ ] Analytics events firing (test user journey end-to-end)
- [ ] **Monitoring:**
  - [ ] Dashboards live (errors, latency, sync queue length, email queue depth)
  - [ ] Alerts enabled (error spike, latency spike, sync failures)
  - [ ] On-call engineer standing by (first 24 hours)
- [ ] **Rollout:**
  - [ ] Soft launch: 10% of users (feature flag `phase3_enabled`)
  - [ ] Monitor for 1 hour, check error rates
  - [ ] Expand to 50% of users
  - [ ] Full rollout if no critical issues
- [ ] **Support:**
  - [ ] Help documentation updated
  - [ ] Support team monitoring tickets
  - [ ] Feedback collection (survey, in-app feedback)

### Post-Launch (Week 1)

- [ ] **Monitoring:**
  - [ ] Daily review of error logs, performance metrics
  - [ ] Recommendation accuracy analysis (are users accepting recommendations?)
  - [ ] Calendar sync success rate (any persistent conflicts?)
  - [ ] Email bounce rate (should be < 1%)
- [ ] **Bug Fixes:**
  - [ ] Prioritize and fix any high-severity bugs
  - [ ] Patch deployment if needed
- [ ] **Metrics:**
  - [ ] Track adoption (% of users who connected Calendar, enabled Email, etc.)
  - [ ] Feature usage (% accepting recommendations, avg tasks per day)
  - [ ] User satisfaction (NPS, feature rating)

### Post-Launch (Month 1)

- [ ] **Optimization:**
  - [ ] Batch job performance tuning (recommendation generation time)
  - [ ] Cache frequently accessed patterns
  - [ ] Optimize Calendar sync (reduce API calls)
- [ ] **Iteration:**
  - [ ] Gather user feedback, prioritize improvements
  - [ ] A/B test recommendation wording (are some types accepted more?)
  - [ ] Plan Phase 4B (Slack) with learnings from Phase 3/4A
- [ ] **Documentation:**
  - [ ] Update CLAUDE.md with new schema, APIs, deployment notes
  - [ ] Document common issues and solutions

---

## Appendix: SQL Boilerplate

### Create Adaptive Patterns Table

```sql
-- This migration should go in supabase/migrations/20260701000000_adaptive_patterns.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.adaptive_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Historical accuracy (computed daily)
  completion_rate_7d DECIMAL(5, 2) DEFAULT 0,
  completion_rate_30d DECIMAL(5, 2) DEFAULT 0,
  
  -- Time estimation accuracy
  estimate_accuracy_ratio DECIMAL(5, 2) DEFAULT 1.0,
  underestimate_percent DECIMAL(5, 2) DEFAULT 0,
  
  -- Postponement patterns
  postponement_rate_7d DECIMAL(5, 2) DEFAULT 0,
  avg_postponement_count DECIMAL(5, 2) DEFAULT 0,
  
  -- Energy patterns
  best_hour_of_day INTEGER,
  worst_hour_of_day INTEGER,
  energy_dips JSONB DEFAULT '{}',
  
  -- Weekly patterns
  best_day_of_week TEXT,
  worst_day_of_week TEXT,
  
  -- Category metrics
  category_completion_rates JSONB DEFAULT '{}',
  category_time_accuracy JSONB DEFAULT '{}',
  
  -- Auto-padding
  suggested_padding_multiplier DECIMAL(3, 2) DEFAULT 1.1,
  category_padding_multipliers JSONB DEFAULT '{}',
  
  -- Fatigue
  avg_daily_task_load INTEGER,
  fatigue_threshold_hours DECIMAL(4, 1),
  
  last_pattern_update TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adaptive_patterns_user_id ON public.adaptive_patterns(user_id);

ALTER TABLE public.adaptive_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own patterns"
  ON public.adaptive_patterns
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can update patterns"
  ON public.adaptive_patterns
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMIT;
```

### Scheduled Batch Jobs (Vercel Cron)

```typescript
// server/cron-jobs.ts

import { json } from '@vercel/web-sdk';

// Runs daily at 11:59 PM
export const POST_cron_update_daily_metrics = async (req: Request) => {
  const auth = req.headers.get('Authorization');
  
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const users = await getAllActiveUsers();
    
    for (const user of users) {
      await updateDailyBehaviorMetrics(user.id);
    }
    
    return json({ success: true, usersProcessed: users.length });
  } catch (error) {
    console.error('Daily metrics cron failed:', error);
    return json({ error: error.message }, { status: 500 });
  }
};

// Runs every 6 hours
export const POST_cron_generate_recommendations = async (req: Request) => {
  const auth = req.headers.get('Authorization');
  
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const users = await getAllActiveUsers();
    
    for (const user of users) {
      await generateDailyRecommendations(user.id);
    }
    
    return json({ success: true, usersProcessed: users.length });
  } catch (error) {
    console.error('Recommendations cron failed:', error);
    return json({ error: error.message }, { status: 500 });
  }
};

// Runs every 1 minute
export const POST_cron_send_email_reminders = async (req: Request) => {
  const auth = req.headers.get('Authorization');
  
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    const pending = await getEmailNotificationQueue('pending');
    let sent = 0;
    let failed = 0;
    
    for (const email of pending) {
      const result = await sendEmail(email);
      if (result.success) sent++; else failed++;
    }
    
    return json({ success: true, sent, failed });
  } catch (error) {
    console.error('Email cron failed:', error);
    return json({ error: error.message }, { status: 500 });
  }
};
```

In `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/update-daily-metrics",
      "schedule": "59 23 * * *"
    },
    {
      "path": "/api/cron/generate-recommendations",
      "schedule": "0 */6 * * *"
    },
    {
      "path": "/api/cron/send-email-reminders",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

---

## Summary

This roadmap provides a complete 6-month plan to evolve Notio from a basic scheduler into a comprehensive, AI-assisted SaaS platform with:

**Core Capabilities:**
- Phase 3: Adaptive learning from behavior (completion rates, energy patterns, auto-padding)
- Phase 4A: Google Calendar bidirectional sync, email reminders, manual working hours adjustment
- Phase 4B: Slack integration for task creation and reminders
- Phase 5: Native iOS/Android mobile app with offline support
- Phase 6: Full offline mode with sync conflict resolution

**Key Metrics:**
- 405 total hours of engineering work
- 6-month timeline (with lean team) or 3-4 months (with 5-person team)
- 11 new database tables
- 4 major integrations (Google, Slack, Email, Mobile)
- 30+ new API endpoints
- 5 new scheduled background jobs

**Go-Live Readiness:**
- Comprehensive testing checklist
- Monitoring & alerting setup
- Beta launch plan (50-100 users)
- Feature flags for safe rollout
- Disaster recovery & backups

The plan is designed for incremental delivery: Phase 3 provides the foundation (recommendations), Phase 4A/4B add ecosystem integrations, Phase 5 expands to mobile, and Phase 6 adds offline resilience. Each phase is independently testable and can be released to users when ready.

