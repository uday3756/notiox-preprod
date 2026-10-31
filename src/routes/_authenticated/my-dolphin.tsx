import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { DolphinCompanion } from "@/components/notio/dolphin-companion";
import { useDolphin } from "@/hooks/use-dolphin";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

export const Route = createFileRoute("/_authenticated/my-dolphin")({
  component: MyDolphinPage,
});

function MyDolphinPage() {
  const q = useDolphin();
  return (
    <main className="notiox-screen mx-auto max-w-lg px-5 py-8 pb-32">
      <Link
        to="/home"
        className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </Link>
      <h1 className="mt-4 font-display text-3xl font-semibold">My Dolphin</h1>
      {!FEATURE_FLAGS.dolphinXp ? (
        <p className="mt-4 text-sm text-muted-foreground">Dolphin progression is off on this environment.</p>
      ) : q.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : q.data && q.data.enabled ? (
        <section className="mt-6 space-y-6">
          <DolphinCompanion state="welcome" />
          <p className="text-sm text-muted-foreground">Level {q.data.level}</p>
          <div>
            <p className="text-2xl font-semibold">{q.data.confirmedXp} XP</p>
            <p className="text-xs text-muted-foreground">
              {q.data.progress.intoLevel} / {q.data.progress.nextAt} this level
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(100, q.data.progress.intoLevel)}%` }}
              />
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold">Recent rewards</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {(q.data.ledger ?? []).length === 0 ? (
                <li className="text-muted-foreground">No confirmed XP yet.</li>
              ) : (
                q.data.ledger.map((row) => (
                  <li key={row.id} className="rounded-lg border border-border px-3 py-2">
                    {row.delta > 0 ? "+" : ""}
                    {row.delta} XP
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Couldn’t load progress.</p>
      )}
    </main>
  );
}
