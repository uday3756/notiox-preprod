import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { NotioLogo } from "@/components/notio/logo";
import { submitFoundersSlotBooking } from "@/lib/founders-booking.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/claim-slot")({
  head: () => ({
    meta: [
      { title: "Claim a Lifetime slot — Notio" },
      {
        name: "description",
        content: "Request a Founders Lifetime slot. We’ll follow up with next steps.",
      },
    ],
  }),
  component: ClaimSlotPage,
});

function ClaimSlotPage() {
  const submitFn = useServerFn(submitFoundersSlotBooking);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ bookingName: string; createdAt: string } | null>(
    null,
  );

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      if (u.email) setEmail((prev) => prev || u.email || "");
      const metaName =
        typeof u.user_metadata?.full_name === "string"
          ? u.user_metadata.full_name
          : typeof u.user_metadata?.name === "string"
            ? u.user_metadata.name
            : "";
      if (metaName) setFullName((prev) => prev || metaName);
    });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await submitFn({
        data: { fullName, email, phone, place },
      });
      setDone({ bookingName: res.bookingName, createdAt: res.createdAt });
      toast.success("Slot request saved.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not submit. Try again.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background bg-glow">
      <div className="mx-auto max-w-lg px-6 py-10 pb-24">
        <Link to="/" className="inline-block">
          <NotioLogo className="text-xl" />
        </Link>

        <h1 className="mt-8 font-display text-3xl font-bold">Claim a Lifetime slot</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Leave your details — we’ll reserve a Founders Lifetime booking under your name
          and follow up. No payment online for this plan.
        </p>

        {done ? (
          <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
            <p className="text-sm font-semibold text-foreground">Request received</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Booking: <span className="text-foreground">{done.bookingName}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Timestamp:{" "}
              <span className="text-foreground">
                {new Date(done.createdAt).toLocaleString()}
              </span>
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Back to home
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Full name
              </span>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="Your name"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email
              </span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="you@example.com"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Phone number
              </span>
              <input
                required
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="+1 …"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Place
              </span>
              <input
                required
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                autoComplete="address-level2"
                className="mt-1.5 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="City / region"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="mt-2 flex w-full min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Saving…" : "Submit slot request"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
