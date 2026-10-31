import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getDolphinProgress, setCompanionPreference } from "@/lib/task-completion.functions";
import { progressForXp, type DolphinEmotion } from "@/lib/dolphin-progression";
import { useSupabaseAuth } from "@/hooks/use-auth";
import { DolphinCompanion } from "./dolphin-companion";

export function DolphinProgress() {
  const { userId } = useSupabaseAuth();
  const load = useServerFn(getDolphinProgress),
    preference = useServerFn(setCompanionPreference);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["dolphin", userId],
    queryFn: () => load(),
    enabled: !!userId,
  });
  const [emotion, setEmotion] = useState<DolphinEmotion>("calm");
  const [saving, setSaving] = useState(false);
  const previousLevel = useRef(1);
  const value = progressForXp(query.data?.confirmed_xp ?? 0, query.data?.pending_xp ?? 0);
  useEffect(() => {
    previousLevel.current = value.level;
  }, [value.level]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const listener = (event: Event) => {
      const result = (event as CustomEvent).detail;
      setEmotion(result.level > previousLevel.current ? "level_up" : "happy");
      clearTimeout(timer);
      timer = setTimeout(() => setEmotion("calm"), 2500);
    };
    window.addEventListener("notio:completion", listener);
    return () => {
      window.removeEventListener("notio:completion", listener);
      clearTimeout(timer);
    };
  }, []);
  async function toggle(enabled: boolean) {
    setSaving(true);
    try {
      await preference({ data: { enabled } });
      await qc.invalidateQueries({ queryKey: ["dolphin", userId] });
    } catch {
      toast.error("Couldn't save companion preference.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="notiox-progress" aria-label="Dolphin progress">
      {query.data?.companion_enabled && <DolphinCompanion state={emotion} />}
      <div className="min-w-0 flex-1">
        {query.isLoading && <p role="status">Loading progress...</p>}
        {query.isError && (
          <p role="alert">
            Couldn't load progress. <button onClick={() => void query.refetch()}>Try again</button>
          </p>
        )}
        {query.data && (
          <div>
            <p className="font-semibold break-words">
              Level {value.level}{" "}
              <span className="text-sm text-muted-foreground">
                {value.confirmedXp} XP
                {value.pendingXp > 0 ? ` · ${value.pendingXp} pending` : ""}
              </span>
            </p>
            <progress value={value.intoLevel} max={100} aria-label="Progress to next level" />
            <p className="text-xs text-muted-foreground break-words" role="status">
              {emotion === "level_up"
                ? "Level up!"
                : emotion === "happy"
                  ? value.pendingXp > 0
                    ? "Done · waiting to sync."
                    : "Step completed."
                  : `${100 - value.intoLevel} XP to next level`}
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={query.data.companion_enabled}
                disabled={saving}
                onChange={(e) => void toggle(e.target.checked)}
              />
              Show Dolphin
            </label>
          </div>
        )}
      </div>
    </section>
  );
}
