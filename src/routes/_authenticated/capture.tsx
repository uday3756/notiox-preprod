import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Loader2, Keyboard, Network } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { previewThought, saveStructuredMap } from "@/lib/notio.functions";
import { generateThoughtDraft, saveThoughtDraft } from "@/lib/capture-draft.functions";
import { CapturePlanPreview } from "@/components/notio/capture-plan-preview";
import { mapDraftSchema, draftRequestSchema, type MapDraft } from "@/lib/capture-draft.types";
import { embedMapNodes } from "@/lib/embeddings.functions";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { getStyleProfile } from "@/lib/style-profile";
import {
  createContinuousRecognizer,
  isLikelyMobileClient,
  isSpeechSupported,
  type ContinuousRecognizer,
} from "@/lib/speech-recognition";
import { applyQuickSttFixes } from "@/lib/stt-quick-fix";
import { repairSpeechTranscript } from "@/lib/stt-repair.functions";
import { getVoiceBackend, transcribeAudio } from "@/lib/transcribe.functions";
import {
  blobToBase64,
  canRecordAudio,
  extensionForMime,
  startVoiceRecording,
  type VoiceRecordingSession,
} from "@/lib/voice-recorder";
import { ensureMicrophonePermission } from "@/lib/mic-permission";
import { VoiceWaveform } from "@/components/notio/voice-waveform";
import { DolphinCompanion } from "@/components/notio/dolphin-companion";

export const Route = createFileRoute("/_authenticated/capture")({
  component: CapturePage,
});

type Phase = "idle" | "recording" | "structuring" | "reviewing" | "preview" | "saving";
type Mode = "voice" | "type";
type VoiceEngine = "groq" | "webspeech" | "none";

