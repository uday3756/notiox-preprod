/**
 * Client-side, zero-latency STT fixes for common mobile mishears.
 * Conservative: only high-confidence productivity phrases.
 * Full cleanup still runs via repairSpeechTranscript (Haiku) on finalize.
 */
const QUICK_FIXES: Array<[RegExp, string]> = [
  [/\bhaving\s+waiting\b/gi, "having a meeting"],
  [/\bhave\s+waiting\b/gi, "have a meeting"],
  [/\bhad\s+waiting\b/gi, "had a meeting"],
  [/\bam\s+having\s+waiting\b/gi, "am having a meeting"],
  [/\ba\s+waiting\s+with\b/gi, "a meeting with"],
  [/\bwaiting\s+with\b/gi, "meeting with"],
  [/\bschedule\s+(a\s+)?waiting\b/gi, "schedule a meeting"],
  [/\bteam\s+waiting\b/gi, "team meeting"],
  [/\bclient\s+waiting\b/gi, "client meeting"],
  [/\bstaff\s+waiting\b/gi, "staff meeting"],
  [/\bdaily\s+waiting\b/gi, "daily meeting"],
  [/\bzoom\s+waiting\b/gi, "zoom meeting"],
  [/\bdead\s+line\b/gi, "deadline"],
  [/\bto\s+do\s+list\b/gi, "todo list"],
  [/\bbrain\s+dump\b/gi, "brain dump"],
];

export function applyQuickSttFixes(text: string): string {
  let out = text;
  for (const [re, replacement] of QUICK_FIXES) {
    out = out.replace(re, replacement);
  }
  return out.replace(/\s{2,}/g, " ").trim();
}
