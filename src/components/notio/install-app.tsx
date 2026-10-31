import { useEffect, useState } from "react";
import { Smartphone, Apple, Monitor, Share, Plus, CheckCircle2, Download, X } from "lucide-react";

// beforeinstallprompt isn't in the standard DOM lib types.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Platform = "android" | "ios" | "desktop" | "unknown";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows|Macintosh|Mac OS X|Linux|CrOS/.test(ua)) return "desktop";
  return "unknown";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Platform-aware "Install Notio" card. Android/Desktop use the native prompt;
 *  iOS gets manual Add-to-Home-Screen instructions. */
export function InstallApp() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const p = detectPlatform();
    const standalone = isStandalone();
    setPlatform(p);
    setInstalled(standalone);

    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setInstalled(true); setJustInstalled(true); setDeferred(null); setPromptOpen(false); setIosOpen(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // Arriving from the marketing "Install" link → surface the install flow
    // immediately so it's a single tap to the home screen.
    if (!standalone && new URLSearchParams(window.location.search).get("install") === "1") {
      if (p === "ios") setIosOpen(true);
      else setPromptOpen(true);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function trigger() {
    if (!deferred) {
      setHint(
        platform === "android"
          ? "Open this page in Chrome, then use the ⋮ menu → “Add to Home screen”."
          : "Use your browser menu → “Install app” (or the ⊕ icon in the address bar) to add Notio to your desktop.",
      );
      return;
    }
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setHint(null);
    setPromptOpen(false);
  }

  // Already installed — nothing to show.
  if (installed) {
    return (
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-5">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-primary" />
        <div>
          <p className="font-display text-sm font-semibold">
            {justInstalled ? "App installed successfully" : "You’re using the installed app"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Launch Notio anytime from your home screen.</p>
        </div>
      </div>
    );
  }

  const meta = {
    android: { Icon: Smartphone, label: "Add to Home Screen" },
    ios: { Icon: Apple, label: "Add to Home Screen" },
    desktop: { Icon: Monitor, label: "Add to Desktop" },
    unknown: { Icon: Download, label: "Install App" },
  }[platform];
  const Icon = meta.Icon;

  return (
    <>
      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:gap-4 sm:text-left">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </span>
          <div className="flex-1">
            <p className="font-display text-base font-semibold">Install Notio</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Add Notio to your {platform === "desktop" ? "desktop" : "home screen"} for a full-screen, app-like experience.
            </p>
          </div>
          <button
            onClick={() => (platform === "ios" ? setIosOpen(true) : trigger())}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {platform === "ios" ? <Share className="h-4 w-4" /> : <Download className="h-4 w-4" />}
            {meta.label}
          </button>
        </div>
        {hint && (
          <p className="mt-4 rounded-xl border border-border bg-background px-4 py-3 text-xs leading-relaxed text-muted-foreground" role="status">
            {hint}
          </p>
        )}
      </div>

      {iosOpen && <IosInstructions onClose={() => setIosOpen(false)} />}
      {promptOpen && (
        <PromptModal
          label={meta.label}
          hint={hint}
          onInstall={trigger}
          onClose={() => setPromptOpen(false)}
        />
      )}
    </>
  );
}

function PromptModal({
  label, hint, onInstall, onClose,
}: { label: string; hint: string | null; onInstall: () => void; onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Install Notio"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div className="w-full max-w-sm rounded-3xl border border-border bg-surface p-6 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="ml-auto block text-muted-foreground hover:text-foreground">
          <X className="h-5 w-5" />
        </button>
        <img src="/icon-192.png" alt="" className="mx-auto -mt-2 h-16 w-16 rounded-2xl" />
        <h3 className="mt-3 font-display text-lg font-semibold">Install Notio</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Add Notio to your home screen for a full-screen, app-like experience.
        </p>
        <button
          onClick={onInstall}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20"
        >
          <Download className="h-4 w-4" /> {label}
        </button>
        {hint && (
          <p className="mt-4 rounded-xl border border-border bg-background px-4 py-3 text-left text-xs leading-relaxed text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

function IosInstructions({ onClose }: { onClose: () => void }) {
  const steps = [
    { icon: <Share className="h-4 w-4" />, text: "Tap the Share button in Safari’s toolbar." },
    { icon: <span className="text-xs font-bold">▾</span>, text: "Scroll down in the share sheet." },
    { icon: <Plus className="h-4 w-4" />, text: "Tap “Add to Home Screen”." },
    { icon: <CheckCircle2 className="h-4 w-4" />, text: "Tap “Add” in the top-right corner." },
  ];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Install Notio"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Apple className="h-5 w-5" />
            <h3 className="font-display text-lg font-semibold">Install Notio</h3>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Add Notio to your home screen in four quick steps:</p>
        <ol className="mt-5 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{s.icon}</span>
              <span className="text-sm leading-relaxed">
                <span className="mr-1.5 font-semibold text-muted-foreground">{i + 1}.</span>{s.text}
              </span>
            </li>
          ))}
        </ol>
        <button onClick={onClose} className="mt-6 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground">
          Got it
        </button>
      </div>
    </div>
  );
}
