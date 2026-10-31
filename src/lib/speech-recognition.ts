/**
 * Shared Web Speech API helper — behavior matched to the Capture path that
 * worked well before the mobile experiments (commit 65b9092):
 *   - continuous=true, interimResults=true
 *   - lang defaults to en-US (changing this hurt accuracy for many users)
 *   - reuse the SAME recognizer instance; restart immediately on onend
 *   - use alternative [0] only (confidence-based picking was unreliable)
 *   - never call getUserMedia (Android mic conflict)
 *
 * A short delayed retry is used ONLY if immediate r.start() throws.
 */

export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

export type SpeechResultEvent = {
  resultIndex?: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
};

export type ContinuousRecognizer = {
  getTranscript: () => string;
  stop: () => void;
};

export type FatalSpeechReason = "unsupported" | "not-allowed" | "network" | "start-failed";

export type CreateContinuousRecognizerOptions = {
  onTranscript: (text: string) => void;
  onFatalError?: (reason: FatalSpeechReason, message: string) => void;
  onPartial?: (finalText: string, interimText: string) => void;
  initialTranscript?: string;
  /** Override language. Default is en-US (yesterday's working setting). */
  lang?: string;
  maxNetworkRetries?: number;
};

const UNSUPPORTED_MSG =
  "Voice isn't supported in this browser — use Chrome or Edge (desktop/Android), or type instead. iPhone Safari may have limited speech recognition.";
const NOT_ALLOWED_MSG =
  "Microphone is blocked. Allow mic access for this site, then try again.";
const NETWORK_MSG =
  "Voice can't reach your browser's speech service. This is usually Brave, an ad-blocker, or a VPN — try Chrome/Edge (turn off shields) or type instead.";
const START_FAILED_MSG = "Couldn't start voice input. Try typing instead.";

export function isLikelyMobileClient(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    try {
      if (
        window.matchMedia("(pointer: coarse)").matches &&
        !window.matchMedia("(hover: hover)").matches
      ) {
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return Boolean(getSpeechRecognition());
}

/** Default en-US — this matched the yesterday build users said worked well. */
export function resolveSpeechLang(): string {
  return "en-US";
}

export function createContinuousRecognizer(
  opts: CreateContinuousRecognizerOptions,
): ContinuousRecognizer | null {
  const SRClass = getSpeechRecognition();
  if (!SRClass) {
    opts.onFatalError?.("unsupported", UNSUPPORTED_MSG);
    return null;
  }

  const maxNet = opts.maxNetworkRetries ?? 2;
  let base = (opts.initialTranscript ?? "").trim();
  let current = "";
  let stopping = false;
  let netFails = 0;
  let instance: SpeechRecognitionLike | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  const emit = () => {
    const combined = `${base} ${current}`.trim();
    opts.onTranscript(combined);
  };

  const getTranscript = () => `${base} ${current}`.trim();

  const clearRestart = () => {
    if (restartTimer != null) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  };

  const tryStart = (r: SpeechRecognitionLike) => {
    try {
      r.start();
      return true;
    } catch {
      // Mobile sometimes needs a beat after onend before start succeeds.
      clearRestart();
      restartTimer = setTimeout(() => {
        restartTimer = null;
        if (stopping || instance !== r) return;
        try {
          r.start();
        } catch {
          /* will end again or user stops */
        }
      }, 250);
      return false;
    }
  };

  const stop = () => {
    stopping = true;
    clearRestart();
    const r = instance;
    instance = null;
    if (r) {
      try {
        r.stop();
      } catch {
        try {
          r.abort?.();
        } catch {
          /* noop */
        }
      }
    }
  };

  try {
    const r = new SRClass();
    // Yesterday's settings — do not flip continuous off on mobile.
    r.continuous = true;
    r.interimResults = true;
    r.lang = opts.lang ?? resolveSpeechLang();

    r.onresult = (e) => {
      if (stopping) return;
      netFails = 0;
      let sessionText = "";
      let interimOnly = "";
      let finalsInSession = "";

      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        // Always take [0] — same as yesterday. Confidence ranking hurt accuracy.
        const text = (result[0]?.transcript ?? "").trim();
        if (!text) continue;
        sessionText += text + " ";
        if (result.isFinal) finalsInSession += text + " ";
        else interimOnly += text + " ";
      }

      current = sessionText.trim();
      emit();

      if (opts.onPartial) {
        opts.onPartial(`${base} ${finalsInSession}`.trim(), interimOnly.trim());
      }
    };

    r.onerror = (e) => {
      if (stopping) return;
      const code = e?.error ?? "";
      if (code === "not-allowed" || code === "service-not-allowed") {
        stopping = true;
        clearRestart();
        instance = null;
        opts.onFatalError?.("not-allowed", NOT_ALLOWED_MSG);
      } else if (code === "network") {
        netFails += 1;
      }
    };

    r.onend = () => {
      if (stopping || instance !== r) return;

      if (netFails > maxNet) {
        stopping = true;
        clearRestart();
        instance = null;
        opts.onFatalError?.("network", NETWORK_MSG);
        return;
      }

      // Commit so the next session's empty results don't wipe speech.
      base = getTranscript();
      current = "";
      tryStart(r);
    };

    instance = r;
    r.start();
  } catch {
    opts.onFatalError?.("start-failed", START_FAILED_MSG);
    return null;
  }

  return { getTranscript, stop };
}

export const SPEECH_MESSAGES = {
  unsupported: UNSUPPORTED_MSG,
  notAllowed: NOT_ALLOWED_MSG,
  network: NETWORK_MSG,
  startFailed: START_FAILED_MSG,
} as const;
