/** Lightweight client-side error reporter. Logs to the console; swap in your
 * own provider (Sentry, etc.) here if you want remote error tracking. */
export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  console.error("[app error]", error, {
    route: window.location.pathname,
    ...context,
  });
}
