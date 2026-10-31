/**
 * Feature-flag abstraction for the three CEO-spec features (Daily Wins,
 * Weekly Reflection, Cross-Map RAG).
 *
 * One file, used on BOTH server and client. Reads Vite-inlined
 * `VITE_FEATURE_*` vars on the client (build-time) and `process.env.FEATURE_*`
 * on the server (runtime). Defaults are chosen so production runs with the
 * incomplete features OFF until explicitly enabled, and dev gets the
 * user-facing ones ON for convenience.
 *
 * Accepted truthy values: "1", "true", "yes", "on" (case-insensitive).
 * Anything else (including empty / unset) falls back to the default.
 */
function parseFlag(raw: unknown, defaultValue: boolean): boolean {
  if (raw === undefined || raw === null || raw === "") return defaultValue;
  const s = String(raw).toLowerCase().trim();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function readFlag(name: string, defaultValue: boolean): boolean {
  const env = (import.meta as { env?: Record<string, unknown> }).env;
  const clientVal = env?.[`VITE_${name}`];
  const serverVal =
    typeof process !== "undefined" && process.env
      ? process.env[name]
      : undefined;
  return parseFlag(clientVal ?? serverVal, defaultValue);
}

/** Runtime kill switch — never honor baked-in VITE_* on the client bundle. */
function readServerOnlyFlag(name: string, defaultValue: boolean): boolean {
  const serverVal =
    typeof process !== "undefined" && process.env ? process.env[name] : undefined;
  return parseFlag(serverVal, defaultValue);
}

export const FEATURE_FLAGS = {
  workflow: readFlag("FEATURE_WORKFLOW", false),
  dolphinXp: readFlag("FEATURE_DOLPHIN_XP", false),
  nativeWidgets: readFlag("FEATURE_NATIVE_WIDGETS", false),
  canvasPilot: readFlag("FEATURE_CANVAS_PILOT", false),
  canvasConnect: readFlag("FEATURE_CANVAS_CONNECT", false),
  canvasImport: readFlag("FEATURE_CANVAS_IMPORT", false),
  canvasDispatch: readServerOnlyFlag("FEATURE_CANVAS_DISPATCH", false),
  // User-facing ritual — safe to ship in dev, on by default.
  dailyWins: readFlag("FEATURE_DAILY_WINS", true),
  // Weekly reflection report — on by default in dev for testing.
  // Cron handler still gates itself on this flag in production.
  weeklyReflection: readFlag("FEATURE_WEEKLY_REFLECTION", true),
  // Cross-map RAG — OFF by default. Requires OPENAI_API_KEY to be useful,
  // and the spec wants incomplete features disabled in production.
  crossMapRag: readFlag("FEATURE_CROSS_MAP_RAG", false),
  // Google Calendar sync — ON by default so Profile shows Connect.
  // Server still requires GOOGLE_CALENDAR_* credentials; without them the
  // card explains that sync is not configured yet.
  googleCalendar: readFlag("FEATURE_GOOGLE_CALENDAR", true),
} as const;

export type FeatureFlagName = keyof typeof FEATURE_FLAGS;
