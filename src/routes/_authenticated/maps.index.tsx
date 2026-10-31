import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import { Network, Plus, LayoutGrid, List, CalendarDays, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotioLogo } from "@/components/notio/logo";
import { SchedulingSection } from "@/components/notio/scheduling-section";
import { LazyThumbnail } from "@/components/notio/lazy-thumbnail";
import { HorizontalMapGallery } from "@/components/notio/horizontal-map-gallery";
import { WinsCard } from "@/components/notio/wins-card";
import { WeeklyReportCard } from "@/components/notio/weekly-report-card";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/maps/")({
  component: MapsList,
});

type View = "gallery" | "list";

function MapsList() {
  const [view, setView] = useState<View>("gallery");

  const { data, isLoading } = useQuery({
    queryKey: ["maps"],
    queryFn: async () => {
      const { data: maps, error } = await supabase
        .from("maps")
        .select("id, title, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!maps?.length) return [];

      // Fetch node positions for every map in one query, then group by map so
      // each card can render a top-down thumbnail of the actual mindmap shape.
      const { data: nodes } = await supabase
        .from("nodes")
        .select("id, map_id, parent_id, x, y")
        .in("map_id", maps.map((m) => m.id));

      const byMap = new Map<string, { id: string; parent_id: string | null; x: number; y: number }[]>();
      for (const n of nodes ?? []) {
        const arr = byMap.get(n.map_id) ?? [];
        arr.push({ id: n.id, parent_id: n.parent_id, x: n.x, y: n.y });
        byMap.set(n.map_id, arr);
      }
      return maps.map((m) => ({ ...m, nodes: byMap.get(m.id) ?? [] }));
    },
  });

  return (
    <div className="notiox-screen notiox-maps mx-auto max-w-md px-6 pt-10 pb-28 lg:max-w-6xl lg:px-8">
      <div className="flex items-center justify-between">
        <NotioLogo className="text-xl" />
        <span className="text-xs text-muted-foreground">Maps</span>
      </div>

      <div className="mt-8 flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">Your maps</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every thought, organized.</p>
        </div>
        {/* Gallery / list toggle - gallery is the default so visual learners
            recognize a map by its shape. */}
        {!!data?.length && (
          <div className="flex rounded-full border border-border bg-surface p-1">
            <button
              onClick={() => setView("gallery")}
              aria-label="Gallery view"
              className={`rounded-full p-1.5 transition-colors ${
                view === "gallery" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("list")}
              aria-label="List view"
              className={`rounded-full p-1.5 transition-colors ${
                view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {isLoading && <p className="mt-10 text-sm text-muted-foreground">Loading...</p>}

      {!isLoading && (!data || data.length === 0) && (
        <div className="mt-12 rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center">
          <Network className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">No maps yet. Capture your first thought.</p>
          <Link
            to="/capture"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Capture
          </Link>
        </div>
      )}

      {/* A partial next card and arrow controls expose the horizontal gallery. */}
      {view === "gallery" && !!data?.length && (
        <HorizontalMapGallery>
          {data.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Link
                to="/maps/$id"
                params={{ id: m.id }}
                className="block overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-primary/50"
              >
                <div className="aspect-square w-full overflow-hidden">
                  <LazyThumbnail nodes={m.nodes} />
                </div>
                <div className="p-2">
                  <h3 className="truncate font-display text-sm font-semibold">{m.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                  </p>
                </div>
              </Link>
            </motion.div>
          ))}
        </HorizontalMapGallery>
      )}

      {/* List view - compact vertical rows */}
      {view === "list" && !!data?.length && (
        <div className="mt-6 space-y-3">
          {data.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Link
                to="/maps/$id"
                params={{ id: m.id }}
                className="block rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary/50"
              >
                <h3 className="font-display text-lg font-semibold">{m.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      {/* Feature 1 — 3 Wins card. Gated on the dailyWins flag. */}
      {FEATURE_FLAGS.dailyWins && <WinsCard />}

      {/* Feature 2 — Weekly Reflection Report card. Gated on the
          weeklyReflection flag. Only renders if a report row exists. */}
      {FEATURE_FLAGS.weeklyReflection && <WeeklyReportCard />}

      <details className="notiox-plan-disclosure">
        <summary>
          <span><CalendarDays className="h-5 w-5" aria-hidden="true" />Plan</span>
          <ChevronDown className="notiox-plan-chevron h-5 w-5" aria-hidden="true" />
        </summary>
        <div className="notiox-plan-content"><SchedulingSection /></div>
      </details>
    </div>
  );
}
