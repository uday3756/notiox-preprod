import { describe, expect, it } from "vitest";
import { mapDraftSchema } from "../src/lib/capture-draft.types";

describe("capture preview vs save", () => {
  it("accepts a draft that has not been given database IDs", () => {
    const draft = mapDraftSchema.parse({
      title: "Tuesday",
      nodes: [
        { id: "root", label: "Tuesday", detail: "", parentId: null, priority: 0 },
        { id: "a", label: "Email advisor", detail: "", parentId: "root", priority: 2 },
      ],
    });
    expect(draft.nodes.every((n) => !/^[0-9a-f-]{36}$/i.test(n.id))).toBe(true);
  });

  it("rejects a draft with two roots", () => {
    const parsed = mapDraftSchema.safeParse({
      title: "Broken",
      nodes: [
        { id: "a", label: "One", parentId: null },
        { id: "b", label: "Two", parentId: null },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
