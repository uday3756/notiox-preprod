"use client";

import { useState, useRef } from "react";
import { Mic, Square, Send, Loader2, Keyboard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type SR = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: (e: unknown) => void;
};

function getSpeechRecognition(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SR;
    webkitSpeechRecognition?: new () => SR;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface TaskCapturePanelProps {
  onSubmit: (transcript: string) => Promise<void>;
  isLoading?: boolean;
}

export function TaskCapturePanel({ onSubmit, isLoading = false }: TaskCapturePanelProps) {
  const [mode, setMode] = useState<"voice" | "type">("voice");
  const [transcript, setTranscript] = useState("");
  const [typed, setTyped] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const transcriptRef = useRef("");
  const recognitionRef = useRef<SR | null>(null);

  const voiceSupported = getSpeechRecognition() !== null;

  function appendTranscript(text: string) {
    transcriptRef.current = text;
    setTranscript(text);
  }

  function startRecording() {
    const SR = getSpeechRecognition();
    if (!SR) {
      toast.error("Voice input isn't supported here. Switch to Type mode.");
      setMode("type");
      return;
    }

    transcriptRef.current = "";
    setTranscript("");

    try {
      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (e) => {
        let full = "";
        for (let i = 0; i < e.results.length; i++) {
          full += e.results[i][0].transcript + " ";
        }
        appendTranscript(full.trim());
      };
      recognition.onerror = () => {
        /* handled on stop */
      };
      recognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    } catch {
      toast.error("Couldn't start voice input. Try Type mode.");
      setIsRecording(false);
    }
  }

  function stopRecording() {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }

  async function handleSubmit(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      toast.error("Describe your task first.");
      return;
    }
    try {
      await onSubmit(trimmed);
      setTranscript("");
      setTyped("");
      transcriptRef.current = "";
    } catch {
      /* parent handles errors */
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex rounded-full border border-border bg-background p-1 text-xs">
        <button
          type="button"
          onClick={() => setMode("voice")}
          disabled={isLoading || isRecording}
          className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2 transition-colors ${
            mode === "voice" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          <Mic className="h-3.5 w-3.5" /> Voice
        </button>
        <button
          type="button"
          onClick={() => setMode("type")}
          disabled={isLoading || isRecording}
          className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2 transition-colors ${
            mode === "type" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          <Keyboard className="h-3.5 w-3.5" /> Type
        </button>
      </div>

      {mode === "voice" ? (
        <div className="mt-6 flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isLoading || !voiceSupported}
            className={`flex h-20 w-20 items-center justify-center rounded-full transition-colors ${
              isRecording
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground"
            } disabled:opacity-50`}
          >
            {isRecording ? <Square className="h-7 w-7" /> : <Mic className="h-7 w-7" />}
          </button>
          {isRecording && (
            <p className="text-sm text-muted-foreground animate-pulse">Listening… tap to stop</p>
          )}
          {!voiceSupported && (
            <p className="text-center text-sm text-muted-foreground">
              Voice isn't supported in this browser. Use Type mode.
            </p>
          )}
          {transcript && (
            <div className="w-full rounded-xl border border-border bg-background p-3 text-sm">
              {transcript}
            </div>
          )}
          <Button
            onClick={() => handleSubmit(transcript)}
            disabled={isLoading || isRecording || !transcript.trim()}
            className="w-full gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Schedule task
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <Textarea
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="E.g. Team standup tomorrow at 9 AM for 30 minutes"
            className="min-h-28 resize-none"
            disabled={isLoading}
          />
          <Button
            onClick={() => handleSubmit(typed)}
            disabled={isLoading || typed.trim().length < 2}
            className="w-full gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Schedule task
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
