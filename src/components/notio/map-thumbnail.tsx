// Feature 6: a top-down visual thumbnail of a mindmap, so users recognize a map
// by its shape (Apple Notes gallery model) instead of reading titles.
//
// Web equivalent of the RN "Skia offscreen snapshot" approach: we render a small
// SVG directly from the saved node positions + parent edges. No storage upload,
// no stale cache - the preview is always derived from live data.

type ThumbNode = {
  id: string;
  parent_id: string | null;
  x: number;
  y: number;
};

const PALETTE = ["#F43F5E", "#2563EB", "#F59E0B", "#10B981", "#8B5CF6", "#EC4899"];

export function MapThumbnail({ nodes }: { nodes: ThumbNode[] }) {
  if (!nodes.length) {
    return <div className="h-full w-full bg-gradient-to-br from-surface to-background" />;
  }

  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 40;
  const w = Math.max(1, maxX - minX) + pad * 2;
  const h = Math.max(1, maxY - minY) + pad * 2;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const root = nodes.find((n) => !n.parent_id) ?? nodes[0];

  // First-level branches (direct children of root), stable order -> stable color.
  const firstLevel = nodes
    .filter((n) => n.parent_id === root.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  const branchColor = (nodeId: string): string => {
    let cur: ThumbNode | undefined = byId.get(nodeId);
    while (cur && cur.parent_id) {
      const parent = byId.get(cur.parent_id);
      if (!parent || !parent.parent_id) break;
      cur = parent;
    }
    const idx = cur ? firstLevel.findIndex((n) => n.id === cur!.id) : -1;
    return idx === -1 ? "#94a3b8" : PALETTE[idx % PALETTE.length];
  };

  return (
    <svg
      viewBox={`${minX - pad} ${minY - pad} ${w} ${h}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      aria-hidden="true"
    >
      <rect x={minX - pad} y={minY - pad} width={w} height={h} fill="oklch(0.16 0.025 265)" />
      {/* edges */}
      {nodes.map((n) => {
        if (!n.parent_id) return null;
        const p = byId.get(n.parent_id);
        if (!p) return null;
        return (
          <line
            key={`te-${n.id}`}
            x1={p.x}
            y1={p.y}
            x2={n.x}
            y2={n.y}
            stroke={branchColor(n.id)}
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.5}
          />
        );
      })}
      {/* nodes */}
      {nodes.map((n) => {
        const isRoot = !n.parent_id;
        return (
          <circle
            key={`tn-${n.id}`}
            cx={n.x}
            cy={n.y}
            r={isRoot ? 22 : 14}
            fill={isRoot ? "oklch(0.74 0.15 290)" : branchColor(n.id)}
            opacity={isRoot ? 1 : 0.9}
          />
        );
      })}
    </svg>
  );
}
