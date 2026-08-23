-- TherapyOnWay production database
-- Supabase project: xetthdpmvupfzvwdptlt
-- This file matches the current live app/database.

create extension if not exists pgcrypto;

-- Core tables already exist in production; these statements are safe to rerun.
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
alter table public.bookings add column if not exists customer_address text;
alter table public.bookings add column if not exists provider_lat double precision;
alter table public.bookings add column if not exists provider_lng double precision;
alter table public.bookings add column if not exists provider_id uuid;
alter table public.bookings add column if not exists status text default 'New';
alter table public.bookings add column if not exists notes text;
alter table public.bookings add column if not exists payment_method text default 'Pay after service';
alter table public.bookings add column if not exists payment_status text default 'Pending';
alter table public.bookings add column if not exists created_at timestamptz default now();
alter table public.bookings add column if not exists updated_at timestamptz default now();

-- Normalize legacy statuses and keep the workflow strict.
alter table public.bookings drop constraint if exists bookings_status_check;
update public.bookings set status=case
  when status is null or lower(btrim(status)) in ('pending','new') then 'New'
  when lower(btrim(status))='accepted' then 'Accepted'
  when lower(btrim(status)) in ('on the way','on_way','on-the-way','on the way.') then 'On the Way'
  when lower(btrim(status))='arrived' then 'Arrived'
  when lower(btrim(status)) in ('completed','complete') then 'Completed'
  else 'New' end;
alter table public.bookings add constraint bookings_status_check check(status in ('New','Accepted','On the Way','Arrived','Completed'));

update public.bookings set booking_code='TOW-'||upper(substr(replace(id::text,'-',''),1,10)) where booking_code is null or btrim(booking_code)='';
with ranked as (
  select id,booking_code,row_number() over(partition by booking_code order by created_at nulls last,id) rn
  from public.bookings where booking_code is not null and btrim(booking_code)<>''
)
update public.bookings b set booking_code='TOW-'||upper(substr(replace(b.id::text,'-',''),1,10))
from ranked r where b.id=r.id and r.rn>1;
create unique index if not exists bookings_booking_code_uidx on public.bookings(booking_code) where booking_code is not null;

-- Service catalogue.
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric default 0,
  duration_minutes integer default 60,
  is_active boolean default true,
  created_at timestamptz default now()
);
insert into public.services(name,description,price,duration_minutes,is_active) values
('Hand Massage','Relaxing hand and forearm massage at your location.',349,20,true),
('Head Massage','Relaxing head and scalp massage at your home.',499,30,true),
('Shoulder Massage','Focused shoulder and upper-back relaxation session.',549,30,true),
('Back Massage','Soothing back massage for muscle tension and stiffness.',699,45,true),
('Neck Massage','Focused neck relaxation for everyday stiffness and fatigue.',349,20,true),
('Full Body Massage','Professional full-body relaxation and wellness session.',999,60,true)
on conflict do nothing;

-- Provider/location/admin tables.
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
create unique index if not exists provider_locations_provider_uidx on public.provider_locations(provider_id);
create index if not exists provider_locations_provider_updated_idx on public.provider_locations(provider_id,updated_at desc);
create table if not exists public.app_admins(user_id uuid primary key references auth.users(id) on delete cascade,created_at timestamptz not null default now());

-- Current project accounts.
do $$ begin
  if exists(select 1 from auth.users where id='d9af623c-0eb5-42cd-b87a-c96bd86793fc'::uuid) then
    insert into public.app_admins(user_id) values('d9af623c-0eb5-42cd-b87a-c96bd86793fc') on conflict do nothing;
  end if;
  if exists(select 1 from auth.users where id='b4c970b1-d209-408f-9106-161c098f4d88'::uuid) then
    insert into public.providers(user_id,name,is_available,is_verified) values('b4c970b1-d209-408f-9106-161c098f4d88','Provider',true,true) on conflict(user_id) do update set is_available=true,is_verified=true;
  end if;
end $$;

