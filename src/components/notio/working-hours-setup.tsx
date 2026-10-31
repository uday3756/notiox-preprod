
import { useState, useEffect } from "react";
import { Clock, Globe, Coffee, Save, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { timezoneSelectOptions, detectAccountTimezone } from "@/lib/timezones";

interface WorkingHoursSetupProps {
  onComplete?: (data: WorkingHoursData) => Promise<void>;
  isLoading?: boolean;
}

export interface WorkingHoursData {
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
  minFocusBlockMinutes: number;
  maxDailyHours: number;
  protectEvenings: boolean;
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
  minFocusBlockMinutes: 30,
  maxDailyHours: 8,
  protectEvenings: true,
};

export function WorkingHoursSetup({
  onComplete,
  isLoading = false,
}: WorkingHoursSetupProps) {
  const [data, setData] = useState<WorkingHoursData>(DEFAULT_WORKING_HOURS);
  const [isSaving, setIsSaving] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Auto-detect timezone from the device (account country signal)
  useEffect(() => {
    const userTimezone = detectAccountTimezone("");
    if (userTimezone) {
      setData((prev) => ({ ...prev, timezone: userTimezone }));
    }
  }, []);

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

  const handleSubmit = async () => {
    if (!onComplete) {
      setIsComplete(true);
      return;
    }

    setIsSaving(true);
    try {
      await onComplete(data);
      setIsComplete(true);
    } catch (error) {
      console.error("Error saving working hours:", error);
      alert("Failed to save working hours. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isComplete) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <Card className="border-green-500/30 bg-green-500/10">
          <CardHeader>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-green-400" />
              <div>
                <CardTitle className="text-green-300">
                  All set!
                </CardTitle>
                <CardDescription className="text-green-400/80">
                  Your working hours have been configured
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-green-200/90 space-y-2">
              <p>• Timezone: {data.timezone}</p>
              <p>
                • Working days:{" "}
                {DAYS
                  .filter((day) => data.workingDays[day].enabled)
                  .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
                  .join(", ")}
              </p>
              <p>• Break time: {data.breakStartTime} ({data.breakDurationMinutes} min)</p>
              {data.protectEvenings && <p>• Evening protection enabled</p>}
            </div>

            {/* Redirecting indicator */}
            <div className="mt-6 pt-4 border-t border-green-500/20 flex items-center justify-center gap-2">
              <div className="animate-spin h-4 w-4 border-2 border-green-400 border-t-transparent rounded-full" />
              <p className="text-sm text-green-400/80">Redirecting to scheduling...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Step 1: Timezone */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-blue-600" />
            <CardTitle>Your Timezone</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Select value={data.timezone} onValueChange={(tz) =>
            setData((prev) => ({ ...prev, timezone: tz }))
          }>
            <SelectTrigger>
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
        </CardContent>
      </Card>

      {/* Step 2: Working Days & Hours */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-purple-600" />
            <CardTitle>Working Hours</CardTitle>
          </div>
          <CardDescription>Set your availability for each day</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {DAYS.map((day) => (
            <div
              key={day}
              className="flex items-center gap-2 p-3 border border-border rounded-lg hover:bg-accent/50 overflow-hidden"
            >
              <Checkbox
                checked={data.workingDays[day].enabled}
                onCheckedChange={() => handleDayToggle(day)}
                id={`day-${day}`}
                className="shrink-0"
              />
              <label
                htmlFor={`day-${day}`}
                className="min-w-0 flex-1 truncate font-medium capitalize cursor-pointer"
              >
                {day}
              </label>

              {data.workingDays[day].enabled && (
                <div className="flex shrink-0 items-center gap-1">
                  <Input
                    type="time"
                    value={data.workingDays[day].start}
                    onChange={(e) =>
                      handleTimeChange(day, "start", e.target.value)
                    }
                    className="w-[92px] px-1.5 text-sm sm:w-24 sm:px-3"
                  />
                  <span className="text-muted-foreground">—</span>
                  <Input
                    type="time"
                    value={data.workingDays[day].end}
                    onChange={(e) =>
                      handleTimeChange(day, "end", e.target.value)
                    }
                    className="w-[92px] px-1.5 text-sm sm:w-24 sm:px-3"
                  />
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Step 3: Break Time */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Coffee className="h-5 w-5 text-amber-600" />
            <CardTitle>Break Time</CardTitle>
          </div>
          <CardDescription>
            When do you typically take your lunch/break?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="break-start">Break Starts At</Label>
            <Input
              id="break-start"
              type="time"
              value={data.breakStartTime}
              onChange={(e) =>
                setData((prev) => ({ ...prev, breakStartTime: e.target.value }))
              }
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="break-duration">Duration (minutes)</Label>
            <Input
              id="break-duration"
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
              className="mt-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Step 4: Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Customize your scheduling behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="min-focus">Minimum Focus Block (minutes)</Label>
            <Input
              id="min-focus"
              type="number"
              min="15"
              max="240"
              step="15"
              value={data.minFocusBlockMinutes}
              onChange={(e) =>
                setData((prev) => ({
                  ...prev,
                  minFocusBlockMinutes: parseInt(e.target.value),
                }))
              }
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Minimum uninterrupted time for deep work
            </p>
          </div>

          <div>
            <Label htmlFor="max-daily">Max Daily Hours</Label>
            <Input
              id="max-daily"
              type="number"
              min="4"
              max="12"
              step="0.5"
              value={data.maxDailyHours}
              onChange={(e) =>
                setData((prev) => ({
                  ...prev,
                  maxDailyHours: parseFloat(e.target.value),
                }))
              }
              className="mt-2"
            />
          </div>

          <div className="flex items-center justify-between p-3 border border-border rounded-lg">
            <div>
              <Label htmlFor="protect-evenings" className="font-medium">
                Protect Evenings
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                No tasks after 9 PM
              </p>
            </div>
            <Switch
              id="protect-evenings"
              checked={data.protectEvenings}
              onCheckedChange={(checked) =>
                setData((prev) => ({ ...prev, protectEvenings: checked }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button
        onClick={handleSubmit}
        disabled={isSaving || isLoading}
        className="w-full h-12 gap-2 text-lg"
      >
        {isSaving || isLoading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save className="h-5 w-5" />
            Save Working Hours
          </>
        )}
      </Button>
    </div>
  );
}
