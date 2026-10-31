import { DolphinCompanion } from "@/components/notio/dolphin-companion";
import type { DolphinEmotion } from "@/lib/dolphin-progression";

export function DolphinAvatar({
  state = "calm",
  compact = false,
}: {
  state?: DolphinEmotion;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "notiox-dolphin-avatar-compact" : "notiox-dolphin-avatar"}>
      <DolphinCompanion state={state} />
    </div>
  );
}
