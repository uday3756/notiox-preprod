import { useState, useRef, useEffect } from "react";
import { Mic, Square, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  createContinuousRecognizer,
  isSpeechSupported,
  type ContinuousRecognizer,
} from "@/lib/speech-recognition";

interface VoiceCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (transcript: string) => Promise<void>;
  isLoading?: boolean;
}

export function VoiceCaptureDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading = false,
}: VoiceCaptureDialogProps) {
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isBrowserSupported, setIsBrowserSupported] = useState(true);
  const recognizerRef = useRef<ContinuousRecognizer | null>(null);

  useEffect(() => {
    setIsBrowserSupported(isSpeechSupported());
  }, []);

  // Clean up recognition when the dialog closes
  useEffect(() => {
    if (!open) {
      recognizerRef.current?.stop();
      recognizerRef.current = null;
      setIsRecording(false);
      setInterim("");
    }
  }, [open]);

  const startRecording = () => {
    if (!isSpeechSupported()) {
      setIsBrowserSupported(false);
      toast.error("Voice isn't available in this browser. Type your task instead.");
      return;
    }

    recognizerRef.current?.stop();
    const seed = transcript.trim();

    const rec = createContinuousRecognizer({
      initialTranscript: seed,
      onTranscript: (text) => {
        setTranscript(text);
        setInterim("");
      },
      onFatalError: (_reason, message) => {
        recognizerRef.current = null;
        setIsRecording(false);
        setInterim("");
        toast.error(message);
        if (_reason === "unsupported") setIsBrowserSupported(false);
      },
    });

    if (!rec) {
      setIsRecording(false);
      return;
    }

    recognizerRef.current = rec;
    setIsRecording(true);
  };

  const stopRecording = () => {
    const rec = recognizerRef.current;
    if (rec) {
      const text = rec.getTranscript();
      if (text) setTranscript(text);
      rec.stop();
    }
    recognizerRef.current = null;
    setIsRecording(false);
    setInterim("");
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const handleSubmit = async () => {
    let text = transcript.trim();
    if (isRecording && recognizerRef.current) {
      text = recognizerRef.current.getTranscript().trim() || text;
      stopRecording();
    }
    if (!text) return;

    try {
      await onSubmit(text);
      setTranscript("");
      setInterim("");
      onOpenChange(false);
    } catch (error) {
      console.error("Error submitting transcript:", error);
      toast.error("Couldn't save that task. Try again.");
    }
  };

  const handleClear = () => {
    if (isRecording) stopRecording();
    setTranscript("");
    setInterim("");
  };

  const displayValue =
    transcript + (interim ? (transcript ? " " : "") + interim : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>Add a New Task</DialogTitle>
          <DialogDescription>
            Speak or type what's on your mind
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3">
            <Button
              onClick={toggleRecording}
              disabled={!isBrowserSupported || isLoading}
              size="lg"
              className={`relative h-16 w-16 rounded-full p-0 transition-colors ${
                isRecording
                  ? "bg-destructive hover:bg-destructive/90 animate-pulse"
                  : "bg-destructive/90 hover:bg-destructive"
              }`}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
            >
              {isRecording ? (
                <Square className="h-6 w-6 fill-current text-white" />
              ) : (
                <Mic className="h-6 w-6 text-white" />
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              {isRecording ? (
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  Recording… tap to stop
                </span>
              ) : (
                "Tap to record"
              )}
            </span>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">
              {displayValue ? "Your task:" : "Or type your task:"}
            </label>
            <Textarea
              value={displayValue}
              onChange={(e) => {
                if (isRecording) stopRecording();
                setInterim("");
                setTranscript(e.target.value);
              }}
              placeholder="E.g., 'I have a meeting tomorrow at 2 PM about Q3 planning...'"
              className="min-h-24 resize-none"
              disabled={isLoading}
            />
          </div>

          {!isBrowserSupported && (
            <div className="rounded border border-yellow-400 bg-yellow-100 p-3 text-sm text-yellow-800">
              Your browser doesn't support voice input. Please type your task instead.
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleClear} disabled={isLoading}>
              Clear
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading || !displayValue.trim()}
              className="gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
