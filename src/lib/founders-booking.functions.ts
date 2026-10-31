import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const bookingSchema = z.object({
  fullName: z.string().trim().min(2, "Name is required").max(120),
  email: z.string().trim().email("Valid email required").max(254),
  phone: z.string().trim().min(7, "Phone number is required").max(40),
  place: z.string().trim().min(2, "Place is required").max(200),
});

async function optionalUserId(): Promise<string | null> {
  try {
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) return null;

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return null;

    const supabase = createClient<Database>(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

/**
 * Public Founders Lifetime slot claim — stores lead details with a timestamp.
 * Uses service role so the table stays closed to anon/authenticated clients.
 */
export const submitFoundersSlotBooking = createServerFn({ method: "POST" })
  .validator((input: unknown) => bookingSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = await optionalUserId();
    const bookingName = `Lifetime slot — ${data.fullName}`;

    const { data: row, error } = await supabaseAdmin
      .from("founders_slot_bookings")
      .insert({
        full_name: data.fullName,
        email: data.email.toLowerCase(),
        phone: data.phone,
        place: data.place,
        booking_name: bookingName,
        user_id: userId,
      })
      .select("id, booking_name, created_at")
      .single();

    if (error) {
      throw new Error(error.message || "Could not save your booking. Please try again.");
    }

    return {
      id: row.id as string,
      bookingName: row.booking_name as string,
      createdAt: row.created_at as string,
    };
  });
