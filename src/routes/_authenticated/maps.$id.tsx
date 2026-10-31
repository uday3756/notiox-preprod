import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MindmapCanvas, type NotioNode } from "@/components/notio/mindmap-canvas";
import { NodeTodoList } from "@/components/notio/node-todo";
import { AutoScheduleFromTranscript } from "@/components/notio/auto-schedule-from-transcript";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { deleteMyMap } from "@/lib/maps.functions";

export const Route = createFileRoute("/_authenticated/maps/$id")({
  component: MapDetail,
});

function MapDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const deleteMapFn = useServerFn(deleteMyMap);

  const { data, isLoading } = useQuery({
    queryKey: ["map", id],
    queryFn: async () => {
      // Get current user for ownership check (defense-in-depth alongside RLS)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication required.");

      const [{ data: map, error: mErr }, { data: nodes, error: nErr }, { data: links }] = await Promise.all([
        // Ownership check: map must belong to the authenticated user (RLS + app-level filter)
        supabase
          .from("maps")
          .select("*")
          .eq("id", id)
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .single(),
        // Load nodes for the map (RLS enforces map ownership via the map's user_id)
        supabase.from("nodes").select("*").eq("map_id", id),
        // node_links may not exist yet if the migration hasn't been applied -
        // tolerate failure so the map still loads.
        supabase.from("node_links").select("id, source_node_id, target_node_id").eq("map_id", id),
      ]);
      if (mErr) throw new Error("Failed to load map. Please try again.");
      if (nErr) throw new Error("Failed to load map. Please try again.");
      return { map, nodes: nodes as NotioNode[], links: links ?? [] };
    },
  });

  async function handleDelete() {
    const ok = window.confirm(
      "Remove this map from your list? Free plans still count it toward your monthly limit. Pro can delete permanently.",
    );
    if (!ok) return;
    try {
      const res = await deleteMapFn({ data: { mapId: id } });
      await qc.invalidateQueries({ queryKey: ["maps"] });
      toast.success(res.mode === "hard" ? "Map deleted" : "Map removed from your list");
      navigate({ to: "/maps" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove map. Please try again.");
    }
  }

  return (
    <div className="mx-auto max-w-md px-6 pt-6 pb-28">
      <div className="flex items-center justify-between">
        <Link to="/maps" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Maps
        </Link>
        {data?.map && (
          <button onClick={handleDelete} className="rounded-full p-2 text-muted-foreground hover:bg-destructive/15 hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {isLoading && <p className="mt-10 text-sm text-muted-foreground">Loading map...</p>}

      {data?.map && (
        <>
          <h1 className="mt-6 font-display text-3xl font-bold">{data.map.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.nodes.length} nodes
          </p>
          <div className="mt-6">
            <MindmapCanvas nodes={data.nodes} mapId={id} links={data.links} />
          </div>

          <NodeTodoList nodes={data.nodes} mapId={id} />

          {data.map.transcript && !FEATURE_FLAGS.workflow && (
            <AutoScheduleFromTranscript
              transcript={data.map.transcript}
              mapId={id}
              nodes={data.nodes}
              createdAt={data.map.created_at}
              scheduleChecked={data.map.schedule_checked ?? false}
            />
          )}

          {data.map.transcript && (
            <details className="mt-6 rounded-2xl border border-border bg-surface p-5 text-sm">
              <summary className="cursor-pointer font-medium">Original transcript</summary>
              <p className="mt-3 whitespace-pre-wrap text-muted-foreground">{data.map.transcript}</p>
            </details>
          )}
        </>
      )}
    </div>
  );
}
