-- TherapyOnWay: secure Supabase setup / migration
-- Run this whole file in Supabase -> SQL Editor -> Run.
-- Designed to preserve existing bookings while aligning the database with the current app.

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
  provider_id uuid,
  status text default 'New',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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
alter table public.bookings add column if not exists provider_id uuid;
alter table public.bookings add column if not exists status text default 'New';
alter table public.bookings add column if not exists created_at timestamptz default now();
alter table public.bookings add column if not exists updated_at timestamptz default now();
alter table public.bookings add column if not exists payment_status text not null default 'unpaid';
alter table public.bookings add column if not exists payment_method text;
alter table public.bookings add column if not exists razorpay_order_id text;
alter table public.bookings add column if not exists razorpay_payment_id text;
alter table public.bookings add column if not exists razorpay_signature text;
alter table public.bookings add column if not exists paid_at timestamptz;


create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references auth.users(id) on delete cascade,
  name text not null default 'Provider',
  phone text,
  is_available boolean not null default true,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.provider_locations (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.bookings drop constraint if exists bookings_status_check;
update public.bookings
set status = case
  when status is null or lower(btrim(status)) in ('pending','new') then 'New'
  when lower(btrim(status)) = 'accepted' then 'Accepted'
  when lower(btrim(status)) in ('rejected','declined','cancelled','canceled') then 'Rejected'
  when lower(btrim(status)) in ('on the way','on_way','on-the-way','on the way.') then 'On the Way'
  when lower(btrim(status)) = 'arrived' then 'Arrived'
  when lower(btrim(status)) in ('completed','complete') then 'Completed'
  else 'New'
end;
alter table public.bookings add constraint bookings_status_check
  check (status in ('New','Accepted','Rejected','On the Way','Arrived','Completed'));

update public.bookings
set booking_code = 'TOW-' || upper(substr(replace(id::text, '-', ''), 1, 10))
where booking_code is null or btrim(booking_code) = '';

with ranked as (
  select id, booking_code,
         row_number() over (partition by booking_code order by created_at nulls last, id) rn
  from public.bookings
  where booking_code is not null and btrim(booking_code) <> ''
)
update public.bookings b
set booking_code = 'TOW-' || upper(substr(replace(b.id::text, '-', ''), 1, 10))
from ranked r
where b.id=r.id and r.rn>1;

create unique index if not exists bookings_booking_code_uidx
  on public.bookings(booking_code) where booking_code is not null;

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Current project admin/provider bootstrap IDs are inserted only when those auth users exist.
do $$
begin
  if exists (select 1 from auth.users where id='d9af623c-0eb5-42cd-b87a-c96bd86793fc'::uuid) then
    insert into public.app_admins(user_id) values ('d9af623c-0eb5-42cd-b87a-c96bd86793fc'::uuid) on conflict do nothing;
  end if;
  if exists (select 1 from auth.users where id='b4c970b1-d209-408f-9106-161c098f4d88'::uuid) then
    insert into public.providers(user_id,name,is_available,is_verified) values ('b4c970b1-d209-408f-9106-161c098f4d88'::uuid,'Provider',true,true) on conflict (user_id) do nothing;
  end if;
end $$;

alter table public.bookings enable row level security;
alter table public.providers enable row level security;
alter table public.provider_locations enable row level security;

-- Remove broad/legacy policies before applying the secure set.
drop policy if exists "public can create bookings" on public.bookings;
drop policy if exists "public can read bookings" on public.bookings;
drop policy if exists "providers can read bookings" on public.bookings;
drop policy if exists "providers can update bookings" on public.bookings;
drop policy if exists "admin or provider can read bookings" on public.bookings;
drop policy if exists "admin or provider can update bookings" on public.bookings;

drop policy if exists "Admin can manage providers" on public.providers;
drop policy if exists "Anyone can view available providers" on public.providers;
drop policy if exists "Provider can view own profile" on public.providers;
drop policy if exists "admin or own provider location insert" on public.provider_locations;
drop policy if exists "admin or own provider location read" on public.provider_locations;
drop policy if exists "admin or own provider location update" on public.provider_locations;

create policy "public can create bookings"
on public.bookings for insert to anon, authenticated
with check (
  coalesce(btrim(customer_name),'') <> ''
  and customer_phone ~ '^[0-9]{10}$'
  and service is not null
  and price is not null and price >= 0
  and booking_date is not null
  and booking_time is not null
  and customer_lat between -90 and 90
  and customer_lng between -180 and 180
  and coalesce(status,'New') = 'New'
  and provider_id is null
  and provider_lat is null
  and provider_lng is null
);

create policy "admin or provider can read bookings"
on public.bookings for select to authenticated
using (
  exists (select 1 from public.app_admins a where a.user_id=(select auth.uid()))
  or exists (select 1 from public.providers p where p.id=bookings.provider_id and p.user_id=(select auth.uid()))
  or (bookings.provider_id is null and bookings.status <> 'Completed'
      and exists (select 1 from public.providers p where p.user_id=(select auth.uid()) and p.is_available=true))
);

create policy "admin or provider can update bookings"
on public.bookings for update to authenticated
using (
  exists (select 1 from public.app_admins a where a.user_id=(select auth.uid()))
  or exists (select 1 from public.providers p where p.id=bookings.provider_id and p.user_id=(select auth.uid()))
  or (bookings.provider_id is null and bookings.status <> 'Completed'
      and exists (select 1 from public.providers p where p.user_id=(select auth.uid()) and p.is_available=true))
)
with check (
  exists (select 1 from public.app_admins a where a.user_id=(select auth.uid()))
  or exists (select 1 from public.providers p where p.id=bookings.provider_id and p.user_id=(select auth.uid()))
);

create policy "admin can manage providers"
on public.providers for all to authenticated
using (exists (select 1 from public.app_admins a where a.user_id=(select auth.uid())))
with check (exists (select 1 from public.app_admins a where a.user_id=(select auth.uid())));

create policy "provider can view own profile"
on public.providers for select to authenticated
using ((select auth.uid())=user_id);

create policy "admin can read provider locations"
on public.provider_locations for select to authenticated
using (exists (select 1 from public.app_admins a where a.user_id=(select auth.uid())));

create policy "provider can read own location"
on public.provider_locations for select to authenticated
using (exists (select 1 from public.providers p where p.id=provider_locations.provider_id and p.user_id=(select auth.uid())));

create policy "provider can insert own location"
on public.provider_locations for insert to authenticated
with check (exists (select 1 from public.providers p where p.id=provider_locations.provider_id and p.user_id=(select auth.uid())));

create policy "provider can update own location"
on public.provider_locations for update to authenticated
using (exists (select 1 from public.providers p where p.id=provider_locations.provider_id and p.user_id=(select auth.uid())))
with check (exists (select 1 from public.providers p where p.id=provider_locations.provider_id and p.user_id=(select auth.uid())));

revoke all on public.bookings from anon;
revoke all on public.providers from anon;
revoke all on public.provider_locations from anon;
revoke all on public.bookings from authenticated;
revoke all on public.providers from authenticated;
revoke all on public.provider_locations from authenticated;
grant insert on public.bookings to anon, authenticated;
grant select, update on public.bookings to authenticated;
grant select, insert, update, delete on public.providers to authenticated;
grant select, insert, update on public.provider_locations to authenticated;

drop function if exists public.get_booking_tracking(text);
create or replace function public.get_booking_tracking(p_booking_id text)
returns table (
  booking_code text,
  service text,
  booking_date date,
  booking_time time,
  status text,
  customer_lat double precision,
  customer_lng double precision,
  provider_lat double precision,
  provider_lng double precision
)
language sql
security definer
set search_path=public,pg_temp
as $
  select b.booking_code,b.service,b.booking_date,b.booking_time,b.status,
         b.customer_lat,b.customer_lng,b.provider_lat,b.provider_lng
  from public.bookings b
  where upper(btrim(p_booking_id))=upper(b.booking_code)
     or b.id::text=btrim(p_booking_id)
  limit 1;
$;
revoke all on function public.get_booking_tracking(text) from public;
grant execute on function public.get_booking_tracking(text) to anon,authenticated;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end; $$;
drop trigger if exists bookings_updated_at on public.bookings;
create trigger bookings_updated_at before update on public.bookings for each row execute function public.set_updated_at();

alter table public.bookings replica identity full;

update public.bookings set payment_status='unpaid' where payment_status is null or lower(btrim(payment_status)) not in ('unpaid','paid','failed','refunded');
alter table public.bookings drop constraint if exists bookings_payment_status_check;
alter table public.bookings drop constraint if exists bookings_payment_method_check;
alter table public.bookings add constraint bookings_payment_status_check check (payment_status in ('unpaid','paid','failed','refunded'));
alter table public.bookings add constraint bookings_payment_method_check check (payment_method in ('online','cash'));

create unique index if not exists bookings_razorpay_order_uidx on public.bookings(razorpay_order_id) where razorpay_order_id is not null;
create unique index if not exists bookings_razorpay_payment_uidx on public.bookings(razorpay_payment_id) where razorpay_payment_id is not null;


-- Customer <-> provider live chat
create table if not exists public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer','provider','admin')),
  sender_user_id uuid references auth.users(id) on delete set null,
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists booking_messages_booking_created_idx on public.booking_messages(booking_id,created_at);
alter table public.booking_messages enable row level security;
drop policy if exists "booking messages provider/admin read" on public.booking_messages;
drop policy if exists "booking messages provider/admin insert" on public.booking_messages;
create policy "booking messages provider/admin read" on public.booking_messages for select to authenticated using (
  exists(select 1 from public.app_admins a where a.user_id=(select auth.uid()))
  or exists(select 1 from public.providers p join public.bookings b on b.provider_id=p.id where b.id=booking_messages.booking_id and p.user_id=(select auth.uid()))
);
create policy "booking messages provider/admin insert" on public.booking_messages for insert to authenticated with check (
  sender_role in ('provider','admin') and sender_user_id=(select auth.uid())
  and (
    exists(select 1 from public.app_admins a where a.user_id=(select auth.uid()))
    or exists(select 1 from public.providers p join public.bookings b on b.provider_id=p.id where b.id=booking_messages.booking_id and p.user_id=(select auth.uid()))
  )
);
revoke all on public.booking_messages from anon;
revoke all on public.booking_messages from authenticated;
grant select,insert on public.booking_messages to authenticated;

create or replace function public.get_customer_chat(p_booking_code text,p_phone text)
returns table(id uuid,sender_role text,message text,created_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_booking_id uuid;
begin
 select id into v_booking_id from public.bookings
 where upper(btrim(booking_code))=upper(btrim(p_booking_code))
 and regexp_replace(coalesce(customer_phone,''),'\\D','','g')=regexp_replace(coalesce(p_phone,''),'\\D','','g')
 limit 1;
 if v_booking_id is null then raise exception 'Booking ID and mobile number do not match'; end if;
 return query select m.id,m.sender_role,m.message,m.created_at from public.booking_messages m
 where m.booking_id=v_booking_id order by m.created_at asc;
end; $$;
revoke all on function public.get_customer_chat(text,text) from public;
grant execute on function public.get_customer_chat(text,text) to anon,authenticated;

create or replace function public.send_customer_chat(p_booking_code text,p_phone text,p_message text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_booking_id uuid; v_message text:=btrim(p_message);
begin
 if char_length(v_message)<1 or char_length(v_message)>2000 then raise exception 'Message must be between 1 and 2000 characters'; end if;
 select id into v_booking_id from public.bookings
 where upper(btrim(booking_code))=upper(btrim(p_booking_code))
 and regexp_replace(coalesce(customer_phone,''),'\\D','','g')=regexp_replace(coalesce(p_phone,''),'\\D','','g')
 limit 1;
 if v_booking_id is null then raise exception 'Booking ID and mobile number do not match'; end if;
 insert into public.booking_messages(booking_id,sender_role,sender_user_id,message) values(v_booking_id,'customer',null,v_message);
 return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.send_customer_chat(text,text,text) from public;
grant execute on function public.send_customer_chat(text,text,text) to anon,authenticated;

do $$
begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='booking_messages') then
   alter publication supabase_realtime add table public.booking_messages;
 end if;
end $$;
