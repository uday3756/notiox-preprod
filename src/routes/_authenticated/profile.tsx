import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LogOut, AlertTriangle, ChevronRight, LifeBuoy, Ticket, Loader2, RefreshCw, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { NotioLogo } from "@/components/notio/logo";
import { WorkingHoursEditor } from "@/components/notio/working-hours-editor";
import { WindDownEditor } from "@/components/notio/wind-down-editor";
import { RingsSettingsEditor } from "@/components/notio/rings-settings-editor";
import { GoogleCalendarEditor } from "@/components/notio/google-calendar-editor";
import { SettingsSection } from "@/components/notio/settings-section";
import { FEATURE_FLAGS } from "@/lib/feature-flags";
import { NudgeSettings } from "@/components/notio/actionable-nudge";
import { CanvasConnectionCard } from "@/components/notio/canvas-connection-card";
import { regenerateMyReport } from "@/lib/weekly-report.functions";
import { InstallApp } from "@/components/notio/install-app";
import { getBillingStatus } from "@/lib/billing.functions";
import { deleteMyAccount } from "@/lib/account.functions";
import { applyAuthCode, lookupAuthCode } from "@/lib/referral.functions";
import { getFormattedDisplayName } from "@/lib/persona-quiz";
import {
  APP_ROLE_OPTIONS,
  type AppRole,
  isAppRole,
  writeAppRole,
} from "@/lib/app-role";

