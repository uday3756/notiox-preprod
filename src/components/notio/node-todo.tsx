import { useEffect, useMemo, useState } from "react";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { useTaskCompletion } from "@/hooks/use-task-completion";
import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { NotioNode } from "./mindmap-canvas";
import {
  currentTimeBlock,
  logicalDate,
  normalizeRingSettings,
} from "@/lib/rings/day";
import type { TimeBlock } from "@/lib/rings/geometry";

const PRIORITY_COLORS = [
  "oklch(0.4 0.02 260)",
  "oklch(0.62 0.17 150)",
  "oklch(0.7 0.16 80)",
  "oklch(0.65 0.22 25)",
];
const PRIORITY_LABELS = ["", "Low", "Medium", "High"];

/** Numbered, prioritised checklist built from the map's nodes. */
export function NodeTodoList({ nodes, mapId }: { nodes: NotioNode[]; mapId?: string }) {
  const completion = useTaskCompletion();
  const [items, setItems] = useState<NotioNode[]>(nodes);
  const qc = useQueryClient();

  useEffect(() => {
    setItems(nodes);
  }, [nodes]);

  const tasks = useMemo(() => {
    return items
      .filter((n) => n.parent_id)
      .sort((a, b) => {
        const ad = a.done ? 1 : 0;
        const bd = b.done ? 1 : 0;
        if (ad !== bd) return ad - bd;
        return (b.priority ?? 1) - (a.priority ?? 1);
      });
  }, [items]);

  const doneCount = tasks.filter((t) => t.done).length;

  async function toggle(node: NotioNode) {
    const next = !node.done;
    try {
      await completion.setNodeCompleted(node.id, next);
      setItems((cur) => cur.map((it) => it.id === node.id ? { ...it, done: next } : it));
      return;
    } catch {
      if (FEATURE_FLAGS.workflow) {
        toast.error("Couldn't update");
        return;
      }
    }
    const now = new Date();

    // Optimistic
    setItems((cur) =>
      cur.map((it) =>
        it.id === node.id
          ? {
              ...it,
              done: next,
              completed_at: next ? now.toISOString() : null,
            }
          : it,
      ),
    );

    try {
      const { data: hours } = await supabase
        .from("user_working_hours")
        .select("timezone, day_start_hour, block_boundaries, daily_task_estimate")
        .maybeSingle();
      const settings = normalizeRingSettings(hours as Record<string, unknown> | null);

      const patch: Record<string, unknown> = { done: next };
      if (next) {
        const block =
          (node.time_block as TimeBlock | null | undefined) ||
          currentTimeBlock(settings, now);
        patch.completed_at = now.toISOString();
        patch.logical_date = logicalDate(now, settings.timezone, settings.day_start_hour);
        if (!node.time_block) {
          patch.time_block = block;
          patch.time_block_source = "default";
        }
      } else {
        patch.completed_at = null;
        patch.logical_date = null;
      }

      const { error } = await supabase.from("nodes").update(patch as never).eq("id", node.id);
      if (error) throw error;

      if (mapId) qc.invalidateQueries({ queryKey: ["map", mapId] });
      qc.invalidateQueries({ queryKey: ["daily-ring-nodes"] });
    } catch {
      toast.error("Couldn't update");
      setItems((cur) => cur.map((it) => (it.id === node.id ? { ...it, done: !next } : it)));
    }
  }

  if (!tasks.length) return null;

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Today&apos;s to-do</h2>
        <span className="text-xs text-muted-foreground">
          {doneCount}/{tasks.length} done
        </span>
      </div>

      <ol className="mt-4 space-y-1.5">
        {tasks.map((t, i) => {
          const pr = t.priority ?? 1;
          return (
            <li key={t.id}>
              <button
                onClick={() => void toggle(t)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-accent/50"
              >
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {i + 1}.
                </span>
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    t.done ? "border-transparent" : "border-border"
                  }`}
                  style={t.done ? { background: "oklch(0.66 0.18 255)" } : undefined}
                >
                  {t.done && <Check className="h-3.5 w-3.5 text-white" />}
                </span>
                <span
                  className={`flex-1 text-sm ${
                    t.done ? "text-muted-foreground line-through" : "text-foreground"
                  }`}
                >
                  {t.label}
                </span>
                {t.time_block && !t.done && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
                    {t.time_block}
                  </span>
                )}
                {pr >= 1 && !t.done && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white"
                    style={{ background: PRIORITY_COLORS[pr] }}
                  >
                    {PRIORITY_LABELS[pr]}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
