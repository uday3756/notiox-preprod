import { z } from "zod";

export const completionCommand = z.object({
  entityId: z.string().uuid(),
  desiredState: z.boolean(),
  expectedRevision: z.number().int().nonnegative(),
  actionId: z.string().uuid(),
  source: z.enum(["home", "map", "plan", "assignment", "android-widget", "ios-widget"]),
});
export type CompletionCommand = z.infer<typeof completionCommand>;
export type CompletionResult = {
  entityId: string;
  completed: boolean;
  revision: number;
  confirmedXp: number;
  level: number;
  rewardChange: number;
  wasAlreadyApplied?: boolean;
};
export type ActionableTask = {
  start_time?: string | null;
  end_time?: string | null;
  id: string;
  title: string;
  description: string | null;
  status: string;
  parent_node_id: string | null;
  sort_order: number;
  revision: number;
  estimated_duration_minutes: number | null;
  map_id: string | null;
  node_id: string | null;
};
