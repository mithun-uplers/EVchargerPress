-- Saved trips (route + every charging station along it) and connected vehicles
-- (Smartcar or the built-in simulated car) with labelled telemetry. Additive only.

-- =========================================================================
-- Saved trips
-- =========================================================================
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  from_label text not null check (char_length(from_label) <= 200),
  from_lat double precision not null check (from_lat between -90 and 90),
  from_lng double precision not null check (from_lng between -180 and 180),
  to_label text not null check (char_length(to_label) <= 200),
  to_lat double precision not null check (to_lat between -90 and 90),
  to_lng double precision not null check (to_lng between -180 and 180),
  distance_km numeric(8,1) not null check (distance_km > 0),
  duration_min int check (duration_min >= 0),
  route_source text not null check (route_source in ('osrm', 'straight_line')),
  route_geometry jsonb not null,            -- GeoJSON LineString (thinned)
  start_soc_percent numeric(5,2) not null check (start_soc_percent between 0 and 100),
  reserve_percent numeric(5,2) not null check (reserve_percent between 0 and 100),
  consumption_kwh_per_100km numeric(5,2) not null check (consumption_kwh_per_100km > 0),
  battery_kwh numeric(6,2) not null check (battery_kwh > 0),
  feasible boolean not null,
  arrive_soc_percent numeric(5,2),
  charge_minutes int,
  energy_kwh numeric(8,2),
  gap_from_km numeric(8,1),                 -- set when no plan reaches the destination
  gap_to_km numeric(8,1),
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index trips_user_idx on public.trips (user_id, created_at desc);

-- Every station found along the route at planning time; planned stops are flagged with their order.
-- Station details are snapshotted so the trip still reads correctly if station data changes later.
create table public.trip_stations (
  id bigint generated always as identity primary key,
  trip_id uuid not null references public.trips(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  name text not null,
  city text,
  operator text,
  lat double precision not null,
  lng double precision not null,
  connector_types text[] not null default '{}',
  max_power_kw numeric(6,1),
  is_bookable boolean not null default false,
  is_compatible boolean not null default false,
  along_km numeric(8,1) not null,
  detour_km numeric(6,1) not null,
  stop_order int check (stop_order between 1 and 20),     -- null = not a planned stop
  arrive_soc_percent numeric(5,2),
  depart_soc_percent numeric(5,2),
  energy_kwh numeric(7,2),
  power_kw numeric(6,1),
  charge_minutes int,
  unique (trip_id, stop_order)
);
create index trip_stations_trip_idx on public.trip_stations (trip_id, along_km);

-- Saves a trip and its stations in one transaction (runs with the caller's rights; RLS applies).
create or replace function public.save_trip(p_trip jsonb, p_stations jsonb)
returns public.trips language plpgsql volatile security invoker set search_path = '' as $$
declare t public.trips; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'EVB01', detail = 'Sign in first.'; end if;
  if jsonb_typeof(p_stations) <> 'array' or jsonb_array_length(p_stations) > 500 then
    raise exception 'invalid_request' using errcode = 'EVB15', detail = 'Too many stations.';
  end if;
  if (select count(*) from public.trips where user_id = uid) >= 200 then
    raise exception 'too_many' using errcode = 'EVB09', detail = 'You can keep up to 200 saved trips. Delete some first.';
  end if;
  insert into public.trips (user_id, vehicle_id, name, from_label, from_lat, from_lng, to_label, to_lat, to_lng, distance_km, duration_min,
                            route_source, route_geometry, start_soc_percent, reserve_percent, consumption_kwh_per_100km, battery_kwh,
                            feasible, arrive_soc_percent, charge_minutes, energy_kwh, gap_from_km, gap_to_km, notes)
  values (uid, nullif(p_trip->>'vehicle_id', '')::uuid, btrim(p_trip->>'name'), p_trip->>'from_label', (p_trip->>'from_lat')::float8, (p_trip->>'from_lng')::float8,
          p_trip->>'to_label', (p_trip->>'to_lat')::float8, (p_trip->>'to_lng')::float8, (p_trip->>'distance_km')::numeric, (p_trip->>'duration_min')::int,
          p_trip->>'route_source', p_trip->'route_geometry', (p_trip->>'start_soc_percent')::numeric, (p_trip->>'reserve_percent')::numeric,
          (p_trip->>'consumption_kwh_per_100km')::numeric, (p_trip->>'battery_kwh')::numeric, (p_trip->>'feasible')::boolean,
          (p_trip->>'arrive_soc_percent')::numeric, (p_trip->>'charge_minutes')::int, (p_trip->>'energy_kwh')::numeric,
          (p_trip->>'gap_from_km')::numeric, (p_trip->>'gap_to_km')::numeric, nullif(btrim(p_trip->>'notes'), ''))
  returning * into t;
  insert into public.trip_stations (trip_id, station_id, name, city, operator, lat, lng, connector_types, max_power_kw, is_bookable, is_compatible,
                                    along_km, detour_km, stop_order, arrive_soc_percent, depart_soc_percent, energy_kwh, power_kw, charge_minutes)
  select t.id, (x->>'station_id')::uuid, left(x->>'name', 200), x->>'city', x->>'operator', (x->>'lat')::float8, (x->>'lng')::float8,
         coalesce((select array_agg(c) from jsonb_array_elements_text(x->'connector_types') c), '{}'),
         (x->>'max_power_kw')::numeric, coalesce((x->>'is_bookable')::boolean, false), coalesce((x->>'is_compatible')::boolean, false),
         (x->>'along_km')::numeric, (x->>'detour_km')::numeric, (x->>'stop_order')::int, (x->>'arrive_soc_percent')::numeric,
         (x->>'depart_soc_percent')::numeric, (x->>'energy_kwh')::numeric, (x->>'power_kw')::numeric, (x->>'charge_minutes')::int
  from jsonb_array_elements(p_stations) as s(x);
  return t;
end $$;

alter table public.trips enable row level security;
alter table public.trip_stations enable row level security;
create policy "own trips readable" on public.trips for select to authenticated using (user_id = (select auth.uid()));
create policy "add own trip" on public.trips for insert to authenticated with check (user_id = (select auth.uid()));
create policy "edit own trip" on public.trips for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "remove own trip" on public.trips for delete to authenticated using (user_id = (select auth.uid()));
create policy "own trip stations readable" on public.trip_stations for select to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())));
create policy "add own trip stations" on public.trip_stations for insert to authenticated
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = (select auth.uid())));

