import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Clock, CheckCircle2 } from "lucide-react";
import { HoursPresets, type HoursPreset } from "@/components/notio/hours-presets";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/hours-settings")({
  component: HoursSettingsPage,
});

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

type DayConfig = { enabled: boolean; start: string; end: string };

function HoursSettingsPage() {
  const [days, setDays] = useState<Record<string, DayConfig>>(() =>
    Object.fromEntries(
      DAYS.map((d) => [
        d,
        {
          enabled: d !== "saturday" && d !== "sunday",
          start: "09:00",
          end: "17:00",
        },
      ])
    )
  );
  const [selectedPreset, setSelectedPreset] = useState<string>();
  const [protectEvenings, setProtectEvenings] = useState(true);
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakDuration, setBreakDuration] = useState(60);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    loadHours();
  }, []);

  const loadHours = async () => {
    const { data } = await supabase
      .from("user_working_hours")
      .select("*")
      .single();

    if (data) {
      const loaded: Record<string, DayConfig> = {};
      DAYS.forEach((d) => {
        const start = data[`${d}_start` as keyof typeof data] as string | null;
        const end = data[`${d}_end` as keyof typeof data] as string | null;
        loaded[d] = {
          enabled: !!start,
          start: start?.slice(0, 5) || "09:00",
          end: end?.slice(0, 5) || "17:00",
        };
      });
      setDays(loaded);
      setProtectEvenings(data.protect_evenings ?? true);
      setBreakStart((data.break_start_time as string)?.slice(0, 5) || "12:00");
      setBreakDuration(data.break_duration_minutes || 60);
    }
  };

  const applyPreset = (preset: HoursPreset) => {
    setSelectedPreset(preset.id);
    setDays((prev) =>
      Object.fromEntries(
        DAYS.map((d) => [
          d,
          {
            ...prev[d],
            start: preset.start,
            end: preset.end,
          },
        ])
      )
    );
    toast.success(`Applied "${preset.label}" to all working days`);
  };

  const toggleDay = (day: string) => {
    setDays((prev) => ({
      ...prev,
      [day]: { ...prev[day], enabled: !prev[day].enabled },
    }));
    setSelectedPreset(undefined);
  };

  const setTime = (day: string, field: "start" | "end", value: string) => {
    setDays((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
    setSelectedPreset(undefined);
  };

  const handleSave = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return;

    setIsLoading(true);
    try {
      const payload: Record<string, unknown> = {
        user_id: userId,
        protect_evenings: protectEvenings,
        break_start_time: breakStart,
        break_duration_minutes: breakDuration,
      };
      DAYS.forEach((d) => {
        payload[`${d}_start`] = days[d].enabled ? days[d].start : null;
        payload[`${d}_end`] = days[d].enabled ? days[d].end : null;
      });

      const { error } = await supabase
        .from("user_working_hours")
        .upsert(payload, { onConflict: "user_id" });

      if (error) throw error;

      setIsSaved(true);
      toast.success("Working hours updated!");
      setTimeout(() => setIsSaved(false), 2000);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <h1 className="font-display text-2xl font-bold">Working Hours</h1>
          <p className="text-sm text-muted-foreground">
            Adjust your availability anytime
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        {/* Quick presets */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              Quick Presets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <HoursPresets selectedId={selectedPreset} onSelect={applyPreset} />
          </CardContent>
        </Card>

        {/* Per-day custom */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Custom Per-Day Hours</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {DAYS.map((day) => (
              <div
                key={day}
                className="flex items-center gap-4 p-3 border rounded-lg"
              >
                <Checkbox
                  checked={days[day].enabled}
                  onCheckedChange={() => toggleDay(day)}
                  id={`day-${day}`}
                />
                <label
                  htmlFor={`day-${day}`}
                  className="flex-1 font-medium capitalize cursor-pointer"
                >
                  {day}
                </label>
                {days[day].enabled ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={days[day].start}
                      onChange={(e) => setTime(day, "start", e.target.value)}
                      className="w-28"
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                      type="time"
                      value={days[day].end}
                      onChange={(e) => setTime(day, "end", e.target.value)}
                      className="w-28"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Day off</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Break + preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Break & Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="break-start">Break starts at</Label>
                <Input
                  id="break-start"
                  type="time"
                  value={breakStart}
                  onChange={(e) => setBreakStart(e.target.value)}
                  className="mt-2"
                />
              </div>
              <div>
                <Label htmlFor="break-dur">Break duration (min)</Label>
                <Input
                  id="break-dur"
                  type="number"
                  min={15}
                  max={120}
                  step={15}
                  value={breakDuration}
                  onChange={(e) => setBreakDuration(parseInt(e.target.value))}
                  className="mt-2"
                />
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <Label className="font-medium">Protect Evenings</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  No tasks scheduled after 9 PM
                </p>
              </div>
              <Switch
                checked={protectEvenings}
                onCheckedChange={setProtectEvenings}
              />
            </div>
          </CardContent>
        </Card>

        <Button
          onClick={handleSave}
          disabled={isLoading}
          className="w-full h-12 gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Saving...
            </>
          ) : isSaved ? (
            <>
              <CheckCircle2 className="h-5 w-5" />
              Saved!
            </>
          ) : (
            <>
              <Save className="h-5 w-5" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}


