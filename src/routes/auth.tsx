import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { NotioLogo } from "@/components/notio/logo";
import { InstallApp } from "@/components/notio/install-app";
import { validateSignupEmail } from "@/lib/email-validation";
import {
  oauthRedirectTo,
  openExternalUrl,
} from "@/lib/auth-redirect";
import { isNativeApp } from "@/lib/native";
import { applyAuthCode, lookupAuthCode } from "@/lib/referral.functions";
import { requestPasswordReset } from "@/lib/password-reset.functions";
import { resendSignupVerification, startEmailSignup } from "@/lib/signup.functions";
import { PASSWORD_MIN_LENGTH, validateNewPassword } from "@/lib/password-policy";
import { resolveOnboardingPath } from "@/lib/onboarding-resolve";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in - Notio" },
      { name: "description", content: "Sign in or create your Notio account." },
    ],
  }),
  component: AuthPage,
});

const PENDING_CODE_KEY = "notio_pending_auth_code";
const RESEND_COOLDOWN_SEC = 60;

type AuthMode = "signin" | "signup" | "forgot";
type AuthStep =
  | "form"
  | "signup_otp"
  | "recovery_otp"
  | "new_password";

function humanizeAuthError(message: string): string {
  const m = message.toLowerCase();
  if (message.includes("DISPOSABLE_EMAIL") || m.includes("disposable")) {
    return "Temporary or disposable emails aren't allowed. Please use a permanent email.";
  }
  if (m.includes("rate limit") || m.includes("too many") || m.includes("over_email_send_rate_limit")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (m.includes("expired") || m.includes("otp_expired")) {
    return "That code expired. Request a new one.";
  }
  if (m.includes("invalid") && (m.includes("otp") || m.includes("token") || m.includes("code"))) {
    return "Invalid or expired code. Check the email and try again.";
  }
  if (m.includes("same_password")) {
    return "New password must be different from your current password.";
  }
  return message;
}

function AuthPage() {
  const navigate = useNavigate();
  const lookupFn = useServerFn(lookupAuthCode);
  const applyFn = useServerFn(applyAuthCode);
  const requestResetFn = useServerFn(requestPasswordReset);
  const startSignupFn = useServerFn(startEmailSignup);
  const resendSignupFn = useServerFn(resendSignupVerification);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [step, setStep] = useState<AuthStep>("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [codeHint, setCodeHint] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [otpCode, setOtpCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const recoveryHold = useRef(false);
  const resendTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function startResendCooldown(seconds = RESEND_COOLDOWN_SEC) {
    setResendIn(seconds);
    if (resendTimer.current) clearInterval(resendTimer.current);
    resendTimer.current = setInterval(() => {
      setResendIn((s) => {
        if (s <= 1) {
          if (resendTimer.current) clearInterval(resendTimer.current);
          resendTimer.current = null;
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    return () => {
      if (resendTimer.current) clearInterval(resendTimer.current);
    };
  }, []);

  async function applyPendingCode(): Promise<void> {
    let code = promoCode.trim();
    if (!code) {
      try {
        code = sessionStorage.getItem(PENDING_CODE_KEY)?.trim() ?? "";
      } catch {
        code = "";
      }
    }
    if (!code) return;
    try {
      const res = await applyFn({ data: { code } });
      try {
        sessionStorage.removeItem(PENDING_CODE_KEY);
      } catch {
        /* ignore */
      }
      if (res.already) return;
      if (res.kind === "referral") {
        toast.success(`Referred by ${res.referrerName}`);
      } else if (res.kind === "promo") {
        toast.success(`Promo applied: ${res.code}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't apply code.");
    }
  }

  function stashCodeIfAny() {
    const code = promoCode.trim();
    if (!code) return;
    try {
      sessionStorage.setItem(PENDING_CODE_KEY, code.toUpperCase());
    } catch {
      /* ignore */
    }
  }

  async function routeAfterAuth(userId: string) {
    await applyPendingCode();
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("notio_checkout_plan")) {
      navigate({ to: "/pricing", replace: true });
      return;
    }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      navigate({ to: "/home", replace: true });
      return;
    }
    const dest = await resolveOnboardingPath(supabase, auth.user);
    navigate({ to: dest, replace: true });
  }

  // Recovery / signup verification link landing
  useEffect(() => {
    let cancelled = false;

    function enterNewPasswordStep(userEmail?: string | null) {
      recoveryHold.current = true;
      setMode("forgot");
      setStep("new_password");
      setPassword("");
      setConfirmPassword("");
      setPasswordError(null);
      if (userEmail) setEmail(userEmail);
      toast.message("Create a new password to finish resetting.");
      window.history.replaceState({}, "", "/auth?reset=1");
    }

    async function bootAuthFromUrl() {
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, ""),
      );
      const wantsReset =
        params.get("reset") === "1" ||
        params.get("type") === "recovery" ||
        hashParams.get("type") === "recovery";
      const wantsVerify =
        params.get("verify") === "1" ||
        params.get("type") === "signup" ||
        hashParams.get("type") === "signup";

      const tokenHash =
        params.get("token_hash") || hashParams.get("token_hash");
      const otpTypeRaw =
        params.get("type") || hashParams.get("type") || "";

      // Signup / magic-link verify from branded Resend email
      if (
        tokenHash &&
        (otpTypeRaw === "signup" ||
          otpTypeRaw === "email" ||
          otpTypeRaw === "magiclink" ||
          (wantsVerify && otpTypeRaw !== "recovery"))
      ) {
        const verifyType =
          otpTypeRaw === "email" || otpTypeRaw === "magiclink"
            ? "email"
            : "signup";
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: verifyType,
        });
        if (!cancelled && !error) {
          toast.success("Email verified. Welcome to Notio.");
          window.history.replaceState({}, "", "/auth");
          await applyPendingCode();
          navigate({ to: "/onboarding/role", replace: true });
          return;
        }
        if (!cancelled && error) {
          console.warn("[auth] signup verifyOtp(token_hash):", error.message);
          toast.error(
            humanizeAuthError(error.message) ||
              "That verification link expired. Enter the code from the email.",
          );
          setMode("signup");
          setStep("signup_otp");
          return;
        }
      }

      // Password recovery link
      if (tokenHash && (otpTypeRaw === "recovery" || wantsReset)) {
        recoveryHold.current = true;
        setMode("forgot");
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (!cancelled && !error) {
          enterNewPasswordStep(data.user?.email ?? data.session?.user?.email);
          return;
        }
        if (!cancelled && error) {
          console.warn("[auth] verifyOtp(token_hash):", error.message);
          toast.error(
            humanizeAuthError(error.message) ||
              "That reset link expired. Enter the code from the email, or request a new one.",
          );
          setStep("recovery_otp");
          return;
        }
      }

      // PKCE: ?code=... from Supabase verify redirect
      const code = params.get("code");
      if (code) {
        recoveryHold.current = true;
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!cancelled && !error) {
          if (wantsVerify) {
            toast.success("Email verified. Welcome to Notio.");
            window.history.replaceState({}, "", "/auth");
            await applyPendingCode();
            navigate({ to: "/onboarding/role", replace: true });
            return;
          }
          enterNewPasswordStep(data.user?.email ?? data.session?.user?.email);
          return;
        }
        if (!cancelled && error) {
          console.warn("[auth] exchangeCodeForSession:", error.message);
          toast.error(
            humanizeAuthError(error.message) ||
              "That link expired. Request a new code.",
          );
        }
      }

      if (wantsReset) {
        recoveryHold.current = true;
        setMode("forgot");
        const { data } = await supabase.auth.getSession();
        if (!cancelled) {
          if (data.session) {
            enterNewPasswordStep(data.session.user.email);
          } else {
            setStep("recovery_otp");
          }
        }
      }
    }

    void bootAuthFromUrl();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        enterNewPasswordStep(session?.user?.email);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data, error }) => {
      if (error || !data.user) return;
      if (recoveryHold.current || step === "new_password" || step === "recovery_otp") {
        return;
      }
      await routeAfterAuth(data.user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, step]);

  async function validateOptionalCode(): Promise<boolean> {
    const code = promoCode.trim();
    if (!code) {
      setCodeError(null);
      setCodeHint(null);
      return true;
    }
    try {
      const res = await lookupFn({ data: { code } });
      if (!res.ok) {
        setCodeError(res.error);
        setCodeHint(null);
        return false;
      }
      setCodeError(null);
      setCodeHint(
        res.kind === "referral"
          ? `Referral from ${res.referrerName}`
          : `Promo code · ${res.trialDays ?? 7}-day trial`,
      );
      stashCodeIfAny();
      return true;
    } catch {
      setCodeError("Couldn't verify that code.");
      setCodeHint(null);
      return false;
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setEmailError(null);
    try {
      const codeOk = await validateOptionalCode();
      if (!codeOk) {
        setBusy(false);
        return;
      }

      if (mode === "signup") {
        const err = validateSignupEmail(email);
        if (err) {
          setEmailError(err);
          setBusy(false);
          return;
        }
        if (!acceptedTerms) {
          toast.error("Please agree to the Terms of Service to continue.");
          setBusy(false);
          return;
        }

        const pwdCheck = validateNewPassword(password, password, email);
        if (!pwdCheck.ok) {
          toast.error(pwdCheck.error ?? "Choose a stronger password.");
          setBusy(false);
          return;
        }

        stashCodeIfAny();
        await startSignupFn({
          data: {
            email: email.trim().toLowerCase(),
            password,
            redirectOrigin: window.location.origin,
          },
        });
        setStep("signup_otp");
        startResendCooldown();
        toast.success("We sent a 6-digit verification code to your email.");
      } else {
        stashCodeIfAny();
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) await routeAfterAuth(userData.user.id);
      }
    } catch (err) {
      toast.error(
        humanizeAuthError(err instanceof Error ? err.message : "Authentication failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotRequest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setEmailError(null);
    try {
      const trimmed = email.trim();
      if (!trimmed) {
        setEmailError("Enter the email for your account.");
        setBusy(false);
        return;
      }

      // Server sends branded OTP via Resend (or Supabase mailer fallback).
      // Always show the same message (anti-enumeration).
      await requestResetFn({
        data: {
          email: trimmed,
          redirectOrigin: window.location.origin,
        },
      });

      setStep("recovery_otp");
      setOtpCode("");
      startResendCooldown();
      toast.success("If an account exists for that email, we sent a reset code.");
    } catch (err) {
      toast.error(
        humanizeAuthError(err instanceof Error ? err.message : "Couldn't send reset email."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifySignupOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode.trim(),
        type: "signup",
      });
      if (error) throw error;
      await applyPendingCode();
      toast.success("Email verified. Welcome to Notio.");
      navigate({ to: "/onboarding/role", replace: true });
    } catch (err) {
      toast.error(
        humanizeAuthError(err instanceof Error ? err.message : "Invalid or expired code."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyRecoveryOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: "recovery",
      });
      if (error) throw error;
      recoveryHold.current = true;
      setPassword("");
      setConfirmPassword("");
      setPasswordError(null);
      setStep("new_password");
      toast.success("Code verified. Set a new password.");
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Invalid or expired code.";
      const hint =
        /provider|oauth|identity|password/i.test(raw)
          ? "If you signed up with Google, use Continue with Google instead."
          : humanizeAuthError(raw);
      toast.error(hint);
    } finally {
      setBusy(false);
    }
  }

  async function handleSetNewPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setPasswordError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error("Reset session expired. Open the email link again or enter the code.");
        setStep("recovery_otp");
        setBusy(false);
        return;
      }

      const accountEmail =
        email.trim() || sessionData.session.user.email?.trim() || "";
      if (accountEmail && !email.trim()) setEmail(accountEmail);

      const check = validateNewPassword(password, confirmPassword, accountEmail);
      if (!check.ok) {
        setPasswordError(check.error);
        setBusy(false);
        return;
      }

      // Replaces the old password in Supabase Auth for this user.
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      // Fresh password sign-in so the recovery session is cleared.
      await supabase.auth.signOut();
      if (!accountEmail) {
        toast.success("Password updated. Please sign in with your new password.");
        recoveryHold.current = false;
        setStep("form");
        setMode("signin");
        setPassword("");
        setConfirmPassword("");
        setOtpCode("");
        return;
      }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: accountEmail,
        password,
      });
      if (signInErr) {
        toast.success("Password updated. Please sign in with your new password.");
        recoveryHold.current = false;
        setStep("form");
        setMode("signin");
        setPassword("");
        setConfirmPassword("");
        setOtpCode("");
        return;
      }

      recoveryHold.current = false;
      toast.success("Password updated.");
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) await routeAfterAuth(userData.user.id);
      else navigate({ to: "/home", replace: true });
    } catch (err) {
      toast.error(
        humanizeAuthError(err instanceof Error ? err.message : "Couldn't update password."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function resendSignupOtp() {
    if (resendIn > 0) return;
    setBusy(true);
    try {
      await resendSignupFn({
        data: {
          email: email.trim().toLowerCase(),
          password,
          redirectOrigin: window.location.origin,
        },
      });
      startResendCooldown();
      toast.success("A new verification code is on the way.");
    } catch (err) {
      toast.error(
        humanizeAuthError(err instanceof Error ? err.message : "Couldn't resend the code."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function resendRecoveryOtp() {
    if (resendIn > 0) return;
    setBusy(true);
    try {
      await requestResetFn({
        data: {
          email: email.trim(),
          redirectOrigin: window.location.origin,
        },
      });
      startResendCooldown();
      toast.success("If an account exists for that email, we sent a new code.");
    } catch (err) {
      toast.error(
        humanizeAuthError(err instanceof Error ? err.message : "Couldn't resend the code."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    if (mode === "signup" && !acceptedTerms) {
      toast.error("Please agree to the Terms of Service to continue.");
      setBusy(false);
      return;
    }
    const codeOk = await validateOptionalCode();
    if (!codeOk) {
      setBusy(false);
      return;
    }
    stashCodeIfAny();
    const redirectTo = oauthRedirectTo("/onboarding/role");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: isNativeApp(),
      },
    });
    if (error) {
      toast.error("Google sign-in failed.");
      setBusy(false);
      return;
    }
    if (isNativeApp() && data?.url) {
      try {
        await openExternalUrl(data.url);
      } catch {
        toast.error("Couldn't open Google sign-in.");
      } finally {
        setBusy(false);
      }
    }
  }

  function backToSignIn() {
    recoveryHold.current = false;
    setMode("signin");
    setStep("form");
    setOtpCode("");
    setPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setEmailError(null);
  }

  // ---- Signup OTP ----
  if (step === "signup_otp") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background bg-glow px-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-2xl">
          <Link to="/" className="block text-center">
            <NotioLogo className="text-3xl" />
          </Link>
          <h1 className="mt-6 text-center font-display text-2xl font-semibold">
            Verify your email
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Check your inbox for a Notio email with a{" "}
            <span className="text-foreground">6-digit code</span> (and a verify
            button). Enter the code here for{" "}
            <span className="text-foreground">{email}</span>.
          </p>

          <form onSubmit={handleVerifySignupOtp} className="mt-6 space-y-3">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={8}
              placeholder="123456"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-center text-lg tracking-[0.5em] outline-none focus:border-primary"
            />
            <button
              disabled={busy || otpCode.length < 6}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-95 disabled:opacity-50"
            >
              Verify &amp; continue
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Didn't get it?{" "}
            <button
              type="button"
              onClick={resendSignupOtp}
              disabled={busy || resendIn > 0}
              className="font-medium text-primary hover:underline disabled:opacity-50"
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </button>
          </p>
          <p className="mt-3 text-center">
            <button
              type="button"
              onClick={() => {
                setStep("form");
                setOtpCode("");
              }}
              className="text-xs text-muted-foreground hover:underline"
            >
              Use a different email
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ---- Recovery OTP ----
  if (step === "recovery_otp") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background bg-glow px-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-2xl">
          <Link to="/" className="block text-center">
            <NotioLogo className="text-3xl" />
          </Link>
          <h1 className="mt-6 text-center font-display text-2xl font-semibold">
            Enter reset code
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Check your inbox for a <span className="text-foreground">6-digit code</span>{" "}
            (and optionally a reset button). Enter the code here for{" "}
            <span className="text-foreground">{email}</span>.
          </p>

          <form onSubmit={handleVerifyRecoveryOtp} className="mt-6 space-y-3">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={8}
              placeholder="123456"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-center text-lg tracking-[0.5em] outline-none focus:border-primary"
            />
            <button
              disabled={busy || otpCode.length < 6}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-95 disabled:opacity-50"
            >
              Verify code
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Didn't get it?{" "}
            <button
              type="button"
              onClick={resendRecoveryOtp}
              disabled={busy || resendIn > 0}
              className="font-medium text-primary hover:underline disabled:opacity-50"
            >
              {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
            </button>
          </p>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Signed up with Google? Use Continue with Google on the sign-in screen.
          </p>
          <p className="mt-3 text-center">
            <button
              type="button"
              onClick={backToSignIn}
              className="text-xs text-muted-foreground hover:underline"
            >
              Back to sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ---- New password (after email link or OTP) ----
  if (step === "new_password") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background bg-glow px-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-2xl">
          <Link to="/" className="block text-center">
            <NotioLogo className="text-3xl" />
          </Link>
          <h1 className="mt-6 text-center font-display text-2xl font-semibold">
            Create new password
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Enter a new password, then retype it. This replaces your old password
            {email.trim() ? (
              <>
                {" "}
                for <span className="text-foreground">{email.trim()}</span>
              </>
            ) : null}
            . At least {PASSWORD_MIN_LENGTH} characters.
          </p>

          <form onSubmit={handleSetNewPassword} className="mt-6 space-y-3">
            {!email.trim() && (
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            )}
            <label className="block space-y-1.5">
              <span className="px-1 text-xs font-medium text-muted-foreground">
                New password
              </span>
              <input
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                placeholder="Create new password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="px-1 text-xs font-medium text-muted-foreground">
                Retype new password
              </span>
              <input
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                autoComplete="new-password"
                placeholder="Retype new password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </label>
            {passwordError && (
              <p className="px-1 text-xs text-destructive">{passwordError}</p>
            )}
            <button
              disabled={busy}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-95 disabled:opacity-50"
            >
              Save new password
            </button>
          </form>

          <p className="mt-5 text-center">
            <button
              type="button"
              onClick={backToSignIn}
              className="text-xs text-muted-foreground hover:underline"
            >
              Back to sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ---- Forgot password request ----
  if (mode === "forgot") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background bg-glow px-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-2xl">
          <Link to="/" className="block text-center">
            <NotioLogo className="text-3xl" />
          </Link>
          <h1 className="mt-6 text-center font-display text-2xl font-semibold">
            Forgot password
          </h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            Enter your account email. If it exists, we&apos;ll send a reset code.
          </p>

          <form onSubmit={handleForgotRequest} className="mt-6 space-y-3">
            <div>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                className={`w-full rounded-xl border bg-background px-4 py-3 text-sm outline-none focus:border-primary ${
                  emailError ? "border-destructive" : "border-border"
                }`}
              />
              {emailError && (
                <p className="mt-1.5 px-1 text-xs text-destructive">{emailError}</p>
              )}
            </div>
            <button
              disabled={busy}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-95 disabled:opacity-50"
            >
              Send reset code
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <button
              type="button"
              onClick={backToSignIn}
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ---- Sign in / Sign up ----
  return (
    <div className="flex min-h-screen items-center justify-center bg-background bg-glow px-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 shadow-2xl">
        <Link to="/" className="block text-center">
          <NotioLogo className="text-3xl" />
        </Link>
        <h1 className="mt-6 text-center font-display text-2xl font-semibold">
          {mode === "signin" ? "Welcome back" : "Start thinking clearly"}
        </h1>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy || (mode === "signup" && !acceptedTerms)}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-background py-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.6z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.95v2.32A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.96H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.04l3.02-2.32z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .95 4.96L3.97 7.28C4.68 5.16 6.66 3.58 9 3.58z"/></svg>
          Continue with Google
        </button>

        <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          <div>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              className={`w-full rounded-xl border bg-background px-4 py-3 text-sm outline-none focus:border-primary ${
                emailError ? "border-destructive" : "border-border"
              }`}
            />
            {emailError && (
              <p className="mt-1.5 px-1 text-xs text-destructive">{emailError}</p>
            )}
          </div>
          <input
            type="password"
            required
            minLength={mode === "signup" ? PASSWORD_MIN_LENGTH : 6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
          />
          {mode === "signin" && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setPassword("");
                  setEmailError(null);
                }}
                className="text-xs font-medium text-primary hover:underline"
              >
                Forgot password?
              </button>
            </div>
          )}
          <div>
            <input
              type="text"
              autoComplete="off"
              placeholder="Promo / referral code (optional)"
              value={promoCode}
              onChange={(e) => {
                setPromoCode(e.target.value.toUpperCase());
                if (codeError) setCodeError(null);
                if (codeHint) setCodeHint(null);
              }}
              onBlur={() => {
                void validateOptionalCode();
              }}
              className={`w-full rounded-xl border bg-background px-4 py-3 text-sm outline-none focus:border-primary ${
                codeError ? "border-destructive" : "border-border"
              }`}
            />
            {codeError && (
              <p className="mt-1.5 px-1 text-xs text-destructive">{codeError}</p>
            )}
            {!codeError && codeHint && (
              <p className="mt-1.5 px-1 text-xs text-primary">{codeHint}</p>
            )}
          </div>
          {mode === "signup" && (
            <label className="flex items-start gap-3 rounded-xl border border-border bg-background/60 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
              />
              <span>
                I agree to the{" "}
                <Link to="/terms" className="font-medium text-primary hover:underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="font-medium text-primary hover:underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
          )}
          <button
            disabled={busy || (mode === "signup" && !acceptedTerms)}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-95 disabled:opacity-50"
          >
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setEmailError(null);
              setCodeError(null);
            }}
            className="font-medium text-primary hover:underline"
          >
            {mode === "signin" ? "Create account" : "Sign in"}
          </button>
        </p>

        <InstallApp />
      </div>
    </div>
  );
}
