import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ArrowLeft, Calendar } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { extractMultipleSchedules } from "@/lib/scheduling.functions";
import { findOverlappingPairs } from "@/lib/tasks/chrono-schedule-fallback";
import { detectAccountTimezone } from "@/lib/timezones";

export const Route = createFileRoute("/_authenticated/schedule-lab")({
  component: ScheduleLabPage,
});

const SAMPLES = [
  "today have meetiing with my friends now 3pm to 6 pm",
  "now 4:00 p.m. to 5:00 p.m. I am having a meeting with my friends",
  "Like right now I will go for dinner from 9 to 9.30. After that I will go for gym from 10 to 11.",
  "Client meeting tomorrow at 2:30 and gym at 6:30",
];

type Row = {
  title: string;
  category: string;
  start: string;
  end: string | null;
  source: string;
};

function ScheduleLabPage() {
  const extractFn = useServerFn(extractMultipleSchedules);
  const [text, setText] = useState(SAMPLES[2]);
  const [timezone, setTimezone] = useState(() => detectAccountTimezone("UTC"));
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [overlaps, setOverlaps] = useState(0);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("user_working_hours")
        .select("timezone")
        .maybeSingle();
      if (data?.timezone) setTimezone(data.timezone);
    })();
  }, []);

  async function run() {
    if (text.trim().length < 2) {
      toast.error("Paste a transcript first");
      return;
    }
    setBusy(true);
    setRows([]);
    try {
      const now = new Date().toISOString();
      const tasks = await extractFn({
        data: {
          transcript: text.slice(0, 12000),
          userTimezone: timezone,
          currentDateTime: now,
        },
      });
      const mapped = (tasks ?? []).map((t) => ({
        title: t.title,
        category: t.category,
        start: t.start_time_iso ?? "",
        end: t.end_time_iso,
        source: t.interpretation,
      }));
      setRows(mapped);
      setOverlaps(
        findOverlappingPairs(
          mapped.map((r, i) => ({
            id: String(i),
            start_time: r.start,
            end_time: r.end,
          })),
        ).length,
      );
      if (mapped.length === 0) {
        toast.message("No timed tasks found");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Extract failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-28 pt-6">
      <div className="mx-auto max-w-lg px-4">
        <Link
          to="/profile"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Profile
        </Link>

        <h1 className="font-display text-2xl font-bold text-foreground">Schedule lab</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste any thought. Claude extracts titles + times. Nothing is saved.
        </p>

        <label className="mt-6 block text-xs font-medium text-muted-foreground">
          Timezone
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2">
          {SAMPLES.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setText(s)}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
            >
              Sample {i + 1}
            </button>
          ))}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Type or paste a transcript…"
          className="mt-3 w-full rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-foreground outline-none focus:border-primary/50"
        />

        <button
          type="button"
          disabled={busy}
          onClick={() => void run()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
          Extract with Claude
        </button>

        {overlaps > 0 && (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            {overlaps} overlapping pair(s) — you’d be asked to change times on the map.
          </p>
        )}

        <div className="mt-4 space-y-2">
          {rows.length === 0 && !busy && (
            <p className="text-center text-sm text-muted-foreground">No results yet.</p>
          )}
          {rows.map((r, i) => (
            <div
              key={`${r.title}-${r.start}-${i}`}
              className="rounded-xl border border-border bg-surface p-3"
            >
              <p className="font-semibold text-foreground">{r.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {r.category}
                {" · "}
                {r.start
                  ? new Date(r.start).toLocaleString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: timezone,
                    })
                  : "—"}
                {r.end
                  ? ` → ${new Date(r.end).toLocaleString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: timezone,
                    })}`
                  : ""}
              </p>
              <p className="mt-1 text-[11px] italic text-muted-foreground/80">{r.source}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
