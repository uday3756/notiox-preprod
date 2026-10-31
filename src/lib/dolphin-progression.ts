export const XP_POLICY = { version: "leaf-v1", perTask: 10, perLevel: 100 } as const;
export type DolphinEmotion =
  | "calm"
  | "welcome"
  | "welcome_student"
  | "welcome_other"
  | "listening"
  | "thinking"
  | "happy"
  | "level_up"
  | "reassuring";

/** Animated GIF first; dolphin-companion falls back to still / starter if missing. */
export const DOLPHIN_EXPRESSION_ASSETS: Record<DolphinEmotion, string> = {
  calm: "/dolphin/calm.gif",
  welcome: "/dolphin/welcome.gif",
  welcome_student: "/dolphin/welcome-student.gif",
  welcome_other: "/dolphin/welcome-other.gif",
  listening: "/dolphin/listening.gif",
  thinking: "/dolphin/thinking.gif",
  happy: "/dolphin/happy.jpg",
  level_up: "/dolphin/level-up.jpg",
  reassuring: "/dolphin/reassuring.jpg",
};

export const DOLPHIN_STILL_FALLBACKS: Record<DolphinEmotion, string> = {
  calm: "/dolphin/companion.png",
  welcome: "/dolphin/welcome.jpg",
  welcome_student: "/dolphin/happy.jpg",
  welcome_other: "/dolphin/reassuring.jpg",
  listening: "/dolphin/listening.jpg",
  thinking: "/dolphin/thinking.jpg",
  happy: "/dolphin/happy.jpg",
  level_up: "/dolphin/level-up.jpg",
  reassuring: "/dolphin/reassuring.jpg",
};

export function dolphinAssetFor(state: DolphinEmotion): string {
  return DOLPHIN_EXPRESSION_ASSETS[state] ?? "/dolphin/companion.png";
}

export function dolphinStillFor(state: DolphinEmotion): string {
  return DOLPHIN_STILL_FALLBACKS[state] ?? "/dolphin/companion.png";
}

export function levelForXp(xp: number): number {
  return 1 + Math.floor(Math.max(0, Number.isFinite(xp) ? xp : 0) / XP_POLICY.perLevel);
}
export function progressForXp(xp: number, pendingXp = 0) {
  const confirmed = Math.max(0, Number.isFinite(xp) ? xp : 0);
  const pending = Math.max(0, Number.isFinite(pendingXp) ? pendingXp : 0);
  return {
    confirmedXp: confirmed,
    pendingXp: pending,
    level: levelForXp(confirmed),
    intoLevel: confirmed % 100,
    nextAt: 100,
  };
}

export function rewardTransition(wasAwarded: boolean, completed: boolean, eligible: boolean) {
  const awarded = completed && eligible;
  return { awarded, delta: (Number(awarded) - Number(wasAwarded)) * XP_POLICY.perTask };
}
