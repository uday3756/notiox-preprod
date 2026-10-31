/**
 * Groq Whisper transcription (server-only).
 * Free tier: whisper-large-v3 / turbo — no credit card, daily rate limits.
 * @see https://console.groq.com/docs/speech-to-text
 */

const GROQ_TRANSCRIBE_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
/** Turbo is free-tier eligible and fast enough for Capture clips. */
const DEFAULT_GROQ_WHISPER_MODEL = "whisper-large-v3-turbo";

export function isGroqWhisperConfigured(): boolean {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

function resolveWhisperModel(): string {
  const raw = process.env.GROQ_WHISPER_MODEL?.trim();
  if (raw && /^whisper-/i.test(raw)) return raw;
  return DEFAULT_GROQ_WHISPER_MODEL;
}

export async function transcribeWithGroqWhisper(params: {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
}): Promise<string> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "High-accuracy voice needs GROQ_API_KEY. Get a free key at https://console.groq.com/keys",
    );
  }

  const form = new FormData();
  // Copy into a fresh ArrayBuffer-backed Uint8Array so Blob accepts it in Node + browsers.
  const copy = new Uint8Array(params.bytes.byteLength);
  copy.set(params.bytes);
  const blob = new Blob([copy], {
    type: params.mimeType || "application/octet-stream",
  });
  form.append("file", blob, params.filename);
  form.append("model", resolveWhisperModel());
  form.append("language", "en");
  form.append("response_format", "json");
  form.append(
    "prompt",
    "Notio productivity notes: meeting, deadline, calendar, todo, journal, client call, presentation, brainstorm.",
  );

  const res = await fetch(GROQ_TRANSCRIBE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[groq-whisper]", res.status, detail.slice(0, 400));
    if (res.status === 401) throw new Error("Groq API key rejected. Check GROQ_API_KEY.");
    if (res.status === 429) {
      throw new Error(
        "Free voice quota hit for today. Try again later, or use Type / browser speech.",
      );
    }
    throw new Error("Couldn't transcribe that recording. Try again or use Type.");
  }

  const json = (await res.json()) as { text?: string };
  const text = (json.text ?? "").trim();
  if (!text) throw new Error("Didn't catch any speech. Try again a bit louder or longer.");
  console.info("[groq-whisper] ok", { chars: text.length, model: resolveWhisperModel() });
  return text;
}
