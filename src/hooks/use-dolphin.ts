import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSupabaseAuth } from "@/hooks/use-auth";
import { getDolphinPage } from "@/lib/dolphin.functions";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

export function useDolphin() {
  const { userId } = useSupabaseAuth();
  const load = useServerFn(getDolphinPage);
  return useQuery({
    queryKey: ["dolphin-page", userId],
    queryFn: () => load(),
    enabled: FEATURE_FLAGS.dolphinXp && !!userId,
  });
}
