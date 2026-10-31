import { useEffect, useState } from "react";
import {
  dolphinAssetFor,
  dolphinStillFor,
  type DolphinEmotion,
} from "@/lib/dolphin-progression";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSupabaseAuth } from "@/hooks/use-auth";
import { getDolphinProgress } from "@/lib/task-completion.functions";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

const STARTER = "/dolphin/companion.png";

/** Presentation only: existing screen state supplies the expression context. */
export function DolphinCompanion({ state = "calm" }: { state?: DolphinEmotion }) {
  const { userId } = useSupabaseAuth();
  const load = useServerFn(getDolphinProgress);
  const progress = useQuery({
    queryKey: ["dolphin", userId],
    queryFn: () => load(),
    enabled: FEATURE_FLAGS.dolphinXp && !!userId,
  });

  const primary = dolphinAssetFor(state);
  const still = dolphinStillFor(state);
  const [src, setSrc] = useState(primary);

  useEffect(() => {
    setSrc(primary);
  }, [primary]);

  return (
    <div
      className="notiox-dolphin"
      data-state={state}
      aria-hidden="true"
      hidden={progress.data?.companion_enabled === false}
    >
      <img
        key={src}
        src={src}
        alt=""
        width={192}
        height={144}
        decoding="async"
        draggable={false}
        onError={() => {
          if (src !== still) {
            setSrc(still);
            return;
          }
          if (src !== STARTER) setSrc(STARTER);
        }}
      />
    </div>
  );
}
