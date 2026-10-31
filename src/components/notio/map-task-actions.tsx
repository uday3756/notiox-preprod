import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListPlus, FilePlus, X, Check } from "lucide-react";
import { toast } from "sonner";
import { getActionableTasks, attachMapNode } from "@/lib/task-completion.functions";
import { useSupabaseAuth } from "@/hooks/use-auth";

export function MapTaskActions({ nodeId, label }: { nodeId: string; label: string }) {
  const { userId } = useSupabaseAuth(),
    list = useServerFn(getActionableTasks),
    qc = useQueryClient();
  const attach = useServerFn(attachMapNode);
  const [mode, setMode] = useState<"step" | "note" | null>(null),
    [parent, setParent] = useState(""),
    [title, setTitle] = useState(label),
    [busy, setBusy] = useState(false);
  const tasks = useQuery({
    queryKey: ["actionable-tasks", userId],
    queryFn: () => list(),
    enabled: !!userId && mode !== null,
  });
  async function save() {
    setBusy(true);
    try {
      await attach({
        data: { nodeId, parentId: parent || null, title, noteOnly: mode === "note" },
      });
      await qc.invalidateQueries({ queryKey: ["actionable-tasks"] });
      await qc.invalidateQueries({ queryKey: ["assignment-notes"] });
      toast.success(mode === "note" ? "Note attached" : "Step saved");
      setMode(null);
    } catch {
      toast.error("Couldn't save. Check the destination and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-5 border-t border-border pt-4">
      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm"
          onClick={() => {
            setMode("step");
            setTitle(label);
          }}
        >
          <ListPlus size={16} />
          Make it a step
        </button>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm"
          onClick={() => setMode("note")}
        >
          <FilePlus size={16} />
          Add to essay
        </button>
      </div>
      {mode && (
        <div className="notiox-task-editor">
          <div className="flex items-center justify-between">
            <h3>{mode === "step" ? "New step" : "Attach note"}</h3>
            <button onClick={() => setMode(null)} aria-label="Cancel">
              <X size={18} />
            </button>
          </div>
          {mode === "step" && (
            <label>
              Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
            </label>
          )}
          <label>
            Destination
            <select
              className="mt-2 min-h-11 w-full rounded-md border border-border bg-background px-3"
              value={parent}
              onChange={(e) => setParent(e.target.value)}
            >
              <option value="">
                {mode === "step" ? "Standalone task" : "Choose an assignment"}
              </option>
              {tasks.data
                ?.filter((t) => !t.parent_node_id)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
          </label>
          {tasks.isError && (
            <p role="alert">
              Couldn't load destinations.{" "}
              <button onClick={() => void tasks.refetch()}>Try again</button>
            </p>
          )}
          <button
            className="mt-4 inline-flex min-h-11 items-center gap-2 px-3"
            disabled={busy || (mode === "note" && !parent) || !title.trim()}
            onClick={() => void save()}
          >
            <Check size={16} />
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </section>
  );
}
