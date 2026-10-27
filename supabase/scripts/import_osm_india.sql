-- Import EV charging stations in India from OpenStreetMap (ODbL, © OpenStreetMap contributors).
-- Run in the Supabase SQL editor. Safe to re-run: existing OSM stations are skipped (unique data_source + external_id).
-- Requires the `http` and `postgis` extensions (enabled by migration 20261027000001).
-- First run on 2026-10-28: 611 stations, 47 connector rows.

create schema if not exists import;
revoke all on schema import from anon, authenticated;
create table if not exists import.osm_raw (id serial primary key, kind text, fetched_at timestamptz default now(), status int, body jsonb);

select extensions.http_set_curlopt('CURLOPT_TIMEOUT', '170');

-- 1. Charging stations
insert into import.osm_raw (kind, status, body)
select 'chargers', status, content::jsonb
from extensions.http_get('https://overpass-api.de/api/interpreter?data=' || extensions.urlencode(
  '[out:json][timeout:160];area["ISO3166-1"="IN"][admin_level=2]->.in;nwr["amenity"="charging_station"](area.in);out center tags;'));

-- 2. Cities and towns (used to label stations that have no address with their nearest town)
insert into import.osm_raw (kind, status, body)
select 'places_geo', status, content::jsonb
from extensions.http_get('https://overpass-api.de/api/interpreter?data=' || extensions.urlencode(
  '[out:json][timeout:160];area["ISO3166-1"="IN"][admin_level=2]->.in;node["place"~"^(city|town)$"](area.in);out body;'));

-- 3. Latest fetch only
create temp table latest as
select distinct on (kind) id, kind from import.osm_raw where status = 200 order by kind, id desc;

create temp table places as
select coalesce(e->'tags'->>'name:en', e->'tags'->>'name') as name,
  extensions.st_setsrid(extensions.st_makepoint((e->>'lon')::float8, (e->>'lat')::float8),4326)::extensions.geography as geog
from import.osm_raw r join latest l on l.id = r.id and l.kind = 'places_geo', jsonb_array_elements(r.body->'elements') e
where e ? 'lat';
create index on places using gist (geog);

create temp table chargers as
with base as (
  select (e->>'type') || '/' || (e->>'id') as external_id,
    coalesce((e->>'lat')::float8, (e->'center'->>'lat')::float8) as lat,
    coalesce((e->>'lon')::float8, (e->'center'->>'lon')::float8) as lng,
    e->'tags' as t, (r.body->'osm3s'->>'timestamp_osm_base')::timestamptz as osm_ts
  from import.osm_raw r join latest l on l.id = r.id and l.kind = 'chargers', jsonb_array_elements(r.body->'elements') e
)
select external_id, lat, lng, t, osm_ts,
  coalesce(nullif(t->>'name:en',''), nullif(t->>'name',''),
           nullif(coalesce(t->>'brand', t->>'operator', t->>'network'),'') || ' charging station',
           'Unnamed charging station') as name,
  nullif(coalesce(t->>'operator', t->>'brand', t->>'network'),'') as operator,
  nullif(coalesce(t->>'addr:full',
    nullif(concat_ws(', ', nullif(concat_ws(' ', t->>'addr:housenumber', t->>'addr:street'),''), t->>'addr:place', t->>'addr:suburb'),'')),'') as address,
  nullif(coalesce(t->>'addr:city', t->>'addr:district'),'') as city,
  case when t->>'addr:postcode' ~ '^\d{6}$' then t->>'addr:postcode' end as postal_code,
  nullif(t->>'addr:state','') as state,
  case when t->>'access' in ('private','customers','permit','no','permissive') then 'restricted' else 'public' end as access,
  nullif(t->>'opening_hours','') as hours,
  case when nullif(t->>'charge','') is not null then t->>'charge'
       when t->>'fee' = 'no' then 'Free (as listed on OpenStreetMap)' end as price_info
from base where lat is not null and lng is not null;

-- 4. Stations
insert into public.stations (name, address, city, city_is_approx, postal_code, state, lat, lng, operator, access, hours, price_info,
  is_demo, data_source, external_id, source_tags, source_updated_at)
select left(c.name, 120), c.address, coalesce(c.city, np.name), (c.city is null and np.name is not null),
  c.postal_code, c.state, c.lat, c.lng, c.operator, c.access, c.hours, c.price_info,
  false, 'openstreetmap', c.external_id, c.t, c.osm_ts
from chargers c
left join lateral (
  select p.name from places p
  where p.name is not null
    and extensions.st_dwithin(p.geog, extensions.st_setsrid(extensions.st_makepoint(c.lng, c.lat),4326)::extensions.geography, 30000)
  order by p.geog operator(extensions.<->) extensions.st_setsrid(extensions.st_makepoint(c.lng, c.lat),4326)::extensions.geography
  limit 1
) np on true
where char_length(left(c.name,120)) >= 2
on conflict (data_source, external_id) do nothing;

-- 5. Connectors from socket:* tags (only for stations that have none yet)
with sockets as (
  select s.id as station_id, substring(k.key from '^socket:([a-z0-9_]+)$') as sock, k.value as qty_raw,
         s.source_tags->>(k.key || ':output') as out_raw
  from public.stations s, jsonb_each_text(s.source_tags) k
  where s.data_source = 'openstreetmap' and k.key ~ '^socket:[a-z0-9_]+$'
    and not exists (select 1 from public.connectors x where x.station_id = s.id)
), mapped as (
  select station_id,
    case sock when 'type2_combo' then 'CCS2' when 'type2' then 'Type 2' when 'type2_cable' then 'Type 2'
              when 'chademo' then 'CHAdeMO' when 'type1' then 'Type 1' when 'type1_combo' then 'CCS1'
              when 'gb_dc' then 'GB/T' when 'gb_ac' then 'GB/T' when 'nacs' then 'NACS'
              when 'bs546' then '15A Socket' else 'Other' end as type,
    case when qty_raw ~ '^\d+$' and qty_raw::int between 1 and 50 then qty_raw::int else 1 end as quantity,
    case when out_raw ~* '^\s*\d+(\.\d+)?\s*kw' then substring(out_raw from '(\d+(?:\.\d+)?)')::numeric
         when out_raw ~* '^\s*\d+\s*w\s*$' then substring(out_raw from '(\d+)')::numeric / 1000 end as power_kw
  from sockets where qty_raw <> 'no'
)
insert into public.connectors (station_id, type, power_kw, quantity)
select station_id, type, case when power_kw > 0 and power_kw < 2000 then round(power_kw,1) end, sum(quantity)::int
from mapped group by station_id, type, power_kw;

select count(*) as openstreetmap_stations from public.stations where data_source = 'openstreetmap';
