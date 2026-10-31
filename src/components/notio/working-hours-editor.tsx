import { useState, useEffect } from "react";
import { Clock, Globe, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useSupabaseAuth } from "@/hooks/use-auth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { timezoneSelectOptions } from "@/lib/timezones";

interface WorkingHoursData {
  timezone: string;
  workingDays: {
    monday: { enabled: boolean; start: string; end: string };
    tuesday: { enabled: boolean; start: string; end: string };
    wednesday: { enabled: boolean; start: string; end: string };
    thursday: { enabled: boolean; start: string; end: string };
    friday: { enabled: boolean; start: string; end: string };
    saturday: { enabled: boolean; start: string; end: string };
    sunday: { enabled: boolean; start: string; end: string };
  };
  breakStartTime: string;
  breakDurationMinutes: number;
}

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const DEFAULT_WORKING_HOURS: WorkingHoursData = {
  timezone: "UTC",
  workingDays: {
    monday: { enabled: true, start: "09:00", end: "17:00" },
    tuesday: { enabled: true, start: "09:00", end: "17:00" },
    wednesday: { enabled: true, start: "09:00", end: "17:00" },
    thursday: { enabled: true, start: "09:00", end: "17:00" },
    friday: { enabled: true, start: "09:00", end: "17:00" },
    saturday: { enabled: false, start: "09:00", end: "17:00" },
    sunday: { enabled: false, start: "09:00", end: "17:00" },
  },
  breakStartTime: "12:00",
  breakDurationMinutes: 60,
};

