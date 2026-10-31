/**
 * Client-side audio capture via MediaRecorder (iOS + Android).
 * Paired with Groq Whisper on the server for accurate free-tier STT.
 */

export type VoiceRecordingSession = {
  stop: () => Promise<{ blob: Blob; mimeType: string }>;
  cancel: () => void;
  /** Current audio so far (for live captions while still recording). */
  snapshot: () => { blob: Blob; mimeType: string } | null;
};

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
    "audio/ogg;codecs=opus",
  ];
  for (const t of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return "";
}

export function canRecordAudio(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

export async function startVoiceRecording(): Promise<VoiceRecordingSession> {
  if (!canRecordAudio()) {
    throw new Error("This browser can't record audio. Use Type mode.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const mimeType = pickMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream);
  const actualMime = recorder.mimeType || mimeType || "audio/webm";
  const chunks: BlobPart[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  // Timeslice so we can snapshot mid-recording for live captions.
  // iOS is picky — use a longer slice + periodic requestData.
  const isApple =
    typeof navigator !== "undefined" &&
    /iPhone|iPad|iPod|Mac.*Mobile|Mobile.*Safari/i.test(navigator.userAgent || "");
  try {
    recorder.start(isApple ? 1000 : 250);
  } catch {
    recorder.start();
  }

  const flushTimer = setInterval(() => {
    if (recorder.state !== "recording") return;
    try {
      recorder.requestData();
    } catch {
      /* ignore */
    }
  }, isApple ? 900 : 1200);

  const stopTracks = () => {
    clearInterval(flushTimer);
    for (const t of stream.getTracks()) {
      try {
        t.stop();
      } catch {
        /* noop */
      }
    }
  };

  const snapshot = () => {
    if (chunks.length === 0) return null;
    const blob = new Blob(chunks, { type: actualMime });
    if (blob.size < 600) return null;
    return { blob, mimeType: actualMime };
  };

  return {
    snapshot,
    stop: () =>
      new Promise((resolve, reject) => {
        const finish = () => {
          stopTracks();
          const blob = new Blob(chunks, { type: actualMime });
          if (blob.size < 800) {
            reject(new Error("Recording was too short. Hold the mic a bit longer."));
            return;
          }
          resolve({ blob, mimeType: actualMime });
        };

        if (recorder.state === "inactive") {
          finish();
          return;
        }

        recorder.onstop = () => finish();
        recorder.onerror = () => {
          stopTracks();
          reject(new Error("Recording failed. Try again or use Type."));
        };
        try {
          if (typeof recorder.requestData === "function" && recorder.state === "recording") {
            try {
              recorder.requestData();
            } catch {
              /* ignore */
            }
          }
          recorder.stop();
        } catch (err) {
          stopTracks();
          reject(err instanceof Error ? err : new Error("Couldn't stop recording."));
        }
      }),
    cancel: () => {
      try {
        if (recorder.state !== "inactive") recorder.stop();
      } catch {
        /* noop */
      }
      stopTracks();
    },
  };
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function extensionForMime(mime: string): string {
  if (mime.includes("mp4") || mime.includes("aac") || mime.includes("m4a")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("wav")) return "wav";
  return "webm";
}
