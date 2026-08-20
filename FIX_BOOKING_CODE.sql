-- TherapyOnWay: complete Supabase setup / migration
-- Run this whole file in Supabase -> SQL Editor -> Run.
-- It is safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text,
  customer_name text,
  customer_phone text,
  service text,
  price numeric,
  booking_date date,
  booking_time time,
  customer_lat double precision,
  customer_lng double precision,
  customer_accuracy double precision,
  provider_lat double precision,
  provider_lng double precision,
  status text default 'New',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Upgrade older versions without deleting existing bookings.
alter table public.bookings add column if not exists booking_code text;
alter table public.bookings add column if not exists customer_name text;
alter table public.bookings add column if not exists customer_phone text;
alter table public.bookings add column if not exists service text;
alter table public.bookings add column if not exists price numeric;
alter table public.bookings add column if not exists booking_date date;
alter table public.bookings add column if not exists booking_time time;
alter table public.bookings add column if not exists customer_lat double precision;
alter table public.bookings add column if not exists customer_lng double precision;
alter table public.bookings add column if not exists customer_accuracy double precision;
alter table public.bookings add column if not exists provider_lat double precision;
alter table public.bookings add column if not exists provider_lng double precision;
alter table public.bookings add column if not exists status text default 'New';
alter table public.bookings add column if not exists created_at timestamptz default now();
alter table public.bookings add column if not exists updated_at timestamptz default now();

-- IMPORTANT: remove the old status constraint before normalizing legacy rows.
alter table public.bookings drop constraint if exists bookings_status_check;

-- Normalize every legacy status to the exact values used by the website.
update public.bookings
set status = case
  when status is null or lower(btrim(status)) in ('pending','new') then 'New'
  when lower(btrim(status)) = 'accepted' then 'Accepted'
  when lower(btrim(status)) in ('on the way','on_way','on the way.') then 'On the Way'
  when lower(btrim(status)) = 'arrived' then 'Arrived'
  when lower(btrim(status)) = 'completed' then 'Completed'
  else 'New'
end;

-- Prevent future invalid status values.
alter table public.bookings
  add constraint bookings_status_check
  check (status in ('New','Accepted','On the Way','Arrived','Completed'));

-- Give legacy rows a stable human-friendly code.
update public.bookings
set booking_code = 'TOW-' || upper(substr(replace(id::text, '-', ''), 1, 10))
where booking_code is null or btrim(booking_code) = '';

-- Repair any duplicate legacy codes before creating the unique index.
with ranked as (
  select id, booking_code, row_number() over (partition by booking_code order by created_at nulls last, id) as rn
  from public.bookings
  where booking_code is not null and btrim(booking_code) <> ''
)
update public.bookings b
set booking_code = 'TOW-' || upper(substr(replace(b.id::text, '-', ''), 1, 10))
from ranked r
where b.id = r.id and r.rn > 1;

create unique index if not exists bookings_booking_code_uidx
  on public.bookings(booking_code)
  where booking_code is not null;

-- Keep updated_at correct automatically.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bookings_updated_at on public.bookings;
create trigger bookings_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

-- RLS: customers may create a booking, but may NOT read all bookings.
-- Providers use authenticated sessions for dashboard reads/updates.
alter table public.bookings enable row level security;

drop policy if exists "public can create bookings" on public.bookings;
create policy "public can create bookings"
on public.bookings for insert
to anon, authenticated
with check (
  coalesce(btrim(customer_name), '') <> ''
  and customer_phone ~ '^[0-9]{10}$'
  and service is not null
  and price is not null and price >= 0
  and booking_date is not null
  and booking_time is not null
  and customer_lat between -90 and 90
  and customer_lng between -180 and 180
);

drop policy if exists "public can read bookings" on public.bookings;
drop policy if exists "providers can read bookings" on public.bookings;
create policy "providers can read bookings"
on public.bookings for select
to authenticated
using (true);

drop policy if exists "providers can update bookings" on public.bookings;
create policy "providers can update bookings"
on public.bookings for update
to authenticated
using (true)
with check (true);

revoke select on public.bookings from anon;
grant insert on public.bookings to anon, authenticated;
grant select, update on public.bookings to authenticated;

-- Public tracking uses a narrow function instead of exposing the whole table.
-- It intentionally does NOT return customer name, phone or exact customer GPS.
create or replace function public.get_booking_tracking(p_booking_id text)
returns table (
  booking_code text,
  service text,
  booking_date date,
  booking_time time,
  status text,
  provider_lat double precision,
  provider_lng double precision
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select b.booking_code, b.service, b.booking_date, b.booking_time, b.status,
         b.provider_lat, b.provider_lng
  from public.bookings b
  where upper(btrim(p_booking_id)) = upper(b.booking_code)
     or b.id::text = btrim(p_booking_id)
  limit 1;
$$;

revoke all on function public.get_booking_tracking(text) from public;
grant execute on function public.get_booking_tracking(text) to anon, authenticated;

-- Realtime is needed by the authenticated provider dashboard.
alter table public.bookings replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.bookings;
exception when duplicate_object then
  null;
end;
$$;

notify pgrst, 'reload schema';
