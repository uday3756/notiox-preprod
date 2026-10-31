import { describe, expect, it } from "vitest";
import { descendantIds, mapGeometry } from "./map-viewport";
describe("map viewport geometry", () => {
  for (const count of [8, 13, 50])
    it(`bounds ${count} nodes and retains an immutable frame through deletion`, () => {
      const nodes = Array.from({ length: count }, (_, i) => ({
        id: String(i),
        parent_id: i === 0 ? null : String(Math.floor((i - 1) / 2)),
        x: i * 30,
        y: (i % 2) * 200,
      }));
      const frame = mapGeometry(nodes, 0.5),
        copy = { ...frame };
      const removed = descendantIds(nodes, "1");
      const remaining = nodes.filter((n) => !removed.has(n.id));
      expect(removed.has("3")).toBe(true);
      expect(remaining.some((n) => n.id === "2")).toBe(true);
      expect(frame).toEqual(copy);
      expect(frame.maxX).toBeGreaterThan(frame.minX);
      expect(mapGeometry(remaining, 0.5).maxX).toBeLessThanOrEqual(frame.maxX);
    });
});
