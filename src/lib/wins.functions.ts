/**
 * Feature 1 — End-of-Day "3 Wins" Report: server functions.
 *
 * The nightly flow itself is local-first per spec ("No LLM call is required for
 * the nightly flow itself — it is pure local data + UI"). These server fns only
 * persist wins to Supabase and read them back. The candidate-wins list (today's
 * completed tasks) is fetched directly by the client via the Supabase SDK (RLS
 * enforces ownership), same pattern as scheduling-section.tsx.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ------------------------------------------------------------------
// Save one win
// ------------------------------------------------------------------

const SaveWinInput = z.object({
  winText: z.string().trim().min(1).max(280),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD in user's TZ
  source: z.enum(["task", "manual"]).default("manual"),
  taskId: z.string().uuid().nullable().optional(),
});

export const saveWin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SaveWinInput.parse(input))
  .handler(async ({ data, context }) => {
    // Safety cap: 50 wins per (user, local_date) — generous upper bound to
    // prevent runaway rows / abuse, but lets users record well past the
    // original 3-win ritual. The sheet UI no longer enforces a 3-win limit.
    const { count, error: countErr } = await context.supabase
      .from("daily_wins")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("local_date", data.localDate);
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) >= 50) {
      throw new Error("You've reached today's win limit (50). Come back tomorrow!");
    }

    const { data: row, error } = await context.supabase
      .from("daily_wins")
      .insert({
        user_id: context.userId,
        local_date: data.localDate,
        win_text: data.winText,
        source: data.source,
        task_id: data.taskId ?? null,
      })
      .select("id, local_date, win_text, source, task_id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

// ------------------------------------------------------------------
// Read wins for a date range (used by the sheet, the weekly report, and the
// "has completed today?" check). Range is inclusive on both ends.
// ------------------------------------------------------------------

const GetWinsInput = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const getWins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => GetWinsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("daily_wins")
      .select("id, local_date, win_text, source, task_id, created_at")
      .eq("user_id", context.userId)
      .gte("local_date", data.startDate)
      .lte("local_date", data.endDate)
      .order("local_date", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ------------------------------------------------------------------
// Delete a win (lets a user undo a mis-tap inside the sheet before Done)
// ------------------------------------------------------------------

const DeleteWinInput = z.object({ id: z.string().uuid() });

export const deleteWin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => DeleteWinInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("daily_wins")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------------------------------------------------------------
// Edit a win's text (lets a user fix a typo / refine a manually-entered win)
// ------------------------------------------------------------------

const EditWinInput = z.object({
  id: z.string().uuid(),
  winText: z.string().trim().min(1).max(280),
});

export const editWin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => EditWinInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("daily_wins")
      .update({ win_text: data.winText })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id, local_date, win_text, source, task_id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
