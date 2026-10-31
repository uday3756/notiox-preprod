/**
 * Google Calendar OAuth state + callback (server-only — uses node:crypto).
 * Do not import this from client components.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { exchangeCodeForTokens } from "@/lib/google-calendar.server";

function stateSecret(): string {
  return (
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "notio-gcal-dev"
  );
}

export function signOAuthState(userId: string): string {
  const exp = Date.now() + 15 * 60_000;
  const payload = Buffer.from(JSON.stringify({ u: userId, exp }), "utf8").toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(state: string): string | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      u?: string;
      exp?: number;
    };
    if (!parsed.u || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed.u;
  } catch {
    return null;
  }
}

export async function saveGoogleCalendarTokens(opts: {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const expires = new Date(Date.now() + (opts.expiresIn ?? 3600) * 1000).toISOString();

  const { data: existing } = await supabaseAdmin
    .from("calendar_integrations")
    .select("id, refresh_token, calendar_id")
    .eq("user_id", opts.userId)
    .eq("provider", "google")
    .maybeSingle();

  const refresh = opts.refreshToken || existing?.refresh_token || null;
  const row = {
    user_id: opts.userId,
    provider: "google",
    access_token: opts.accessToken,
    refresh_token: refresh,
    token_expires_at: expires,
    calendar_id: existing?.calendar_id || "primary",
    sync_enabled: true,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    await supabaseAdmin.from("calendar_integrations").update(row).eq("id", existing.id);
  } else {
    await supabaseAdmin.from("calendar_integrations").insert(row);
  }
}

export async function handleGoogleCalendarOAuthCallback(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const appUrl =
    process.env.VITE_PUBLIC_APP_URL?.trim() || `${url.protocol}//${url.host}`;

  const err = url.searchParams.get("error");
  if (err) {
    return Response.redirect(`${appUrl}/profile?gcal=error&reason=${encodeURIComponent(err)}`);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return Response.redirect(`${appUrl}/profile?gcal=error&reason=missing_code`);
  }

  const userId = verifyOAuthState(state);
  if (!userId) {
    return Response.redirect(`${appUrl}/profile?gcal=error&reason=invalid_state`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveGoogleCalendarTokens({
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
    });
    return Response.redirect(`${appUrl}/profile?gcal=connected`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "oauth_failed";
    return Response.redirect(`${appUrl}/profile?gcal=error&reason=${encodeURIComponent(msg)}`);
  }
}
