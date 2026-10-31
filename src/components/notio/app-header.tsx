import { Link } from "@tanstack/react-router";
import { NotioLogo } from "@/components/notio/logo";
import { DolphinAvatar } from "@/components/notio/dolphin-avatar";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

export function AppHeader() {
  return (
    <header className="notiox-app-header mb-6 flex items-center justify-between gap-3">
      <NotioLogo />
      {FEATURE_FLAGS.dolphinXp ? (
        <Link
          to="/my-dolphin"
          className="inline-flex items-center gap-2 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground"
          aria-label="My Dolphin"
        >
          <DolphinAvatar compact />
          <span>My Dolphin</span>
        </Link>
      ) : null}
    </header>
  );
}
