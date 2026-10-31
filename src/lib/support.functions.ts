import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TICKET_TYPES } from "@/lib/support";

type AnyAdmin = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

const ticketTypeValues = TICKET_TYPES.map((t) => t.value) as [string, ...string[]];

// Friendly messages for exceptions raised by submit_support_ticket().
const TICKET_ERRORS: Record<string, string> = {
  SUBJECT_REQUIRED: "Please enter a subject.",
  DESCRIPTION_REQUIRED: "Please describe the issue.",
  INVALID_TICKET_TYPE: "Please choose a valid ticket type.",
  NOT_AUTHENTICATED: "Your session expired — please sign in again.",
};

/**
 * Create a support ticket and award +3 bonus map credits, atomically. The
 * insert + reward run in the SECURITY DEFINER RPC with the JWT-verified user id,
 * so the client can't forge the author or double-claim the reward.
 */
export const submitSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        ticketType: z.enum(ticketTypeValues),
        fullName: z.string().trim().max(200).optional().default(""),
        email: z.string().trim().max(320).optional().default(""),
        subject: z.string().trim().min(1, "Subject is required").max(200),
        description: z.string().trim().min(1, "Description is required").max(5000),
        screenshotUrl: z.string().url().max(1000).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as AnyAdmin;

    const { data: res, error } = await admin.rpc("submit_support_ticket", {
      p_user_id: context.userId,
      p_ticket_type: data.ticketType,
      p_full_name: data.fullName || null,
      p_email: data.email || null,
      p_subject: data.subject,
      p_description: data.description,
      p_screenshot_url: data.screenshotUrl ?? null,
    });

    if (error) {
      const raw = String(error.message ?? "");
      const code = Object.keys(TICKET_ERRORS).find((k) => raw.includes(k));
      throw new Error(code ? TICKET_ERRORS[code] : "Couldn't submit your ticket. Please try again.");
    }

    return {
      id: res.id as string,
      ticketId: res.ticket_id as string,
      creditsAwarded: res.credits_awarded as number,
      bonusCreditsTotal: res.bonus_credits_total as number,
    };
  });
