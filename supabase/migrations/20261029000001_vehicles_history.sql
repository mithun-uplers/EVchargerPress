-- =====================================================================
-- Vehicles, vehicle-aware booking, charging history, battery readings,
-- profile preferences, and schema for payments, reviews, notifications.
-- 2026-10-28. Additive only.
-- =====================================================================
-- New error codes: EVB17 incompatible_vehicle, EVB18 vehicle_in_use

-- ---------- Profile: account, preferences, privacy ---------------------
alter table public.profiles
  add column if not exists phone text check (phone ~ '^\+?[0-9]{8,15}$'),
  add column if not exists status text not null default 'active'
    check (status in ('active', 'suspended', 'deletion_requested')),
  add column if not exists distance_unit text not null default 'km' check (distance_unit in ('km', 'mi')),
  add column if not exists share_location boolean not null default false,
  add column if not exists email_reminders boolean not null default true,
  add column if not exists onboarded_at timestamptz,
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

-- ---------- Vehicles ----------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_type text not null check (vehicle_type in ('car', 'motorcycle', 'scooter', 'bicycle', 'other')),
  make text not null check (char_length(make) between 1 and 60),
  model text not null check (char_length(model) between 1 and 60),
  model_year int check (model_year between 1990 and 2100),
  nickname text check (char_length(nickname) <= 40),
  registration_label text check (char_length(registration_label) <= 20),
  battery_capacity_kwh numeric(6,1) check (battery_capacity_kwh > 0 and battery_capacity_kwh <= 300),
  max_ac_kw numeric(5,1) check (max_ac_kw > 0 and max_ac_kw <= 50),
  max_dc_kw numeric(6,1) check (max_dc_kw > 0 and max_dc_kw <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz          -- soft removal keeps booking and session history intact
);
create index vehicles_user_idx on public.vehicles (user_id) where deleted_at is null;

-- Which connector standards the vehicle can use (inlet or supplied adapter cable).
-- Kept separate from vehicle_type: a scooter is not automatically compatible with anything.
create table public.vehicle_connectors (
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  connector_type text not null check (connector_type in
    ('CCS2','CCS1','CHAdeMO','Type 2','Type 1','GB/T','NACS','Bharat AC-001','Bharat DC-001','15A Socket','Other')),
  supported_power_kw numeric(6,1) check (supported_power_kw > 0 and supported_power_kw <= 1000),
  primary key (vehicle_id, connector_type)
);

alter table public.profiles
  add column if not exists preferred_vehicle_id uuid references public.vehicles(id) on delete set null;
create index if not exists profiles_preferred_vehicle_idx on public.profiles (preferred_vehicle_id);

-- ---------- Bookings remember the vehicle ------------------------------
alter table public.bookings add column if not exists vehicle_id uuid references public.vehicles(id) on delete restrict;
create index if not exists bookings_vehicle_idx on public.bookings (vehicle_id);

-- ---------- Charging sessions (separate from bookings) -----------------
-- A booking is a reservation; a session is evidence that charging happened.
-- source says where the record came from — manual entries are never shown as telemetry.
create table public.charging_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  station_id uuid references public.stations(id) on delete set null,
  evse_id uuid references public.evses(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  energy_kwh numeric(8,3) check (energy_kwh >= 0 and energy_kwh <= 1000),
  total_cost_minor int check (total_cost_minor >= 0),
  currency char(3) not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  source text not null check (source in ('manual', 'operator_api', 'charger_ocpp')),
  status text not null default 'completed' check (status in ('in_progress', 'completed', 'failed')),
  notes text check (char_length(notes) <= 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at),
  check (status <> 'completed' or ended_at is not null)
);
create index charging_sessions_user_idx on public.charging_sessions (user_id, started_at desc);
create index charging_sessions_booking_idx on public.charging_sessions (booking_id);
create index charging_sessions_vehicle_idx on public.charging_sessions (vehicle_id);
create index charging_sessions_station_idx on public.charging_sessions (station_id);
create index charging_sessions_evse_idx on public.charging_sessions (evse_id);

