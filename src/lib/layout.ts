// Pure, dependency-free radial tree layout shared by the server (initial
// placement) and the client (Auto-arrange). Produces a clean, non-overlapping
// mindmap: root at center, each subtree gets its own angular wedge sized by how
// many leaves it contains, so siblings never collide.

export type LayoutNode = { id: string; parent: string | null };

export function radialLayout(nodes: LayoutNode[]): Record<string, { x: number; y: number }> {
  if (!nodes.length) return {};
  const ids = new Set(nodes.map((n) => n.id));
  const root = nodes.find((n) => !n.parent || !ids.has(n.parent)) ?? nodes[0];

  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.id === root.id) continue;
    const parent = n.parent && ids.has(n.parent) ? n.parent : root.id;
    const list = children.get(parent);
    if (list) list.push(n.id);
    else children.set(parent, [n.id]);
  }

  const leaves = new Map<string, number>();
  const countLeaves = (id: string): number => {
    const ch = children.get(id) ?? [];
    if (!ch.length) {
      leaves.set(id, 1);
      return 1;
    }
    let sum = 0;
    for (const c of ch) sum += countLeaves(c);
    leaves.set(id, sum);
    return sum;
  };
  countLeaves(root.id);

  const pos: Record<string, { x: number; y: number }> = { [root.id]: { x: 0, y: 0 } };
  const firstRingCount = children.get(root.id)?.length ?? 1;
  // Ring big enough that arc spacing between siblings clears a ~200px node box.
  const ring0 = Math.max(300, Math.round((34 * firstRingCount) / Math.PI) * Math.PI + 80);
  const ringStep = 230;

  const place = (id: string, a0: number, a1: number, depth: number) => {
    const ch = children.get(id) ?? [];
    if (!ch.length) return;
    const total = leaves.get(id) || ch.length;
    const r = ring0 + (depth - 1) * ringStep;
    let a = a0;
    for (const c of ch) {
      const frac = (leaves.get(c) || 1) / total;
      const c0 = a;
      const c1 = a + (a1 - a0) * frac;
      const mid = (c0 + c1) / 2;
      pos[c] = { x: Math.cos(mid) * r, y: Math.sin(mid) * r };
      place(c, c0, c1, depth + 1);
      a = c1;
    }
  };
  // Start at the top (-90°) and sweep a full circle.
  place(root.id, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2, 1);
  return pos;
}
