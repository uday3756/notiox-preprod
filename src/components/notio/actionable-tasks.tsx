import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { ArrowRight, Check, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { getActionableTasks, saveActionableTask } from "@/lib/task-completion.functions";
import { useTaskCompletion } from "@/hooks/use-task-completion";
import { useSupabaseAuth } from "@/hooks/use-auth";
import type { ActionableTask } from "@/lib/task-completion.types";

export function ActionableTasks({
  parentId = null,
  title = "Next actions",
  compact = false,
}: {
  parentId?: string | null;
  title?: string;
  compact?: boolean;
}) {
  const { userId } = useSupabaseAuth();
  const list = useServerFn(getActionableTasks);
  const save = useServerFn(saveActionableTask);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["actionable-tasks", userId],
    queryFn: () => list(),
    enabled: !!userId,
  });
  const completion = useTaskCompletion();
  const [editing, setEditing] = useState<ActionableTask | "new" | null>(null);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [estimate, setEstimate] = useState("");
  const [order, setOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const draftId = useRef("");
  const children = (id: string) => (query.data ?? []).filter((t) => t.parent_node_id === id);
  const next = (query.data ?? []).find(
    (t) => t.status !== "completed" && children(t.id).length === 0,
  );
  const tasks = compact
    ? next
      ? [next]
      : []
    : (query.data ?? []).filter((t) => t.parent_node_id === parentId);
  function edit(task: ActionableTask | "new") {
    draftId.current = task === "new" ? crypto.randomUUID() : task.id;
    setEditing(task);
    setLabel(task === "new" ? "" : task.title);
    setDescription(task === "new" ? "" : (task.description ?? ""));
    setEstimate(task === "new" ? "" : String(task.estimated_duration_minutes ?? ""));
    setOrder(task === "new" ? tasks.length : task.sort_order);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || saving) return;
    setSaving(true);
    try {
      await save({
        data: {
          id: draftId.current,
          title: label,
          description,
          parentId: editing === "new" ? parentId : editing.parent_node_id,
          estimate: estimate ? Number(estimate) : null,
          order,
          revision: editing === "new" ? 0 : editing.revision,
        },
      });
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["actionable-tasks"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="notiox-actions">
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          onClick={() => edit("new")}
          aria-label={parentId ? "Add step" : "Add task"}
          title={parentId ? "Add step" : "Add task"}
        >
          <Plus size={18} />
        </button>
      </header>
      {query.isLoading && <p role="status">Loading tasks...</p>}
      {query.isError && (
        <div role="alert">
          <p>Couldn't load your tasks.</p>
          <button type="button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      )}
      {query.isSuccess && tasks.length === 0 && (
        <p className="break-words text-muted-foreground">
          No actions yet. Undated steps stay visible here once added.
        </p>
      )}
      <ul>
        {tasks.map((task) => {
          const steps = children(task.id),
            done = task.status === "completed";
          return (
            <li key={task.id}>
              <button
                type="button"
                className="notiox-task-check"
                role="checkbox"
                aria-checked={done}
                aria-label={`Complete ${task.title}`}
                disabled={completion.busy || steps.length > 0}
                onClick={() =>
                  void completion
                    .setCompleted(task, !done, parentId ? "assignment" : "home")
                    .catch((error) => toast.error(error.message))
                }
              >
                {done && <Check size={16} />}
              </button>
              <div className="notiox-task-label">
                <Link to="/assignments/$id" params={{ id: task.id }}>
                  {task.title}
                </Link>
                {steps.length > 0 ? (
                  <small>
                    {steps.filter((t) => t.status === "completed").length}/{steps.length} steps done
                    in NotioX
                  </small>
                ) : (
                  task.estimated_duration_minutes && (
                    <small>{task.estimated_duration_minutes} min</small>
                  )
                )}
              </div>
              <button
                type="button"
                onClick={() => edit(task)}
                aria-label={`Edit ${task.title}`}
                title="Edit task"
              >
                <Pencil size={16} />
              </button>
              <Link
                to="/assignments/$id"
                params={{ id: task.id }}
                aria-label={`Open ${task.title}`}
                title="Open task"
              >
                <ArrowRight size={18} />
              </Link>
            </li>
          );
        })}
      </ul>
      {editing && (
        <form onSubmit={submit} className="notiox-task-editor">
          <div className="flex items-center justify-between">
            <h3>{editing === "new" ? (parentId ? "New step" : "New task") : "Edit task"}</h3>
            <button type="button" onClick={() => setEditing(null)} aria-label="Cancel editing">
              <X size={18} />
            </button>
          </div>
          <label>
            Title
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              required
              maxLength={500}
            />
          </label>
          <label>
            Notes
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={10000}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              Estimate (minutes)
              <input
                type="number"
                min={1}
                max={10080}
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
              />
            </label>
            <label>
              Order
              <input
                type="number"
                min={0}
                value={order}
                onChange={(e) => setOrder(Number(e.target.value))}
              />
            </label>
          </div>
          <button type="submit" disabled={saving || !label.trim()}>
            {saving ? "Saving..." : "Save"}
          </button>
        </form>
      )}
    </section>
  );
}
