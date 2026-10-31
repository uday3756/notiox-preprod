import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Volume2, Volume1, VolumeX, Maximize, Minimize } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function getFullscreenElement(): Element | null {
  const d = document as FsDoc;
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

function toggleFullscreen(wrap: HTMLElement) {
  const d = document as FsDoc;
  const active = getFullscreenElement();
  if (active) {
    const exit = document.exitFullscreen?.bind(document) ?? d.webkitExitFullscreen?.bind(d);
    void exit?.();
    return;
  }
  const el = wrap as FsEl;
  const request = wrap.requestFullscreen?.bind(wrap) ?? el.webkitRequestFullscreen?.bind(el);
  void request?.();
}

const formatTime = (seconds: number) => {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

const CustomSlider = ({
  value,
  onChange,
  className,
  ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  ariaLabel?: string;
}) => {
  const seekFromClientX = (el: HTMLElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    onChange(Math.min(Math.max(percentage, 0), 100));
  };

  return (
    <motion.div
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      className={cn(
        "relative h-1.5 w-full cursor-pointer rounded-full bg-white/20 touch-none sm:h-1",
        className,
      )}
      onClick={(e) => seekFromClientX(e.currentTarget, e.clientX)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seekFromClientX(e.currentTarget, e.clientX);
      }}
      onPointerMove={(e) => {
        if (e.buttons !== 1) return;
        seekFromClientX(e.currentTarget, e.clientX);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          onChange(Math.min(value + 5, 100));
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          onChange(Math.max(value - 5, 0));
        }
      }}
    >
      <motion.div
        className="absolute left-0 top-0 h-full rounded-full bg-white"
        style={{ width: `${value}%` }}
        initial={false}
        animate={{ width: `${value}%` }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      />
    </motion.div>
  );
};

export type VideoPlayerProps = {
  src: string;
  poster?: string;
  className?: string;
  /** Auto-start after mount (e.g. after poster tap). */
  autoPlay?: boolean;
  onError?: () => void;
};

export function VideoPlayer({
  src,
  poster,
  className,
  autoPlay = false,
  onError,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [progress, setProgress] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const clearHideTimer = () => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleHideControls = () => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false);
      }
    }, 3200);
  };

  const revealControls = () => {
    setShowControls(true);
    scheduleHideControls();
  };

  useEffect(() => {
    return () => clearHideTimer();
  }, []);

  useEffect(() => {
    const onFs = () => {
      const active = getFullscreenElement();
      setIsFullscreen(Boolean(active && wrapRef.current && active === wrapRef.current));
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs as EventListener);
    };
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !autoPlay) return;
    void v
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => {
        /* autoplay blocked — user can tap play */
      });
  }, [autoPlay, src]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      void v.play();
      setIsPlaying(true);
      scheduleHideControls();
    } else {
      v.pause();
      setIsPlaying(false);
      setShowControls(true);
      clearHideTimer();
    }
  };

  const handleVolumeChange = (value: number) => {
    const v = videoRef.current;
    if (!v) return;
    const newVolume = value / 100;
    v.volume = newVolume;
    v.muted = newVolume === 0;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const next = (v.currentTime / v.duration) * 100;
    setProgress(isFinite(next) ? next : 0);
    setCurrentTime(v.currentTime);
    setDuration(v.duration);
  };

  const handleSeek = (value: number) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const time = (value / 100) * v.duration;
    if (isFinite(time)) {
      v.currentTime = time;
      setProgress(value);
    }
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    const next = !isMuted;
    v.muted = next;
    setIsMuted(next);
    if (next) {
      setVolume(0);
    } else {
      const restored = volume > 0 ? volume : 1;
      setVolume(restored);
      v.volume = restored;
    }
  };

  const setSpeed = (speed: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
    setPlaybackSpeed(speed);
  };

  return (
    <motion.div
      ref={wrapRef}
      className={cn(
        "l-video-player relative mx-auto w-full max-w-4xl overflow-hidden rounded-xl bg-[#11111198] shadow-[0_0_20px_rgba(0,0,0,0.2)] backdrop-blur-sm",
        className,
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      onMouseEnter={() => {
        setShowControls(true);
        clearHideTimer();
      }}
      onMouseLeave={() => {
        if (isPlaying) scheduleHideControls();
      }}
    >
      <div className="relative mx-auto aspect-[9/16] max-h-[70vh] w-full max-w-sm bg-black md:aspect-video md:max-h-none md:max-w-none">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-contain"
          src={src}
          poster={poster}
          playsInline
          preload="metadata"
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false);
            setShowControls(true);
          }}
          onLoadedMetadata={handleTimeUpdate}
          onError={() => onError?.()}
          onClick={() => {
            togglePlay();
            revealControls();
          }}
        />

        {/* Center play affordance when paused */}
        {!isPlaying && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="absolute inset-0 z-[1] flex items-center justify-center bg-black/25"
            aria-label="Play video"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-black shadow-lg sm:h-16 sm:w-16">
              <Play className="h-6 w-6 translate-x-0.5 sm:h-7 sm:w-7" fill="currentColor" />
            </span>
          </button>
        )}

        {/* Tap strip to reveal controls on mobile while playing */}
        {isPlaying && !showControls && (
          <button
            type="button"
            className="absolute inset-0 z-[1] sm:hidden"
            aria-label="Show video controls"
            onClick={(e) => {
              e.stopPropagation();
              revealControls();
            }}
          />
        )}

        <AnimatePresence>
          {showControls && (
            <motion.div
              className="absolute bottom-0 left-0 right-0 z-[2] mx-auto max-w-xl p-2 sm:p-4 sm:m-2"
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-xl bg-[#111111d8] p-3 backdrop-blur-md sm:rounded-2xl sm:p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="shrink-0 text-[11px] tabular-nums text-white sm:text-sm">
                    {formatTime(currentTime)}
                  </span>
                  <CustomSlider
                    value={progress}
                    onChange={(v) => {
                      handleSeek(v);
                      revealControls();
                    }}
                    className="flex-1"
                    ariaLabel="Seek"
                  />
                  <span className="shrink-0 text-[11px] tabular-nums text-white sm:text-sm">
                    {formatTime(duration)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 sm:gap-3">
                    <Button
                      type="button"
                      onClick={() => {
                        togglePlay();
                        revealControls();
                      }}
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-white hover:bg-[#111111d1] hover:text-white"
                      aria-label={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                    </Button>

                    <div className="flex items-center gap-x-1">
                      <Button
                        type="button"
                        onClick={() => {
                          toggleMute();
                          revealControls();
                        }}
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-white hover:bg-[#111111d1] hover:text-white"
                        aria-label={isMuted ? "Unmute" : "Mute"}
                      >
                        {isMuted || volume === 0 ? (
                          <VolumeX className="h-5 w-5" />
                        ) : volume > 0.5 ? (
                          <Volume2 className="h-5 w-5" />
                        ) : (
                          <Volume1 className="h-5 w-5" />
                        )}
                      </Button>
                      <div className="hidden w-20 sm:block sm:w-24">
                        <CustomSlider
                          value={volume * 100}
                          onChange={(v) => {
                            handleVolumeChange(v);
                            revealControls();
                          }}
                          ariaLabel="Volume"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 sm:gap-1">
                    {[0.5, 1, 1.5, 2].map((speed) => (
                      <Button
                        key={speed}
                        type="button"
                        onClick={() => {
                          setSpeed(speed);
                          revealControls();
                        }}
                        variant="ghost"
                        size="sm"
                        className={cn(
                          "h-8 min-w-[2.25rem] px-1.5 text-[11px] text-white hover:bg-[#111111d1] hover:text-white sm:min-w-[2.5rem] sm:text-xs",
                          playbackSpeed === speed && "bg-[#111111d1]",
                        )}
                      >
                        {speed}x
                      </Button>
                    ))}
                    <Button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (wrapRef.current) toggleFullscreen(wrapRef.current);
                        revealControls();
                      }}
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-white hover:bg-[#111111d1] hover:text-white"
                      aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                    >
                      {isFullscreen ? (
                        <Minimize className="h-5 w-5" />
                      ) : (
                        <Maximize className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default VideoPlayer;
