import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Check, ArrowRight, ListTree } from "lucide-react";
import { useTaskCompletion } from "@/hooks/use-task-completion";
import { toast } from "sonner";
import { ActionableTasks } from "@/components/notio/actionable-tasks";
import {
  getActionableTasks,
  getAssignmentNotes,
  seedEssayOutline,
} from "@/lib/task-completion.functions";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { TaskSchedule } from "@/components/notio/task-schedule";

export const Route = createFileRoute("/_authenticated/assignments/$id")({
  beforeLoad: () => {
    if (!FEATURE_FLAGS.workflow) throw redirect({ to: "/home" });
  },
  component: AssignmentPage,
});
function AssignmentPage() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const list = useServerFn(getActionableTasks);
  const getNotes = useServerFn(getAssignmentNotes);
  const seedEssay = useServerFn(seedEssayOutline);
  const [seeding, setSeeding] = useState(false);
  const query = useQuery({ queryKey: ["actionable-tasks", user.id], queryFn: () => list() });
  const notes = useQuery({
    queryKey: ["assignment-notes", user.id, id],
    queryFn: () => getNotes({ data: { id } }),
  });
  const task = query.data?.find((t) => t.id === id);
  const completion = useTaskCompletion();
  const steps = query.data?.filter((t) => t.parent_node_id === id) ?? [];
  const next = steps.find((t) => t.status !== "completed");
  async function startEssayOutline() {
    setSeeding(true);
    try {
      await seedEssay({ data: { parentId: id } });
      await qc.invalidateQueries({ queryKey: ["actionable-tasks"] });
      toast.success("Essay steps added. Complete them one at a time.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't add essay steps.");
    } finally {
      setSeeding(false);
    }
  }
  return (
    <main className="notiox-screen mx-auto max-w-3xl px-5 py-8 pb-32">
      <Link to="/home" className="inline-flex min-h-11 items-center gap-2">
        <ArrowLeft size={16} /> Home
      </Link>
      {query.isLoading && <p role="status">Loading...</p>}
      {query.isError && (
        <div role="alert">
          <p>Couldn't load this task.</p>
          <button type="button" className="min-h-11" onClick={() => void query.refetch()}>
            Try again
          </button>
        </div>
      )}
      {query.isSuccess && !task && <p>Task not found.</p>}
      {task && (
        <div className="mt-8 min-w-0">
          <h1 className="text-2xl font-semibold break-words">{task.title}</h1>
          {task.estimated_duration_minutes && (
            <p className="mt-2 text-sm text-muted-foreground">
              {task.estimated_duration_minutes} min
            </p>
          )}
          {task.description && (
            <p className="mt-3 whitespace-pre-wrap break-words text-muted-foreground">
              {task.description}
            </p>
          )}
          {steps.length === 0 ? (
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                role="checkbox"
                aria-checked={task.status === "completed"}
                className="inline-flex min-h-12 items-center gap-3 rounded-md border border-border px-5"
                disabled={completion.busy}
                onClick={() =>
                  void completion
                    .setCompleted(task, task.status !== "completed", "assignment")
                    .catch((error) => toast.error(error.message))
                }
              >
                <Check size={18} />
                {task.status === "completed" ? "Done - undo" : "I did it"}
              </button>
              {!task.parent_node_id && (
                <button
                  type="button"
                  className="inline-flex min-h-12 items-center gap-3 rounded-md border border-border px-5"
                  disabled={seeding || task.status === "completed"}
                  onClick={() => void startEssayOutline()}
                >
                  <ListTree size={18} />
                  {seeding ? "Adding steps..." : "Start essay outline"}
                </button>
              )}
            </div>
          ) : (
            <div className="mt-6 min-w-0">
              <p className="break-words">
                {steps.filter((t) => t.status === "completed").length}/{steps.length} steps done in
                NotioX
              </p>
              {next && (
                <Link
                  to="/assignments/$id"
                  params={{ id: next.id }}
                  className="mt-3 inline-flex min-h-11 max-w-full items-center gap-2 break-words"
                >
                  <ArrowRight size={16} className="shrink-0" />
                  <span className="min-w-0 break-words">Start step: {next.title}</span>
                </Link>
              )}
            </div>
          )}
          <ActionableTasks parentId={id} title="Steps" />
          <TaskSchedule key={`${task.id}:${task.revision}`} task={task} />
          {notes.data && notes.data.length > 0 && (
            <section className="mt-8 border-t border-border pt-5">
              <h2 className="text-lg font-semibold">Notes</h2>
              {notes.data.map((note) => (
                <p key={note.node_id} className="mt-4 whitespace-pre-wrap break-words">
                  {note.content}
                </p>
              ))}
            </section>
          )}
          {notes.isError && (
            <p role="alert" className="mt-6 break-words">
              Couldn't load notes.{" "}
              <button type="button" className="min-h-11" onClick={() => void notes.refetch()}>
                Try again
              </button>
            </p>
          )}
        </div>
      )}
    </main>
  );
}
