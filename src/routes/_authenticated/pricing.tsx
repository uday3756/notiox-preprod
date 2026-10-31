import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Zap, Loader2, Ticket, PartyPopper, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { NotioLogo } from "@/components/notio/logo";
import {
  createCheckoutSession,
  confirmCheckout,
  getBillingStatus,
  redeemCoupon,
} from "@/lib/billing.functions";
import { useStoreBilling } from "@/lib/native";
import { syncStoreEntitlement } from "@/lib/iap.functions";
import { loadIap } from "@/lib/iap-loader";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/pricing")({
  component: PricingPage,
});

const FREE_FEATURES = [
  "8 mind maps per reset cycle",
  "Voice + keyboard capture",
  "Standard organization",
  "Recordings up to 3 minutes",
  "Baseline Executive Function tracking",
];

const PRO_MONTHLY_FEATURES = [
  "Unlimited mind maps",
  "Priority processing",
  "10-minute voice sessions",
  "Advanced EF Score dashboard",
  "Full Weekly Mind Report",
  "Cross-device cloud sync",
];

const PRO_ANNUAL_FEATURES = [
  "Everything in Pro Monthly",
  "Two months free vs monthly",
  "Priority support",
  "Founder's pricing locked in",
];

const FOUNDERS_FEATURES = [
  "All future premium tiers, forever",
  "Direct line to the dev team",
  "Founding Member badge",
];

