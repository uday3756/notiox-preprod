/**
 * Shared allow-listed app origins for auth email deep links.
 * Server-only — do not import from client components.
 */
export function defaultAppOrigin(): string {
  const raw =
    process.env.VITE_PUBLIC_APP_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    "https://www.notiolive.com";
  return raw.replace(/\/$/, "");
}

export function resolveAppOrigin(requested?: string): string {
  const fallback = defaultAppOrigin();
  if (!requested) return fallback;
  let origin: string;
  try {
    origin = new URL(requested).origin;
  } catch {
    return fallback;
  }

  const allowed = new Set<string>([
    fallback,
    "https://www.notiolive.com",
    "https://notiolive.com",
    "https://remix-of-pixel-perfect-ten.vercel.app",
    "https://notiox-preprod.vercel.app",
  ]);
  if (
    /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(
      origin,
    )
  ) {
    return origin;
  }
  // Preview / preprod Vercel aliases (*.vercel.app under this project)
  if (/^https:\/\/notiox-preprod([a-z0-9-]+)?-uday3756s-projects\.vercel\.app$/i.test(origin)) {
    return origin;
  }
  if (allowed.has(origin)) return origin;
  return fallback;
}
