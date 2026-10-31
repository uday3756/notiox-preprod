/** SVG arc helpers for Daily Progress Rings (Julian handoff). */

export const RING_CENTER = 130;
export const RING_VIEWBOX = "0 0 260 260";

export const RING_RADII = [108, 84, 60] as const; // morning, afternoon, evening
export const RING_GAPS = [7, 9, 11] as const;
export const RING_STROKE = 15;
/** Light → core → cyan, so concentric rings stay readable but never leave blue. */
export const RING_COLORS = ["#8AB4FF", "#3B82F6", "#22D3D8"] as const;
export const RING_TRACK = "rgba(255,255,255,0.09)";
/** Unfilled segments of the block you're currently in sit slightly brighter. */
export const RING_TRACK_ACTIVE = "rgba(255,255,255,0.18)";

export type TimeBlock = "morning" | "afternoon" | "evening";

export const BLOCK_ORDER: TimeBlock[] = ["morning", "afternoon", "evening"];

function pointOnCircle(radius: number, degrees: number): { x: number; y: number } {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return {
    x: RING_CENTER + radius * Math.cos(radians),
    y: RING_CENTER + radius * Math.sin(radians),
  };
}

export function segmentPath(radius: number, startDeg: number, endDeg: number): string {
  const p1 = pointOnCircle(radius, startDeg);
  const p2 = pointOnCircle(radius, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${largeArc} 1 ${p2.x} ${p2.y}`;
}

/** Split daily estimate across morning/afternoon/evening with remainder to earliest blocks. */
export function estimateSplit(dailyEstimate: number): [number, number, number] {
  const n = Math.max(3, Math.min(20, Math.round(dailyEstimate) || 10));
  const base = Math.floor(n / 3);
  const rem = n % 3;
  return [base + (rem > 0 ? 1 : 0), base + (rem > 1 ? 1 : 0), base];
}

export function ringCapacity(
  estimateForBlock: number,
  assignedCount: number,
  completedCount: number,
): number {
  return Math.max(estimateForBlock, assignedCount, completedCount, 1);
}
