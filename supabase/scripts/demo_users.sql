-- =====================================================================
-- Demo driver data for presentations (2026-11).
--
-- 1. Create the two accounts first (Admin → Users → Add a user, or sign up), e.g.
--      priya.demo@evchargepress.app   and   arjun.demo@evchargepress.app
-- 2. Run this whole file in the Supabase SQL Editor (it only adds data).
-- 3. Run:  select app.seed_demo_driver('priya.demo@evchargepress.app', 1);
--          select app.seed_demo_driver('arjun.demo@evchargepress.app', 2);
--
-- Everything created is clearly sample data: vehicles are nicknamed "Demo …",
-- sessions are manual entries at demo stations, the car link is the simulator.
-- Running it again for the same account does nothing.
-- =====================================================================

create or replace function app.seed_demo_driver(p_email text, p_persona int)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid; v1 uuid; v2 uuid; home_station uuid; st record; ev record; b public.bookings; trip_id uuid;
  tz text := 'Asia/Kolkata'; tomorrow date; slot timestamptz; n_sessions int := 0; i int;
  p_name text; p_phone text; home_name text; trip jsonb; trip_stops jsonb;
begin
  select id into uid from auth.users where lower(email) = lower(btrim(p_email));
  if uid is null then raise exception 'No account with email %. Create it first.', p_email; end if;
  if exists (select 1 from public.vehicles where user_id = uid and nickname like 'Demo %') then
    return jsonb_build_object('email', p_email, 'skipped', 'already seeded');
  end if;

  if p_persona = 1 then
    p_name := 'Priya Sharma (demo)'; p_phone := '+919800000101'; home_name := 'Demo Hub – Koramangala';
  else
    p_name := 'Arjun Mehta (demo)'; p_phone := '+919800000202'; home_name := 'Demo Mall Charger – Andheri';
  end if;
  select id into home_station from public.stations where name = home_name limit 1;
  if home_station is null then raise exception 'Demo station % not found (run supabase/seed.sql first).', home_name; end if;

  -- Act as the user for the functions that check auth.uid().
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);

  -- ---------- Vehicles ----------
  if p_persona = 1 then
    insert into public.vehicles (user_id, vehicle_type, make, model, model_year, nickname, registration_label, battery_capacity_kwh, max_ac_kw, max_dc_kw)
    values (uid, 'car', 'Tata', 'Nexon EV', 2024, 'Demo daily car', 'KA 01 •• 4821', 40.5, 7.2, 50) returning id into v1;
    insert into public.vehicle_connectors (vehicle_id, connector_type, supported_power_kw) values (v1, 'CCS2', 50), (v1, 'Type 2', 7.2);
  else
    insert into public.vehicles (user_id, vehicle_type, make, model, model_year, nickname, registration_label, battery_capacity_kwh, max_ac_kw, max_dc_kw)
    values (uid, 'car', 'MG', 'ZS EV', 2023, 'Demo family SUV', 'MH 02 •• 7316', 50.3, 7.4, 76) returning id into v1;
    insert into public.vehicle_connectors (vehicle_id, connector_type, supported_power_kw) values (v1, 'CCS2', 76), (v1, 'Type 2', 7.4);
    insert into public.vehicles (user_id, vehicle_type, make, model, model_year, nickname, registration_label, battery_capacity_kwh, max_ac_kw)
    values (uid, 'scooter', 'Ather', '450X', 2024, 'Demo scooter', 'MH 02 •• 1188', 3.7, 3.3) returning id into v2;
    insert into public.vehicle_connectors (vehicle_id, connector_type, supported_power_kw) values (v2, 'Type 2', 3.3);
  end if;

  update public.profiles set display_name = p_name, phone = p_phone, preferred_vehicle_id = v1,
         onboarded_at = coalesce(onboarded_at, now()), share_location = true
   where id = uid;

  -- ---------- Battery readings (manual) ----------
  for i in 0..5 loop
    insert into public.battery_readings (vehicle_id, recorded_at, soc_percent, odometer_km, source, notes)
    values (v1, now() - make_interval(days => 25 - i * 5), 35 + (i * 9) % 50, (case when p_persona = 1 then 12400 else 21800 end) + i * 180, 'manual', 'From the car dashboard');
  end loop;

  -- ---------- Past charging sessions (manual entries at demo stations) ----------
  for st in select s.id from public.stations s where s.data_source = 'demo' order by (s.id = home_station) desc, s.name limit 4 loop
    for i in 1..3 loop
      insert into public.charging_sessions (user_id, vehicle_id, station_id, started_at, ended_at, energy_kwh, total_cost_minor, currency, source, status, notes)
      values (uid, v1, st.id,
              date_trunc('day', now()) - make_interval(days => 9 + n_sessions * 13) + make_interval(hours => 8 + (n_sessions % 4) * 3),
              date_trunc('day', now()) - make_interval(days => 9 + n_sessions * 13) + make_interval(hours => 8 + (n_sessions % 4) * 3, mins => 35 + (n_sessions % 3) * 15),
              18 + (n_sessions % 5) * 4.2, (18 + (n_sessions % 5) * 4.2) * (1700 + (n_sessions % 3) * 150), 'INR', 'manual', 'completed', 'Demo entry from receipt');
      n_sessions := n_sessions + 1;
    end loop;
  end loop;
  if v2 is not null then
    insert into public.charging_sessions (user_id, vehicle_id, station_id, started_at, ended_at, energy_kwh, total_cost_minor, currency, source, status, notes)
    values (uid, v2, home_station, now() - interval '6 days', now() - interval '6 days' + interval '70 minutes', 2.9, 2900 * 12, 'INR', 'manual', 'completed', 'Demo entry from receipt');
    n_sessions := n_sessions + 1;
  end if;

  -- ---------- Upcoming confirmed booking (tomorrow ~10:00 at the home demo station) ----------
  tomorrow := (now() at time zone tz)::date + 1;
  select a.evse_id, a.slot_start into ev from public.get_availability(home_station, tomorrow, 60) a
   where (a.slot_start at time zone tz)::time >= time '10:00'
     and exists (select 1 from public.compatible_evses(v1, home_station) c where c.evse_id = a.evse_id)
   order by a.slot_start, a.evse_id limit 1;
  if ev.evse_id is not null then
    b := app.reserve(uid, ev.evse_id, v1, ev.slot_start, 60, 'demo-seed-' || uid::text);
    b := public.confirm_booking(b.id);
  end if;

  -- ---------- Connected car: the built-in simulator ----------
  perform public.start_vehicle_connection(v1, 'simulator');

  -- ---------- Saved trip ----------
  if p_persona = 1 then
    trip := jsonb_build_object('name', 'Weekend drive to Mysuru', 'vehicle_id', v1, 'from_label', 'Bengaluru, Karnataka', 'from_lat', 12.9716, 'from_lng', 77.5946,
      'to_label', 'Mysuru, Karnataka', 'to_lat', 12.2958, 'to_lng', 76.6394, 'distance_km', 145.2, 'duration_min', 190, 'route_source', 'straight_line',
      'route_geometry', jsonb_build_object('type', 'LineString', 'coordinates', jsonb_build_array(jsonb_build_array(77.5946, 12.9716), jsonb_build_array(77.12, 12.62), jsonb_build_array(76.6394, 12.2958))),
      'start_soc_percent', 80, 'reserve_percent', 15, 'consumption_kwh_per_100km', 14.5, 'battery_kwh', 40.5, 'feasible', true,
      'arrive_soc_percent', 28, 'charge_minutes', 0, 'energy_kwh', 0, 'notes', 'Demo trip: no charging stop needed');
  else
    trip := jsonb_build_object('name', 'Mumbai to Pune', 'vehicle_id', v1, 'from_label', 'Mumbai, Maharashtra', 'from_lat', 19.0760, 'from_lng', 72.8777,
      'to_label', 'Pune, Maharashtra', 'to_lat', 18.5204, 'to_lng', 73.8567, 'distance_km', 149.8, 'duration_min', 180, 'route_source', 'straight_line',
      'route_geometry', jsonb_build_object('type', 'LineString', 'coordinates', jsonb_build_array(jsonb_build_array(72.8777, 19.0760), jsonb_build_array(73.35, 18.75), jsonb_build_array(73.8567, 18.5204))),
      'start_soc_percent', 70, 'reserve_percent', 15, 'consumption_kwh_per_100km', 16.5, 'battery_kwh', 50.3, 'feasible', true,
      'arrive_soc_percent', 21, 'charge_minutes', 0, 'energy_kwh', 0, 'notes', 'Demo trip: Expressway, no stop needed');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'station_id', s.id, 'name', s.name, 'city', s.city, 'operator', s.operator, 'lat', s.lat, 'lng', s.lng,
           'connector_types', s.connector_types, 'max_power_kw', s.max_power_kw, 'is_bookable', s.is_bookable, 'is_compatible', s.connector_types && array['CCS2', 'Type 2'],
           'along_km', round(s.along_km::numeric, 1), 'detour_km', round(s.detour_km::numeric, 1)) order by s.along_km), '[]'::jsonb)
    into trip_stops
    from public.stations_along_route(trip->'route_geometry', 5, 60) s;
  select t.id into trip_id from public.save_trip(trip, trip_stops) t;

  -- ---------- Check-ins and a review ----------
  insert into public.checkins (station_id, user_id, status, comment, created_at)
  values (home_station, uid, 'working', 'Demo: all chargers working this morning', now() - interval '2 days'),
         (home_station, uid, 'busy', 'Demo: short queue after 6 pm', now() - interval '9 days');
  insert into public.reviews (user_id, station_id, rating, comment)
  values (uid, home_station, case when p_persona = 1 then 5 else 4 end, 'Demo review: easy to find, booking worked well.')
  on conflict (user_id, station_id) do nothing;

  return jsonb_build_object('email', p_email, 'vehicles', case when v2 is null then 1 else 2 end, 'sessions', n_sessions,
    'booking', b.reference, 'trip', trip_id, 'connected_car', true);
end $$;

revoke execute on function app.seed_demo_driver(text, int) from public;