-- RLS.
alter table public.bookings enable row level security;
alter table public.services enable row level security;
alter table public.providers enable row level security;
alter table public.provider_locations enable row level security;
alter table public.app_admins enable row level security;

drop policy if exists "public can create bookings" on public.bookings;
drop policy if exists "admin or provider can read bookings" on public.bookings;
drop policy if exists "admin or provider can update bookings" on public.bookings;
create policy "public can create bookings" on public.bookings for insert to anon,authenticated with check(
  coalesce(btrim(customer_name),'')<>'' and customer_phone ~ '^[0-9]{10}$' and service is not null and price is not null and price>=0 and booking_date is not null and booking_time is not null and customer_lat between -90 and 90 and customer_lng between -180 and 180
);
create policy "admin or provider can read bookings" on public.bookings for select to authenticated using(
  exists(select 1 from public.app_admins a where a.user_id=(select auth.uid()))
  or exists(select 1 from public.providers p where p.id=bookings.provider_id and p.user_id=(select auth.uid()))
  or (bookings.provider_id is null and bookings.status<>'Completed' and exists(select 1 from public.providers p where p.user_id=(select auth.uid()) and p.is_available=true))
);
create policy "admin or provider can update bookings" on public.bookings for update to authenticated using(
  exists(select 1 from public.app_admins a where a.user_id=(select auth.uid()))
  or exists(select 1 from public.providers p where p.id=bookings.provider_id and p.user_id=(select auth.uid()))
  or (bookings.provider_id is null and bookings.status<>'Completed' and exists(select 1 from public.providers p where p.user_id=(select auth.uid()) and p.is_available=true))
) with check(
  exists(select 1 from public.app_admins a where a.user_id=(select auth.uid()))
  or exists(select 1 from public.providers p where p.id=bookings.provider_id and p.user_id=(select auth.uid()))
);

drop policy if exists "Anyone can view active services" on public.services;
create policy "Anyone can view active services" on public.services for select to anon,authenticated using(is_active=true);

drop policy if exists "admin can manage providers" on public.providers;
drop policy if exists "admin can delete providers" on public.providers;
drop policy if exists "admin can update providers" on public.providers;
drop policy if exists "admin can read providers" on public.providers;
drop policy if exists "provider can view own profile" on public.providers;
create policy "admin can manage providers" on public.providers for all to authenticated using(exists(select 1 from public.app_admins a where a.user_id=(select auth.uid()))) with check(exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())));
create policy "provider can view own profile" on public.providers for select to authenticated using((select auth.uid())=user_id);

drop policy if exists "admin or own provider location insert" on public.provider_locations;
drop policy if exists "admin or own provider location read" on public.provider_locations;
drop policy if exists "admin or own provider location update" on public.provider_locations;
create policy "admin or own provider location read" on public.provider_locations for select to authenticated using(exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())) or exists(select 1 from public.providers p where p.id=provider_locations.provider_id and p.user_id=(select auth.uid())));
create policy "admin or own provider location insert" on public.provider_locations for insert to authenticated with check(exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())) or exists(select 1 from public.providers p where p.id=provider_locations.provider_id and p.user_id=(select auth.uid())));
create policy "admin or own provider location update" on public.provider_locations for update to authenticated using(exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())) or exists(select 1 from public.providers p where p.id=provider_locations.provider_id and p.user_id=(select auth.uid()))) with check(exists(select 1 from public.app_admins a where a.user_id=(select auth.uid())) or exists(select 1 from public.providers p where p.id=provider_locations.provider_id and p.user_id=(select auth.uid())));

create or replace function public.set_booking_defaults() returns trigger language plpgsql set search_path='' as $$ begin
  if new.booking_code is null or btrim(new.booking_code)='' then new.booking_code:='TOW-'||lpad((floor(random()*1000000))::int::text,6,'0'); end if;
  if new.payment_method is null or btrim(new.payment_method)='' then new.payment_method:='Pay after service'; end if;
  if new.payment_status is null or btrim(new.payment_status)='' then new.payment_status:='Pending'; end if;
  return new;
