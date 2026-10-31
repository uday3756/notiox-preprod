/** Google Calendar API helpers (server-only). */

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_CAL = "https://www.googleapis.com/calendar/v3";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
].join(" ");

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

export type GoogleCalendarListItem = {
  id: string;
  summary: string;
  primary?: boolean;
};

export type GoogleEventInput = {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  timeZone: string;
  notioTaskId: string;
  location?: string;
  attendees?: string[];
};

function clientId() {
  return process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || "";
}
function clientSecret() {
  return process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || "";
}
export function googleCalendarRedirectUri() {
  return (
    process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim() ||
    "http://localhost:8080/api/integrations/google-calendar/callback"
  );
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(clientId() && clientSecret());
}

export function buildGoogleCalendarAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: googleCalendarRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: googleCalendarRedirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as GoogleTokens & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "OAuth exchange failed");
  }
  return json;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const body = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as GoogleTokens & {
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Token refresh failed");
  }
  return json;
}

async function gcalFetch(accessToken: string, path: string, init?: RequestInit) {
  return fetch(`${GOOGLE_CAL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}

export async function listCalendars(accessToken: string): Promise<GoogleCalendarListItem[]> {
  const res = await gcalFetch(accessToken, "/users/me/calendarList?minAccessRole=writer");
  const json = (await res.json()) as {
    items?: GoogleCalendarListItem[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message || "Failed to list calendars");
  return json.items || [];
}

function eventBody(input: GoogleEventInput) {
  const attendees = (input.attendees ?? [])
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .map((email) => ({ email }));

  return {
    summary: input.summary,
    description: input.description || undefined,
    location: input.location?.trim() || undefined,
    start: { dateTime: input.startIso, timeZone: input.timeZone },
    end: { dateTime: input.endIso, timeZone: input.timeZone },
    ...(attendees.length > 0 ? { attendees } : {}),
    extendedProperties: {
      private: { notio_task_id: input.notioTaskId, source: "notio" },
    },
  };
}

function eventsPath(
  calendarId: string,
  eventId?: string,
  opts?: { sendUpdates?: boolean },
): string {
  const base = eventId
    ? `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
    : `/calendars/${encodeURIComponent(calendarId)}/events`;
  if (!opts?.sendUpdates) return base;
  return `${base}?sendUpdates=all`;
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  input: GoogleEventInput,
): Promise<{ id: string }> {
  const notify = (input.attendees?.length ?? 0) > 0;
  const res = await gcalFetch(
    accessToken,
    eventsPath(calendarId, undefined, { sendUpdates: notify }),
    { method: "POST", body: JSON.stringify(eventBody(input)) },
  );
  const json = (await res.json()) as { id?: string; error?: { message?: string } };
  if (!res.ok || !json.id) throw new Error(json.error?.message || "Create event failed");
  return { id: json.id };
}

export async function updateCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  input: GoogleEventInput,
): Promise<void> {
  const notify = (input.attendees?.length ?? 0) > 0;
  const res = await gcalFetch(
    accessToken,
    eventsPath(calendarId, eventId, { sendUpdates: notify }),
    { method: "PATCH", body: JSON.stringify(eventBody(input)) },
  );
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(json.error?.message || "Update event failed");
  }
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<void> {
  const res = await gcalFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(json.error?.message || "Delete event failed");
  }
}

export type GoogleListedEvent = {
  id: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
  updated?: string;
};

export async function listChangedEvents(
  accessToken: string,
  calendarId: string,
  syncToken?: string | null,
): Promise<{ items: GoogleListedEvent[]; nextSyncToken?: string }> {
  const items: GoogleListedEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  do {
    const params = new URLSearchParams({ maxResults: "250", showDeleted: "true" });
    if (syncToken) params.set("syncToken", syncToken);
    else {
      const min = new Date();
      min.setDate(min.getDate() - 30);
      params.set("timeMin", min.toISOString());
      params.set("singleEvents", "true");
    }
    if (pageToken) params.set("pageToken", pageToken);

    const res = await gcalFetch(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    );
    const json = (await res.json()) as {
      items?: GoogleListedEvent[];
      nextPageToken?: string;
      nextSyncToken?: string;
      error?: { code?: number; message?: string };
    };

    if (!res.ok) {
      if (json.error?.code === 410) {
        return listChangedEvents(accessToken, calendarId, null);
      }
      throw new Error(json.error?.message || "List events failed");
    }

    items.push(...(json.items || []));
    pageToken = json.nextPageToken;
    if (json.nextSyncToken) nextSyncToken = json.nextSyncToken;
  } while (pageToken);

  return { items, nextSyncToken };
}
