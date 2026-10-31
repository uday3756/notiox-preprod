/** Shared transcript limits for voice/type capture (mindmap + schedule). */
export const MAX_TRANSCRIPT_LENGTH = 8000;

export function prepareTranscript(text: string): {
  text: string;
  trimmed: boolean;
} {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= MAX_TRANSCRIPT_LENGTH) {
    return { text: normalized, trimmed: false };
  }
  return {
    text: normalized.slice(0, MAX_TRANSCRIPT_LENGTH),
    trimmed: true,
  };
}

/** Turn Zod / server-fn validation errors into readable toast text. */
export function formatServerFnError(err: unknown): string {
  if (!(err instanceof Error)) return "Something went wrong. Try again.";

  const raw = err.message.trim();
  if (!raw.startsWith("[") && !raw.startsWith("{")) return raw;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const messages = parsed
        .map((item) =>
          item && typeof item === "object" && "message" in item
            ? String((item as { message: unknown }).message)
            : null
        )
        .filter(Boolean);
      if (messages.length) return messages.join(" ");
    }
  } catch {
    /* fall through */
  }

  return raw.length > 160 ? "Input validation failed. Try a shorter message." : raw;
}
