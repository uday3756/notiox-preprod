import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      // Intercept the cron reminder endpoint before TanStack routing.
      // This version has no file-based API routes, so we handle it here.
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/v1/widgets/")) {
        const { handleWidgetRequest } = await import("./lib/widget-completion.server");
        return await handleWidgetRequest(request);
      }
      if (url.pathname === "/api/cron/reminders") {
        const { handleReminderCron } = await import("./lib/cron-reminders.server");
        return await handleReminderCron(request);
      }
      if (url.pathname === "/api/cron/canvas-sync") {
        const { handleCanvasCron } = await import("./lib/cron-canvas.server");
        return await handleCanvasCron(request);
      }
      // Feature 2 — Weekly Reflection Report cron. Same intercept pattern as
      // the reminders cron above. Gated on FEATURE_FLAGS.weeklyReflection
      // inside the handler (returns 200 "feature disabled" when off so Vercel
      // Cron doesn't retry but no work is done).
      if (url.pathname === "/api/cron/weekly-report") {
        const { handleWeeklyReportCron } = await import("./lib/cron-weekly-report.server");
        return await handleWeeklyReportCron(request);
      }
      if (url.pathname === "/api/webhooks/revenuecat") {
        const { handleRevenueCatWebhook } = await import("./lib/iap.functions");
        return await handleRevenueCatWebhook(request);
      }
      // Google Calendar OAuth callback (separate from Supabase Sign-in with Google).
      if (url.pathname === "/api/integrations/google-calendar/callback") {
        const { handleGoogleCalendarOAuthCallback } = await import(
          "./lib/google-calendar.oauth.server"
        );
        return await handleGoogleCalendarOAuthCallback(request);
      }
      // Google → Notio poll for Notio-owned calendar events.
      if (url.pathname === "/api/cron/google-calendar-sync") {
        const { handleGoogleCalendarSyncCron } = await import(
          "./lib/cron-google-calendar.server"
        );
        return await handleGoogleCalendarSyncCron(request);
      }
      // Durable completion → Google export outbox retry (quiet accounts).
      if (url.pathname === "/api/cron/completion-export-retry") {
        const { handleCompletionExportRetryCron } = await import(
          "./lib/cron-completion-export.server"
        );
        return await handleCompletionExportRetryCron(request);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
