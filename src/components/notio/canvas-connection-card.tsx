import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import {
  connectCanvas,
  disconnectCanvas,
  getCanvasStatus,
  listCanvasAssignments,
  syncCanvas,
} from "@/lib/canvas.functions";

/**
 * Live Canvas LMS connection (direct REST). Tokens never use VITE_* vars.
 * School domain = user's Canvas host (e.g. school.instructure.com), not Notiolive.com.
 */
export function CanvasConnectionCard({
  active = false,
}: {
  /** Parent decides visibility (Student role, onboarding step, or feature flag). */
  active?: boolean;
}) {
  const qc = useQueryClient();
  const statusFn = useServerFn(getCanvasStatus);
  const connectFn = useServerFn(connectCanvas);
  const disconnectFn = useServerFn(disconnectCanvas);
  const syncFn = useServerFn(syncCanvas);
  const listFn = useServerFn(listCanvasAssignments);
  const [domain, setDomain] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const status = useQuery({
    queryKey: ["canvas-status"],
    queryFn: () => statusFn(),
    enabled: active,
  });
  const assignments = useQuery({
    queryKey: ["canvas-assignments"],
    queryFn: () => listFn(),
    enabled: active && !!status.data && "connection" in status.data && !!status.data.connection,
  });

  if (!active) return null;

  async function connect() {
    setBusy(true);
    try {
      await connectFn({ data: { domain, token, institution: domain } });
      setToken("");
      toast.success("Canvas connected");
      await qc.invalidateQueries({ queryKey: ["canvas-status"] });
      await syncFn();
      await qc.invalidateQueries({ queryKey: ["canvas-assignments"] });
      await qc.invalidateQueries({ queryKey: ["actionable-tasks"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't connect Canvas");
    } finally {
      setBusy(false);
    }
  }

  async function syncNow() {
    setBusy(true);
    try {
      const res = await syncFn();
      toast.success(res.ok ? `Synced ${res.upserted} assignments` : "Sync skipped");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["canvas-status"] }),
        qc.invalidateQueries({ queryKey: ["canvas-assignments"] }),
        qc.invalidateQueries({ queryKey: ["actionable-tasks"] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await disconnectFn();
      toast.success("Canvas disconnected");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["canvas-status"] }),
        qc.invalidateQueries({ queryKey: ["canvas-assignments"] }),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }

  const connection =
    status.data && "connection" in status.data ? status.data.connection : null;

  return (
    <section
      className="mt-6 rounded-2xl border border-border bg-surface p-5"
      aria-label="Canvas LMS"
    >
      <h2 className="font-display text-lg font-semibold break-words">Canvas classes</h2>
      <p className="mt-2 break-words text-sm text-muted-foreground">
        Import your own courses and assignments with a student access token from your school
        Canvas. Completing steps in Notio never submits work to Canvas.
      </p>

      {status.isLoading && (
        <p className="mt-4" role="status">
          Loading Canvas…
        </p>
      )}
      {status.data && "error" in status.data && status.data.error && (
        <p className="mt-4 break-words text-sm text-destructive" role="alert">
          {status.data.error}
        </p>
      )}

      {!connection ? (
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            School Canvas domain
            <input
              className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
              placeholder="school.instructure.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block text-sm">
            Access token
            <input
              className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-3"
              type="password"
              placeholder="Canvas student token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            disabled={busy || domain.trim().length < 3 || token.trim().length < 10}
            onClick={() => void connect()}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Connect Canvas
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="break-words text-sm">
            {connection.domain} · <span className="text-muted-foreground">{connection.state}</span>
          </p>
          {connection.last_successful_sync && (
            <p className="text-xs text-muted-foreground">
              Last sync {new Date(connection.last_successful_sync).toLocaleString()}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void syncNow()}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sync now
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void disconnect()}
              className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-4 text-muted-foreground"
            >
              <Unlink className="h-4 w-4" /> Disconnect
            </button>
          </div>
        </div>
      )}

      {assignments.data && assignments.data.length > 0 && (
        <ul className="mt-5 space-y-3 border-t border-border pt-4">
          {assignments.data.slice(0, 12).map((a) => (
            <li key={`${a.courseId}-${a.assignmentId}`} className="min-w-0">
              <p className="break-words text-sm font-medium">{a.title}</p>
              <p className="break-words text-xs text-muted-foreground">
                {a.display?.dateSource}
                {a.officialDueAt ? ` · ${new Date(a.officialDueAt).toLocaleString()}` : ""}
                {a.display?.submissionLabel ? ` · ${a.display.submissionLabel}` : ""}
                {a.display?.stale ? " · stale" : ""}
                {a.display?.changed ? " · deadline changed" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
