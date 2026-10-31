import { Check, Loader2 } from "lucide-react";
import { MindmapCanvas, type NotioNode } from "@/components/notio/mindmap-canvas";
import { mapDraftSchema, type MapDraft } from "@/lib/capture-draft.types";

const EXAMPLE_DRAFT: MapDraft = {
  title: "Plan my Tuesday",
  nodes: [
    { id: "root", label: "Tuesday", detail: "", parentId: null, priority: 0, category: null, time_block: "unknown", time_block_confidence: "low" },
    { id: "a", label: "Email advisor", detail: "", parentId: "root", priority: 2, category: null, time_block: "morning", time_block_confidence: "low" },
    { id: "b", label: "Lab write-up", detail: "", parentId: "root", priority: 1, category: null, time_block: "afternoon", time_block_confidence: "low" },
  ],
};

function draftToNodes(draft: MapDraft): NotioNode[] {
  return draft.nodes.map((n, i) => ({
    id: n.id,
    parent_id: n.parentId ?? null,
    label: n.label,
    detail: n.detail ?? "",
    x: (i - draft.nodes.length / 2) * 80,
    y: n.parentId ? 90 : 0,
    priority: n.priority ?? 1,
    done: false,
    time_block: n.time_block === "unknown" ? null : n.time_block,
    category: n.category ?? null,
  }));
}

export function CapturePlanPreview({
  draft,
  onChange,
  nextNode,
  onNextNode,
  working = false,
  example = false,
  onEditThought,
  onSave,
}: {
  draft: MapDraft;
  onChange: (draft: MapDraft) => void;
  nextNode: string;
  onNextNode: (id: string) => void;
  working?: boolean;
  example?: boolean;
  onEditThought?: () => void;
  onSave?: () => void;
}) {
  const shown = example ? EXAMPLE_DRAFT : draft;
  return (
    <section className="notiox-review" aria-busy={working}>
      {example && (
        <p className="mb-3 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
          Example only — nothing is saved until you tap Save.
        </p>
      )}
      <label>
        Map title
        <input
          value={shown.title}
          maxLength={500}
          disabled={working || example}
          onChange={(e) => onChange({ ...shown, title: e.target.value })}
        />
      </label>
      <div className="my-4 overflow-hidden rounded-2xl border border-border bg-surface">
        <MindmapCanvas nodes={draftToNodes(shown)} draftMode />
      </div>
      <fieldset disabled={working || example}>
        <legend>Next action</legend>
        {shown.nodes.map((node) => (
          <label key={node.id} className="notiox-draft-node">
            {node.parentId && (
              <input
                type="radio"
                name="next-action"
                value={node.id}
                checked={nextNode === node.id}
                onChange={() => onNextNode(node.id)}
              />
            )}
            <input
              aria-label={node.parentId ? "Action title" : "Root idea"}
              value={node.label}
              maxLength={500}
              onChange={(e) =>
                onChange({
                  ...shown,
                  nodes: shown.nodes.map((n) => (n.id === node.id ? { ...n, label: e.target.value } : n)),
                })
              }
            />
          </label>
        ))}
        <label className="flex items-center gap-2">
          <input type="radio" name="next-action" checked={!nextNode} onChange={() => onNextNode("")} />
          Save map only
        </label>
      </fieldset>
      {!example && (
        <div className="notiox-review-actions">
          <button type="button" disabled={working} onClick={onEditThought}>
            Edit thought
          </button>
          <button
            type="button"
            disabled={working || !mapDraftSchema.safeParse(shown).success}
            onClick={onSave}
          >
            {working ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}{" "}
            {working ? "Saving..." : "Save"}
          </button>
        </div>
      )}
    </section>
  );
}
