# Google Calendar sync — setup

Notio can push timed `scheduling_nodes` to Google Calendar and pull changes back for **Notio-owned** events only.

## Important: separate from "Sign in with Google"

| Purpose | Where credentials live |
|---|---|
| **Login** (Sign in with Google) | Supabase → Auth → Providers → Google |
| **Calendar sync** (Profile → Connect Google Calendar) | Vercel / `.env` → `GOOGLE_CALENDAR_CLIENT_*` |

Use a **different** OAuth 2.0 Web client for Calendar than the one you put in Supabase for login. Same Google Cloud project is fine; two clients keep redirects and scopes clean.

## 1. Google Cloud (Calendar-only client)

1. Open [Google Cloud Console](https://console.cloud.google.com/) → your project.
2. Enable **Google Calendar API** (APIs & Services → Library).
3. APIs & Services → Credentials → **Create credentials → OAuth client ID**.
4. Application type: **Web application**.
5. Name it clearly, e.g. `Notio Calendar Sync` (not the login client).
6. Authorized redirect URIs (exact match):
   - `http://localhost:8080/api/integrations/google-calendar/callback`
   - `https://notiolive.com/api/integrations/google-calendar/callback` (or your production domain)
   - Also add `https://remix-of-pixel-perfect-ten.vercel.app/api/integrations/google-calendar/callback` if you use the Vercel URL
7. Copy the new **Client ID** and **Client secret**.
8. Scopes used by the app (consent screen):
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`

Do **not** paste these into Supabase. They only go into the Calendar env vars below.

## 2. Env vars (local `.env` + Vercel)

```
FEATURE_GOOGLE_CALENDAR=1
VITE_FEATURE_GOOGLE_CALENDAR=1
GOOGLE_CALENDAR_CLIENT_ID=...        # from the Calendar OAuth client
GOOGLE_CALENDAR_CLIENT_SECRET=...    # from the Calendar OAuth client
GOOGLE_CALENDAR_REDIRECT_URI=https://notiolive.com/api/integrations/google-calendar/callback
```

`VITE_FEATURE_GOOGLE_CALENDAR` is build-time — redeploy after changing it.

Also ensure `CRON_SECRET` is set (shared with other crons). Vercel runs `/api/cron/google-calendar-sync` once daily (`0 9 * * *` UTC) for Google → Notio pull — Hobby plans only allow daily crons. Notio → Google still syncs immediately when you save/edit a timed task. On Pro you can tighten the schedule (e.g. `*/20 * * * *`).

## 3. Database

Apply migration `supabase/migrations/20260720000000_google_calendar_sync.sql` (adds `google_event_id`, sync columns, hardens token access).

## Sync directions

| Direction | When |
|---|---|
| **Notio → Google** | Immediately on create / edit / complete / delete of a timed task |
| **Google → Notio** | Profile **Sync now**, auto-pull every ~5 min while Notio is open, and daily Vercel cron (`0 9 * * *` UTC). Only events Notio created (private `notio_task_id`) are updated. |

Hobby Vercel cannot run a every-20-minute cron; the in-app puller covers that while you use the app.
