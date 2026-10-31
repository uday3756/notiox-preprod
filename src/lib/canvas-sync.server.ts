import { supabaseAdmin as supabase } from "@/integrations/supabase/client.server";
import { canvasMcpConfigured } from "./canvas-mcp.server";

export async function enqueueCanvasRefresh(userId: string, connectionId: string) {
  const { data, error } = await supabase
    .from("canvas_sync_jobs")
    .insert({
      user_id: userId,
      connection_id: connectionId,
      state: "queued",
      epoch: 1,
    })
    .select("id")
    .single();
  if (error) throw new Error("Couldn't enqueue Canvas sync.");
  return { jobId: data.id, mcp: canvasMcpConfigured() };
}
