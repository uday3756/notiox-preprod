/**
 * Feature 1 — "Today's Wins" full-screen sheet.
 *
 * Flow:
 *   1. Candidate list = scheduling_nodes completed today (RLS-scoped client
 *      query — same pattern as scheduling-section.tsx). Each is a tappable
 *      card. Tapping marks it as a win (saves to daily_wins) with a checkmark
 *      animation + navigator.vibrate haptic.
 *   2. "Add your own win" — free-text input OR voice via the existing browser
 *      Web Speech STT path (reused from capture.tsx). Saved as a manual win.
 *   3. After the 3rd win OR tapping Done → closing screen: the 3 wins listed
 *      together + a warm neutral line. No scores, no streaks.
 *
 * Completable in <20s — it's a wind-down ritual, not a form.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Mic, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { saveWin, deleteWin, editWin } from "@/lib/wins.functions";
import {
  createContinuousRecognizer,
  isSpeechSupported,
  type ContinuousRecognizer,
} from "@/lib/speech-recognition";

type CandidateTask = {
  id: string;
  title: string;
  completed_at: string | null;
};

type SavedWin = {
  id: string;
  win_text: string;
  source: "task" | "manual";
  task_id: string | null;
};

const CLOSING_LINE = "That's a wrap on today.";

function todayLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function haptic() {
  // Web-standard haptics. No-op on desktop, real vibration on Android Chrome.
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  try {
    navigator.vibrate(15);
  } catch {
    /* ignore */
  }
}

