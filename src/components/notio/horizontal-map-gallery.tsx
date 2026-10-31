import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function HorizontalMapGallery({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const count = Children.count(children);
  const [position, setPosition] = useState({ overflow: false, previous: false, next: false });

  const measure = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    const maximum = element.scrollWidth - element.clientWidth;
    const next = {
      overflow: maximum > 2,
      previous: element.scrollLeft > 2,
      next: element.scrollLeft < maximum - 2,
    };
    setPosition(current =>
      current.overflow === next.overflow && current.previous === next.previous && current.next === next.next
        ? current
        : next,
    );
  }, []);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [count, measure]);

  const scroll = (direction: number) => {
    const element = scroller.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.8 });
  };

  return (
    <section className="notiox-map-gallery" aria-label="Map gallery">
      <div className="notiox-map-gallery-toolbar">
        <span>{count} {count === 1 ? "map" : "maps"}</span>
        <div className="notiox-map-gallery-arrows" hidden={!position.overflow}>
          <button type="button" onClick={() => scroll(-1)} disabled={!position.previous} aria-label="Previous maps" title="Previous maps">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => scroll(1)} disabled={!position.next} aria-label="Next maps" title="Next maps">
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        ref={scroller}
        className="notiox-map-gallery-track"
        onScroll={measure}
        tabIndex={position.overflow ? 0 : undefined}
        role="region"
        aria-label="Maps, horizontally scrollable"
      >
        {children}
      </div>
    </section>
  );
}