-- =========================================================================
-- Connected vehicles
-- =========================================================================
create table public.vehicle_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  provider text not null check (provider in ('smartcar', 'simulator')),
  mode text not null default 'live' check (mode in ('live', 'simulated')),
  status text not null default 'pending' check (status in ('pending', 'active', 'error', 'revoked')),
  provider_user_id text check (char_length(provider_user_id) <= 100),
  provider_vehicle_id text check (char_length(provider_vehicle_id) <= 100),
  provider_make text, provider_model text, provider_year int,
  state_nonce text,                       -- OAuth state while pending (never exposed after completion)
  state_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index vehicle_connections_one_active_idx on public.vehicle_connections (vehicle_id) where status in ('pending', 'active', 'error');
create index vehicle_connections_user_idx on public.vehicle_connections (user_id);

-- Readings from a connected vehicle. Never edited by users; source and simulation flag always stored.
create table public.vehicle_telemetry (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  connection_id uuid not null references public.vehicle_connections(id) on delete cascade,
  recorded_at timestamptz not null,
  soc_percent numeric(5,2) check (soc_percent between 0 and 100),
  range_km numeric(7,1) check (range_km >= 0),
  odometer_km numeric(9,1) check (odometer_km >= 0),
  is_charging boolean,
  is_plugged_in boolean,
  charge_power_kw numeric(7,2),
  charge_limit_percent numeric(5,2) check (charge_limit_percent between 0 and 100),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  source text not null check (source in ('smartcar', 'simulator')),
  is_simulated boolean not null default false,
  created_at timestamptz not null default now()
);
create index vehicle_telemetry_vehicle_idx on public.vehicle_telemetry (vehicle_id, recorded_at desc);

