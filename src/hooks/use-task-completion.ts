import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getTaskForNode, setTaskCompletion } from "@/lib/task-completion.functions";
import type { ActionableTask, CompletionCommand } from "@/lib/task-completion.types";

export function useTaskCompletion() {
  const complete = useServerFn(setTaskCompletion);
  const link = useServerFn(getTaskForNode);
  const qc = useQueryClient();
  const retry = useRef(new Map<string, CompletionCommand>());
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  async function setCompleted(
    task: Pick<ActionableTask, "id" | "revision">,
    desired: boolean,
    source: CompletionCommand["source"],
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    const previous = retry.current.get(task.id);
    const command =
      previous?.desiredState === desired
        ? previous
        : {
            entityId: task.id,
            expectedRevision: task.revision,
            desiredState: desired,
            actionId: crypto.randomUUID(),
            source,
          };
    retry.current.set(task.id, command);
    setBusy(true);
    try {
      const result = await complete({ data: command });
      retry.current.delete(task.id);
      if (result.rewardChange > 0 && !result.wasAlreadyApplied) {
        window.dispatchEvent(new CustomEvent("notio:completion", { detail: result }));
        toast.success(`Done. +${result.rewardChange} XP`);
      } else toast.success(desired ? "Done" : "Completion undone");
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't update. Try again.";
      if (message.includes("another device")) retry.current.delete(task.id);
      throw error;
    } finally {
      setBusy(false);
      inFlight.current = false;
      for (const key of [
        "map",
        "scheduled-tasks",
        "actionable-tasks",
        "dolphin",
        "daily-ring-nodes",
        "daily-ring-calendar",
      ]) {
        void qc.invalidateQueries({ queryKey: [key] });
      }
    }
  }
  async function setNodeCompleted(nodeId: string, desired: boolean) {
    const task = await link({ data: { nodeId } });
    return setCompleted(task, desired, "map");
  }
  return { setCompleted, setNodeCompleted, busy };
}
