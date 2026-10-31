import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isGroqWhisperConfigured, transcribeWithGroqWhisper } from "@/lib/transcribe.server";

/** Whether Groq Whisper (free-tier accurate STT) is configured. */
export const getVoiceBackend = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { whisper: isGroqWhisperConfigured(), provider: "groq" as const };
  });

/**
 * Transcribe a MediaRecorder clip with Groq Whisper (free tier).
 * audioBase64 must be raw base64 (no data: URL prefix).
 */
export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        audioBase64: z.string().min(100).max(20_000_000),
        mimeType: z.string().min(3).max(120),
        filename: z.string().min(3).max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (!isGroqWhisperConfigured()) {
      throw new Error(
        "High-accuracy voice needs GROQ_API_KEY. Add a free key from console.groq.com in Vercel env.",
      );
    }

    const binary = Buffer.from(data.audioBase64, "base64");
    if (binary.byteLength > 12 * 1024 * 1024) {
      throw new Error("Recording is too long. Try a shorter clip (under ~2 minutes).");
    }

    const mimeType = data.mimeType.split(";")[0].trim() || "audio/webm";
    const filename =
      data.filename ||
      `capture.${mimeType.includes("mp4") || mimeType.includes("aac") ? "m4a" : "webm"}`;

    const transcript = await transcribeWithGroqWhisper({
      bytes: new Uint8Array(binary),
      mimeType,
      filename,
    });

    return { transcript, provider: "groq" as const };
  });
