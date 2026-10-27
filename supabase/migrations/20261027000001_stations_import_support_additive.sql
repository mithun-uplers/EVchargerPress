-- Applied 2026-10-27
create extension if not exists postgis with schema extensions;
create extension if not exists http with schema extensions;

alter table public.stations
  add column data_source text not null default 'community' check (data_source in ('community','demo','openstreetmap')),
  add column external_id text,
  add column city_is_approx boolean not null default false,
  add column postal_code text,
  add column state text,
  add column source_tags jsonb,
  add column source_updated_at timestamptz,
  add column location extensions.geography(Point, 4326)
    generated always as (extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography) stored;

update public.stations set data_source = 'demo' where is_demo;

create unique index stations_source_external_uidx on public.stations (data_source, external_id);
create index stations_location_gix on public.stations using gist (location);
create index stations_postal_code_idx on public.stations (postal_code);
create index stations_lat_lng_idx on public.stations (lat, lng);

alter policy "add station" on public.stations
  with check ((select auth.uid()) = created_by and is_demo = false and data_source = 'community');

create or replace view public.station_summaries with (security_invoker = true) as
select s.id, s.name, s.address, s.city, s.lat, s.lng, s.operator, s.access, s.hours, s.price_info,
  s.is_demo, s.created_by, s.created_at,
  (select c.status from public.checkins c where c.station_id = s.id order by c.created_at desc limit 1) as last_status,
  (select c.created_at from public.checkins c where c.station_id = s.id order by c.created_at desc limit 1) as last_checkin_at,
  (select coalesce(max(k.power_kw),0) from public.connectors k where k.station_id = s.id) as max_power_kw,
  (select coalesce(array_agg(distinct k.type), '{}') from public.connectors k where k.station_id = s.id) as connector_types,
  s.city_is_approx, s.state, s.postal_code, s.data_source, s.external_id, s.source_updated_at
from public.stations s;

create or replace function public.nearby_stations(p_lat double precision, p_lng double precision, p_radius_km double precision default 25, p_limit int default 100)
returns table (id uuid, distance_km double precision)
language sql stable security invoker set search_path = '' as $$
  select s.id,
    extensions.st_distance(s.location, extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography) / 1000.0
  from public.stations s
  where extensions.st_dwithin(s.location, extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
                              least(greatest(p_radius_km, 1), 200) * 1000)
  order by 2
  limit least(greatest(p_limit, 1), 200);
$$;
grant execute on function public.nearby_stations(double precision, double precision, double precision, int) to anon, authenticated;
