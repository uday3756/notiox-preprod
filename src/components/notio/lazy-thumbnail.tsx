import { useEffect, useRef, useState } from "react";
import { MapThumbnail } from "./map-thumbnail";

type ThumbNode = { id: string; parent_id: string | null; x: number; y: number };

/**
 * CR-02 §A — Web-appropriate grid virtualization (no new deps/infra).
 *
 * The maps grid previously mounted every map's SVG thumbnail at once. With many
 * maps that's a lot of simultaneous SVG work on first paint. This wrapper only
 * renders the actual <MapThumbnail> once the card scrolls near the viewport
 * (IntersectionObserver), showing a cheap placeholder until then. Off-screen
 * cards stay un-mounted, so the grid paints instantly regardless of map count.
 *
 * Once a thumbnail has been shown we keep it mounted (no flicker on scroll-back).
 */
export function LazyThumbnail({ nodes }: { nodes: ThumbNode[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No IntersectionObserver (old browsers / SSR) → just render it.
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect(); // once shown, stay shown
        }
      },
      // Start rendering a bit before the card enters view for a seamless feel.
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="h-full w-full">
      {visible ? (
        <MapThumbnail nodes={nodes} />
      ) : (
        <div className="h-full w-full bg-gradient-to-br from-surface to-background" />
      )}
    </div>
  );
}
