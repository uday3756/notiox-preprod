/**
 * Feature 1 — Wind-down time + weekly-report-day editor (collapsible section
 * in Profile). Reuses the same Supabase row as WorkingHoursEditor
 * (user_working_hours), so the user's timezone + wind-down time live together.
 *
 * Wind-down time is in the user's local timezone (the `timezone` column on the
 * same row). The weekly-report-day controls when the cron job generates the
 * user's reflection (Feature 2).
 */
import { useEffect, useState } from "react";
import { Moon, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DAYS = [
  { value: "sunday", label: "Sunday" },
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
] as const;

export function WindDownEditor() {
  const [hour, setHour] = useState(21);
  const [minute, setMinute] = useState(0);
  const [reportDay, setReportDay] = useState<string>("sunday");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("user_working_hours")
        .select("wind_down_hour, wind_down_minute, weekly_report_day")
        .maybeSingle();
      if (data) {
        setHour(data.wind_down_hour ?? 21);
        setMinute(data.wind_down_minute ?? 0);
        setReportDay(data.weekly_report_day ?? "sunday");
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in.");
      // Upsert: the row may not exist yet for a brand-new user.
      const { error } = await supabase
        .from("user_working_hours")
        .upsert(
          {
            user_id: u.user.id,
            wind_down_hour: hour,
            wind_down_minute: minute,
            weekly_report_day: reportDay,
          },
          { onConflict: "user_id" },
        );
      if (error) throw error;
      toast.success("Wind-down time saved");
      setExpanded(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // Format the time input as HH:MM for the <input type="time"> control.
  const timeValue = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-start justify-between">
        <div className="text-left">
          <div className="mb-2 flex items-center gap-2">
            <Moon className="h-4 w-4 text-primary" />
            <p className="font-display text-lg font-semibold">Wind-down & Weekly Report</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Daily 3-wins reminder at <span className="font-medium text-foreground">{timeValue}</span> ·
            weekly report on <span className="font-medium text-foreground">{reportDay}</span>
          </p>
        </div>
        <span className="text-xs text-muted-foreground">{expanded ? "▼" : "▶"}</span>
      </button>

      {expanded && (
        <div className="mt-6 space-y-4 border-t border-border pt-4">
          <div>
            <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">
              Daily wind-down time
            </label>
            <Input
              type="time"
              value={timeValue}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                setHour(h ?? 21);
                setMinute(m ?? 0);
              }}
              className="w-32 text-sm"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              When the 3-wins reminder fires (your local time).
            </p>
          </div>

          <div>
            <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">
              Weekly reflection day
            </label>
            <Select value={reportDay} onValueChange={setReportDay}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              When your weekly reflection report is generated.
            </p>
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save Changes
          </button>
        </div>
      )}
    </div>
  );
}
