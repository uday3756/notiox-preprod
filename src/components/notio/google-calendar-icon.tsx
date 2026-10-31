import { useId } from "react";

/** Google Calendar brand mark, drawn inline so no asset/network fetch is needed. */
export function GoogleCalendarIcon({ className = "h-5 w-5" }: { className?: string }) {
  const clipId = useId();

  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Google Calendar">
      <clipPath id={clipId}>
        <rect x="2.5" y="2.5" width="19" height="19" rx="3" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect x="2.5" y="2.5" width="9.5" height="9.5" fill="#4285F4" />
        <rect x="12" y="2.5" width="9.5" height="9.5" fill="#EA4335" />
        <rect x="2.5" y="12" width="9.5" height="9.5" fill="#FBBC04" />
        <rect x="12" y="12" width="9.5" height="9.5" fill="#34A853" />
      </g>
      <rect x="5.6" y="5.6" width="12.8" height="12.8" rx="1.2" fill="#FFFFFF" />
      <text
        x="12"
        y="16.1"
        textAnchor="middle"
        fontSize="8.4"
        fontWeight="700"
        fontFamily="Arial, Helvetica, sans-serif"
        fill="#4285F4"
      >
        31
      </text>
    </svg>
  );
}
