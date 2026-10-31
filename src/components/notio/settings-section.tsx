import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Collapsible Profile section. Matches the header style of the editors that
 * already manage their own open state (working hours, rings, wind-down).
 */
export function SettingsSection({
  title,
  summary,
  icon: Icon,
  tone = "default",
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  icon: LucideIcon;
  tone?: "default" | "danger";
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const danger = tone === "danger";

  return (
    <div
      className={`rounded-2xl border bg-surface p-5 ${
        danger ? "border-destructive/30 bg-destructive/5" : "border-border"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3"
      >
        <div className="min-w-0 text-left">
          <div className="mb-2 flex items-center gap-2">
            <Icon className={`h-4 w-4 ${danger ? "text-destructive" : "text-primary"}`} />
            <p
              className={`font-display text-lg font-semibold ${
                danger ? "text-destructive" : ""
              }`}
            >
              {title}
            </p>
          </div>
          {summary && <p className="text-xs text-muted-foreground">{summary}</p>}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">{open ? "▼" : "▶"}</span>
      </button>

      {open && <div className="mt-6 border-t border-border pt-4">{children}</div>}
    </div>
  );
}