-- ---------- Battery readings -------------------------------------------
create table public.battery_readings (
  id bigint generated always as identity primary key,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  soc_percent numeric(5,2) check (soc_percent between 0 and 100),
  odometer_km numeric(9,1) check (odometer_km >= 0),
  source text not null default 'manual' check (source in ('manual', 'vehicle_api')),
  notes text check (char_length(notes) <= 300),
  created_at timestamptz not null default now(),
  check (soc_percent is not null or odometer_km is not null)
);
create index battery_readings_vehicle_idx on public.battery_readings (vehicle_id, recorded_at desc);

-- ---------- Payments (schema only; no provider integrated yet) ---------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  provider text not null,
  provider_reference text not null,
  amount_minor int not null check (amount_minor >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('pending', 'authorized', 'captured', 'failed', 'refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);
create index payments_booking_idx on public.payments (booking_id);

-- ---------- Reviews (schema; UI later) ----------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, station_id)
);
create index reviews_station_idx on public.reviews (station_id);

-- ---------- Notifications outbox (schema; sender later) ---------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('booking_confirmed', 'booking_cancelled', 'booking_reminder', 'hold_expired', 'account')),
  channel text not null default 'email' check (channel in ('email', 'sms', 'push')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  attempts int not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_queue_idx on public.notifications (status, created_at) where status = 'queued';

-- ---------- Guards ------------------------------------------------------
-- Customers may edit their profile, but not their account status.
create or replace function app.profiles_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.status is distinct from old.status or new.deletion_requested_at is distinct from old.deletion_requested_at then
      raise exception 'forbidden' using errcode = '42501', detail = 'Account status can only be changed by the service.';
    end if;
    if new.preferred_vehicle_id is not null and not exists (
      select 1 from public.vehicles v where v.id = new.preferred_vehicle_id and v.user_id = new.id and v.deleted_at is null) then
      raise exception 'not_found' using errcode = 'EVB02', detail = 'Vehicle not found.';
    end if;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function app.profiles_guard();

-- A vehicle with a live booking can't be removed; removing the preferred vehicle clears the preference.
create or replace function app.vehicles_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'forbidden' using errcode = '42501', detail = 'A vehicle cannot change owner.';
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    if exists (select 1 from public.bookings b where b.vehicle_id = new.id and b.status in ('pending', 'confirmed', 'checked_in')) then
      raise exception 'vehicle_in_use' using errcode = 'EVB18',
        detail = 'This vehicle has an upcoming booking. Cancel it first, then remove the vehicle.';
    end if;
    update public.profiles set preferred_vehicle_id = null where preferred_vehicle_id = new.id;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end $$;
create trigger vehicles_guard before update on public.vehicles
  for each row execute function app.vehicles_guard();

-- Manual sessions take station/charging point from the linked booking, and must stay consistent.
create or replace function app.charging_sessions_fill() returns trigger
language plpgsql set search_path = '' as $$
declare b record;
begin
  if new.booking_id is not null then
    select bk.user_id, bk.station_id, bk.evse_id, bk.vehicle_id into b from public.bookings bk where bk.id = new.booking_id;
    if not found or b.user_id <> new.user_id then
      raise exception 'not_found' using errcode = 'EVB02', detail = 'Booking not found.';
    end if;
    new.station_id := b.station_id;
    new.evse_id := b.evse_id;
    new.vehicle_id := coalesce(new.vehicle_id, b.vehicle_id);
  end if;
  if new.vehicle_id is not null and not exists (select 1 from public.vehicles v where v.id = new.vehicle_id and v.user_id = new.user_id) then
    raise exception 'not_found' using errcode = 'EVB02', detail = 'Vehicle not found.';
  end if;
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  new.updated_at := pg_catalog.now();
  return new;
end $$;
create trigger charging_sessions_fill before insert or update on public.charging_sessions
  for each row execute function app.charging_sessions_fill();

-- Booking guard: the vehicle is part of the frozen booking too.
create or replace function app.bookings_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'invalid_transition' using errcode = 'EVB11', detail = 'New bookings start as a hold.';
    end if;
    return new;
  end if;

  if (new.reference, new.user_id, new.station_id, new.evse_id, new.vehicle_id, new.period, new.buffered_period,
      new.price_snapshot, new.currency, new.reservation_fee_minor, new.estimated_total_minor, new.created_at)
     is distinct from
     (old.reference, old.user_id, old.station_id, old.evse_id, old.vehicle_id, old.period, old.buffered_period,
      old.price_snapshot, old.currency, old.reservation_fee_minor, old.estimated_total_minor, old.created_at) then
    raise exception 'booking_immutable' using errcode = 'EVB10',
      detail = 'Booking time, charging point, vehicle and price snapshot cannot be changed. Cancel and book again.';
  end if;

  if new.status is distinct from old.status then
    if not ((old.status = 'pending'    and new.status in ('confirmed', 'cancelled', 'expired'))
         or (old.status = 'confirmed'  and new.status in ('checked_in', 'cancelled', 'no_show'))
         or (old.status = 'checked_in' and new.status = 'completed')) then
      raise exception 'invalid_transition' using errcode = 'EVB11',
        detail = format('A %s booking cannot become %s.', old.status, new.status);
    end if;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end $$;

-- ---------- Compatibility ----------------------------------------------
create or replace function app.is_dc_connector(p_type text) returns boolean
language sql immutable set search_path = '' as $$
  select p_type in ('CCS2', 'CCS1', 'CHAdeMO', 'GB/T', 'NACS', 'Bharat DC-001')
$$;

-- A vehicle fits a charging point when they share at least one connector standard.
create or replace function app.vehicle_fits_evse(p_vehicle_id uuid, p_evse_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.connectors c
    join public.vehicle_connectors vc on vc.connector_type = c.type and vc.vehicle_id = p_vehicle_id
    where c.evse_id = p_evse_id)
$$;

-- Best power the vehicle can draw from the charging point (null = unknown).
create or replace function app.vehicle_power_on_evse(p_vehicle_id uuid, p_evse_id uuid) returns numeric
language sql stable set search_path = '' as $$
  select max(least(
           coalesce(c.power_kw, e.max_power_kw),
           coalesce(vc.supported_power_kw, case when app.is_dc_connector(c.type) then v.max_dc_kw else v.max_ac_kw end,
                    c.power_kw, e.max_power_kw)))
  from public.connectors c
  join public.evses e on e.id = c.evse_id
  join public.vehicle_connectors vc on vc.connector_type = c.type and vc.vehicle_id = p_vehicle_id
  join public.vehicles v on v.id = vc.vehicle_id
  where c.evse_id = p_evse_id
$$;

-- Compatible charging points for a vehicle (used by the checkout screen).
create or replace function public.compatible_evses(p_vehicle_id uuid, p_station_id uuid)
returns table (evse_id uuid, effective_power_kw numeric)
language sql stable security definer set search_path = '' as $$
  select e.id, app.vehicle_power_on_evse(p_vehicle_id, e.id)
  from public.evses e
  where e.station_id = p_station_id
    and exists (select 1 from public.vehicles v where v.id = p_vehicle_id and v.user_id = auth.uid() and v.deleted_at is null)
    and app.vehicle_fits_evse(p_vehicle_id, e.id)
$$;

-- ---------- Pricing with an optional vehicle ---------------------------
-- Same breakdown as app.price_quote, but the energy estimate uses the power the
-- vehicle can actually draw, capped at 80 % of its battery (a 10 % → 90 % charge).
create or replace function app.price_quote_for_vehicle(p_evse_id uuid, p_start timestamptz, p_end timestamptz, p_vehicle_id uuid)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  q jsonb; v record; kw numeric; mins numeric := extract(epoch from (p_end - p_start)) / 60;
  est numeric; capped numeric; t record; c record; lines jsonb := '[]'::jsonb;
  est_net bigint := 0; amt bigint; est_tax bigint; est_total bigint; res_total bigint;
begin
  q := app.price_quote(p_evse_id, p_start, p_end);
  if p_vehicle_id is null then return q; end if;
  select * into v from public.vehicles where id = p_vehicle_id;
  kw := app.vehicle_power_on_evse(p_vehicle_id, p_evse_id);
  if kw is null then
    return q || jsonb_build_object('assumptions', q->'assumptions' || jsonb_build_object(
      'power_basis', 'charging point rating (vehicle limits unknown)', 'vehicle_id', p_vehicle_id));
  end if;
  est := round(kw * (mins / 60) * 0.8, 2);
  capped := case when v.battery_capacity_kwh is not null then least(est, round(v.battery_capacity_kwh * 0.8, 2)) else est end;

  -- Re-price the energy line with the vehicle-aware estimate; other lines are unchanged.
  for c in select * from jsonb_array_elements(q->'lines') as l(x) loop
    if c.x->>'type' = 'energy_kwh' then
      amt := round((c.x->>'unit_price_minor')::numeric * capped);
      lines := lines || (c.x || jsonb_build_object('quantity', capped, 'amount_minor', amt));
    else
      amt := (c.x->>'amount_minor')::bigint;
      lines := lines || c.x;
    end if;
    if c.x->>'payable' = 'at_session' then est_net := est_net + amt; end if;
  end loop;
  select (q->'tariff'->>'tax_mode') as tax_mode, (q->'tariff'->>'tax_rate_bp')::int as bp into t;
  if t.tax_mode = 'exclusive' then
    est_tax := round(est_net * t.bp / 10000.0); est_total := est_net + est_tax;
  else
    est_tax := round(est_net * t.bp / (10000.0 + t.bp)); est_total := est_net;
  end if;
  res_total := (q->'reservation'->>'total_minor')::bigint;
  return q || jsonb_build_object(
    'lines', lines,
    'estimated_charging', jsonb_build_object('net_minor', est_net, 'tax_minor', est_tax, 'total_minor', est_total),
    'estimated_grand_total_minor', res_total + est_total,
    'assumptions', jsonb_build_object(
      'evse_max_power_kw', q->'assumptions'->'evse_max_power_kw', 'assumed_power_share', 0.8,
      'effective_power_kw', kw, 'estimated_kwh', capped, 'battery_capacity_kwh', v.battery_capacity_kwh,
      'power_basis', 'vehicle and charging point', 'vehicle_id', p_vehicle_id));
end $$;

-- ---------- Reservation core (shared by create_booking and book_slot) --
create or replace function app.reserve(p_uid uuid, p_evse_id uuid, p_vehicle_id uuid, p_start timestamptz,
                                       p_duration_min int, p_idempotency_key text)
returns public.bookings language plpgsql volatile set search_path = '' as $$
declare
  uid uuid := p_uid; v_now timestamptz := app.now();
  w record; r public.booking_rules; k public.idempotency_keys; b public.bookings; veh record;
  v_hash text; v_end timestamptz; snap jsonb; active_count int;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'EVB01', detail = 'Sign in to book a charging slot.';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{8,100}$' then
    raise exception 'invalid_request' using errcode = 'EVB15',
      detail = 'A valid Idempotency-Key (8–100 letters, digits, - or _) is required.';
  end if;

  -- 1. Idempotency (see 20261028000001). The vehicle is part of the request fingerprint.
  v_hash := md5(concat_ws('|', p_evse_id::text, extract(epoch from p_start)::bigint::text, p_duration_min::text, p_vehicle_id::text));
  insert into public.idempotency_keys (user_id, key, endpoint, request_hash, expires_at)
  values (uid, p_idempotency_key, 'create_booking', v_hash, v_now + interval '24 hours')
  on conflict (user_id, key) do update
    set endpoint = excluded.endpoint, request_hash = excluded.request_hash, booking_id = null,
        created_at = v_now, expires_at = excluded.expires_at
    where public.idempotency_keys.expires_at <= v_now;
  if not found then
    select * into k from public.idempotency_keys ik where ik.user_id = uid and ik.key = p_idempotency_key;
    if k.request_hash <> v_hash or k.endpoint <> 'create_booking' then
      raise exception 'idempotency_mismatch' using errcode = 'EVB08',
        detail = 'This Idempotency-Key was already used for a different booking request.';
    end if;
    select * into b from public.bookings bk where bk.id = k.booking_id;
    if found then return b; end if;
    raise exception 'idempotency_mismatch' using errcode = 'EVB08',
      detail = 'The original request with this key did not create a booking. Use a new key.';
  end if;

  -- 2. Per-user lock (active-booking limit).
  perform pg_advisory_xact_lock(hashtextextended('ev-booking-user:' || uid::text, 0));

  -- 3. Window and vehicle validation.
  select * into w from app.validate_window(p_evse_id, p_start, p_duration_min);
  r := w.rules;
  v_end := p_start + make_interval(mins => p_duration_min);
  if p_vehicle_id is not null then
    select id, make, model, nickname into veh from public.vehicles
     where id = p_vehicle_id and user_id = uid and deleted_at is null;
    if not found then
      raise exception 'not_found' using errcode = 'EVB02', detail = 'Vehicle not found.';
    end if;
    if not app.vehicle_fits_evse(p_vehicle_id, p_evse_id) then
      raise exception 'incompatible_vehicle' using errcode = 'EVB17',
        detail = 'Your vehicle''s connectors don''t match this charging point. Pick another charging point or check your vehicle''s connector types.';
    end if;
  end if;

  -- 3b. Per-charging-point lock (prevents exclusion-check deadlocks).
  perform pg_advisory_xact_lock(hashtextextended('ev-booking-evse:' || p_evse_id::text, 0));

  -- 4. Lapsed holds must not block the slot.
  perform set_config('app.transition_reason', 'Hold expired', true);
  update public.bookings set status = 'expired'
   where evse_id = p_evse_id and status = 'pending' and hold_expires_at <= v_now;
  perform set_config('app.transition_reason', '', true);

  select count(*) into active_count from public.bookings bk
   where bk.user_id = uid and bk.status in ('pending', 'confirmed', 'checked_in') and upper(bk.period) > v_now
     and not (bk.status = 'pending' and bk.hold_expires_at <= v_now);
  if active_count >= r.max_active_per_user then
    raise exception 'too_many_active' using errcode = 'EVB09',
      detail = format('You can have at most %s upcoming bookings at a time.', r.max_active_per_user);
  end if;

  -- 5. Server-side price + frozen policy (+ vehicle).
  snap := app.price_quote_for_vehicle(p_evse_id, p_start, v_end, p_vehicle_id) || jsonb_build_object('policy', jsonb_build_object(
    'hold_minutes', r.hold_minutes, 'buffer_min', r.buffer_min, 'free_cancel_until_min', r.free_cancel_until_min,
    'late_cancel_fee', 'reservation_fee', 'check_in_early_min', r.check_in_early_min,
    'no_show_grace_min', r.no_show_grace_min, 'time_zone', w.time_zone));
  if p_vehicle_id is not null then
    snap := snap || jsonb_build_object('vehicle', jsonb_build_object(
      'id', veh.id, 'label', coalesce(nullif(veh.nickname, ''), veh.make || ' ' || veh.model)));
  end if;

  -- 6. Insert; the exclusion constraint is the final arbiter.
  begin
    insert into public.bookings (user_id, station_id, evse_id, vehicle_id, period, buffered_period, status, hold_expires_at,
                                 price_snapshot, currency, reservation_fee_minor, estimated_total_minor)
    values (uid, w.station_id, p_evse_id, p_vehicle_id, tstzrange(p_start, v_end, '[)'),
            tstzrange(p_start, v_end + make_interval(mins => r.buffer_min), '[)'),
            'pending', v_now + make_interval(mins => r.hold_minutes),
            snap, snap->>'currency', (snap->'reservation'->>'total_minor')::int,
            (snap->>'estimated_grand_total_minor')::int)
    returning * into b;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'EVB07', detail = 'That slot was just taken. Please pick another time.';
  end;

  update public.idempotency_keys ik set booking_id = b.id where ik.user_id = uid and ik.key = p_idempotency_key;
  return b;
end $$;

-- Existing API keeps working (no vehicle).
create or replace function public.create_booking(p_evse_id uuid, p_start timestamptz, p_duration_min int, p_idempotency_key text)
returns public.bookings language sql volatile security definer set search_path = '' as $$
  select * from app.reserve(auth.uid(), p_evse_id, null, p_start, p_duration_min, p_idempotency_key)
$$;

-- Checkout with a vehicle.
create or replace function public.book_slot(p_evse_id uuid, p_vehicle_id uuid, p_start timestamptz, p_duration_min int, p_idempotency_key text)
returns public.bookings language sql volatile security definer set search_path = '' as $$
  select * from app.reserve(auth.uid(), p_evse_id, p_vehicle_id, p_start, p_duration_min, p_idempotency_key)
$$;

-- Price preview for checkout, vehicle-aware. Creates nothing.
create or replace function public.quote_for_vehicle(p_evse_id uuid, p_vehicle_id uuid, p_start timestamptz, p_duration_min int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w record;
begin
  select * into w from app.validate_window(p_evse_id, p_start, p_duration_min);
  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles v where v.id = p_vehicle_id and v.user_id = auth.uid() and v.deleted_at is null) then
    raise exception 'not_found' using errcode = 'EVB02', detail = 'Vehicle not found.';
  end if;
  return app.price_quote_for_vehicle(p_evse_id, p_start, p_start + make_interval(mins => p_duration_min), p_vehicle_id);
end $$;

-- Privacy: a customer can ask for their account to be removed (processed by an operator; 30-day grace).
create or replace function public.request_account_deletion() returns public.profiles
language plpgsql volatile security definer set search_path = '' as $$
declare p public.profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'EVB01', detail = 'Sign in first.'; end if;
  update public.profiles set status = 'deletion_requested', deletion_requested_at = app.now()
   where id = auth.uid() returning * into p;
  return p;
end $$;

-- ---------- Summary view: is the station bookable? ---------------------
create or replace view public.station_summaries with (security_invoker = true) as
select s.id, s.name, s.address, s.city, s.lat, s.lng, s.operator, s.access, s.hours, s.price_info,
  s.is_demo, s.created_by, s.created_at,
  (select c.status from public.checkins c where c.station_id = s.id order by c.created_at desc limit 1) as last_status,
  (select c.created_at from public.checkins c where c.station_id = s.id order by c.created_at desc limit 1) as last_checkin_at,
  (select coalesce(max(k.power_kw),0) from public.connectors k where k.station_id = s.id) as max_power_kw,
  (select coalesce(array_agg(distinct k.type), '{}') from public.connectors k where k.station_id = s.id) as connector_types,
  s.city_is_approx, s.state, s.postal_code, s.data_source, s.external_id, s.source_updated_at,
  s.time_zone,
  (exists (select 1 from public.booking_rules br where br.station_id = s.id)
   and exists (select 1 from public.evses e where e.station_id = s.id and e.is_bookable and e.is_active)) as is_bookable
from public.stations s;

-- ---------- Row level security -----------------------------------------
alter table public.vehicles enable row level security;
alter table public.vehicle_connectors enable row level security;
alter table public.charging_sessions enable row level security;
alter table public.battery_readings enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;

create policy "own vehicles readable" on public.vehicles for select to authenticated
  using (user_id = (select auth.uid()));
create policy "add own vehicle" on public.vehicles for insert to authenticated
  with check (user_id = (select auth.uid()) and deleted_at is null);
create policy "edit own vehicle" on public.vehicles for update to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null) with check (user_id = (select auth.uid()));

create policy "own vehicle connectors readable" on public.vehicle_connectors for select to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = (select auth.uid())));
create policy "add own vehicle connectors" on public.vehicle_connectors for insert to authenticated
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = (select auth.uid()) and v.deleted_at is null));
create policy "edit own vehicle connectors" on public.vehicle_connectors for update to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = (select auth.uid()) and v.deleted_at is null))
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = (select auth.uid())));

create policy "own sessions readable" on public.charging_sessions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "add own manual session" on public.charging_sessions for insert to authenticated
  with check (user_id = (select auth.uid()) and source = 'manual');
create policy "edit own manual session" on public.charging_sessions for update to authenticated
  using (user_id = (select auth.uid()) and source = 'manual')
  with check (user_id = (select auth.uid()) and source = 'manual');

create policy "own battery readings readable" on public.battery_readings for select to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = (select auth.uid())));
create policy "add own manual battery reading" on public.battery_readings for insert to authenticated
  with check (source = 'manual' and exists (
    select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = (select auth.uid()) and v.deleted_at is null));

create policy "own payments readable" on public.payments for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = (select auth.uid())));

create policy "reviews readable" on public.reviews for select using (true);
create policy "add own review" on public.reviews for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "edit own review" on public.reviews for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own notifications readable" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