import { requestNotificationPermission, fireTestNotification } from "@/hooks/use-task-notifications";
import { 
  getNotificationSettings, 
  enableNotifications, 
  disableNotifications,
  toggleNotificationInterval,
  NOTIFICATION_INTERVALS
} from "@/hooks/use-notification-settings";
import { Bell, BellOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");
  const [appRole, setAppRole] = useState<AppRole | null>(null);
  const [roleBusy, setRoleBusy] = useState(false);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>("default");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [notificationIntervals, setNotificationIntervals] = useState<number[]>([1]);
  const [reportBusy, setReportBusy] = useState(false);
  const regenerate = useServerFn(regenerateMyReport);
  const deleteAccountFn = useServerFn(deleteMyAccount);
  const applyCodeFn = useServerFn(applyAuthCode);
  const lookupCodeFn = useServerFn(lookupAuthCode);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("Notification" in window) setNotifPerm(Notification.permission);
    const settings = getNotificationSettings();
    setReminderEnabled(settings.enabled);
    // Defensive: guarantee an array even if a legacy/corrupt value slips through.
    setNotificationIntervals(Array.isArray(settings.intervals) ? settings.intervals : [1]);
  }, []);

  const statusFn = useServerFn(getBillingStatus);

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      const metaRole = u.user.user_metadata?.notio_app_role;
      const rowRole = data && "app_role" in data ? data.app_role : null;
      return {
        ...data,
        email: u.user.email,
        app_role: isAppRole(rowRole) ? rowRole : isAppRole(metaRole) ? metaRole : null,
      };
    },
  });

  const { data: billing } = useQuery({
    queryKey: ["billing-status"],
    queryFn: () => statusFn(),
  });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setRole(profile.role ?? "");
      const fromProfile = (profile as { app_role?: unknown }).app_role;
      if (isAppRole(fromProfile)) setAppRole(fromProfile);
    }
  }, [profile]);

  async function save() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName, role, updated_at: new Date().toISOString() })
      .eq("id", u.user.id);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  async function changeAppRole(next: AppRole) {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    setRoleBusy(true);
    try {
      const { error } = await writeAppRole(supabase, u.user.id, next);
      if (error) throw new Error(error);
      setAppRole(next);
      toast.success(next === "student" ? "Student role on — connect Canvas below" : "Role updated");
      await qc.invalidateQueries({ queryKey: ["profile"] });
      await qc.invalidateQueries({ queryKey: ["canvas-status"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update role");
    } finally {
      setRoleBusy(false);
    }
  }

  async function applyProfileCode(e: React.FormEvent) {
    e.preventDefault();
    const code = promoCode.trim();
    if (!code) {
      setCodeError("Enter a promo or referral code.");
      return;
    }
    setCodeBusy(true);
    setCodeError(null);
    try {
      const lookup = await lookupCodeFn({ data: { code } });
      if (!lookup.ok) {
        setCodeError(lookup.error);
        return;
      }
      const res = await applyCodeFn({ data: { code } });
      if (res.already) {
        toast.message("You already have a referral / promo code on this account.");
      } else if (res.kind === "referral") {
        toast.success(`Referred by ${res.referrerName}`);
      } else {
        toast.success(`Promo applied: ${res.code}`);
      }
      setPromoCode("");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["billing-status"] });
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "Couldn't apply code.");
    } finally {
      setCodeBusy(false);
    }
  }

  async function signOut() {
    await clearNativeWidget().catch(() => undefined);
    const { data: { user } } = await supabase.auth.getUser();
    try { if (user) sessionStorage.removeItem(`notio:capture:${user.id}`); } catch { /* Storage may be unavailable. */ }
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function handleDeleteAccount() {
    const ok = window.confirm(
      "Delete your Notio account and all maps permanently? This cannot be undone.",
    );
    if (!ok) return;
    const typed = window.prompt('Type DELETE to confirm account deletion:');
    if (typed !== "DELETE") {
      toast.message("Account not deleted.");
      return;
    }
    setDeletingAccount(true);
    try {
      await deleteAccountFn({ data: { confirm: "DELETE" } });
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      toast.success("Your account has been deleted.");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete account.");
    } finally {
      setDeletingAccount(false);
    }
  }

  async function toggleReminders() {
    if (!reminderEnabled) {
      const perm = await requestNotificationPermission();
      setNotifPerm(perm);
      if (perm !== "granted") {
        toast.error("Allow notifications in your browser to enable task reminders.");
        return;
      }
      setReminderEnabled(true);
      enableNotifications(notificationIntervals);
      const intervalText = notificationIntervals.map(m => m === 60 ? '1h' : m + 'm').join(', ');
      toast.success(`Task notifications enabled - alerts at: ${intervalText}`);
    } else {
      setReminderEnabled(false);
      disableNotifications();
      toast("Task notifications disabled");
    }
  }

  async function testNotification() {
    const ok = await fireTestNotification();
    if (!ok) {
      toast.error("Allow notifications in your browser first.");
      return;
    }
    toast.success("Test notification will arrive in ~5 seconds");
  }

  async function generateReport() {
    setReportBusy(true);
    try {
      const result = await regenerate();
      if ("generated" in result && result.generated === false) {
        toast(result.reason ?? "No activity this week yet.");
      } else {
        toast.success("Your weekly reflection report is ready.");
        // Invalidate so /maps card + /weekly-report list pick it up.
        qc.invalidateQueries({ queryKey: ["weekly-report"] });
        // Fire a browser notification if permission granted.
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification("Your week in mind", {
              body: "Your weekly reflection report is ready to view.",
              icon: "/logo.png",
              badge: "/logo.png",
              tag: "notio-weekly-report",
              requireInteraction: false,
            });
          } catch {
            /* some platforms throw outside a service worker; ignore */
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't generate the report.");
    } finally {
      setReportBusy(false);
    }
  }

  function toggleInterval(minutes: number) {
    toggleNotificationInterval(minutes);
    const newIntervals = notificationIntervals.includes(minutes)
      ? notificationIntervals.filter(m => m !== minutes)
      : [...notificationIntervals, minutes].sort((a, b) => a - b);
    setNotificationIntervals(newIntervals);
    
    if (reminderEnabled && newIntervals.length > 0) {
      const intervalText = newIntervals.map(m => m === 60 ? '1h' : m + 'm').join(', ');
      toast.success(`Notifications set to: ${intervalText}`);
    } else if (newIntervals.length === 0) {
      setReminderEnabled(false);
    }
  }

return (
    <div className="notiox-screen notiox-profile mx-auto max-w-md px-6 pt-10 pb-28 lg:max-w-2xl lg:px-8">
      <div className="flex items-center justify-between">
        <NotioLogo className="text-xl" />
        <span className="text-xs text-muted-foreground">Profile</span>
      </div>

      {/* Identity — who you're signed in as. */}
      <div className="mt-8 flex items-center gap-4">
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/15 font-display text-2xl font-semibold text-primary">
            {(displayName || profile?.email || "Y").charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="break-words font-display text-2xl font-bold">
            {profile?.persona_label
              ? getFormattedDisplayName({
                  displayName: profile.display_name ?? displayName ?? "",
                  personaLabel: profile.persona_label,
                })
              : displayName || "You"}
          </h1>
          <p className="break-all text-sm text-muted-foreground">{profile?.email}</p>
          {profile?.referred_by_name ? (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
              Referred by {profile.referred_by_name}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <div>
          <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Role</p>
          <p className="mb-3 break-words text-xs text-muted-foreground">
            Student unlocks Canvas on this same Notiolive account. Change anytime.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {APP_ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                disabled={roleBusy}
                onClick={() => void changeAppRole(opt.value)}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                  appRole === opt.value
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-surface text-muted-foreground hover:border-primary/40"
                } disabled:opacity-60`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-2 block text-xs uppercase tracking-widest text-muted-foreground">What you do</label>
          <input
            value={role}
            placeholder="Founder, writer, engineer…"
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={save}
          className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
        >
          Save
        </button>
      </div>

      <CanvasConnectionCard
        active={appRole === "student" || FEATURE_FLAGS.canvasPilot}
      />

      {/* Google Calendar — Connect / sync. */}
      {FEATURE_FLAGS.googleCalendar && (
        <div className="mt-6">
          <GoogleCalendarEditor />
        </div>
      )}

      {/* Subscription status */}
      <SubscriptionCard billing={billing} />

      {/* Everything below is collapsed by default. */}
      <p className="mt-10 mb-3 px-1 text-xs uppercase tracking-widest text-muted-foreground">
        Settings
      </p>
      <div className="space-y-3">
        <SettingsSection
          title="Task Notifications"
          icon={reminderEnabled ? Bell : BellOff}
          summary={
            reminderEnabled
              ? `On · alerts at ${notificationIntervals.map((m) => (m === 60 ? "1h" : `${m}m`)).join(", ")}`
              : "Off · get alerted before your tasks start"
          }
        >
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Alert me before a task starts</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Reminders arrive while Notio is open in your browser.
            </p>
          </div>
          <button
            onClick={toggleReminders}
            className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
              reminderEnabled
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground"
            }`}
          >
            {reminderEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
            {reminderEnabled ? "On" : "Off"}
          </button>
        </div>

        {notifPerm === "denied" && (
          <div className="mt-3 rounded-lg bg-destructive/10 p-3 text-[11px] text-destructive">
            <p className="font-medium">Notifications are blocked for this site.</p>
            <p className="mt-1 text-destructive/90">
              Your browser won't ask again until you reset it manually:
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-destructive/90">
              <li><b>Desktop:</b> click the 🔒 (or ⓘ / tune) icon at the left of the address bar → set <b>Notifications</b> to <b>Allow</b> → reload.</li>
              <li><b>Android Chrome:</b> tap ⋮ → <b>Site settings</b> → <b>Notifications</b> → <b>Allow</b>.</li>
              <li>Also check your OS isn't muting them (Windows Focus Assist / Do Not Disturb).</li>
            </ul>
            <p className="mt-1.5 text-destructive/90">Then come back and toggle this on.</p>
          </div>
        )}

        {reminderEnabled && (
          <div className="mt-4">
            <p className="text-xs text-muted-foreground mb-2">Select multiple times to be notified:</p>
            <div className="flex gap-2 flex-wrap">
              {NOTIFICATION_INTERVALS.map((mins) => (
                <button
                  key={mins}
                  onClick={() => toggleInterval(mins)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    notificationIntervals.includes(mins)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mins === 60 ? "1h" : `${mins}m`}
                </button>
              ))}
            </div>

            <button
              onClick={testNotification}
              className="mt-4 w-full rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              Send a test notification
            </button>
            <p className="mt-2 text-[11px] text-muted-foreground/70">
              Reminders arrive while Notio is open in your browser.
            </p>
          </div>
        )}
      </div>
        </SettingsSection>

        <WorkingHoursEditor />
        <RingsSettingsEditor />
        {FEATURE_FLAGS.dailyWins && <WindDownEditor />}

        <SettingsSection
          title="Tools & extras"
          icon={Wrench}
          summary="Schedule lab, weekly report, promo code, install app"
        >
          <div className="space-y-4">
            <Link
              to="/schedule-lab"
              className="flex items-center justify-between rounded-xl border border-border p-4 transition-colors hover:border-primary/40"
            >
              <div>
                <p className="text-sm font-medium">Schedule lab</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Paste any transcript and preview extracted times (nothing saved).
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </Link>

            {FEATURE_FLAGS.weeklyReflection && (
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-medium">Weekly reflection report</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Covers the last 7 days — your wins, completed tasks, and recurring themes.
                </p>
                <button
                  onClick={generateReport}
                  disabled={reportBusy}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan/15 py-2.5 text-sm font-semibold text-cyan transition-colors hover:bg-cyan/25 disabled:opacity-50"
                >
                  {reportBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {reportBusy ? "Generating..." : "Generate this week's report"}
                </button>
                <Link
                  to="/weekly-report"
                  className="mt-3 block text-center text-xs font-medium text-muted-foreground hover:text-cyan"
                >
                  See past reports →
                </Link>
              </div>
            )}

            {profile?.referred_by_name ? (
              <p className="text-xs text-muted-foreground">
                Referred by {profile.referred_by_name}
                {profile.referral_code_used ? ` · ${profile.referral_code_used}` : ""}
              </p>
            ) : (
              <form onSubmit={applyProfileCode} className="rounded-xl border border-border p-4">
                <p className="text-sm font-medium">Have a promo or referral code?</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  You can only apply a code once.
                </p>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    autoComplete="off"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value.toUpperCase());
                      if (codeError) setCodeError(null);
                    }}
                    placeholder="Enter code"
                    className={`min-w-0 flex-1 rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary ${
                      codeError ? "border-destructive" : "border-border"
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={codeBusy || !promoCode.trim()}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    {codeBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Apply
                  </button>
                </div>
                {codeError ? <p className="mt-2 text-xs text-destructive">{codeError}</p> : null}
              </form>
            )}

            <InstallApp />
          </div>
        </SettingsSection>

        <SettingsSection
          title="Support"
          icon={LifeBuoy}
          summary="Report a bug, request a feature, view your tickets"
        >
          <div className="space-y-2">
            <Link
              to="/support"
              className="flex items-center justify-between rounded-xl border border-border p-4 transition-colors hover:border-primary/50"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <LifeBuoy className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">Support &amp; Feedback</p>
                  <p className="text-xs text-muted-foreground">Report a bug or request a feature</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
            <Link
              to="/support-tickets"
              className="flex items-center justify-between rounded-xl border border-border p-4 transition-colors hover:border-primary/50"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Ticket className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">My Support Tickets</p>
                  <p className="text-xs text-muted-foreground">View your tickets and replies</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </div>
        </SettingsSection>

        <SettingsSection
          title="Delete account"
          icon={AlertTriangle}
          tone="danger"
          summary="Permanently remove your account, maps, and data"
        >
          <button
            type="button"
            onClick={() => void handleDeleteAccount()}
            disabled={deletingAccount}
            className="inline-flex items-center gap-2 rounded-xl border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {deletingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Delete my account
          </button>
        </SettingsSection>
      </div>

      {FEATURE_FLAGS.workflow && FEATURE_FLAGS.nativeWidgets && supportsNativeWidget() && (
        <WidgetSettings />
      )}
      {FEATURE_FLAGS.workflow && <NudgeSettings />}
      {FEATURE_FLAGS.workflow && (
        <Link to="/journal" className="mt-6 inline-flex min-h-11 items-center text-sm break-words">
          Journal
        </Link>
      )}
      {FEATURE_FLAGS.workflow && (
        <Link
          to="/onboarding/persona"
          search={{ legacy: true }}
          className="mt-6 ml-6 inline-flex min-h-11 items-center text-sm break-words"
        >
          About you
        </Link>
      )}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link to="/privacy-policy" className="underline">
          Privacy
        </Link>
        {" · "}
        <Link to="/terms" className="underline">
          Terms
        </Link>
      </p>

      <button
        onClick={signOut}
        className="mt-8 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

type BillingStatus = Awaited<ReturnType<typeof getBillingStatus>>;

function SubscriptionCard({ billing }: { billing: BillingStatus | undefined }) {
  const isTrialing = billing?.status === "trialing" && !!billing?.trial;
  const isPaidPro = billing?.plan === "pro" && billing?.status !== "trialing";
  const expired = billing?.trialExpired;
  const trial = billing?.trial ?? null;

  const planLabel = isPaidPro ? "Pro" : isTrialing ? "Premium Trial" : "Free";

  return (
    <div className="mt-6 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 to-transparent p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Current plan</p>
          <p className="mt-1 font-display text-lg font-semibold">
            {planLabel}
          </p>
        </div>
        {isTrialing && trial && (
          <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            {trial.daysRemaining} {trial.daysRemaining === 1 ? "day" : "days"} left
          </span>
        )}
      </div>

      {isTrialing && trial && (
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/50 pt-4 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Start</p>
            <p className="mt-1 text-xs font-medium">{fmtDate(trial.startDate)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">End</p>
            <p className="mt-1 text-xs font-medium">{fmtDate(trial.endDate)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Days left</p>
            <p className="mt-1 text-xs font-medium">{trial.daysRemaining}</p>
          </div>
        </div>
      )}

      {expired && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Your free trial has expired. Upgrade to keep premium features.</span>
        </div>
      )}

      {!isPaidPro && (
        <Link
          to="/pricing"
          className="mt-4 flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.01]"
        >
          <span>{isTrialing ? "Upgrade to Pro" : expired ? "Upgrade to continue" : "Upgrade to Pro · from $12/mo"}</span>
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}
import { clearNativeWidget, supportsNativeWidget } from "@/lib/widget-bridge";
import { WidgetSettings } from "@/components/notio/widget-settings";
