import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LandingLoadGate } from "@/components/landing/LandingLoadGate";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";
import { DemoCard } from "@/components/landing/DemoCard";
import { DemoVideo } from "@/components/landing/DemoVideo";
import { MindReportSection } from "@/components/landing/MindReportSection";
import { CompoundSection } from "@/components/landing/CompoundSection";
import { LandingPricing } from "@/components/landing/LandingPricing";
import { FaqSection } from "@/components/landing/FaqSection";
import { LandingFooter } from "@/components/landing/LandingFooter";

const TITLE = "Notio — The voice-first mind map app for ADHD & fast minds";
const DESCRIPTION =
  "When your brain outruns your hands, just speak. Notio captures your unfiltered voice and structures it into beautiful, interactive mind maps.";

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Notio",
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Web",
  description: DESCRIPTION,
  offers: {
    "@type": "AggregateOffer",
    lowPrice: "0",
    highPrice: "79",
    priceCurrency: "USD",
    offerCount: "4",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
      { "@type": "Offer", name: "Pro Monthly", price: "12", priceCurrency: "USD" },
      { "@type": "Offer", name: "Pro Annual", price: "48", priceCurrency: "USD" },
      { "@type": "Offer", name: "Founders Lifetime", price: "79", priceCurrency: "USD" },
    ],
  },
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "Notio, mind map, ADHD, voice to mindmap, executive function, weekly mind report, voice capture",
      },
      { name: "robots", content: "index, follow" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:site_name", content: "Notio" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
  }),
  component: Landing,
});

/**
 * Auth gate: signed-in users never see marketing (redirect /home).
 * Load UI: YouTube-style spinner (July 21 handoff) — max ~2.5s via LandingLoadGate
 * when showing the public landing; brief spinner while redirecting if signed in.
 */
function Landing() {
  const navigate = useNavigate();
  const [authed, setAuthed] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const authPromise = supabase.auth.getUser();
      const result = await Promise.race([
        authPromise,
        new Promise<{ data: { user: null }; error: Error }>((resolve) => {
          window.setTimeout(
            () => resolve({ data: { user: null }, error: new Error("auth-timeout") }),
            2500,
          );
        }),
      ]);

      if (cancelled) return;

      if (result.error || !result.data.user) {
        setAuthed(false);
        return;
      }

      setAuthed(true);
      void navigate({ to: "/home", replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Signed in / still resolving → minimal spinner only (no logo splash)
  if (authed === undefined || authed === true) {
    return (
      <div className="fixed inset-0 z-[60] grid place-items-center bg-[#0b0f12]">
        <span className="l-spinner" role="status" aria-label="Loading" />
      </div>
    );
  }

  return (
    <LandingLoadGate>
      <div className="landing min-h-screen">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
        />
        <LandingNav />
        <main>
          <LandingHero />
          <DemoCard />
          <DemoVideo />
          <MindReportSection />
          <CompoundSection />
          <LandingPricing />
          <FaqSection />
        </main>
        <LandingFooter />
      </div>
    </LandingLoadGate>
  );
}
