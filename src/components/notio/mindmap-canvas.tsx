import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, Pencil, Check, X, Wand2, GitBranch, Search, Maximize, Minimize, Scan, ZoomIn, ZoomOut } from "lucide-react";
import { descendantIds, mapGeometry } from "@/lib/map-viewport";
import { MapTaskActions } from "./map-task-actions";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { supabase } from "@/integrations/supabase/client";
import { radialLayout } from "@/lib/layout";
import { updateLocalStyleProfile } from "@/lib/style-profile";
import { toast } from "sonner";

export type NotioNode = {
  id: string;
  parent_id: string | null;
  label: string;
  detail: string | null;
  x: number;
  y: number;
  priority?: number | null;
  done?: boolean | null;
  own_words?: string | null;
  category?: string | null; // AI-tagged grouping, e.g. "coaching", "discovery"
  color_override?: string | null; // explicit hex the user picked ("#F2A65A")
  time_block?: "morning" | "afternoon" | "evening" | null;
  time_block_source?: "explicit" | "inferred" | "default" | "user_corrected" | null;
  completed_at?: string | null;
  logical_date?: string | null;
};

export type NodeLink = {
  id: string;
  source_node_id: string;
  target_node_id: string;
};

// Per-category → hex color map, loaded from the `category_colors` table.
export type CategoryColors = Record<string, string>;

// Node color feature (CEO handoff): similar nodes share a color. The palette is
// chosen for reasonable separation (colorblind-friendliness) and matches the
// handoff spec. One tap in the node sheet recolors; a manual choice always wins.
export const CATEGORY_PALETTE = [
  { name: "Amber", hex: "#F2A65A" },
  { name: "Red", hex: "#E5556E" },
  { name: "Teal", hex: "#35E0C2" },
  { name: "Blue", hex: "#3B92FF" },
  { name: "Purple", hex: "#9B7CF6" },
  { name: "Pink", hex: "#EC6FB0" },
  { name: "Green", hex: "#4FCB7B" },
  { name: "Slate", hex: "#8A93A6" },
] as const;

// Deterministic fallback so the same category always maps to the same palette
// color even before anyone has explicitly recolored it.
function paletteForCategory(category: string): string {
  let h = 0;
  for (const ch of category) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length].hex;
}

// Single source of truth for a node's color — used for BOTH the node fill and
// its branch link stroke so a node and its line always match. Precedence:
//   1. explicit user override  2. category color map  3. deterministic palette
//   4. the structural branch color (preserves existing maps with no category).
export function resolveNodeColor(
  node: NotioNode,
  categoryColors: CategoryColors,
  branchFallback: string,
): string {
  if (node.color_override) return node.color_override;
  if (node.category && categoryColors[node.category]) return categoryColors[node.category];
  if (node.category) return paletteForCategory(node.category);
  return branchFallback;
}

const PRIORITY_LABELS = ["None", "Low", "Medium", "High"] as const;
const PRIORITY_COLORS = [
  "oklch(0.4 0.02 260)", // 0 none — grey
  "oklch(0.5 0.08 200)", // 1 low — teal
  "oklch(0.7 0.16 80)", // 2 medium — amber
  "oklch(0.65 0.22 25)", // 3 high — red
];

// Branch color palette — spec proposal first (rose / blue / amber), then
// complementary hues for maps with more than three top-level functions.
const BRANCH_COLORS = [
  "#F43F5E", // Rose
  "#2563EB", // Blue
  "#F59E0B", // Amber
  "#10B981", // Emerald
  "#8B5CF6", // Violet
  "#EC4899", // Pink
] as const;

type DragState = { id: string; offsetX: number; offsetY: number; startX: number; startY: number; moved: boolean };

// Find the first-level branch ancestor (direct child of root) for any node
function findBranchId(nodeId: string, nodes: NotioNode[]): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let current = byId.get(nodeId);

  while (current) {
    if (!current.parent_id) {
      // Reached root, current is a first-level branch
      return current.id;
    }
    const parent = byId.get(current.parent_id);
    if (!parent || !parent.parent_id) {
      // Parent is root, so current is a first-level branch
      return current.id;
    }
    current = parent;
  }

  return null;
}

// Get the hex color for a branch.
// Rule: each top-level function (direct child of root) gets its own palette
// color; every sub-task inherits its parent function's color. Mapping is by
// stable branch order and deterministic — no AI, no guessing.
function getBranchColor(branchId: string | null, nodes: NotioNode[]): string {
  if (!branchId) return "oklch(0.62 0.17 255)"; // Root — neutral

  // The root is the node with no parent.
  const root = nodes.find((n) => !n.parent_id);
  if (!root) return "oklch(0.62 0.17 255)";

  // First-level branches = direct children of the root, in stable id order so
  // the color assignment stays consistent across renders.
  const firstLevelNodes = nodes
    .filter((n) => n.parent_id === root.id)
    .sort((a, b) => a.id.localeCompare(b.id));

  const branchIndex = firstLevelNodes.findIndex((n) => n.id === branchId);
  if (branchIndex === -1) return "oklch(0.62 0.17 255)";
  return BRANCH_COLORS[branchIndex % BRANCH_COLORS.length];
}

