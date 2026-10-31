import { createFileRoute, Link } from "@tanstack/react-router";
import { NotioLogo } from "@/components/notio/logo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Notio" },
      { name: "description", content: "Terms for using Notio on web and mobile." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background bg-glow">
      <div className="mx-auto max-w-2xl px-6 py-10 pb-24">
        <Link to="/" className="inline-block">
          <NotioLogo className="text-xl" />
        </Link>
        <h1 className="mt-8 font-display text-3xl font-bold">Terms of Use</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: July 20, 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="text-lg font-semibold">Agreement</h2>
            <p className="mt-2 text-muted-foreground">
              By using Notio (web or mobile), you agree to these terms and our{" "}
              <Link to="/privacy" className="underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">The service</h2>
            <p className="mt-2 text-muted-foreground">
              Notio turns voice or typed thoughts into mind maps and related productivity
              features. Features may change; free and paid tiers may have limits.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Your content</h2>
            <p className="mt-2 text-muted-foreground">
              You own the content you create. You grant us a limited license to process it to
              provide the service (including AI structuring and transcription).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Subscriptions</h2>
            <p className="mt-2 text-muted-foreground">
              Web purchases are billed via Stripe. App Store / Play Store purchases are billed by
              Apple or Google under their terms; manage or cancel in your store account settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Acceptable use</h2>
            <p className="mt-2 text-muted-foreground">
              Do not abuse the service, attempt to break security, scrape other users&apos; data,
              or use Notio for unlawful activity.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Disclaimer</h2>
            <p className="mt-2 text-muted-foreground">
              Notio is provided &quot;as is.&quot; We are not liable for decisions you make based
              on AI-generated structure or reflections. AI output can be wrong.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">Contact</h2>
            <p className="mt-2 text-muted-foreground">
              Use in-app Support for account or billing questions.
            </p>
          </section>
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          <Link to="/privacy" className="underline">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
