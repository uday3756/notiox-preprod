/**
 * Feature 1 — small "Today's wins" card on the Home page.
 *
 * Dark-mode dashboard aesthetic (matches the CEO reference mock):
 *   - No borders; card is slightly lighter than the bg for subtle depth.
 *   - Cyan (#35E0F0) accent on the count + icon.
 *   - High border radius (rounded-3xl).
 *
 * Shows the user's win count for today and opens the full-screen WinsSheet on
 * tap. Wins are no longer capped at 3 — the user can record as many as they
 * like (server safety cap is 50). The "3 wins" framing stays as a soft goal
 * but the count display is open-ended. Reads existing daily_wins rows for
 * today's local date via the Supabase client (RLS-scoped) — no server fn
 * needed for a count.
 */
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { WinsSheet } from "./wins-sheet";

function todayLocalDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function WinsCard() {
  const [open, setOpen] = useState(false);

  const { data: count = 0 } = useQuery({
    queryKey: ["daily-wins", "today"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("daily_wins")
        .select("id", { count: "exact", head: true })
        .eq("local_date", todayLocalDate());
      if (error) throw error;
      return count ?? 0;
    },
  });

  // 3 wins is a soft ritual goal — once met, the card celebrates but the
  // user can still add more from the sheet (no hard cap).
  const goalMet = count >= 3;

  return (
    <>
      <motion.button
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => setOpen(true)}
        className="mt-6 flex w-full items-center gap-4 rounded-3xl bg-surface p-5 text-left transition-colors hover:bg-surface-2"
      >
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-cyan/15 text-cyan">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="font-display text-base font-semibold text-foreground">
            {goalMet ? "Today's wins are in" : "Mark today's wins"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {goalMet
              ? `Nice work — ${count} ${count === 1 ? "win" : "wins"} recorded. Tap to add more.`
              : count > 0
                ? `${count} ${count === 1 ? "win" : "wins"} so far — keep going`
                : "A 20-second wind-down ritual."}
          </p>
        </div>
        <span className="font-display text-2xl font-bold text-cyan">{count}</span>
      </motion.button>

      <WinsSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
