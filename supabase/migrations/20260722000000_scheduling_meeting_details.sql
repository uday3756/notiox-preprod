-- Optional meeting details for Reschedule / Google Calendar sync.
-- location → Google event.location; attendees → Google event.attendees (emails).

ALTER TABLE public.scheduling_nodes
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS attendees TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.scheduling_nodes.location IS
  'Optional place or link (Zoom, address). Synced to Google Calendar location.';
COMMENT ON COLUMN public.scheduling_nodes.attendees IS
  'Optional invitee emails. Synced to Google Calendar attendees.';