export function MindmapCanvas({
  nodes,
  mapId,
  links = [],
  draftMode = false,
}: {
  nodes: NotioNode[];
  mapId?: string;
  links?: NodeLink[];
  /** Preview-only: no Supabase writes, color reads, or server calls. */
  draftMode?: boolean;
}) {
  const persistEnabled = Boolean(mapId) && !draftMode;
  // Local working copy so drags/edits feel instant; re-syncs when the query refetches.
  const [items, setItems] = useState<NotioNode[]>(nodes);
  const [linkItems, setLinkItems] = useState<NodeLink[]>(links);
  const [categoryColors, setCategoryColors] = useState<CategoryColors>({});
  const [colorScope, setColorScope] = useState<"node" | "category">("node");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [navigatorOpen,setNavigatorOpen]=useState(false);
  const [nodeSearch,setNodeSearch]=useState("");
  const [editing, setEditing] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [linking, setLinking] = useState(false); // "Branch a Thought" picker open
  const [linkQuery, setLinkQuery] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftDetail, setDraftDetail] = useState("");
  const [ownWords, setOwnWords] = useState("");
  const [savingOwnWords, setSavingOwnWords] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);
  const qc = useQueryClient();

  // Zoom/pan state (mirrors transformRef, which is the synchronous source of
  // truth so rapid pointer events don't fight stale closures).
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Single source of truth for the current transform. We mutate this
  // synchronously inside pointer handlers (zoom-to-point math needs the exact
  // current scale+translate together) then flush to React state for rendering.
  const transformRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // How much of the raw pinch delta to apply. 1 = 1:1 (felt too sensitive to
  // beta users); 0.5 makes zoom calmer and more controllable.
  const PINCH_DAMPING = 0.5;

  // Gesture tracking
  const pointerRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchDistRef = useRef<number | null>(null);
  const lastTapRef = useRef(0);
  const tapCountRef = useRef(0);

  function flushTransform() {
    setScale(transformRef.current.scale);
    setTranslateX(transformRef.current.tx);
    setTranslateY(transformRef.current.ty);
  }

  function resetTransform() {
    transformRef.current = { scale: 1, tx: 0, ty: 0 };
    flushTransform();
  }

  // Measure the canvas's on-screen aspect ratio so the map can spread to fill
  // a landscape (desktop) container instead of being letterboxed into a narrow
  // vertical strip. On a tall/portrait (mobile) container this stays ~1 and the
  // layout is untouched. Also measure width/height for responsive font sizing.
  const [containerAspect, setContainerAspect] = useState(1.6);
  const [containerWidth, setContainerWidth] = useState(800);
  const [containerHeight, setContainerHeight] = useState(400);
  const [frame, setFrame] = useState(() => ({ mapId, geometry: mapGeometry(nodes, 1.6), populated: nodes.length > 0 }));
  useEffect(() => {
    if (frame.mapId !== mapId || (!frame.populated && nodes.length > 0)) {
      setFrame({ mapId, geometry: mapGeometry(nodes,containerAspect), populated: nodes.length > 0 });
      resetTransform();
    }
  }, [mapId,nodes,frame,containerAspect]);
  useEffect(() => {
    if (!isFullscreen) return;
    const exit = () => setIsFullscreen(false);
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Escape") exit(); };
    document.addEventListener("keydown",keyboard); window.addEventListener("notio:exit-fullscreen",exit);
    const overflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown",keyboard); window.removeEventListener("notio:exit-fullscreen",exit); };
  }, [isFullscreen]);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box && box.height > 0) {
        setContainerAspect(box.width / box.height);
        setContainerWidth(box.width);
        setContainerHeight(box.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setItems(nodes);
  }, [nodes]);

  useEffect(() => {
    setLinkItems(links);
  }, [links]);

  // Load the per-map category → color map. Tolerates a missing table (feature
  // migration not yet applied) so the map still renders with palette defaults.
  useEffect(() => {
    if (!mapId || draftMode) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("category_colors")
        .select("category, color")
        .eq("map_id", mapId);
      if (cancelled || error || !data) return;
      const map: CategoryColors = {};
      for (const row of data) map[row.category] = row.color;
      setCategoryColors(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [mapId, draftMode]);

  // Wire Capacitor back button to exit fullscreen (Android)
  useEffect(() => {
    if (!isFullscreen) return;
    let unsubscribe: (() => void) | null = null;

    // Capacitor App API is only available in native/Cordova environments
    // Check if Capacitor's App plugin is available via the bridge
    const setupBackButton = () => {
      const capacitorApp = (window as any)?.Capacitor?.Plugins?.App;
      if (capacitorApp && typeof capacitorApp.addListener === "function") {
        try {
          unsubscribe = capacitorApp.addListener("backButton", () => {
            setIsFullscreen(false);
          }).remove;
        } catch {
          // Capacitor listener setup failed — no-op
        }
      }
    };

    setupBackButton();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isFullscreen]);

  const responsiveFontSize = 18;

  function zoomBy(factor: number) {
    const rect=viewportRef.current?.getBoundingClientRect();
    if(!rect)return;
    const current=transformRef.current, next=Math.max(.5,Math.min(12,current.scale*factor)), applied=next/current.scale;
    current.tx=rect.width/2-applied*(rect.width/2-current.tx);
    current.ty=rect.height/2-applied*(rect.height/2-current.ty);
    current.scale=next;flushTransform();
  }

  // Clamp a value between min and max
  function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
  }

  // Hit-test: is (x, y) inside a node circle?
  function hitTestNode(clientX: number, clientY: number): NotioNode | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    const hitRadius = 40; // Node + label area
    for (const n of items) {
      const nx = dispX(n.x);
      const ny = n.y;
      if (Math.hypot(p.x - nx, p.y - ny) < hitRadius) return n;
    }
    return null;
  }

  // Handle SVG pointer events (pan/zoom/gestures on empty areas)
  function onSvgPointerDown(e: React.PointerEvent) {
    // Check if pointer is on a node — if so, let the node handler take it
    const hitNode = hitTestNode(e.clientX, e.clientY);
    if (hitNode) return;

    // Track pointer for pan/pinch
    pointerRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Double-tap detection
    const now = performance.now();
    if (now - lastTapRef.current < 300) {
      tapCountRef.current++;
    } else {
      tapCountRef.current = 1;
    }
    lastTapRef.current = now;
  }

  function onSvgPointerMove(e: React.PointerEvent) {
    const pointers = pointerRef.current;
    if (!pointers.has(e.pointerId)) return;

    // Update this pointer's position
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pts = Array.from(pointers.values());

    if (pts.length >= 2) {
      // ── Pinch zoom, anchored to the midpoint between the two fingers ──
      const [p1, p2] = pts;
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      // First frame of a pinch: record the baseline distance, no zoom yet.
      if (pinchDistRef.current == null) {
        pinchDistRef.current = dist;
        return;
      }

      // Raw factor, then damped toward 1 so the zoom feels calm, not twitchy.
      const rawFactor = dist / pinchDistRef.current;
      const factor = 1 + (rawFactor - 1) * PINCH_DAMPING;
      pinchDistRef.current = dist;

      const cur = transformRef.current;
      const nextScale = clamp(cur.scale * factor, 0.5, 12);
      const applied = nextScale / cur.scale; // real factor after clamping

      // Midpoint of the two fingers, relative to the (untransformed) viewport
      // top-left — that's where transformOrigin sits.
      const rect = viewportRef.current?.getBoundingClientRect();
      const midX = (p1.x + p2.x) / 2 - (rect?.left ?? 0);
      const midY = (p1.y + p2.y) / 2 - (rect?.top ?? 0);

      // Keep the content point under the fingers fixed while scaling:
      //   screen = t + s * content  ⇒  t' = mid - applied * (mid - t)
      cur.tx = midX - applied * (midX - cur.tx);
      cur.ty = midY - applied * (midY - cur.ty);
      cur.scale = nextScale;
      flushTransform();
    } else if (pts.length === 1 && prev) {
      // ── Single-finger pan ──
      const cur = transformRef.current;
      cur.tx += e.clientX - prev.x;
      cur.ty += e.clientY - prev.y;
      flushTransform();
    }
  }

  function onSvgPointerUp(e: React.PointerEvent) {
    if (!pointerRef.current.has(e.pointerId)) return;
    pointerRef.current.delete(e.pointerId);

    // Dropping below two fingers ends the current pinch; clear the baseline so
    // the next pinch re-establishes it (prevents a jump).
    if (pointerRef.current.size < 2) {
      pinchDistRef.current = null;
    }

    if (pointerRef.current.size === 0) {
      // Double-tap on an empty area resets zoom/pan.
      if (tapCountRef.current >= 2 && performance.now() - lastTapRef.current < 300) {
        resetTransform();
        tapCountRef.current = 0;
      }
    }
  }

  const selected = items.find((n) => n.id === selectedId) ?? null;

  // Keep the "own words" draft in sync with whichever node is open.
  useEffect(() => {
    setOwnWords(selected?.own_words ?? "");
  }, [selectedId, selected?.own_words]);

  function refetch() {
    if (persistEnabled && mapId) qc.invalidateQueries({ queryKey: ["map", mapId] });
  }

  // Feature 7: the explanation is map content (-> Supabase, on the node); the
  // user's talking style is derived and stored local-only (-> style-profile).
  async function saveOwnWords() {
    if (!selected) return;
    const text = ownWords.trim();
    setSavingOwnWords(true);
    try {
      updateLocalStyleProfile(text); // (b) local-only, never sent to the server
      setItems((cur) =>
        cur.map((it) => (it.id === selected.id ? { ...it, own_words: text } : it)),
      );
      if (!persistEnabled) return;
      const { error } = await supabase
        .from("nodes")
        .update({ own_words: text }) // (a) map content
        .eq("id", selected.id);
      if (error) {
        toast.error(
          error.message?.includes("own_words")
            ? "This needs the own_words column - apply the migration first."
            : "Couldn't save your explanation.",
        );
      } else {
        toast.success("Saved in your words");
        refetch();
      }
    } finally {
      setSavingOwnWords(false);
    }
  }

  // ── screen → svg coordinate conversion ──
  function toSvg(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  function onPointerDown(e: React.PointerEvent, n: NotioNode) {
    e.stopPropagation();
    const p = toSvg(e.clientX, e.clientY);
    // Pointer/SVG coords are in display space (x spread for landscape); the
    // offset is taken there and converted back to canonical x on store.
    drag.current = { id: n.id, offsetX: p.x - dispX(n.x), offsetY: p.y - n.y, startX: e.clientX, startY: e.clientY, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 4) return;
    d.moved = true;
    const p = toSvg(e.clientX, e.clientY);
    const nx = invX(p.x - d.offsetX); // display → canonical
    const ny = p.y - d.offsetY;
    setItems((cur) => cur.map((it) => (it.id === d.id ? { ...it, x: nx, y: ny } : it)));
  }

  async function onPointerUp(e: React.PointerEvent, n: NotioNode) {
    const d = drag.current;
    drag.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    if (!d) return;
    if (!d.moved) {
      setSelectedId(n.id);
      setEditing(false);
      return;
    }
    const moved = items.find((it) => it.id === n.id);
    if (!moved) return;
    if (!persistEnabled) return;
    const { error } = await supabase.from("nodes").update({ x: moved.x, y: moved.y }).eq("id", n.id);
    if (error) toast.error("Couldn't save position");
    else refetch();
  }

  async function changePriority(p: number) {
    if (!selected) return;
    setItems((cur) => cur.map((it) => (it.id === selected.id ? { ...it, priority: p } : it)));
    if (!persistEnabled) return;
    const { error } = await supabase.from("nodes").update({ priority: p }).eq("id", selected.id);
    if (error) toast.error("Couldn't update priority");
    else refetch();
  }

  // ── In-node color picker (CEO handoff) ──
  // Optimistic → persist → sync. A manual choice always wins over auto color.
  const migrationHint =
    "This needs the color columns — apply the node-color migration first.";

  // Recolor just the selected node (writes color_override; wins over category).
  async function pickNodeColor(color: string) {
    if (!selected) return;
    const id = selected.id;
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, color_override: color } : it)));
    if (!persistEnabled) return;
    const { error } = await supabase.from("nodes").update({ color_override: color }).eq("id", id);
    if (error) {
      toast.error(error.message?.includes("color_override") ? migrationHint : "Couldn't save color");
    } else {
      refetch();
    }
  }

  // Recolor the whole category. Clears per-node overrides in that category so
  // the new category color actually shows (per the handoff edge-case rule).
  async function pickCategoryColor(color: string) {
    if (!selected?.category || !mapId) return;
    const cat = selected.category;
    setCategoryColors((cur) => ({ ...cur, [cat]: color }));
    setItems((cur) =>
      cur.map((it) => (it.category === cat ? { ...it, color_override: null } : it)),
    );
    if (!persistEnabled) return;
    const [{ error: catErr }, { error: nodeErr }] = await Promise.all([
      supabase
        .from("category_colors")
        .upsert({ map_id: mapId, category: cat, color }, { onConflict: "map_id,category" }),
      supabase.from("nodes").update({ color_override: null }).eq("map_id", mapId).eq("category", cat),
    ]);
    if (catErr || nodeErr) {
      const msg = catErr?.message ?? nodeErr?.message ?? "";
      toast.error(msg.includes("category_colors") || msg.includes("color_override") ? migrationHint : "Couldn't save color");
    } else {
      refetch();
    }
  }

  // "Reset to auto" — clear the override so the node returns to its category /
  // branch color.
  async function resetNodeColor() {
    if (!selected) return;
    const id = selected.id;
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, color_override: null } : it)));
    if (!persistEnabled) return;
    const { error } = await supabase.from("nodes").update({ color_override: null }).eq("id", id);
    if (error) toast.error(error.message?.includes("color_override") ? migrationHint : "Couldn't reset color");
    else refetch();
  }

  function startEdit() {
    if (!selected) return;
    setDraftLabel(selected.label);
    setDraftDetail(selected.detail ?? "");
    setEditing(true);
  }

  async function saveEdit() {
    if (!selected) return;
    const label = draftLabel.trim();
    if (!label) {
      toast.error("Label can't be empty.");
      return;
    }
    setItems((cur) => cur.map((it) => (it.id === selected.id ? { ...it, label, detail: draftDetail } : it)));
    setEditing(false);
    if (!persistEnabled) return;
    const { error } = await supabase
      .from("nodes")
      .update({ label, detail: draftDetail })
      .eq("id", selected.id);
    if (error) toast.error("Couldn't save changes");
    else {
      toast.success("Saved");
      refetch();
    }
  }

  async function deleteNode() {
    if (!selected) return;
    const hasChildren = items.some((it) => it.parent_id === selected.id);
    const msg = hasChildren
      ? "Delete this node and all its children? This can't be undone."
      : "Delete this node? This can't be undone.";
    if (!confirm(msg)) return;
    const id = selected.id;
    setSelectedId(null);
    const removed = descendantIds(items, id);
    const previousItems = items;
    // Preserve pan/zoom (transformRef) and avoid refetch viewBox jumps.
    setItems((cur) => cur.filter((it) => !removed.has(it.id)));
    if (!persistEnabled) return;
    const { error } = await supabase.from("nodes").delete().eq("id", id);
    if (error) {
      setItems(previousItems);
      toast.error("Couldn't delete");
    } else {
      toast.success("Deleted");
      if (mapId) {
        qc.setQueryData(["map", mapId], (old: unknown) => {
          if (!old || typeof old !== "object") return old;
          const record = old as { nodes?: Array<{ id: string }> };
          if (!Array.isArray(record.nodes)) return old;
          return {
            ...record,
            nodes: record.nodes.filter((n) => !removed.has(n.id)),
          };
        });
      }
    }
  }

  // "Branch a Thought" — manually link the selected node to another node.
  async function createLink(targetId: string) {
    if (!selected || !mapId) return;
    const sourceId = selected.id;
    if (sourceId === targetId) return;

    // Already linked (either direction)? Skip.
    const exists = linkItems.some(
      (l) =>
        (l.source_node_id === sourceId && l.target_node_id === targetId) ||
        (l.source_node_id === targetId && l.target_node_id === sourceId),
    );
    if (exists) {
      toast("These thoughts are already connected.");
      setLinking(false);
      return;
    }

    if (!persistEnabled) {
      setLinking(false);
      return;
    }
    const { data, error } = await supabase
      .from("node_links")
      .insert({ map_id: mapId, source_node_id: sourceId, target_node_id: targetId })
      .select("id, source_node_id, target_node_id")
      .single();

    if (error) {
      toast.error(
        error.message?.includes("node_links")
          ? "Linking needs the node_links table — apply the migration first."
          : "Couldn't connect those thoughts.",
      );
      return;
    }
    if (data) {
      setLinkItems((prev) => [...prev, data]);
      const target = items.find((n) => n.id === targetId);
      toast.success(`Connected to "${target?.label ?? "node"}"`);
    }
    setLinking(false);
    setLinkQuery("");
  }

  async function removeLink(linkId: string) {
    setLinkItems((prev) => prev.filter((l) => l.id !== linkId));
    if (!persistEnabled) return;
    const { error } = await supabase.from("node_links").delete().eq("id", linkId);
    if (error) toast.error("Couldn't remove the connection.");
  }

  async function autoArrange() {
    if (arranging || !items.length) return;
    setArranging(true);
    const layout = radialLayout(items.map((n) => ({ id: n.id, parent: n.parent_id })));
    const next = items.map((it) => ({ ...it, ...(layout[it.id] ?? { x: it.x, y: it.y }) }));
    setItems(next);
    if (!persistEnabled) {
      setArranging(false);
      return;
    }
    try {
      const results = await Promise.all(
        next.map((it) => supabase.from("nodes").update({ x: it.x, y: it.y }).eq("id", it.id)),
      );
      if (results.some((r) => r.error)) toast.error("Some positions didn't save.");
      else {
        toast.success("Tidied up ✨");
        refetch();
      }
    } finally {
      setArranging(false);
    }
  }

  // The main idea (root) stays visually centered — branches radiate off it in
  // both directions.
  const root = items.find((n) => !n.parent_id) ?? items[0];
  const rootX = frame.geometry.rootX;

  // Landscape spread: a radial map is naturally ~square, which gets letterboxed
  // (narrow vertical strip) inside the wide desktop canvas. We stretch each
  // node's horizontal distance from the root so the map's aspect ratio matches
  // the container — filling the width on desktop. Node coordinates are only
  // transformed for *display*; stored positions (and drags) stay canonical, so
  // the same map also reads correctly on a portrait phone (where spreadX ≈ 1).
  const spreadX = frame.geometry.spread;

  const dispX = (x: number) => rootX + (x - rootX) * spreadX;
  const invX = (x: number) => rootX + (x - rootX) / spreadX;

  const bounds = frame.geometry;

  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  // Display-space lookup (x spread to landscape) for edges/links.
  const byId = new Map(items.map((n) => [n.id, { ...n, x: dispX(n.x) }]));

  return (
    <div
      ref={containerRef}
      data-notio-fullscreen={isFullscreen ? "true" : undefined}
      className={`relative w-full overflow-hidden ${isFullscreen ? "fixed inset-0 z-50 rounded-none border-0" : "rounded-2xl border border-border"}`}
      style={{
        position: isFullscreen ? "fixed" : "relative",
        height: isFullscreen ? "100dvh" : undefined,
        background:
          "radial-gradient(120% 100% at 50% 0%, oklch(0.21 0.04 270) 0%, oklch(0.15 0.025 265) 55%, oklch(0.12 0.02 265) 100%)",
        paddingTop: isFullscreen ? "env(safe-area-inset-top)" : undefined,
        paddingBottom: isFullscreen ? "env(safe-area-inset-bottom)" : undefined,
        paddingLeft: isFullscreen ? "env(safe-area-inset-left)" : undefined,
        paddingRight: isFullscreen ? "env(safe-area-inset-right)" : undefined,
      }}
    >
      {/* Hidden while the node sheet is open — it used to sit UNDER the sheet's
          own header (close/edit/delete) with no z-index, so this bar visually
          overlapped those buttons. Simplest fix: don't show both at once. */}
      {!isFullscreen && !selected && (
        <>
          <button type="button" title="Find node" aria-label="Find node" onClick={()=>setNavigatorOpen(!navigatorOpen)}
            className="absolute left-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background"><Search size={18}/></button>
          <button
            onClick={autoArrange}
            disabled={arranging}
            className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 py-1.5 text-[11px] font-medium text-foreground backdrop-blur transition-colors hover:bg-accent disabled:opacity-60"
          >
            <Wand2 className="h-3.5 w-3.5 text-primary" />
            {arranging ? "Arranging…" : "Auto-arrange"}
          </button>
        </>
      )}
      {navigatorOpen&&!selected&&<section aria-label="Find node" className="absolute left-3 top-16 z-30 w-[calc(100%-24px)] max-w-sm rounded-md border border-border bg-popover p-3 shadow-xl">
        <div className="flex items-center gap-2"><input autoFocus aria-label="Search nodes" className="min-w-0 flex-1 rounded border border-border bg-background p-3 text-sm" value={nodeSearch} onChange={e=>setNodeSearch(e.target.value)}/>
          <button className="flex h-11 w-11 items-center justify-center" aria-label="Close node search" onClick={()=>setNavigatorOpen(false)}><X size={18}/></button></div>
        <ul className="mt-2 max-h-60 overflow-y-auto">{items.filter(n=>n.label.toLowerCase().includes(nodeSearch.toLowerCase())).map(n=><li key={n.id}><button className="min-h-11 w-full break-words px-2 py-3 text-left text-sm hover:bg-accent" onClick={()=>{setSelectedId(n.id);setNavigatorOpen(false);}}>{n.label}</button></li>)}</ul>
      </section>}
      <div
        ref={viewportRef}
        className={`relative overflow-hidden ${isFullscreen ? "h-full" : "h-[50vh]"}`}
        onPointerCancel={onSvgPointerUp}
        onPointerDown={onSvgPointerDown}
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        style={{ touchAction: "none" }}
      >
        <svg
          ref={svgRef}
          viewBox={`${bounds.minX} ${bounds.minY} ${w} ${h}`}
          preserveAspectRatio="xMidYMid meet"
          className="h-full w-full touch-none"
          style={{
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
            transformOrigin: "top left",
            transition: "none",
          }}
        >
        <defs>
          <filter id="nodeShadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="oklch(0 0 0 / 0.5)" />
          </filter>
          {/* Soft glow for nodes — gives depth without neon bloom */}
          <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="edgeFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.66 0.18 255 / 0.15)" />
            <stop offset="100%" stopColor="oklch(0.66 0.18 255 / 0.55)" />
          </linearGradient>
          {/* Radial vignette — darkens edges, focuses the eye on the center */}
          <radialGradient id="vignette" cx="50%" cy="45%" r="75%">
            <stop offset="55%" stopColor="oklch(0 0 0 / 0)" />
            <stop offset="100%" stopColor="oklch(0 0 0 / 0.45)" />
          </radialGradient>
          {/* Subtle dot grid */}
          <pattern id="dotGrid" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="oklch(0.7 0.04 260 / 0.07)" />
          </pattern>
          {/* Central-node gradient fill */}
          <radialGradient id="rootFill" cx="50%" cy="38%" r="70%">
            <stop offset="0%" stopColor="oklch(0.32 0.06 285)" />
            <stop offset="100%" stopColor="oklch(0.16 0.03 270)" />
          </radialGradient>
          <style>{`
            @keyframes pulseBranch {
              0%, 100% { opacity: 0; }
              50% { opacity: 0.22; }
            }
            .pulse-branch { animation: pulseBranch 2.2s ease-in-out infinite; }

            /* Gentle "breathe" — subtle scale on every node, eased and slow */
            @keyframes nodeBreathe {
              0%, 100% { transform: scale(1); }
              50%      { transform: scale(1.035); }
            }
            .node-breathe {
              animation: nodeBreathe 4s ease-in-out infinite;
              transform-box: fill-box;
              transform-origin: center;
            }

            /* Expanding ring on the central / active node */
            @keyframes ringPulse {
              0%   { opacity: 0.35; transform: scale(1); }
              70%  { opacity: 0;    transform: scale(1.6); }
              100% { opacity: 0;    transform: scale(1.6); }
            }
            .ring-pulse {
              animation: ringPulse 2.8s ease-out infinite;
              transform-box: fill-box;
              transform-origin: center;
            }

            /* Respect the user's reduced-motion preference */
            @media (prefers-reduced-motion: reduce) {
              .pulse-branch, .node-breathe, .ring-pulse { animation: none; }
            }
          `}</style>
        </defs>

        {/* Background layers — grid + vignette for an intentional, designed canvas */}
        <rect x={bounds.minX} y={bounds.minY} width={w} height={h} fill="url(#dotGrid)" />
        <rect x={bounds.minX} y={bounds.minY} width={w} height={h} fill="url(#vignette)" pointerEvents="none" />
        {/* edges — gentle curves read far cleaner than crossing straight lines */}
        {items.map((n) => {
          if (!n.parent_id) return null;
          const p = byId.get(n.parent_id);
          if (!p) return null;
          const nx = dispX(n.x);
          const dx = nx - p.x;
          const dy = n.y - p.y;
          const len = Math.hypot(dx, dy) || 1;
          const bow = Math.min(46, len * 0.14);
          const cx = (p.x + nx) / 2 + (-dy / len) * bow;
          const cy = (p.y + n.y) / 2 + (dx / len) * bow;

          const branchId = findBranchId(n.id, items);
          const branchColor = resolveNodeColor(n, categoryColors, getBranchColor(branchId, items));
          const isActiveBranch = selectedId && findBranchId(selectedId, items) === branchId;

          // Scale thickness by hierarchy: primary branches (root → first level)
          // are heaviest; deeper leaf connections taper down.
          const isPrimary = !p.parent_id; // parent is the central/root node
          const strokeWidth = isPrimary ? 5 : 3.25;
          const dash = isPrimary ? "5 7" : "3 6";

          return (
            <g key={`e-${n.id}`}>
              <path
                d={`M ${p.x} ${p.y} Q ${cx} ${cy} ${nx} ${n.y}`}
                fill="none"
                stroke={branchColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={dash}
                opacity={0.65}
              />
              {isActiveBranch && (
                <path
                  d={`M ${p.x} ${p.y} Q ${cx} ${cy} ${nx} ${n.y}`}
                  fill="none"
                  stroke={branchColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={dash}
                  className="pulse-branch"
                />
              )}
            </g>
          );
        })}

        {/* manual links ("Branch a Thought") — distinct dashed connector with arrow */}
        {linkItems.map((l) => {
          const s = byId.get(l.source_node_id);
          const t = byId.get(l.target_node_id);
          if (!s || !t) return null;
          const dx = t.x - s.x;
          const dy = t.y - s.y;
          const len = Math.hypot(dx, dy) || 1;
          const bow = Math.min(60, len * 0.18);
          const cx = (s.x + t.x) / 2 + (-dy / len) * bow;
          const cy = (s.y + t.y) / 2 + (dx / len) * bow;
          return (
            <path
              key={`link-${l.id}`}
              d={`M ${s.x} ${s.y} Q ${cx} ${cy} ${t.x} ${t.y}`}
              fill="none"
              stroke="oklch(0.85 0.02 260)"
              strokeWidth={2.25}
              strokeLinecap="round"
              strokeDasharray="1 8"
              opacity={0.65}
            />
          );
        })}

        {/* nodes */}
        {items.map((n) => {
          const isRoot = !n.parent_id;
          const radius = isRoot ? 30 : 24;
          const pr = n.priority ?? 1;
          const isSel = n.id === selectedId;
          // Display coords (x spread to fill a landscape canvas); radii are
          // unchanged so the node circles never distort.
          const nx = dispX(n.x);
          const ny = n.y;

          const branchId = findBranchId(n.id, items);
          const branchColor = resolveNodeColor(n, categoryColors, getBranchColor(branchId, items));
          const labelText = n.label.length > 24 ? n.label.slice(0, 23) + "…" : n.label;
          const isActiveBranchNode =
            selectedId != null && findBranchId(selectedId, items) === branchId;
          // Breathe on all nodes, but pause the one being edited so it's calm to work with.
          const breathe = selectedId !== n.id;
          // Expanding ring on the central node and any node on the active branch.
          const showRing = isRoot || isActiveBranchNode;

          return (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={n.label}
              onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSelectedId(n.id);}}}
              onPointerDown={(e) => onPointerDown(e, n)}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => onPointerUp(e, n)}
              className="cursor-grab active:cursor-grabbing"
              style={{ touchAction: "none" }}
              opacity={n.done ? 0.5 : 1}
            >
              {/* Expanding pulse ring — slow, low-opacity, eye-drawing */}
              {showRing && (
                <circle
                  className="ring-pulse"
                  cx={nx}
                  cy={ny}
                  r={radius}
                  fill="none"
                  stroke={isRoot ? "oklch(0.74 0.15 290)" : branchColor}
                  strokeWidth={2}
                  style={{
                    animationDelay: `${(Math.abs(n.x + n.y) % 10) / 10}s`,
                  }}
                />
              )}

              {/* Node visuals — gentle breathe */}
              <g className={breathe ? "node-breathe" : undefined} style={{ animationDelay: `${(Math.abs(n.x) % 8) / 4}s` }}>
              {isRoot ? (
                /* Central node — gradient fill, double ring for depth */
                <>
                  <circle
                    cx={nx}
                    cy={ny}
                    r={radius + 8}
                    fill="oklch(0.72 0.15 290)"
                    opacity={0.14}
                  />
                  <circle
                    cx={nx}
                    cy={ny}
                    r={radius}
                    fill="url(#rootFill)"
                    stroke="oklch(0.74 0.15 290)"
                    strokeWidth={isSel ? 6 : 5}
                    filter="url(#nodeShadow)"
                  />
                  {/* Inner accent ring */}
                  <circle
                    cx={nx}
                    cy={ny}
                    r={radius - 7}
                    fill="none"
                    stroke="oklch(0.74 0.15 290 / 0.35)"
                    strokeWidth={1.5}
                  />
                </>
              ) : (
                /* Branch node — soft glow, tinted fill, refined ring + icon */
                <>
                  {/* Soft glow halo */}
                  <circle
                    cx={nx}
                    cy={ny}
                    r={radius + 6}
                    fill={branchColor}
                    opacity={isSel ? 0.3 : 0.14}
                    filter="url(#softGlow)"
                  />
                  {/* Branch-colored fill tint */}
                  <circle
                    cx={nx}
                    cy={ny}
                    r={radius}
                    fill={branchColor}
                    opacity={0.2}
                  />
                  {/* Solid ring (refined — solid, not dashed, reads more designed) */}
                  <circle
                    cx={nx}
                    cy={ny}
                    r={radius}
                    fill="none"
                    stroke={isSel ? "white" : branchColor}
                    strokeWidth={isSel ? 3.5 : 2.5}
                    filter="url(#nodeShadow)"
                  />
                  {/* Faint inner ring for depth */}
                  <circle
                    cx={nx}
                    cy={ny}
                    r={radius - 5}
                    fill="none"
                    stroke={branchColor}
                    strokeWidth={1}
                    opacity={0.4}
                  />
                  {/* + icon */}
                  <line
                    x1={nx - 7}
                    y1={ny}
                    x2={nx + 7}
                    y2={ny}
                    stroke={branchColor}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                  <line
                    x1={nx}
                    y1={ny - 7}
                    x2={nx}
                    y2={ny + 7}
                    stroke={branchColor}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                </>
              )}
              </g>

              {/* Label below the circle — stronger weight + shadow for contrast */}
              <text
                x={nx}
                y={ny + radius + 19}
                textAnchor="middle"
                fontSize={responsiveFontSize}
                fontWeight={isRoot ? 700 : 600}
                fill="#EDF0F6"
                style={{
                  fontFamily: "Inter, sans-serif",
                  pointerEvents: "none",
                  textDecoration: n.done ? "line-through" : "none",
                  paintOrder: "stroke",
                  stroke: "oklch(0.1 0.02 265 / 0.85)",
                  strokeWidth: "3px",
                  strokeLinejoin: "round",
                }}
              >
                {labelText}
              </text>
            </g>
          );
        })}
        </svg>
      </div>

      {!selected && <button type="button" title="Fit map" aria-label="Fit map"
        onClick={() => { setFrame({ mapId, geometry: mapGeometry(items,containerAspect), populated: items.length>0 }); resetTransform(); }}
        className="absolute bottom-4 left-4 z-20 flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background"><Scan size={18}/></button>}
      {!selected&&<div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-md border border-border bg-background">
        <button type="button" className="flex h-11 w-11 items-center justify-center" title="Zoom out" aria-label="Zoom out" onClick={()=>zoomBy(1/1.4)}><ZoomOut size={18}/></button>
        <button type="button" className="flex h-11 w-11 items-center justify-center" title="Zoom in" aria-label="Zoom in" onClick={()=>zoomBy(1.4)}><ZoomIn size={18}/></button>
      </div>}
      {/* Fullscreen toggle button — bottom-right corner */}
      <button
        onClick={() => setIsFullscreen(!isFullscreen)}
        className="absolute bottom-4 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        style={isFullscreen ? { bottom: "env(safe-area-inset-bottom, 1rem)", right: "env(safe-area-inset-right, 1rem)" } : undefined}
        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? <Minimize className="h-5 w-5"/> : <Maximize className="h-5 w-5"/>}
      </button>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            className="absolute right-0 top-0 z-20 flex h-full w-full max-w-sm flex-col border-l border-border bg-popover p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setSelectedId(null);
                  setEditing(false);
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ← close
              </button>
              <div className="flex items-center gap-1">
                {!editing && (
                  <button
                    onClick={startEdit}
                    className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={deleteNode}
                  className="rounded-md p-2 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {editing ? (
              <div className="mt-4 flex-1 overflow-y-auto">
                <label className="text-xs uppercase tracking-widest text-muted-foreground">Label</label>
                <input
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <label className="mt-4 block text-xs uppercase tracking-widest text-muted-foreground">Detail</label>
                <textarea
                  value={draftDetail}
                  onChange={(e) => setDraftDetail(e.target.value)}
                  rows={6}
                  className="mt-1 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary"
                />
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={saveEdit}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
                  >
                    <Check className="h-4 w-4" /> Save
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm"
                  >
                    <X className="h-4 w-4" /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex-1 overflow-y-auto">
                <h3 className="font-display text-2xl font-bold">{selected.label}</h3>

                {/* Color — one tap recolors (CEO handoff: effortless, ≤2 taps) */}
                {(() => {
                  const currentColor = resolveNodeColor(
                    selected,
                    categoryColors,
                    getBranchColor(findBranchId(selected.id, items), items),
                  ).toLowerCase();
                  const applyColor = (hex: string) =>
                    colorScope === "category" && selected.category
                      ? pickCategoryColor(hex)
                      : pickNodeColor(hex);
                  return (
                    <div className="mt-5">
                      <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Color</p>
                      <div className="flex flex-wrap gap-2.5">
                        {CATEGORY_PALETTE.map((c) => {
                          const active = currentColor === c.hex.toLowerCase();
                          return (
                            <button
                              key={c.hex}
                              aria-label={c.name}
                              onClick={() => applyColor(c.hex)}
                              className="relative flex items-center justify-center rounded-full transition-transform active:scale-90"
                              style={{
                                width: 44,
                                height: 44,
                                background: c.hex,
                                boxShadow: active ? `0 0 0 2px var(--background,#0b0f1a), 0 0 0 4px ${c.hex}` : undefined,
                              }}
                            >
                              {active && <Check className="h-5 w-5 text-white drop-shadow" strokeWidth={3} />}
                            </button>
                          );
                        })}
                        {/* Custom hex — optional, hidden behind the trailing + */}
                        <label
                          className="flex cursor-pointer items-center justify-center rounded-full border-2 border-dashed border-border text-lg text-muted-foreground hover:text-foreground"
                          style={{ width: 44, height: 44 }}
                          aria-label="Custom color"
                          title="Custom color"
                        >
                          +
                          <input
                            type="color"
                            className="sr-only"
                            onChange={(e) => applyColor(e.target.value)}
                          />
                        </label>
                      </div>

                      {/* Scope toggle — only meaningful when the node has a category */}
                      {selected.category && (
                        <div className="mt-3 inline-flex rounded-lg border border-border p-0.5 text-xs font-medium">
                          <button
                            onClick={() => setColorScope("node")}
                            className={`rounded-md px-3 py-1.5 transition-colors ${colorScope === "node" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                          >
                            This node
                          </button>
                          <button
                            onClick={() => setColorScope("category")}
                            className={`rounded-md px-3 py-1.5 transition-colors ${colorScope === "category" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                          >
                            All "{selected.category}"
                          </button>
                        </div>
                      )}

                      {/* Reset to auto — only when this node carries an explicit override */}
                      {selected.color_override && (
                        <button
                          onClick={resetNodeColor}
                          className="mt-3 block text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        >
                          Reset to auto
                        </button>
                      )}
                    </div>
                  );
                })()}

                {selected.parent_id && (
                  <div className="mt-5">
                    {FEATURE_FLAGS.workflow && <MapTaskActions key={selected.id} nodeId={selected.id} label={selected.label}/>}
                    <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Priority</p>
                    <div className="flex gap-2">
                      {PRIORITY_LABELS.map((label, idx) => {
                        const active = (selected.priority ?? 1) === idx;
                        return (
                          <button
                            key={label}
                            onClick={() => changePriority(idx)}
                            className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition-all ${
                              active
                                ? "border-transparent text-white shadow-md"
                                : "border-border text-muted-foreground hover:text-foreground"
                            }`}
                            style={active ? { background: PRIORITY_COLORS[idx] } : undefined}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <p className="mt-5 whitespace-pre-wrap text-sm text-muted-foreground">
                  {selected.detail || "No additional detail."}
                </p>

                {/* Connections — manual links to other thoughts */}
                <div className="mt-6">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      Connections
                    </p>
                    <button
                      onClick={() => {
                        setLinking((v) => !v);
                        setLinkQuery("");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    >
                      <GitBranch className="h-3.5 w-3.5" /> Branch a Thought
                    </button>
                  </div>

                  {/* Existing connections */}
                  {(() => {
                    const connected = linkItems.filter(
                      (l) => l.source_node_id === selected.id || l.target_node_id === selected.id,
                    );
                    if (!connected.length) return null;
                    return (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {connected.map((l) => {
                          const otherId =
                            l.source_node_id === selected.id ? l.target_node_id : l.source_node_id;
                          const other = items.find((n) => n.id === otherId);
                          if (!other) return null;
                          return (
                            <span
                              key={l.id}
                              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs"
                            >
                              {other.label.length > 18 ? other.label.slice(0, 17) + "…" : other.label}
                              <button
                                onClick={() => removeLink(l.id)}
                                className="text-muted-foreground hover:text-destructive"
                                title="Remove connection"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Pill picker — surfaces every other node to connect to */}
                  {linking && (
                    <div className="mt-3 rounded-xl border border-border bg-background p-3">
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5">
                        <Search className="h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          autoFocus
                          value={linkQuery}
                          onChange={(e) => setLinkQuery(e.target.value)}
                          placeholder="Find a thought to connect…"
                          className="w-full bg-transparent text-xs outline-none"
                        />
                      </div>
                      <div className="mt-3 flex max-h-52 flex-wrap gap-2 overflow-y-auto">
                        {items
                          .filter((n) => n.id !== selected.id)
                          .filter((n) =>
                            n.label.toLowerCase().includes(linkQuery.trim().toLowerCase()),
                          )
                          .filter(
                            (n) =>
                              !linkItems.some(
                                (l) =>
                                  (l.source_node_id === selected.id && l.target_node_id === n.id) ||
                                  (l.source_node_id === n.id && l.target_node_id === selected.id),
                              ),
                          )
                          .map((n) => {
                            const branchColor = resolveNodeColor(n, categoryColors, getBranchColor(findBranchId(n.id, items), items));
                            return (
                              <button
                                key={n.id}
                                onClick={() => createLink(n.id)}
                                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                                style={{ borderColor: branchColor }}
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ background: branchColor }}
                                />
                                {n.label.length > 22 ? n.label.slice(0, 21) + "…" : n.label}
                              </button>
                            );
                          })}
                        {items.filter(
                          (n) =>
                            n.id !== selected.id &&
                            n.label.toLowerCase().includes(linkQuery.trim().toLowerCase()) &&
                            !linkItems.some(
                              (l) =>
                                (l.source_node_id === selected.id && l.target_node_id === n.id) ||
                                (l.source_node_id === n.id && l.target_node_id === selected.id),
                            ),
                        ).length === 0 && (
                          <p className="w-full py-2 text-center text-xs text-muted-foreground">
                            No thoughts to connect.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Explain in your own words (optional) - the generation-effect
                    mechanic. Articulating it yourself is how the concept sticks. */}
                <div className="mt-6">
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">
                    Explain this in your own words
                    <span className="ml-1 normal-case tracking-normal text-muted-foreground/60">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    value={ownWords}
                    onChange={(e) => setOwnWords(e.target.value)}
                    rows={4}
                    placeholder="Say it back the way you'd explain it to a friend. This is how it sticks."
                    className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary"
                  />
                  <button
                    onClick={saveOwnWords}
                    disabled={savingOwnWords || ownWords.trim() === (selected.own_words ?? "").trim()}
                    className="mt-2 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    {savingOwnWords ? "Saving..." : "Save explanation"}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
