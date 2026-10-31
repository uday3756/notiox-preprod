import { z } from "zod";
export const draftRequestSchema = z.object({ id: z.string().uuid(), text: z.string().min(4) });
export const mapDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    nodes: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          label: z.string().trim().min(1).max(500),
          detail: z.string().max(10000).default(""),
          parentId: z.string().nullable().optional(),
          priority: z.number().int().min(0).max(3).default(1),
          category: z.string().nullable().optional(),
          time_block: z.enum(["morning", "afternoon", "evening", "unknown"]).default("unknown"),
          time_block_confidence: z.enum(["high", "low"]).default("low"),
        }),
      )
      .min(1)
      .max(100),
  })
  .superRefine((draft, ctx) => {
    const ids = new Set(draft.nodes.map((n) => n.id));
    if (ids.size !== draft.nodes.length)
      ctx.addIssue({ code: "custom", message: "Duplicate node IDs" });
    if (draft.nodes.filter((n) => !n.parentId).length !== 1)
      ctx.addIssue({ code: "custom", message: "Choose one root" });
    const byId = new Map(draft.nodes.map((n) => [n.id, n]));
    for (const node of draft.nodes) {
      const seen = new Set([node.id]);
      let parent = node.parentId;
      while (parent) {
        if (!ids.has(parent) || seen.has(parent)) {
          ctx.addIssue({ code: "custom", message: "Invalid node hierarchy" });
          break;
        }
        seen.add(parent);
        parent = byId.get(parent)?.parentId;
      }
    }
  });
export type MapDraft = z.infer<typeof mapDraftSchema>;