type Trial = { startDate: string; endDate: string; daysRemaining: number } | null;
type Status = {
  plan: "free" | "pro";
  status: string | null;
  trial: Trial;
  trialExpired: boolean;
  mapsThisMonth: number;
  limit: number;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function PricingPage() {
  const checkoutFn = useServerFn(createCheckoutSession);
  const confirmFn = useServerFn(confirmCheckout);
  const statusFn = useServerFn(getBillingStatus);
  const redeemFn = useServerFn(redeemCoupon);
  const syncIapFn = useServerFn(syncStoreEntitlement);
  const storeBilling = useStoreBilling();

  const [status, setStatus] = useState<Status | null>(null);
  const [busyPlan, setBusyPlan] = useState<"pro-monthly" | "pro-annual" | null>(null);

  // Coupon state
  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [justRedeemed, setJustRedeemed] = useState<Trial>(null);

  async function refreshStatus() {
    try {
      setStatus((await statusFn()) as Status);
    } catch {
      /* leave previous status */
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const sessionId = params.get("session_id");

    async function init() {
      if (checkout === "success" && sessionId) {
        try {
          const res = await confirmFn({ data: { sessionId } });
          if (res.plan === "pro") toast.success("You're on Pro. Enjoy unlimited mindmaps.");
          else toast.info("Payment is still processing - refresh in a moment.");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Couldn't confirm checkout.");
        }
      } else if (checkout === "cancelled") {
        toast.info("Checkout cancelled.");
      }
      if (checkout) window.history.replaceState({}, "", "/pricing");
      await refreshStatus();
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!storeBilling) return;
    void (async () => {
      const iap = await loadIap();
      if (!iap) return;
      const { data } = await supabase.auth.getUser();
      await iap.configureIap(data.user?.id);
      if (data.user?.id) await iap.identifyIapUser(data.user.id);
    })();
  }, [storeBilling]);

  async function startCheckout(plan: "pro-monthly" | "pro-annual" = "pro-monthly") {
    setBusyPlan(plan);
    try {
      // App Store / Play Store: Apple & Google require IAP for digital goods.
      if (storeBilling) {
        const iap = await loadIap();
        if (!iap) throw new Error("In-app purchases aren't available in this environment.");
        if (!iap.isIapConfiguredInEnv()) {
          throw new Error(
            "In-app purchases aren't set up yet. Use the website to subscribe, or try again after the next app update.",
          );
        }
        const packages = await iap.getStorePackages();
        if (!packages.length) {
          throw new Error("No store products found. Check RevenueCat offerings.");
        }
        // Prefer package id match; else monthly / annual heuristics.
        const pick =
          packages.find((p) => p.identifier.toLowerCase().includes(plan.replace("pro-", ""))) ||
          packages.find((p) =>
            plan === "pro-annual"
              ? /annual|year/i.test(p.identifier + p.product.identifier)
              : /month|default|pro/i.test(p.identifier + p.product.identifier),
          ) ||
          packages[0];

        const result = await iap.purchaseStorePackage(pick);
        await syncIapFn({
          data: {
            active: result.active,
            customerInfoJson: result.customerInfoJson,
            productId: pick.product.identifier,
          },
        });
        if (result.active) toast.success("You're on Pro. Enjoy unlimited mindmaps.");
        else toast.info("Purchase completed — refresh if Pro isn't active yet.");
        await refreshStatus();
        return;
      }

      const { url } = await checkoutFn({
        data: { origin: window.location.origin, plan },
      });
      if (!url) throw new Error("No checkout URL returned.");
      window.location.href = url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't start checkout.";
      if (/cancel|cancelled|user cancelled/i.test(msg)) {
        toast.message("Purchase cancelled.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusyPlan(null);
    }
  }

  async function restorePurchases() {
    if (!storeBilling) return;
    setBusyPlan("pro-monthly");
    try {
      const iap = await loadIap();
      if (!iap) throw new Error("In-app purchases aren't available in this environment.");
      const result = await iap.restoreStorePurchases();
      await syncIapFn({
        data: { active: result.active, customerInfoJson: result.customerInfoJson },
      });
      toast.success(result.active ? "Purchases restored — you're Pro." : "No active Pro entitlement found.");
      await refreshStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't restore purchases.");
    } finally {
      setBusyPlan(null);
    }
  }

  // Resume a landing-page checkout after sign-in (plan stored in sessionStorage).
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem("notio_checkout_plan");
      if (!pending) return;
      if (pending === "founders") {
        sessionStorage.removeItem("notio_checkout_plan");
        window.location.assign("/claim-slot");
        return;
      }
      if (pending === "pro-monthly" || pending === "pro-annual") {
        sessionStorage.removeItem("notio_checkout_plan");
        void startCheckout(pending);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function applyCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || applying) return;
    setApplying(true);
    setCouponError(null);
    try {
      const res = await redeemFn({ data: { code: code.trim() } });
      setJustRedeemed({
        startDate: res.startDate,
        endDate: res.endDate,
        daysRemaining: res.daysRemaining,
      });
      setCode("");
      toast.success(`${res.trialDays}-day free trial activated`);
      await refreshStatus();
    } catch (err) {
      setCouponError(err instanceof Error ? err.message : "Network error. Please try again.");
    } finally {
      setApplying(false);
    }
  }

  const isTrialing = status?.status === "trialing" && !!status?.trial;
  const isPaidPro = status?.plan === "pro" && status?.status !== "trialing";
  const trial = justRedeemed ?? status?.trial ?? null;
  const used = status?.mapsThisMonth ?? 0;
  const limit = status?.limit ?? 5;

  return (
    <div className="min-h-screen bg-glow">
      <div className="mx-auto max-w-md px-6 pt-10 pb-28">
        <div className="flex items-center justify-between">
          <NotioLogo className="text-xl" />
          <Link to="/profile" className="text-xs text-muted-foreground hover:text-foreground">
            Back to Profile
          </Link>
        </div>

        {/* Trial badge */}
        {isTrialing && trial && (
          <div className="mt-6 flex items-center justify-center gap-2 rounded-full bg-primary/15 px-4 py-2 text-sm font-semibold text-primary">
            <Check className="h-4 w-4" />
            Premium Trial · {trial.daysRemaining} {trial.daysRemaining === 1 ? "day" : "days"} remaining
          </div>
        )}

        {status?.trialExpired && (
          <div className="mt-6 flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Free trial expired</p>
              <p className="mt-0.5 text-amber-300/80">Upgrade to Pro to keep premium features.</p>
            </div>
          </div>
        )}

        <div className="mt-8 text-center">
          <h1 className="font-display text-3xl font-bold leading-tight">
            {isPaidPro ? "You're on Pro" : isTrialing ? "You're on a Premium Trial" : "Go further with Pro"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isPaidPro
              ? "Thanks for supporting Notio."
              : "Pay only when you outgrow Free."}
          </p>
        </div>

        {/* Coupon success card */}
        {justRedeemed && (
          <div className="mt-6 animate-in fade-in slide-in-from-top-2 rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/15 via-surface to-surface p-6 text-center shadow-lg shadow-primary/10">
            <PartyPopper className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 font-display text-xl font-bold text-primary">Coupon Applied Successfully</p>
            <p className="mt-1 text-sm">🎉 7-Day Free Trial Activated</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-surface/60 p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Starts</p>
                <p className="mt-1 text-xs font-semibold">{fmtDate(justRedeemed.startDate)}</p>
              </div>
              <div className="rounded-xl bg-surface/60 p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Ends</p>
                <p className="mt-1 text-xs font-semibold">{fmtDate(justRedeemed.endDate)}</p>
              </div>
              <div className="rounded-xl bg-surface/60 p-3">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Days left</p>
                <p className="mt-1 text-xs font-semibold">{justRedeemed.daysRemaining}</p>
              </div>
            </div>
          </div>
        )}

        {/* Coupon input — hidden once the user is trialing or paid Pro */}
        {!isTrialing && !isPaidPro && !justRedeemed && (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" />
              <p className="font-display text-base font-semibold">Have a coupon code?</p>
            </div>
            <form onSubmit={applyCoupon} className="mt-4 space-y-3">
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  if (couponError) setCouponError(null);
                }}
                placeholder="Enter coupon code"
                aria-label="Coupon code"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                disabled={applying}
                className={`w-full rounded-xl border bg-background px-4 py-3.5 text-center text-lg font-semibold tracking-widest outline-none focus:border-primary disabled:opacity-60 ${
                  couponError ? "border-destructive" : "border-border"
                }`}
              />
              {couponError && (
                <p className="px-1 text-xs text-destructive" role="alert">
                  {couponError}
                </p>
              )}
              <button
                type="submit"
                disabled={applying || !code.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.01] disabled:opacity-50"
              >
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
                {applying ? "Validating..." : "Apply Coupon"}
              </button>
            </form>
          </div>
        )}

        {/* Free tier */}
        <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Free</p>
              <p className="mt-1 font-display text-2xl font-bold">$0</p>
            </div>
            {status?.plan === "free" && (
              <span className="rounded-full bg-muted px-3 py-1 text-[11px] uppercase tracking-widest text-muted-foreground">
                Current
              </span>
            )}
          </div>
          {status?.plan === "free" && (
            <p className="mt-3 text-xs text-muted-foreground">
              {used}/{limit} mindmaps used this month
            </p>
          )}
          <ul className="mt-5 space-y-2">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Pro Monthly — matches landing $12/mo */}
        <div className="relative mt-5 overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 via-surface to-surface p-6 shadow-lg shadow-primary/10">
          <div className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
            <Check className="h-3 w-3" />
            {isPaidPro ? "Active" : isTrialing ? "Trial" : "Pro"}
          </div>
          <p className="text-xs uppercase tracking-widest text-primary">Pro Monthly</p>
          <p className="mt-1 font-display text-4xl font-bold">
            $12
            <span className="ml-1 text-base font-medium text-muted-foreground">/month</span>
          </p>
          <ul className="mt-5 space-y-2">
            {PRO_MONTHLY_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                {f}
              </li>
            ))}
          </ul>
          {isPaidPro ? (
            <div className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary/15 py-3 text-sm font-semibold text-primary">
              <Check className="h-4 w-4" /> You're subscribed
            </div>
          ) : (
            <button
              onClick={() => startCheckout("pro-monthly")}
              disabled={busyPlan !== null}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.01] disabled:opacity-60"
            >
              {busyPlan === "pro-monthly" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {busyPlan === "pro-monthly" ? "Opening checkout..." : "Go Pro"}
            </button>
          )}
        </div>

        {/* Pro Annual — matches landing $48/yr */}
        {!isPaidPro && (
          <div className="relative mt-5 rounded-2xl border border-border bg-surface p-6">
            <div className="absolute right-4 top-4 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
              Best value · Founder's choice
            </div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Pro Annual</p>
            <p className="mt-1 font-display text-3xl font-bold">
              $48
              <span className="ml-1 text-base font-medium text-muted-foreground">/yr</span>
            </p>
            <ul className="mt-5 space-y-2">
              {PRO_ANNUAL_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => startCheckout("pro-annual")}
              disabled={busyPlan !== null}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-3 text-sm font-semibold text-primary transition-transform hover:scale-[1.01] disabled:opacity-60"
            >
              {busyPlan === "pro-annual" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              {busyPlan === "pro-annual" ? "Opening checkout..." : "Go Pro Annual"}
            </button>
          </div>
        )}

        {/* Founders Lifetime — request form (no $79 Stripe checkout) */}
        {!isPaidPro && (
          <div className="relative mt-5 rounded-2xl border border-border bg-surface p-6">
            <div className="absolute right-4 top-4 rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Limited slots
            </div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Founders Lifetime</p>
            <p className="mt-1 font-display text-3xl font-bold">Invite only</p>
            <ul className="mt-5 space-y-2">
              {FOUNDERS_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to="/claim-slot"
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-sm font-semibold text-foreground transition-transform hover:scale-[1.01]"
            >
              <Check className="h-4 w-4" />
              Claim a slot
            </Link>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          {storeBilling
            ? "Subscriptions are billed through the App Store / Play Store."
            : "Cancel anytime. Checkout via Stripe."}
        </p>

        {storeBilling && (
          <button
            type="button"
            onClick={() => void restorePurchases()}
            disabled={busyPlan !== null}
            className="mt-3 w-full text-center text-xs text-primary underline-offset-2 hover:underline disabled:opacity-50"
          >
            Restore purchases
          </button>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground/60">
          Prices in USD. Taxes calculated at checkout.
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground/60">
          <Link to="/privacy-policy" className="underline">
            Privacy
          </Link>
          {" · "}
          <Link to="/terms" className="underline">
            Terms
          </Link>
        </p>
      </div>
    </div>
  );
}