function CapturePage() {
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const generateDraft = useServerFn(generateThoughtDraft);
  const saveDraft = useServerFn(saveThoughtDraft);
  const [draft, setDraft] = useState<MapDraft | null>(null);
  const [nextNode, setNextNode] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const requestRef = useRef<{ id: string; text: string } | null>(null);
  const previewFn = useServerFn(previewThought);
  const saveMapFn = useServerFn(saveStructuredMap);
  const repairFn = useServerFn(repairSpeechTranscript);
  const backendFn = useServerFn(getVoiceBackend);
  const transcribeFn = useServerFn(transcribeAudio);
  const embedFn = useServerFn(embedMapNodes);

  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [mode, setMode] = useState<Mode>("voice");
  const [typed, setTyped] = useState("");
  const [speechOk, setSpeechOk] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngine>("none");
  const [groqReady, setGroqReady] = useState(false);

  const fromVoiceRef = useRef(false);
  /** Skip free-model repair when Whisper already produced a strong transcript. */
  const skipHeavyRepairRef = useRef(false);
  const transcriptRef = useRef("");
  const recognizerRef = useRef<ContinuousRecognizer | null>(null);
  const recorderRef = useRef<VoiceRecordingSession | null>(null);
  const activeEngineRef = useRef<VoiceEngine>("none");
  const livePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveReqIdRef = useRef(0);
  /** Prevent overlapping live Whisper polls (first-attempt hangs). */
  const liveInFlightRef = useRef(false);
  /** Prefer browser live captions when available; Whisper still owns the final text. */
  const liveFromBrowserRef = useRef(false);
  /**
   * Live parallel edit: when the user types in the listening box, freeze their text
   * as a prefix and only append NEW speech after it (never wipe their edits).
   */
  const userBaseRef = useRef<string | null>(null);
  const sttTailRef = useRef("");
  const liveBaselineRef = useRef("");
  const engineTextRef = useRef("");

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`notio:capture:${user.id}`) ?? "null");
      if (saved && typeof saved.transcript === "string") {
        setTyped(saved.transcript); setTranscript(saved.transcript); transcriptRef.current = saved.transcript;
        const parsed = mapDraftSchema.safeParse(saved.draft);
        const request=draftRequestSchema.safeParse(saved.request);
        const matching=request.success&&request.data.text===saved.transcript;
        if (parsed.success && matching) { setDraft(parsed.data); setPhase("preview"); setNextNode(saved.nextNode ?? ""); }
        else if (saved.transcript.length >= 4) setPhase("reviewing");
        if (matching) requestRef.current = request.data;
      }
    } catch { /* A bad or unavailable draft store must not prevent capture. */ }
    setDraftLoaded(true);
  }, [user.id]);

  useEffect(() => {
    if (!draftLoaded) return;
    try { sessionStorage.setItem(`notio:capture:${user.id}`, JSON.stringify({ transcript: phase==="idle"&&mode==="type"?typed:transcript||typed, draft, nextNode, request: requestRef.current })); }
    catch { /* Keep the in-memory draft if browser storage is unavailable. */ }
  }, [user.id, draftLoaded, transcript, typed, draft, nextNode, phase, mode]);

  async function generateReviewed() {
    const text = transcriptRef.current.trim();
    if (text.length < 4) { toast.error("Add a little more text first."); return; }
    if (!requestRef.current || requestRef.current.text !== text) requestRef.current = { id: crypto.randomUUID(), text };
    setPhase("structuring"); setStatusHint("Building your draft...");
    try {
      if (FEATURE_FLAGS.workflow) {
        const result = await generateDraft({ data: { requestId: requestRef.current.id, transcript: text } });
        setDraft(result.draft); setNextNode(result.draft.nodes.find(n => n.parentId)?.id ?? ""); setPhase("preview");
      } else {
        const profile = getStyleProfile();
        const style = profile?.samples
          ? `avg ${profile.avgSentenceLength} words/sentence, ${profile.fillers.slice(0, 4).join(", ") || "plain phrasing"}`
          : undefined;
        const result = await previewFn({ data: { transcript: text, style } });
        setDraft({ title: result.title, nodes: result.nodes });
        setNextNode(result.nodes.find((n) => n.parentId)?.id ?? "");
        setPhase("preview");
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't generate. Your text is still here."); setPhase("reviewing"); }
    finally { setStatusHint(null); }
  }

  async function saveReviewed() {
    if (!draft || !requestRef.current || phase === "saving") return;
    setPhase("saving");
    try {
      const result = FEATURE_FLAGS.workflow
        ? await saveDraft({ data: { requestId: requestRef.current.id, draft, nextNodeId: nextNode || null } })
        : await saveMapFn({
            data: {
              captureRequestId: requestRef.current.id,
              transcript: requestRef.current.text,
              title: draft.title,
              nodes: draft.nodes,
            },
          });
      if (FEATURE_FLAGS.crossMapRag) void embedFn({ data: { mapId: result.mapId } }).catch(() => undefined);
      try { sessionStorage.removeItem(`notio:capture:${user.id}`); } catch { /* A confirmed save must still navigate when storage is unavailable. */ }
      toast.success("Saved"); navigate({ to: nextNode ? "/home" : "/maps/$id", params: { id: result.mapId } });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't save. Try again."); setPhase("preview"); }
  }

  function resetLiveEditState() {
    userBaseRef.current = null;
    sttTailRef.current = "";
    liveBaselineRef.current = "";
    engineTextRef.current = "";
  }

  /** Apply incoming STT while preserving any in-progress user edits. */
  function applyLiveTranscript(incoming: string) {
    const text = incoming.trim();
    engineTextRef.current = text;

    if (userBaseRef.current === null) {
      liveBaselineRef.current = text;
      transcriptRef.current = text;
      setTranscript(text);
      return;
    }

    const baseline = liveBaselineRef.current;
    let addition = "";
    if (!baseline) {
      addition = text ? ` ${text}` : "";
    } else if (text.startsWith(baseline)) {
      addition = text.slice(baseline.length);
    } else if (text.length > baseline.length) {
      addition = text.slice(baseline.length);
    } else {
      // Shorter/rollback interim — keep UI, don't clobber user text
      return;
    }

    liveBaselineRef.current = text;
    if (addition) {
      sttTailRef.current = `${sttTailRef.current}${addition}`;
    }
    const merged = `${userBaseRef.current}${sttTailRef.current}`
      .replace(/\s+/g, " ")
      .trim();
    transcriptRef.current = merged;
    setTranscript(merged);
  }

  /** User typed while listening — lock prefix, keep appending new speech after it. */
  function onLiveTranscriptEdit(next: string) {
    userBaseRef.current = next;
    sttTailRef.current = "";
    liveBaselineRef.current = engineTextRef.current;
    transcriptRef.current = next;
    setTranscript(next);
  }

  useEffect(() => {
    const mobile = isLikelyMobileClient();
    setIsMobile(mobile);
    const webSpeech = isSpeechSupported();
    const canRec = canRecordAudio();

    let cancelled = false;
    (async () => {
      let whisper = false;
      try {
        const backend = await backendFn();
        whisper = Boolean(backend?.whisper);
      } catch {
        whisper = false;
      }
      if (cancelled) return;

      setGroqReady(whisper);
      // Prefer Groq whenever configured + MediaRecorder (works on iOS without Web Speech).
      const usable: VoiceEngine =
        whisper && canRec ? "groq" : webSpeech ? "webspeech" : "none";
      setVoiceEngine(usable);
      setSpeechOk(usable !== "none");
      if (usable === "none") setMode("type");
    })();

    return () => {
      cancelled = true;
    };
  }, [backendFn]);

  function clearLivePoll() {
    if (livePollRef.current != null) {
      clearInterval(livePollRef.current);
      livePollRef.current = null;
    }
    liveReqIdRef.current += 1;
    liveInFlightRef.current = false;
  }

  useEffect(() => {
    return () => {
      clearLivePoll();
      recognizerRef.current?.stop();
      recognizerRef.current = null;
      recorderRef.current?.cancel();
      recorderRef.current = null;
    };
  }, []);

  function switchToTypeHint() {
    setMode("type");
  }

  /** Soft live captions via browser STT — never aborts the Groq recording. */
  function startLiveBrowserCaptions() {
    if (!isSpeechSupported()) return;
    liveFromBrowserRef.current = false;
    recognizerRef.current?.stop();

    const rec = createContinuousRecognizer({
      onTranscript: (text) => {
        const t = text.trim();
        if (!t) return;
        liveFromBrowserRef.current = true;
        applyLiveTranscript(t);
      },
      onFatalError: () => {
        // Mic conflict / unsupported — keep recording; Whisper live poll will fill captions.
        recognizerRef.current = null;
        liveFromBrowserRef.current = false;
      },
    });
    recognizerRef.current = rec;
  }

  /** Live captions from Whisper snapshots when browser captions aren't flowing. */
  function startLiveWhisperCaptions(session: VoiceRecordingSession) {
    clearLivePoll();
    livePollRef.current = setInterval(() => {
      void (async () => {
        // If browser captions are already updating the UI, skip expensive polls.
        if (liveFromBrowserRef.current && transcriptRef.current.length > 0) return;
        // Serialize: never pile concurrent Whisper calls (cold-start hangs).
        if (liveInFlightRef.current) return;
        const snap = session.snapshot();
        if (!snap || snap.blob.size < 2500) return;
        const reqId = ++liveReqIdRef.current;
        liveInFlightRef.current = true;
        try {
          const audioBase64 = await blobToBase64(snap.blob);
          const filename = `live.${extensionForMime(snap.mimeType)}`;
          const res = await transcribeFn({
            data: { audioBase64, mimeType: snap.mimeType, filename },
          });
          if (reqId !== liveReqIdRef.current) return;
          const text = (res?.transcript ?? "").trim();
          if (!text) return;
          // Don't overwrite fresher browser captions that arrived mid-request.
          if (liveFromBrowserRef.current && engineTextRef.current.length >= text.length) return;
          applyLiveTranscript(text);
        } catch (e) {
          console.warn("[capture] live Whisper caption skipped:", e);
        } finally {
          liveInFlightRef.current = false;
        }
      })();
    }, 4000);
  }

  async function startGroqRecording() {
    const session = await startVoiceRecording();
    recorderRef.current = session;
    activeEngineRef.current = "groq";
    resetLiveEditState();
    setTranscript("");
    transcriptRef.current = "";
    fromVoiceRef.current = true;
    skipHeavyRepairRef.current = true;
    liveFromBrowserRef.current = false;
    setPhase("recording");
    // Live text while speaking + accurate Whisper on stop.
    startLiveBrowserCaptions();
    startLiveWhisperCaptions(session);
  }

  function startWebSpeech() {
    if (!isSpeechSupported()) {
      setSpeechOk(false);
      setMode("type");
      toast.error("Voice isn't supported here — use Type instead.", {
        action: { label: "Type", onClick: switchToTypeHint },
      });
      return;
    }

    clearLivePoll();
    resetLiveEditState();
    transcriptRef.current = "";
    setTranscript("");
    fromVoiceRef.current = true;
    skipHeavyRepairRef.current = false;
    liveFromBrowserRef.current = true;
    recognizerRef.current?.stop();

    const rec = createContinuousRecognizer({
      onTranscript: (text) => {
        applyLiveTranscript(text);
      },
      onFatalError: (reason, message) => {
        recognizerRef.current = null;
        setPhase("idle");
        toast.error(message, {
          action:
            reason === "unsupported" || reason === "network" || reason === "not-allowed"
              ? { label: "Type instead", onClick: switchToTypeHint }
              : undefined,
        });
        if (reason === "unsupported") {
          setSpeechOk(false);
          setMode("type");
        }
      },
    });

    if (!rec) {
      setPhase("idle");
      return;
    }

    recognizerRef.current = rec;
    activeEngineRef.current = "webspeech";
    setPhase("recording");
  }

  async function start() {
    fromVoiceRef.current = true;
    clearLivePoll();
    recognizerRef.current?.stop();
    recorderRef.current?.cancel();
    recognizerRef.current = null;
    recorderRef.current = null;

    // Explicit mic prompt before Capture (store / WebView requirement).
    if (canRecordAudio() || isSpeechSupported()) {
      const mic = await ensureMicrophonePermission();
      if (mic === "denied") {
        toast.error("Microphone is blocked. Allow mic access for Notio, then try again.", {
          action: { label: "Type", onClick: switchToTypeHint },
        });
        return;
      }
    }

    // Re-check at tap time (avoids race where groqReady is still false on first load).
    let whisperOn = groqReady;
    if (canRecordAudio()) {
      try {
        const backend = await backendFn();
        whisperOn = Boolean(backend?.whisper);
        setGroqReady(whisperOn);
        if (whisperOn) setVoiceEngine("groq");
      } catch (e) {
        console.warn("[capture] getVoiceBackend failed:", e);
      }
    }

    // Prefer Groq Whisper whenever the key is live + MediaRecorder works.
    if (whisperOn && canRecordAudio()) {
      try {
        await startGroqRecording();
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Couldn't start recording.";
        if (/Permission|NotAllowed|denied/i.test(msg)) {
          toast.error("Microphone is blocked. Allow mic access, then try again.", {
            action: { label: "Type", onClick: switchToTypeHint },
          });
          return;
        }
        console.warn("[capture] Groq record failed, trying Web Speech:", err);
        toast.message("Accurate voice unavailable — using browser speech.");
      }
    }

    if (isSpeechSupported()) {
      startWebSpeech();
      return;
    }

    setSpeechOk(false);
    setMode("type");
    toast.error(
      whisperOn
        ? "Couldn't access the mic. Allow microphone permission or use Type."
        : "Accurate voice isn't configured yet. Use Type, or the keyboard mic.",
      { action: { label: "Type", onClick: switchToTypeHint } },
    );
  }

  async function stop() {
    const engine = activeEngineRef.current;
    clearLivePoll();

    if (engine === "groq" && recorderRef.current) {
      const session = recorderRef.current;
      recorderRef.current = null;
      // Stop live browser captions; keep last live text as fallback.
      const liveFallback = (
        recognizerRef.current?.getTranscript() ??
        transcriptRef.current
      ).trim();
      recognizerRef.current?.stop();
      recognizerRef.current = null;

      setPhase("structuring");
      setStatusHint("Finalizing what you said…");
      try {
        const { blob, mimeType } = await session.stop();
        const audioBase64 = await blobToBase64(blob);
        const filename = `capture.${extensionForMime(mimeType)}`;
        const res = await transcribeFn({
          data: { audioBase64, mimeType, filename },
        });
        const whisperText = (res?.transcript ?? "").trim() || liveFallback;
        // If the user edited while listening, keep their text (plus any appended speech).
        const text =
          userBaseRef.current !== null
            ? transcriptRef.current.trim() || whisperText
            : whisperText;
        setTranscript(text);
        transcriptRef.current = text;
        skipHeavyRepairRef.current = Boolean(res?.transcript?.trim()) && userBaseRef.current === null;
        resetLiveEditState();
        await finalize(text);
      } catch (err) {
        session.cancel?.();
        const fallback =
          userBaseRef.current !== null
            ? transcriptRef.current.trim() || liveFallback
            : liveFallback;
        if (fallback.length >= 4) {
          // Still build a map from live captions if Whisper fails.
          skipHeavyRepairRef.current = false;
          setTranscript(fallback);
          transcriptRef.current = fallback;
          resetLiveEditState();
          await finalize(fallback);
          return;
        }
        const raw = err instanceof Error ? err.message : "Transcription failed.";
        toast.error(raw, { action: { label: "Type", onClick: switchToTypeHint } });
        setPhase("idle");
        setStatusHint(null);
        fromVoiceRef.current = false;
      }
      return;
    }

    const rec = recognizerRef.current;
    recognizerRef.current = null;
    const text =
      userBaseRef.current !== null
        ? transcriptRef.current
        : rec?.getTranscript() ?? transcriptRef.current;
    rec?.stop();
    skipHeavyRepairRef.current = false;
    resetLiveEditState();
    await finalize(text);
  }

  async function finalize(text: string) {
    if (!text || text.trim().length < 4) {
      toast.error("Didn't catch that - try speaking a bit longer, or switch to Type.");
      setPhase("idle");
      setStatusHint(null);
      return;
    }
    setPhase("structuring");
    try {
      let reviewed = fromVoiceRef.current ? applyQuickSttFixes(text.trim()) : text.trim();
      if (fromVoiceRef.current && !skipHeavyRepairRef.current) {
        setStatusHint("Cleaning up what we heard...");
        try { const repaired = await repairFn({ data: { transcript: reviewed } }); reviewed = repaired.transcript?.trim() || reviewed; } catch { /* Review remains available. */ }
      }
      transcriptRef.current = reviewed; setTranscript(reviewed); setDraft(null); setPhase("reviewing");
      return;
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      const isNetwork = /failed to fetch|network|load failed|fetch|connection/i.test(raw);
      toast.error(
        isNetwork
          ? "Couldn't reach the server. Check your internet connection and try again."
          : raw || "Something went wrong. Try again.",
      );
      setPhase("idle");
    } finally {
      setStatusHint(null);
      fromVoiceRef.current = false;
      skipHeavyRepairRef.current = false;
      activeEngineRef.current = "none";
    }
  }

  const recording = phase === "recording";
  const working = phase === "structuring" || phase === "saving";

  async function submitTyped() {
    fromVoiceRef.current = false;
    skipHeavyRepairRef.current = false;
    const text = typed.trim();
    if (text.length < 4) {
      toast.error("Write a bit more first.");
      return;
    }
    await finalize(text);
  }

  return (
    <div className="notiox-capture min-h-dvh" data-phase={phase}>
      <div className="notiox-capture-layout">
        <div className="notiox-screen-header flex items-center justify-end">
          <span className="text-xs text-muted-foreground">Capture</span>
        </div>

        <div className="notiox-capture-companion"><DolphinCompanion state={recording ? "listening" : working ? "thinking" : "calm"} /></div>

        <div className="notiox-mode-tabs" role="group" aria-label="Capture mode">
          <button
            onClick={() => setMode("voice")}
            disabled={working || recording || !speechOk}
            aria-pressed={mode === "voice"}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2 transition-colors ${
              mode === "voice" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            } disabled:opacity-40`}
          >
            <Mic className="h-3.5 w-3.5" /> Voice
          </button>
          <button
            onClick={() => setMode("type")}
            disabled={working || recording}
            aria-pressed={mode === "type"}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2 transition-colors ${
              mode === "type" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            <Keyboard className="h-3.5 w-3.5" /> Type
          </button>
        </div>
        {!speechOk && (
          <p className="notiox-voice-unavailable text-center text-sm text-muted-foreground">
            Voice isn't available here — Type works just as well.
          </p>
        )}

        <div className="notiox-capture-heading text-center">
          <h1 className="font-display text-3xl font-bold leading-tight">
            {phase === "idle" && (mode === "type" ? "Type what's on your mind" : "What's on your mind?")}
            {phase === "recording" && "Listening..."}
            {phase === "structuring" && (statusHint || "Building your map...")}
            {phase === "reviewing" && "Review your thought"}
            {(phase === "preview" || phase === "saving") && "Choose your next action"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {phase === "idle"
              ? mode === "type"
                ? "Dump freely — same as speaking. Ctrl/Cmd+Enter to build."
                : "Hold nothing back. Just talk."
              : phase === "reviewing" || phase === "preview" ? "" : statusHint || "Hang tight."}
          </p>
        </div>

        {phase === "reviewing" ? (
          <section className="notiox-review">
            <label htmlFor="reviewed-transcript">Your thought</label>
            <textarea id="reviewed-transcript" rows={8} value={transcript} maxLength={30000}
              onChange={e => { setTranscript(e.target.value); transcriptRef.current = e.target.value; }}/>
            <div className="notiox-review-actions"><button type="button" onClick={() => { setTyped(transcript); setMode("type"); setPhase("idle"); }}>Back</button>
              <button type="button" onClick={() => void generateReviewed()} disabled={transcript.trim().length < 4}><Network size={16}/> Create plan</button></div>
          </section>
        ) : draft && (phase === "preview" || phase === "saving") ? (
          <CapturePlanPreview
            draft={draft}
            onChange={setDraft}
            nextNode={nextNode}
            onNextNode={setNextNode}
            working={working}
            onEditThought={() => setPhase("reviewing")}
            onSave={() => void saveReviewed()}
          />
        ) : mode === "voice" ? (
          <div className="notiox-voice-controls flex flex-col items-center">
            <AnimatePresence>
              {recording && (
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 280, damping: 26 }}
                  className="notiox-transcript-panel w-full overflow-y-auto rounded-lg border border-border bg-surface p-5"
                >
                  <VoiceWaveform active={recording} />
                  <div className="mt-4 min-h-[2.5rem]">
                    <label className="sr-only" htmlFor="live-transcript-edit">
                      Edit transcript while listening
                    </label>
                    <textarea
                      id="live-transcript-edit"
                      value={transcript}
                      onChange={(e) => onLiveTranscriptEdit(e.target.value)}
                      rows={3}
                      placeholder={
                        isMobile
                          ? "Listening… speak or tap here to edit."
                          : "Listening… speak, or tap here to edit as you go."
                      }
                      className="w-full resize-none rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-center text-base font-medium leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
                    />
                    <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
                      Tap the text to edit anytime — new speech keeps adding after your edits.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {working && transcript && (
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 24 }}
                  className="notiox-transcript-panel mt-5 w-full rounded-lg border border-border bg-surface px-6 py-5 text-center"
                >
                  <p className="text-base font-medium text-foreground">
                    {transcript}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={recording ? () => void stop() : () => void start()}
              disabled={working}
              aria-label={recording ? "Stop recording" : working ? "Building your map" : "Start recording"}
              className={`notiox-record-button relative flex h-24 w-24 items-center justify-center rounded-full text-primary-foreground transition-colors ${
                recording ? "bg-destructive animate-pulse-ring" : working ? "bg-muted" : "bg-primary shadow-primary/40"
              } disabled:cursor-not-allowed`}
            >
              {working ? (
                <Loader2 className="h-10 w-10 animate-spin" />
              ) : recording ? (
                <Square className="h-9 w-9" fill="currentColor" />
              ) : (
                <Mic className="h-10 w-10" />
              )}
            </motion.button>
            <p className="mt-5 text-sm font-medium text-foreground" aria-live="polite">
              {recording ? "Tap to stop" : working ? "Working..." : "Tap to speak"}
            </p>
            {!recording && !working && (
              <p className="mt-2 max-w-xs text-center text-sm text-muted-foreground">
                No filter. No polish. Just get it out of your head.
              </p>
            )}
          </div>
        ) : (
          <div className="notiox-typed-controls">
            <textarea
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void submitTyped();
                }
              }}
              disabled={working}
              placeholder="Type freely — same as speaking. Dump anything; Notio will structure it."
              rows={8}
              aria-label="Your thought"
              className="w-full resize-y rounded-2xl border border-border bg-surface px-4 py-4 text-base leading-relaxed outline-none focus:border-primary min-h-[12rem]"
            />
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Tip: Ctrl+Enter or Cmd+Enter to build
            </p>
            <button
              type="button"
              onClick={() => void submitTyped()}
              disabled={working || typed.trim().length < 4}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />}
              {phase === "structuring" ? "Building map..." : "Review thought"}
            </button>
            {typed.trim().length > 0 && typed.trim().length < 4 && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Add a little more text to build a map.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
