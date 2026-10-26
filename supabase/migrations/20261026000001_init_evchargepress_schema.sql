-- Applied to project igvdjixjrqmrfzrvsqps on 2026-10-26
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  address text not null,
  city text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  operator text,
  access text not null default 'public' check (access in ('public','restricted')),
  hours text,
  price_info text,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index stations_city_idx on public.stations (lower(city));
create index stations_created_by_idx on public.stations (created_by);

create table public.connectors (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  type text not null check (type in ('CCS2','CHAdeMO','Type 2','Type 1','GB/T','NACS','Bharat AC-001','Bharat DC-001','15A Socket')),
  power_kw numeric(6,1) not null check (power_kw > 0),
  quantity int not null default 1 check (quantity > 0)
);
create index connectors_station_idx on public.connectors (station_id);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('working','broken','busy')),
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now()
);
create index checkins_station_created_idx on public.checkins (station_id, created_at desc);
create index checkins_user_idx on public.checkins (user_id);

create view public.station_summaries with (security_invoker = true) as
select s.*,
  (select c.status from public.checkins c where c.station_id = s.id order by c.created_at desc limit 1) as last_status,
  (select c.created_at from public.checkins c where c.station_id = s.id order by c.created_at desc limit 1) as last_checkin_at,
  (select coalesce(max(k.power_kw),0) from public.connectors k where k.station_id = s.id) as max_power_kw,
  (select coalesce(array_agg(distinct k.type), '{}') from public.connectors k where k.station_id = s.id) as connector_types
from public.stations s;

alter table public.profiles enable row level security;
alter table public.stations enable row level security;
alter table public.connectors enable row level security;
alter table public.checkins enable row level security;

create policy "profiles readable" on public.profiles for select using (true);
create policy "update own profile" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "stations readable" on public.stations for select using (true);
create policy "add station" on public.stations for insert to authenticated
  with check ((select auth.uid()) = created_by and is_demo = false);
create policy "edit own station" on public.stations for update to authenticated
  using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);
create policy "delete own station" on public.stations for delete to authenticated
  using ((select auth.uid()) = created_by);
create policy "connectors readable" on public.connectors for select using (true);
create policy "manage connectors of own station" on public.connectors for all to authenticated
  using (exists (select 1 from public.stations s where s.id = station_id and s.created_by = (select auth.uid())))
  with check (exists (select 1 from public.stations s where s.id = station_id and s.created_by = (select auth.uid())));
create policy "checkins readable" on public.checkins for select using (true);
create policy "add own checkin" on public.checkins for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "delete own checkin" on public.checkins for delete to authenticated
  using ((select auth.uid()) = user_id);
