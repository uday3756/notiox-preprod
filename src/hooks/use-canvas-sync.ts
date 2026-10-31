import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSupabaseAuth } from "@/hooks/use-auth";
import { getCanvasStatus } from "@/lib/canvas.functions";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

export function useCanvasSync() {
  const { userId } = useSupabaseAuth();
  const load = useServerFn(getCanvasStatus);
  return useQuery({
    queryKey: ["canvas-status", userId],
    queryFn: () => load(),
    enabled: !!userId && (FEATURE_FLAGS.canvasPilot || FEATURE_FLAGS.canvasConnect),
    staleTime: 60_000,
  });
}