alter table public.battery_readings
  add column if not exists is_simulated boolean not null default false,
  add column if not exists connection_id uuid references public.vehicle_connections(id) on delete set null;

-- Secrets shared with the app server (stored hashed). No API access.
create table if not exists app.integration_keys (
  name text primary key,
  key_hash text not null,
  created_at timestamptz not null default now()
);

create or replace function app.set_integration_key(p_name text, p_key text) returns void
language sql volatile security definer set search_path = '' as $$
  insert into app.integration_keys (name, key_hash) values (p_name, extensions.crypt(p_key, extensions.gen_salt('bf', 10)))
  on conflict (name) do update set key_hash = excluded.key_hash, created_at = now();
$$;

create or replace function app.check_integration_key(p_name text, p_key text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare h text;
begin
  select key_hash into h from app.integration_keys where name = p_name;
  if h is null or p_key is null or h <> extensions.crypt(p_key, h) then
    raise exception 'invalid_credentials' using errcode = '28000', detail = 'Invalid integration key.';
  end if;
end $$;

-- Stores a reading (and mirrors battery % / odometer into battery_readings so existing charts include it).
create or replace function app.record_telemetry(c public.vehicle_connections, r jsonb, p_source text, p_simulated boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare t timestamptz := coalesce(app.ocpp_time(r->>'recorded_at', app.now()), app.now()); soc numeric; odo numeric;
begin
  soc := (r->>'soc_percent')::numeric;
  odo := (r->>'odometer_km')::numeric;
  if soc is not null and (soc < 0 or soc > 100) then soc := null; end if;
  if odo is not null and odo < 0 then odo := null; end if;
  insert into public.vehicle_telemetry (vehicle_id, connection_id, recorded_at, soc_percent, range_km, odometer_km, is_charging, is_plugged_in,
                                        charge_power_kw, charge_limit_percent, latitude, longitude, source, is_simulated)
  values (c.vehicle_id, c.id, t, soc, (r->>'range_km')::numeric, odo, (r->>'is_charging')::boolean, (r->>'is_plugged_in')::boolean,
          (r->>'charge_power_kw')::numeric, (r->>'charge_limit_percent')::numeric, (r->>'latitude')::float8, (r->>'longitude')::float8,
          p_source, p_simulated);
  if soc is not null or odo is not null then
    insert into public.battery_readings (vehicle_id, recorded_at, soc_percent, odometer_km, source, notes, is_simulated, connection_id)
    values (c.vehicle_id, t, soc, odo, 'vehicle_api', case when p_simulated then 'Simulated car' else initcap(p_source) end, p_simulated, c.id);
  end if;
  update public.vehicle_connections set last_synced_at = t, status = 'active', last_error = null, updated_at = app.now() where id = c.id;
end $$;

-- ---------- Driver API ----------------------------------------------------
-- Starts connecting a vehicle. Smartcar: returns a pending connection whose state_nonce goes into the Connect URL.
-- Simulator: active immediately, with a first reading.
create or replace function public.start_vehicle_connection(p_vehicle_id uuid, p_provider text, p_mode text default 'live')
returns public.vehicle_connections language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v public.vehicles; c public.vehicle_connections; last_soc numeric; last_odo numeric;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'EVB01', detail = 'Sign in first.'; end if;
  select * into v from public.vehicles where id = p_vehicle_id and user_id = uid and deleted_at is null;
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'Vehicle not found.'; end if;
  if p_provider not in ('smartcar', 'simulator') or p_mode not in ('live', 'simulated') then
    raise exception 'invalid_request' using errcode = 'EVB15', detail = 'Unknown connection type.';
  end if;
  -- Replace any earlier pending/failed attempt; an active connection must be disconnected first.
  if exists (select 1 from public.vehicle_connections x where x.vehicle_id = v.id and x.status = 'active') then
    raise exception 'already_connected' using errcode = 'EVB22', detail = 'This vehicle is already connected. Disconnect it first.';
  end if;
  update public.vehicle_connections set status = 'revoked', state_nonce = null, updated_at = app.now()
   where vehicle_id = v.id and status in ('pending', 'error');
  insert into public.vehicle_connections (user_id, vehicle_id, provider, mode, status, state_nonce, state_expires_at)
  values (uid, v.id, p_provider, case when p_provider = 'simulator' then 'simulated' else p_mode end,
          case when p_provider = 'simulator' then 'active' else 'pending' end,
          case when p_provider = 'smartcar' then encode(extensions.gen_random_bytes(18), 'hex') end,
          case when p_provider = 'smartcar' then app.now() + interval '30 minutes' end)
  returning * into c;
  if p_provider = 'simulator' then
    select br.soc_percent, br.odometer_km into last_soc, last_odo from public.battery_readings br
     where br.vehicle_id = v.id order by br.recorded_at desc limit 1;
    perform app.record_telemetry(c, jsonb_build_object('soc_percent', coalesce(last_soc, 62), 'odometer_km', coalesce(last_odo, 12000),
      'range_km', round(coalesce(last_soc, 62) / 100.0 * coalesce(v.battery_capacity_kwh, 40) / 0.15, 0), 'is_charging', false, 'is_plugged_in', false,
      'latitude', 12.9352, 'longitude', 77.6245), 'simulator', true);
    select * into c from public.vehicle_connections where id = c.id;
  end if;
  return c;
end $$;

-- Completes a Smartcar connection after the Connect redirect (state must match and not be expired).
create or replace function public.complete_vehicle_connection(p_state text, p_provider_user_id text)
returns public.vehicle_connections language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); c public.vehicle_connections;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'EVB01', detail = 'Sign in first.'; end if;
  select * into c from public.vehicle_connections
   where state_nonce = p_state and user_id = uid and status = 'pending' and state_expires_at > app.now() for update;
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'This connection link expired. Please try connecting again.'; end if;
  if p_provider_user_id is null or p_provider_user_id !~ '^[A-Za-z0-9._-]{1,100}$' then
    raise exception 'invalid_request' using errcode = 'EVB15', detail = 'The car provider didn’t return an account.';
  end if;
  update public.vehicle_connections set provider_user_id = p_provider_user_id, status = 'active', state_nonce = null, state_expires_at = null,
         updated_at = app.now()
   where id = c.id returning * into c;
  return c;
end $$;

create or replace function public.disconnect_vehicle(p_connection_id uuid)
returns public.vehicle_connections language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); c public.vehicle_connections;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'EVB01', detail = 'Sign in first.'; end if;
  update public.vehicle_connections set status = 'revoked', state_nonce = null, updated_at = app.now()
   where id = p_connection_id and user_id = uid and status <> 'revoked' returning * into c;
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'Connection not found.'; end if;
  return c;
