import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * FAQ accordion — sits directly below Pricing (July 21 handoff §3).
 * One item open at a time; height via grid-rows (no JS measure); ARIA + keyboard.
 */

const FAQS = [
  {
    q: "Is my data private?",
    a: "Yes — your notes and maps live on your device first. Only what's needed for your account syncs, and it's never sold.",
  },
  {
    q: "Is the subscription refundable?",
    a: "No — we issue refunds on a case-by-case basis, and only if we believe we've made an error on our part. App Store purchases follow Apple's refund process.",
  },
  {
    q: "Will Notio actually make me more productive?",
    a: "Yes, it can — we've designed the app to be as user-friendly as possible.",
  },
  {
    q: "What platforms is Notio available on?",
    a: "Currently available on iOS, Android, and Desktop.",
  },
  {
    q: "What languages are currently supported on Notio?",
    a: "English, Spanish, Hindi, and French.",
  },
] as const;

export function FaqSection() {
  const [open, setOpen] = useState(0);

  return (
    <section
      id="faq"
      className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-20 md:py-[100px]"
      aria-label="Frequently asked questions"
    >
      <h2 className="l-display text-center text-[clamp(26px,6vw,36px)] leading-tight">
        Frequently asked questions
      </h2>
      <div className="mt-8 divide-y divide-[var(--line-1)] sm:mt-10">
        {FAQS.map((f, i) => {
          const isOpen = open === i;
          return (
            <div key={f.q}>
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-between gap-4 py-5 text-left"
                aria-expanded={isOpen}
                aria-controls={`faq-${i}`}
                id={`faq-btn-${i}`}
                onClick={() => setOpen(isOpen ? -1 : i)}
              >
                <span className="text-[15px] font-medium text-[var(--ink-strong)] sm:text-[16px]">
                  {f.q}
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-[var(--ink-faint)] transition-transform duration-300 motion-reduce:transition-none ${
                    isOpen ? "rotate-180 text-[var(--accent)]" : ""
                  }`}
                  aria-hidden
                />
              </button>
              <div
                id={`faq-${i}`}
                role="region"
                aria-labelledby={`faq-btn-${i}`}
                className={`grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none ${
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <p className="pb-5 text-[14.5px] leading-relaxed text-[var(--ink-muted)]">
                    {f.a}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
