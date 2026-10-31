import { useEffect, useMemo, useState } from "react";
import { VideoPlayer } from "@/components/ui/video-player";

/**
 * Front-page walkthrough video — custom player when an mp4 URL is available.
 *
 * Source resolution:
 * 1. VITE_DEMO_VIDEO_URL — direct mp4/webm (best for production)
 * 2. /demo-walkthrough.mp4 or /demo-walkthrough.mov in public/
 * 3. Otherwise Google Drive iframe (current founder file)
 *
 * Note: Drive preview links cannot be used as <video src>.
 */
const DRIVE_FILE_ID = "1E-yXkID5d8KsPfjJbv0n6rivOpyb9e1z";
const DRIVE_PREVIEW = `https://drive.google.com/file/d/${DRIVE_FILE_ID}/preview`;
const DRIVE_THUMB = `https://drive.google.com/thumbnail?id=${DRIVE_FILE_ID}&sz=w1920`;
const PUBLIC_DEMO_CANDIDATES = ["/demo-walkthrough.mp4", "/demo-walkthrough.mov"] as const;

function envDemoVideoUrl(): string | null {
  const raw = (import.meta.env.VITE_DEMO_VIDEO_URL as string | undefined)?.trim();
  return raw || null;
}

export function DemoVideo() {
  const [started, setStarted] = useState(false);
  const [html5Src, setHtml5Src] = useState<string | null>(() => envDemoVideoUrl());
  const [resolved, setResolved] = useState(() => Boolean(envDemoVideoUrl()));

  const driveIframe = useMemo(
    () => (
      <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
        <iframe
          src={`${DRIVE_PREVIEW}?autoplay=1`}
          title="Notio walkthrough — capture your first thought"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
    ),
    [],
  );

  // If no env URL, probe public demo files once play is tapped.
  useEffect(() => {
    if (!started || resolved) return;
    let cancelled = false;
    (async () => {
      try {
        for (const path of PUBLIC_DEMO_CANDIDATES) {
          const res = await fetch(path, { method: "HEAD", cache: "no-store" });
          if (cancelled) return;
          if (res.ok) {
            setHtml5Src(path);
            break;
          }
        }
      } catch {
        /* use Drive iframe */
      } finally {
        if (!cancelled) setResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [started, resolved]);

  return (
    <figure
      id="demo-video"
      className="mx-auto mt-5 max-w-[1104px] px-4 sm:mt-7 sm:px-6 md:mt-8 md:px-8"
      aria-label="Product walkthrough video"
    >
      <div className="l-card overflow-hidden rounded-[16px] sm:rounded-[22px] md:rounded-[26px]">
        <div className="relative w-full overflow-hidden bg-[#05070a]">
          {!started ? (
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="group relative flex w-full flex-col items-center justify-center"
              style={{ aspectRatio: "16 / 9" }}
              aria-label="Play founder walkthrough video"
            >
              <img
                src={DRIVE_THUMB}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-55 transition-opacity duration-300 group-hover:opacity-65"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(11,15,18,0.15) 0%, rgba(11,15,18,0.72) 70%, rgba(11,15,18,0.92) 100%)",
                }}
                aria-hidden
              />

              <span
                className="relative z-[1] flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--on-accent)] transition-transform duration-200 group-hover:-translate-y-0.5 sm:h-16 sm:w-16"
                aria-hidden
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8.5 6.5v11l9-5.5-9-5.5Z" />
                </svg>
              </span>
              <span className="relative z-[1] mt-3 text-[12.5px] font-semibold tracking-wide text-[var(--ink)] sm:mt-4 sm:text-[13.5px]">
                Watch the 90-sec walkthrough
              </span>
            </button>
          ) : !resolved ? (
            <div
              className="flex w-full items-center justify-center bg-[#05070a]"
              style={{ aspectRatio: "16 / 9" }}
              aria-label="Loading video"
            >
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
            </div>
          ) : html5Src ? (
            <VideoPlayer
              src={html5Src}
              poster={DRIVE_THUMB}
              autoPlay
              className="max-w-none rounded-none shadow-none"
              onError={() => setHtml5Src(null)}
            />
          ) : (
            driveIframe
          )}
        </div>
      </div>

      <figcaption className="mx-auto mt-4 max-w-md px-2 text-center sm:mt-5">
        <p className="text-[13px] font-medium leading-snug text-[var(--ink-muted)] sm:text-[13.5px]">
          Founder walkthrough
        </p>
        <p className="mt-1 text-[12px] leading-snug text-[var(--ink-faint)] sm:text-[12.5px]">
          Your first thought → your first map · 90 sec
        </p>
      </figcaption>
    </figure>
  );
}
