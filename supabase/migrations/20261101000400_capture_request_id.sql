-- Additive capture idempotency key. Safe to apply after review.
alter table public.maps
  add column if not exists capture_request_id uuid;

create unique index if not exists uq_maps_user_capture_request
  on public.maps (user_id, capture_request_id)
  where capture_request_id is not null;