export function WorkingHoursEditor() {
  const { supabase } = useSupabaseAuth();
  const [data, setData] = useState<WorkingHoursData>(DEFAULT_WORKING_HOURS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    loadWorkingHours();
  }, []);

  const loadWorkingHours = async () => {
    if (!supabase) return;

    try {
      const { data: workingHours } = await supabase
        .from("user_working_hours")
        .select("*")
        .maybeSingle();

      if (workingHours) {
        setData({
          timezone: workingHours.timezone || "UTC",
          workingDays: {
            monday: {
              enabled: workingHours.monday_start !== null,
              start: workingHours.monday_start || "09:00",
              end: workingHours.monday_end || "17:00",
            },
            tuesday: {
              enabled: workingHours.tuesday_start !== null,
              start: workingHours.tuesday_start || "09:00",
              end: workingHours.tuesday_end || "17:00",
            },
            wednesday: {
              enabled: workingHours.wednesday_start !== null,
              start: workingHours.wednesday_start || "09:00",
              end: workingHours.wednesday_end || "17:00",
            },
            thursday: {
              enabled: workingHours.thursday_start !== null,
              start: workingHours.thursday_start || "09:00",
              end: workingHours.thursday_end || "17:00",
            },
            friday: {
              enabled: workingHours.friday_start !== null,
              start: workingHours.friday_start || "09:00",
              end: workingHours.friday_end || "17:00",
            },
            saturday: {
              enabled: workingHours.saturday_start !== null,
              start: workingHours.saturday_start || "09:00",
              end: workingHours.saturday_end || "17:00",
            },
            sunday: {
              enabled: workingHours.sunday_start !== null,
              start: workingHours.sunday_start || "09:00",
              end: workingHours.sunday_end || "17:00",
            },
          },
          breakStartTime: workingHours.break_start_time || "12:00",
          breakDurationMinutes: workingHours.break_duration_minutes || 60,
        });
      }
    } catch (err) {
      console.error("Error loading working hours:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDayToggle = (day: typeof DAYS[number]) => {
    setData((prev) => ({
      ...prev,
      workingDays: {
        ...prev.workingDays,
        [day]: {
          ...prev.workingDays[day],
          enabled: !prev.workingDays[day].enabled,
        },
      },
    }));
  };

  const handleTimeChange = (
    day: typeof DAYS[number],
    field: "start" | "end",
    value: string
  ) => {
    setData((prev) => ({
      ...prev,
      workingDays: {
        ...prev.workingDays,
        [day]: {
          ...prev.workingDays[day],
          [field]: value,
        },
      },
    }));
  };

  const handleSave = async () => {
    if (!supabase) return;

    setIsSaving(true);
    try {
      const updateData = {
        timezone: data.timezone,
        monday_start: data.workingDays.monday.enabled ? data.workingDays.monday.start : null,
        monday_end: data.workingDays.monday.enabled ? data.workingDays.monday.end : null,
        tuesday_start: data.workingDays.tuesday.enabled ? data.workingDays.tuesday.start : null,
        tuesday_end: data.workingDays.tuesday.enabled ? data.workingDays.tuesday.end : null,
        wednesday_start: data.workingDays.wednesday.enabled ? data.workingDays.wednesday.start : null,
        wednesday_end: data.workingDays.wednesday.enabled ? data.workingDays.wednesday.end : null,
        thursday_start: data.workingDays.thursday.enabled ? data.workingDays.thursday.start : null,
        thursday_end: data.workingDays.thursday.enabled ? data.workingDays.thursday.end : null,
        friday_start: data.workingDays.friday.enabled ? data.workingDays.friday.start : null,
        friday_end: data.workingDays.friday.enabled ? data.workingDays.friday.end : null,
        saturday_start: data.workingDays.saturday.enabled ? data.workingDays.saturday.start : null,
        saturday_end: data.workingDays.saturday.enabled ? data.workingDays.saturday.end : null,
        sunday_start: data.workingDays.sunday.enabled ? data.workingDays.sunday.start : null,
        sunday_end: data.workingDays.sunday.enabled ? data.workingDays.sunday.end : null,
        break_start_time: data.breakStartTime,
        break_duration_minutes: data.breakDurationMinutes,
      };

      const { error } = await supabase
        .from("user_working_hours")
        .update(updateData)
        .eq("user_id", (await supabase.auth.getUser()).data.user?.id);

      if (error) throw error;
      toast.success("Working hours updated");
      setIsExpanded(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-start justify-between"
      >
        <div className="text-left">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-primary" />
            <p className="font-display text-lg font-semibold">Working Hours</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Timezone: <span className="font-medium text-foreground">{data.timezone}</span>
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {isExpanded ? "▼" : "▶"}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-6 space-y-4 border-t border-border pt-4">
          {/* Timezone */}
          <div>
            <label className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <Globe className="h-3 w-3" />
              Timezone
            </label>
            <Select value={data.timezone} onValueChange={(tz) =>
              setData((prev) => ({ ...prev, timezone: tz }))
            }>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {timezoneSelectOptions(data.timezone).map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Working Days */}
          <div>
            <label className="mb-3 block text-xs uppercase tracking-widest text-muted-foreground">
              Working Days & Hours
            </label>
            <div className="space-y-2">
              {DAYS.map((day) => (
                <div
                  key={day}
                  className="flex items-center gap-3 p-2 rounded border border-border/50"
                >
                  <Checkbox
                    checked={data.workingDays[day].enabled}
                    onCheckedChange={() => handleDayToggle(day)}
                    id={`edit-day-${day}`}
                  />
                  <label
                    htmlFor={`edit-day-${day}`}
                    className="flex-1 text-xs font-medium capitalize cursor-pointer"
                  >
                    {day}
                  </label>

                  {data.workingDays[day].enabled && (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="time"
                        value={data.workingDays[day].start}
                        onChange={(e) =>
                          handleTimeChange(day, "start", e.target.value)
                        }
                        className="h-8 w-20 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">—</span>
                      <Input
                        type="time"
                        value={data.workingDays[day].end}
                        onChange={(e) =>
                          handleTimeChange(day, "end", e.target.value)
                        }
                        className="h-8 w-20 text-xs"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Break Time */}
          <div>
            <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">
              Break Time
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={data.breakStartTime}
                onChange={(e) =>
                  setData((prev) => ({ ...prev, breakStartTime: e.target.value }))
                }
                className="h-9 w-24 text-xs"
              />
              <span className="text-xs text-muted-foreground">for</span>
              <Input
                type="number"
                min="15"
                max="120"
                step="15"
                value={data.breakDurationMinutes}
                onChange={(e) =>
                  setData((prev) => ({
                    ...prev,
                    breakDurationMinutes: parseInt(e.target.value),
                  }))
                }
                className="h-9 w-16 text-xs"
              />
              <span className="text-xs text-muted-foreground">minutes</span>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full mt-4 rounded-lg bg-primary py-2 text-xs font-semibold text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-3 w-3" />
                Save Changes
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
