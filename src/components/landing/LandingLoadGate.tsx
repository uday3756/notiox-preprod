/**
 * YouTube-style load gate for the public landing page.
 * Overlay always mounted; visibility via opacity (PDF JSX guardrail).
 * Hard-caps at 2.5s so LCP/first paint is never trapped.
 */
import { useEffect, useState, type ReactNode } from "react";

const HARD_CAP_MS = 2500;

async function preloadHeroAssets(): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  if (typeof document !== "undefined" && document.fonts?.ready) {
    jobs.push(document.fonts.ready.catch(() => undefined));
  }
  // Warm the logo used in nav/footer
  jobs.push(
    new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = "/logo.png";
    }),
  );
  await Promise.all(jobs);
}

export function LandingLoadGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.race([
      preloadHeroAssets(),
      new Promise<void>((r) => setTimeout(r, HARD_CAP_MS)),
    ]).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative min-h-screen">
      {children}
      <div
        className={`fixed inset-0 z-[60] grid place-items-center bg-[var(--canvas,#0b0f12)] transition-opacity duration-300 ${
          ready ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
        aria-hidden={ready}
        aria-busy={!ready}
      >
        <span className="l-spinner" role="status" aria-label="Loading" />
      </div>
    </div>
  );
}