export function WinsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [candidates, setCandidates] = useState<CandidateTask[]>([]);
  const [wins, setWins] = useState<SavedWin[]>([]);
  const [loading, setLoading] = useState(false);
  const [customText, setCustomText] = useState("");
  const [recording, setRecording] = useState(false);
  const [phase, setPhase] = useState<"pick" | "done">("pick");
  const recognizerRef = useRef<ContinuousRecognizer | null>(null);

  const saveWinFn = useServerFn(saveWin);
  const deleteWinFn = useServerFn(deleteWin);
  const editWinFn = useServerFn(editWin);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // Load today's completed tasks (candidate wins) + any already-saved wins
  // (so reopening the sheet mid-ritual shows prior picks).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const today = todayLocalDate();
      const startIso = new Date();
      startIso.setHours(0, 0, 0, 0);
      const endIso = new Date();
      endIso.setHours(23, 59, 59, 999);

      const [tasksRes, winsRes] = await Promise.all([
        supabase
          .from("scheduling_nodes")
          .select("id, title, completed_at")
          .eq("status", "completed")
          .gte("completed_at", startIso.toISOString())
          .lte("completed_at", endIso.toISOString())
          .order("completed_at", { ascending: false }),
        supabase
          .from("daily_wins")
          .select("id, win_text, source, task_id")
          .eq("local_date", today)
          .order("created_at", { ascending: true }),
      ]);

      if (cancelled) return;
      setCandidates((tasksRes.data as CandidateTask[]) ?? []);
      setWins((winsRes.data as SavedWin[]) ?? []);
      // Always start in "pick" so the user can add/edit more wins (no 3-cap).
      setPhase("pick");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
      recognizerRef.current?.stop();
      recognizerRef.current = null;
    };
  }, [open]);

  // Stop mic when the sheet closes.
  useEffect(() => {
    if (!open) {
      recognizerRef.current?.stop();
      recognizerRef.current = null;
      setRecording(false);
    }
  }, [open]);

  async function addWinFromTask(task: CandidateTask) {
    if (wins.some((w) => w.task_id === task.id)) return;
    haptic();
    try {
      const saved = await saveWinFn({
        data: {
          winText: task.title,
          localDate: todayLocalDate(),
          source: "task",
          taskId: task.id,
        },
      });
      setWins((prev) => [...prev, saved as SavedWin]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that win.");
    }
  }

  async function addCustomWin() {
    const text = customText.trim();
    if (!text) return;
    haptic();
    try {
      const saved = await saveWinFn({
        data: { winText: text, localDate: todayLocalDate(), source: "manual" },
      });
      setWins((prev) => [...prev, saved as SavedWin]);
      setCustomText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that win.");
    }
  }

  async function removeWin(id: string) {
    // Optimistic remove — lets the user fix a mis-tap before Done.
    const prev = wins;
    setWins((w) => w.filter((x) => x.id !== id));
    if (editingId === id) setEditingId(null);
    if (phase === "done") setPhase("pick");
    try {
      await deleteWinFn({ data: { id } });
    } catch {
      setWins(prev); // rollback
      toast.error("Couldn't undo that.");
    }
  }

  function startEdit(w: SavedWin) {
    setEditingId(w.id);
    setEditDraft(w.win_text);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  async function saveEdit(id: string) {
    const text = editDraft.trim();
    if (!text) {
      toast.error("Win text can't be empty.");
      return;
    }
    const prev = wins;
    setWins((w) => w.map((x) => (x.id === id ? { ...x, win_text: text } : x)));
    setEditingId(null);
    setEditDraft("");
    try {
      await editWinFn({ data: { id, winText: text } });
      toast.success("Win updated.");
    } catch (err) {
      setWins(prev); // rollback
      toast.error(err instanceof Error ? err.message : "Couldn't update that win.");
    }
  }

  // --- Voice input via browser Web Speech API (same path as capture.tsx) ---
  // Continuous helper (same as Capture) — survives pauses / mobile phrase ends.
  function startVoice() {
    if (!isSpeechSupported()) {
      toast.error("Voice input isn't available in this browser. Type instead.");
      return;
    }
    recognizerRef.current?.stop();
    const seed = customText.trim();
    const rec = createContinuousRecognizer({
      initialTranscript: seed,
      onTranscript: (text) => setCustomText(text),
      onFatalError: (_reason, message) => {
        recognizerRef.current = null;
        setRecording(false);
        toast.error(message);
      },
    });
    if (!rec) {
      setRecording(false);
      return;
    }
    recognizerRef.current = rec;
    setRecording(true);
  }

  function stopVoice() {
    const rec = recognizerRef.current;
    if (rec) {
      const text = rec.getTranscript();
      if (text) setCustomText(text);
      rec.stop();
    }
    recognizerRef.current = null;
    setRecording(false);
  }

  const candidateIds = useMemo(() => new Set(wins.map((w) => w.task_id)), [wins]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm"
        >
          <div className="mx-auto flex h-full max-w-md flex-col px-6 pt-10 pb-[env(safe-area-inset-bottom)]">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  {phase === "pick" ? "Today's wins" : "Nice work"}
                </p>
                <h1 className="mt-1 font-display text-2xl font-bold">
                  {phase === "pick"
                    ? wins.length === 0
                      ? "What went well today?"
                      : `${wins.length} ${wins.length === 1 ? "win" : "wins"} picked`
                    : "That's a wrap on today."}
                </h1>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {phase === "pick" ? (
              <div className="mt-6 flex-1 overflow-y-auto pb-4">
                {loading && (
                  <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
                )}

                {!loading && candidates.length === 0 && wins.length === 0 && (
                  <p className="py-6 text-sm text-muted-foreground">
                    No completed tasks today. Add your own wins below — even small ones count.
                  </p>
                )}

                {/* Already-saved wins (with edit + undo) */}
                {wins.length > 0 && (
                  <div className="mb-4 space-y-2">
                    {wins.map((w) => (
                      <motion.div
                        key={w.id}
                        layout
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 p-3"
                      >
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-4 w-4" />
                        </span>
                        {editingId === w.id ? (
                          <div className="flex flex-1 flex-col gap-2">
                            <textarea
                              value={editDraft}
                              onChange={(e) => setEditDraft(e.target.value)}
                              rows={2}
                              autoFocus
                              className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => saveEdit(w.id)}
                                className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="flex-1 text-sm font-medium text-foreground">{w.win_text}</p>
                            <button
                              onClick={() => startEdit(w)}
                              aria-label="Edit win"
                              className="rounded-full p-1 text-muted-foreground hover:text-primary"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => removeWin(w.id)}
                              aria-label="Remove win"
                              className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Candidate task cards */}
                {candidates.length > 0 && (
                  <>
                    <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                      Tap to add
                    </p>
                    <div className="space-y-2">
                      {candidates.map((task) => {
                        const picked = candidateIds.has(task.id);
                        return (
                          <button
                            key={task.id}
                            disabled={picked}
                            onClick={() => addWinFromTask(task)}
                            className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
                              picked
                                ? "border-primary/40 bg-primary/10"
                                : "border-border bg-surface hover:border-primary/50"
                            }`}
                          >
                            <span
                              className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
                                picked
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border text-muted-foreground"
                              }`}
                            >
                              <Check className="h-4 w-4" />
                            </span>
                            <p className="flex-1 text-sm font-medium text-foreground">
                              {task.title}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Add your own win */}
                <div className="mt-6 rounded-2xl border border-border bg-surface p-3">
                  <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                    Add your own win
                  </p>
                    <div className="flex items-end gap-2">
                      <textarea
                        value={customText}
                        onChange={(e) => setCustomText(e.target.value)}
                        placeholder="e.g. I went for a walk"
                        rows={2}
                        className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                      />
                      <div className="flex flex-col gap-1">
                        {recording ? (
                          <button
                            onClick={stopVoice}
                            aria-label="Stop voice"
                            className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={startVoice}
                            aria-label="Voice win"
                            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:border-primary hover:text-primary"
                          >
                            <Mic className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={addCustomWin}
                          disabled={!customText.trim()}
                          aria-label="Add win"
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-50"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                </div>

                {wins.length > 0 && (
                  <button
                    onClick={() => setPhase("done")}
                    className="mt-6 w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground"
                  >
                    Done
                  </button>
                )}
              </div>
            ) : (
              // Closing screen — 3 wins listed + warm line. No scores, no streaks.
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-8 flex-1 overflow-y-auto pb-4"
              >
                <div className="space-y-3">
                  {wins.map((w, i) => (
                    <motion.div
                      key={w.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4"
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Check className="h-4 w-4" />
                      </span>
                      <p className="text-sm font-medium text-foreground">{w.win_text}</p>
                    </motion.div>
                  ))}
                </div>
                <p className="mt-8 text-center text-sm text-muted-foreground">{CLOSING_LINE}</p>
                <button
                  onClick={onClose}
                  className="mt-6 w-full rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground"
                >
                  Close
                </button>
                <button
                  onClick={() => setPhase("pick")}
                  className="mt-3 w-full rounded-full border border-border py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Add more wins
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
