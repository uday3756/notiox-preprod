import { useEffect, useRef, useState } from "react";

interface VoiceWaveformProps {
  /** Whether audio is actively being captured (animates the bars) */
  active: boolean;
  /** Number of bars to render */
  barCount?: number;
}

/**
 * Animated gradient waveform — purple→pink bars that pulse while recording.
 *
 * IMPORTANT: this is a purely SYNTHETIC animation and deliberately does NOT open
 * its own microphone stream. On Android, Chrome's SpeechRecognition uses Google's
 * speech service, which cannot record while another part of the page holds the
 * mic via getUserMedia ("Speech Recognition ... cannot record now as Chrome is
 * recording"). An earlier mic-driven waveform grabbed the mic and starved the
 * recognizer, so voice capture failed on Android. The bars are cosmetic, so we
 * animate them without the mic and leave the microphone free for recognition.
 */
export function VoiceWaveform({ active, barCount = 40 }: VoiceWaveformProps) {
  const [levels, setLevels] = useState<number[]>(() =>
    Array.from({ length: barCount }, () => 0.2)
  );
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef(0);

  useEffect(() => {
    if (!active) {
      // Reset to a calm idle state
      setLevels(Array.from({ length: barCount }, () => 0.15));
      cleanup();
      return;
    }

    function animateSynthetic() {
      const loop = () => {
        tickRef.current += 0.15;
        const t = tickRef.current;
        const next = Array.from({ length: barCount }, (_, i) => {
          const wave =
            Math.sin(t + i * 0.5) * 0.3 +
            Math.sin(t * 1.7 + i * 0.3) * 0.25 +
            0.45;
          return Math.max(0.12, Math.min(1, wave));
        });
        setLevels(next);
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    }

    animateSynthetic();

    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, barCount]);

  function cleanup() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  return (
    <div className="flex h-20 items-center justify-center gap-[3px]">
      {levels.map((level, i) => {
        // center bars taller, edges shorter — natural waveform falloff
        const center = barCount / 2;
        const distance = Math.abs(i - center) / center;
        const falloff = 1 - distance * 0.45;
        const height = Math.max(4, level * 64 * falloff);
        return (
          <div
            key={i}
            className="w-[3px] rounded-full"
            style={{
              height: `${height}px`,
              background:
                "linear-gradient(to top, #9B7CFF, #C77DFF, #FF6B9D)",
              opacity: active ? 0.55 + level * 0.45 : 0.3,
              transition: "height 80ms ease-out, opacity 120ms ease-out",
            }}
          />
        );
      })}
    </div>
  );
}
