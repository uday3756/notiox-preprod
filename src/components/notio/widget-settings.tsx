import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSupabaseAuth } from "@/hooks/use-auth";
import { getActionableTasks } from "@/lib/task-completion.functions";
import { configureNativeWidget, widgetOptions } from "@/lib/widget-bridge";
import { toast } from "sonner";

export function WidgetSettings() {
  const { session, userId } = useSupabaseAuth();
  const list = useServerFn(getActionableTasks);
  const tasks = useQuery({
    queryKey: ["actionable-tasks", userId],
    queryFn: () => list(),
    enabled: !!userId,
  });
  const [privateTitles, setPrivate] = useState(() =>
    userId ? widgetOptions(userId).privateTitles : false,
  );
  const [assignment, setAssignment] = useState(() =>
    userId ? widgetOptions(userId).assignment : "",
  );
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!session) return;
    setBusy(true);
    try {
      await configureNativeWidget(session, { privateTitles, assignment });
      toast.success("Widget updated");
    } catch {
      toast.error("Couldn't update the widget. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="notiox-actions">
      <h2>Home-screen widget</h2>
      <label className="mt-4 flex items-center gap-2">
        <input
          type="checkbox"
          checked={privateTitles}
          onChange={(e) => setPrivate(e.target.checked)}
        />
        Hide task titles
      </label>
      <label className="mt-4 block">
        Show
        <select
          className="mt-2 w-full rounded-md border border-border bg-surface p-3"
          value={assignment}
          onChange={(e) => setAssignment(e.target.value)}
        >
          <option value="">Today and undated tasks</option>
          {tasks.data
            ?.filter((t) => !t.parent_node_id)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
        </select>
      </label>
      <button
        className="mt-4 border border-border px-4"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? "Updating..." : "Update widget"}
      </button>
    </section>
  );
}
