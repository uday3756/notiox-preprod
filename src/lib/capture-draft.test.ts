import { describe, expect, it } from "vitest";
import { mapDraftSchema } from "./capture-draft.types";
describe("reviewed capture validation", () => {
  const root = { id: "root", label: "Essay", parentId: null };
  it("accepts one root and editable tasks", () => {
    expect(
      mapDraftSchema.safeParse({
        title: "Essay",
        nodes: [root, { id: "step", label: "Write thesis", parentId: "root" }],
      }).success,
    ).toBe(true);
  });
  it("rejects duplicate identifiers, missing parents, cycles and multiple roots", () => {
    for (const nodes of [
      [root, root],
      [root, { id: "a", label: "A", parentId: "missing" }],
      [root, { id: "a", label: "A", parentId: "a" }],
      [root, { id: "a", label: "A", parentId: null }],
    ])
      expect(mapDraftSchema.safeParse({ title: "Essay", nodes }).success).toBe(false);
  });
  it("rejects blank edited labels and caps graph size", () => {
    expect(
      mapDraftSchema.safeParse({ title: "Essay", nodes: [{ ...root, label: " " }] }).success,
    ).toBe(false);
    expect(
      mapDraftSchema.safeParse({
        title: "Essay",
        nodes: Array.from({ length: 101 }, (_, i) => ({
          ...root,
          id: String(i),
          parentId: i ? "0" : null,
        })),
      }).success,
    ).toBe(false);
  });
});
