import { useEffect, useState } from "react";
import { Loader2, Save, CircleDot } from "lucide-react";
import { toast } from "sonner";
import { useSupabaseAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsSection } from "@/components/notio/settings-section";
import {
  DEFAULT_BLOCK_BOUNDARIES,
  normalizeRingSettings,
  type BlockBoundaries,
} from "@/lib/rings/day";

export function RingsSettingsEditor() {
  const { supabase } = useSupabaseAuth();
  const [estimate, setEstimate] = useState(10);
  const [dayStart, setDayStart] = useState(4);
  const [boundaries, setBoundaries] = useState<BlockBoundaries>(DEFAULT_BLOCK_BOUNDARIES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("user_working_hours")
        .select("day_start_hour, block_boundaries, daily_task_estimate, timezone")
        .maybeSingle();
      const s = normalizeRingSettings(data as Record<string, unknown> | null);
      setEstimate(s.daily_task_estimate);
      setDayStart(s.day_start_hour);
      setBoundaries(s.block_boundaries);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!supabase) return;
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const est = Math.max(3, Math.min(20, estimate));
      const { error } = await supabase.from("user_working_hours").upsert(
        {
          user_id: u.user.id,
          daily_task_estimate: est,
          day_start_hour: dayStart,
          block_boundaries: boundaries,
        } as never,
        { onConflict: "user_id" },
      );
      if (error) throw error;
      toast.success("Daily rings settings saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function setBound(block: keyof BlockBoundaries, idx: 0 | 1, value: number) {
    setBoundaries((prev) => {
      const next = { ...prev, [block]: [...prev[block]] as [number, number] };
      next[block][idx] = Math.max(0, Math.min(23, value));
      return next;
    });
  }

  return (
    <SettingsSection
      title="Daily rings"
      icon={CircleDot}
      summary={
        loading
          ? "Loading…"
          : `${estimate} tasks a day · day starts at ${String(dayStart).padStart(2, "0")}:00`
      }
    >
      <div className="space-y-4">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              <div>
                <Label className="text-xs text-muted-foreground">
                  How many tasks do you usually have in a day?
                </Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-border px-2.5 py-1 text-sm"
                    onClick={() => setEstimate((n) => Math.max(3, n - 1))}
                  >
                    −
                  </button>
                  <span className="w-8 text-center tabular-nums font-medium">{estimate}</span>
                  <button
                    type="button"
                    className="rounded-md border border-border px-2.5 py-1 text-sm"
                    onClick={() => setEstimate((n) => Math.min(20, n + 1))}
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Day starts at (local hour)</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  className="mt-1.5"
                  value={dayStart}
                  onChange={(e) => setDayStart(Number(e.target.value) || 0)}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Default 4 — tasks done before this hour count toward yesterday.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Block boundaries (hours)</Label>
                {(
                  [
                    ["morning", "Morning"],
                    ["afternoon", "Afternoon"],
                    ["evening", "Evening"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="grid grid-cols-[1fr_72px_72px] items-center gap-2">
                    <span className="text-xs">{label}</span>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={boundaries[key][0]}
                      onChange={(e) => setBound(key, 0, Number(e.target.value))}
                    />
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={boundaries[key][1]}
                      onChange={(e) => setBound(key, 1, Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save rings settings
              </button>
            </>
          )}
      </div>
    </SettingsSection>
  );
}
