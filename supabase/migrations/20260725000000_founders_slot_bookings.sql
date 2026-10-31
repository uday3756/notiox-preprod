-- Lifetime / Founders slot interest bookings (no Stripe checkout).
create table if not exists public.founders_slot_bookings (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null,
  place text not null,
  booking_name text not null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists founders_slot_bookings_created_at_idx
  on public.founders_slot_bookings (created_at desc);

create index if not exists founders_slot_bookings_email_idx
  on public.founders_slot_bookings (lower(email));

alter table public.founders_slot_bookings enable row level security;

-- No direct client access: inserts go through service-role server function only.
revoke all on table public.founders_slot_bookings from anon, authenticated;
grant select, insert, update, delete on table public.founders_slot_bookings to service_role;

comment on table public.founders_slot_bookings is
  'Founders Lifetime slot claims from Claim a slot form; created_at is the booking timestamp.';