end; $$;
drop trigger if exists bookings_defaults on public.bookings;
create trigger bookings_defaults before insert on public.bookings for each row execute function public.set_booking_defaults();

create or replace function public.set_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists bookings_updated_at on public.bookings;
create trigger bookings_updated_at before update on public.bookings for each row execute function public.set_updated_at();

-- Public customer tracking is intentionally limited to booking status + provider coordinates.
create or replace function private.get_booking_tracking(p_booking_id text)
returns table(booking_code text,service text,booking_date date,booking_time time,status text,provider_lat double precision,provider_lng double precision)
language sql security definer set search_path='' as $$
  select b.booking_code,b.service,b.booking_date,b.booking_time,b.status,coalesce(pl.latitude,b.provider_lat),coalesce(pl.longitude,b.provider_lng)
  from public.bookings b left join lateral(select latitude,longitude from public.provider_locations where provider_id=b.provider_id order by updated_at desc limit 1) pl on true
  where upper(btrim(p_booking_id))=upper(b.booking_code) or b.id::text=btrim(p_booking_id) limit 1;
$$;
create or replace function public.get_booking_tracking(p_booking_id text) returns table(booking_code text,service text,booking_date date,booking_time time,status text,provider_lat double precision,provider_lng double precision)
language sql set search_path='' as $$ select * from private.get_booking_tracking(p_booking_id); $$;
revoke all on function public.get_booking_tracking(text) from public;
grant execute on function public.get_booking_tracking(text) to anon,authenticated;

-- Secure provider GPS update. Only an admin or the provider linked to the booking may write location.
create or replace function private.share_provider_location(p_booking_id uuid,p_lat double precision,p_lng double precision) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_provider_id uuid; v_is_admin boolean:=false;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_lat is null or p_lng is null or p_lat<-90 or p_lat>90 or p_lng<-180 or p_lng>180 then raise exception 'Invalid GPS coordinates'; end if;
  select provider_id into v_provider_id from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking not found'; end if;
  select exists(select 1 from public.app_admins where user_id=v_uid) into v_is_admin;
  if v_is_admin then
    if v_provider_id is null then select id into v_provider_id from public.providers where is_available=true order by created_at limit 1; end if;
  else
    select id into v_provider_id from public.providers where user_id=v_uid limit 1;
    if v_provider_id is null then raise exception 'Provider account is not configured'; end if;
    if exists(select 1 from public.bookings where id=p_booking_id and provider_id is not null and provider_id<>v_provider_id) then raise exception 'This booking is assigned to another provider'; end if;
  end if;
  if v_provider_id is null then raise exception 'No available provider is configured'; end if;
  update public.bookings set provider_id=v_provider_id,provider_lat=p_lat,provider_lng=p_lng,updated_at=now() where id=p_booking_id;
  insert into public.provider_locations(provider_id,latitude,longitude,updated_at) values(v_provider_id,p_lat,p_lng,now()) on conflict(provider_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,updated_at=excluded.updated_at;
  return jsonb_build_object('ok',true,'provider_id',v_provider_id,'latitude',p_lat,'longitude',p_lng);
end; $$;
create or replace function public.share_provider_location(p_booking_id uuid,p_lat double precision,p_lng double precision) returns jsonb language sql set search_path='' as $$ select private.share_provider_location(p_booking_id,p_lat,p_lng); $$;
revoke all on function public.share_provider_location(uuid,double precision,double precision) from public,anon;
grant execute on function public.share_provider_location(uuid,double precision,double precision) to authenticated;

-- Data API grants.
grant select on public.services to anon,authenticated;
grant insert on public.bookings to anon,authenticated;
grant select,update on public.bookings to authenticated;
grant select,insert,update,delete on public.providers to authenticated;
grant select,insert,update on public.provider_locations to authenticated;
grant select on public.app_admins to authenticated;

alter table public.bookings replica identity full;