end $$;

-- ---------- App-server API (Smartcar sync) ----------------------------------
-- The server reads Smartcar with its own credentials and stores what it got here; it authenticates with
-- an integration key (hashed in app.integration_keys), so drivers can't write "vehicle" data themselves.
create or replace function public.ingest_vehicle_telemetry(p_key text, p_connection_id uuid, p_reading jsonb, p_vehicle jsonb default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare c public.vehicle_connections;
begin
  perform app.check_integration_key('vehicle_ingest', p_key);
  select * into c from public.vehicle_connections where id = p_connection_id and status in ('active', 'error') and provider = 'smartcar';
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'Connection not found.'; end if;
  if p_vehicle is not null then
    update public.vehicle_connections
       set provider_vehicle_id = coalesce(left(p_vehicle->>'id', 100), provider_vehicle_id),
           provider_make = coalesce(left(p_vehicle->>'make', 40), provider_make),
           provider_model = coalesce(left(p_vehicle->>'model', 60), provider_model),
           provider_year = coalesce((p_vehicle->>'year')::int, provider_year)
     where id = c.id returning * into c;
  end if;
  if p_reading is not null then perform app.record_telemetry(c, p_reading, 'smartcar', c.mode = 'simulated'); end if;
end $$;

create or replace function public.report_vehicle_sync_error(p_key text, p_connection_id uuid, p_error text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.check_integration_key('vehicle_ingest', p_key);
  update public.vehicle_connections set status = 'error', last_error = left(p_error, 300), updated_at = app.now()
   where id = p_connection_id and status = 'active';
end $$;

-- Lets the server look up what it needs to sync one of the caller's connections (no secrets inside).
create or replace function public.vehicle_connection_for_sync(p_key text, p_connection_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.vehicle_connections;
begin
  perform app.check_integration_key('vehicle_ingest', p_key);
  select * into c from public.vehicle_connections where id = p_connection_id;
  if not found then return null; end if;
  return jsonb_build_object('id', c.id, 'user_id', c.user_id, 'vehicle_id', c.vehicle_id, 'provider', c.provider, 'mode', c.mode, 'status', c.status,
                            'provider_user_id', c.provider_user_id, 'provider_vehicle_id', c.provider_vehicle_id, 'last_synced_at', c.last_synced_at);
end $$;

-- ---------- Simulated car ---------------------------------------------------
-- Every 5 minutes (pg_cron): parked cars lose a little charge, driving adds km, and a car on a live
-- charging session follows the charger's battery %. Every value is flagged as simulated.
create or replace function app.vehicle_sim_tick() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare c public.vehicle_connections; last public.vehicle_telemetry; v public.vehicles; ses record; n int := 0;
  soc numeric; odo numeric; drove numeric; hr int; bat numeric;
begin
  for c in select * from public.vehicle_connections where provider = 'simulator' and status = 'active' loop
    select * into last from public.vehicle_telemetry t where t.connection_id = c.id order by recorded_at desc limit 1;
    if last.id is not null and last.recorded_at > app.now() - interval '4 minutes' then continue; end if;
    select * into v from public.vehicles where id = c.vehicle_id;
    bat := coalesce(v.battery_capacity_kwh, 40);
    soc := coalesce(last.soc_percent, 62);
    odo := coalesce(last.odometer_km, 12000);
    select cs.last_soc_percent, cs.last_power_kw into ses from public.charging_sessions cs
     where cs.vehicle_id = c.vehicle_id and cs.status = 'in_progress' and cs.last_soc_percent is not null order by cs.started_at desc limit 1;
    if ses.last_soc_percent is not null then
      perform app.record_telemetry(c, jsonb_build_object('soc_percent', ses.last_soc_percent, 'odometer_km', odo,
        'range_km', round(ses.last_soc_percent / 100.0 * bat / 0.15, 0), 'is_charging', true, 'is_plugged_in', true,
        'charge_power_kw', ses.last_power_kw, 'charge_limit_percent', 100, 'latitude', last.latitude, 'longitude', last.longitude), 'simulator', true);
    else
      hr := extract(hour from app.now() at time zone 'Asia/Kolkata')::int;
      -- Deterministic "driving" in the morning and evening commute windows, parked otherwise.
      drove := case when hr in (8, 9, 18, 19) and soc > 15 then 3.5 else 0 end;
      soc := greatest(5, soc - drove * 0.15 / bat * 100 - 0.02);
      odo := odo + drove;
      perform app.record_telemetry(c, jsonb_build_object('soc_percent', round(soc, 1), 'odometer_km', round(odo, 1),
        'range_km', round(soc / 100.0 * bat / 0.15, 0), 'is_charging', false, 'is_plugged_in', false,
        'latitude', coalesce(last.latitude, 12.9352) + case when drove > 0 then 0.004 else 0 end,
        'longitude', coalesce(last.longitude, 77.6245) + case when drove > 0 then 0.003 else 0 end), 'simulator', true);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------- Row level security ------------------------------------------------
alter table public.vehicle_connections enable row level security;
alter table public.vehicle_telemetry enable row level security;

create policy "own vehicle connections readable" on public.vehicle_connections for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own vehicle telemetry readable" on public.vehicle_telemetry for select to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = (select auth.uid())));

-- A view without the OAuth state for the app to read.
create or replace view public.my_vehicle_connections with (security_invoker = true) as
select id, vehicle_id, provider, mode, status, provider_make, provider_model, provider_year, provider_vehicle_id is not null as has_vehicle,
       last_synced_at, last_error, created_at
from public.vehicle_connections;
