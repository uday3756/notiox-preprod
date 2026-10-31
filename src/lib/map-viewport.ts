type Point = { id: string; parent_id: string | null; x: number; y: number };
export function descendantIds(nodes: readonly Point[], id: string) {
  const removed = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes)
      if (node.parent_id && removed.has(node.parent_id) && !removed.has(node.id)) {
        removed.add(node.id);
        changed = true;
      }
  }
  return removed;
}
export function mapGeometry(nodes: readonly Point[], aspect: number) {
  const root = nodes.find((n) => !n.parent_id) ?? nodes[0];
  const rootX = root?.x ?? 0,
    rootY = root?.y ?? 0;
  const halfX = Math.max(160, ...nodes.map((n) => Math.abs(n.x - rootX))) + 140;
  const halfY = Math.max(100, ...nodes.map((n) => Math.abs(n.y - rootY))) + 100;
  const spread = Math.min(2.4, Math.max(1, aspect / (halfX / halfY)));
  const width = halfX * spread,
    height = halfY;
  return {
    rootX,
    spread,
    minX: rootX - width,
    maxX: rootX + width,
    minY: rootY - height,
    maxY: rootY + height,
  };
}
