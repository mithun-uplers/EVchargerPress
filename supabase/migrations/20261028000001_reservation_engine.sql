-- =====================================================================
-- Reservation engine (Module F) — 2026-10-28
-- Bookable resource = one EVSE (charging point). Every rule is enforced
-- in Postgres so all clients (web, API, future apps) get the same
-- guarantees. No payments and no charger hardware are involved.
-- =====================================================================

create extension if not exists btree_gist with schema extensions;
create schema if not exists app;

-- ---------- Clock -------------------------------------------------------
-- app.now() = now(), except that tests (any connection that is not the
-- PostgREST "authenticator" login) may pin it with set_config('app.now', …).
create or replace function app.now() returns timestamptz
language sql stable set search_path = '' as $$
  select case
    when session_user <> 'authenticator' and nullif(current_setting('app.now', true), '') is not null
      then current_setting('app.now', true)::timestamptz
    else pg_catalog.now()
  end
$$;

-- ---------- Error codes -------------------------------------------------
-- Business errors use SQLSTATE 'EVBxx'; message = machine code, detail =
-- text that is safe to show to the user. The API maps codes to HTTP.
--   EVB01 not_authenticated   EVB02 not_found          EVB03 not_bookable
--   EVB04 invalid_duration    EVB05 invalid_start      EVB06 outside_hours
--   EVB07 slot_unavailable    EVB08 idempotency_mismatch
--   EVB09 too_many_active     EVB10 booking_immutable  EVB11 invalid_transition
--   EVB12 hold_expired        EVB13 not_cancellable    EVB14 no_tariff
--   EVB15 invalid_request     EVB16 check_in_window

-- ---------- Station time zone ------------------------------------------
alter table public.stations add column if not exists time_zone text not null default 'Asia/Kolkata';

create or replace function app.check_time_zone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'invalid time zone: %', new.time_zone using errcode = '22023';
  end if;
  return new;
end $$;
create trigger stations_time_zone_check before insert or update of time_zone on public.stations
  for each row execute function app.check_time_zone();

-- ---------- EVSEs (charging points) ------------------------------------
create table public.evses (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  evse_uid text not null check (char_length(evse_uid) between 1 and 64),
  label text not null check (char_length(label) between 1 and 60),
  max_power_kw numeric(6,1) check (max_power_kw > 0),
  is_bookable boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (station_id, evse_uid)
);
create index evses_station_idx on public.evses (station_id);

alter table public.connectors add column if not exists evse_id uuid references public.evses(id) on delete set null;
create index if not exists connectors_evse_idx on public.connectors (evse_id);

-- ---------- Operating hours (station local time) -----------------------
-- weekday: 0 = Sunday … 6 = Saturday (Postgres extract(dow)).
-- closes_at may be '24:00'. Hours that cross midnight = two rows.
-- A station with no rows is never open and therefore not bookable.
create table public.operating_hours (
  id bigint generated always as identity primary key,
  station_id uuid not null references public.stations(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  check (closes_at > opens_at),
  unique (station_id, weekday, opens_at)
);
create index operating_hours_station_idx on public.operating_hours (station_id, weekday);

-- ---------- Booking rules (one row per bookable station) ---------------
create table public.booking_rules (
  station_id uuid primary key references public.stations(id) on delete cascade,
  slot_step_min int not null default 15 check (slot_step_min in (5, 10, 15, 20, 30, 60)),
  min_duration_min int not null default 30,
  max_duration_min int not null default 120,
  buffer_min int not null default 10 check (buffer_min between 0 and 120),
  lead_time_min int not null default 15 check (lead_time_min between 0 and 1440),
  max_advance_days int not null default 14 check (max_advance_days between 1 and 90),
  hold_minutes int not null default 10 check (hold_minutes between 1 and 60),
  free_cancel_until_min int not null default 60 check (free_cancel_until_min between 0 and 2880),
  check_in_early_min int not null default 15 check (check_in_early_min between 0 and 120),
  no_show_grace_min int not null default 15 check (no_show_grace_min between 0 and 120),
  max_active_per_user int not null default 3 check (max_active_per_user between 1 and 20),
  updated_at timestamptz not null default now(),
  check (min_duration_min > 0 and max_duration_min >= min_duration_min and max_duration_min <= 720),
  check (min_duration_min % slot_step_min = 0 and max_duration_min % slot_step_min = 0)
);

-- ---------- Tariffs -----------------------------------------------------
create table public.tariffs (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete cascade,
  evse_id uuid references public.evses(id) on delete cascade,   -- null = applies to the whole station
  name text not null check (char_length(name) between 1 and 80),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  tax_mode text not null default 'exclusive' check (tax_mode in ('inclusive', 'exclusive')),
  tax_rate_bp int not null default 0 check (tax_rate_bp between 0 and 5000),  -- basis points: 1800 = 18 %
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  is_active boolean not null default true,
  source text not null default 'operator' check (source in ('operator', 'admin', 'demo')),
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from)
);
create index tariffs_station_idx on public.tariffs (station_id, evse_id, valid_from desc);

create table public.tariff_components (
  id bigint generated always as identity primary key,
  tariff_id uuid not null references public.tariffs(id) on delete cascade,
  -- energy_kwh / time_min / idle_min = price per unit; session_fixed / reservation_fixed = flat amount.
  type text not null check (type in ('energy_kwh', 'time_min', 'session_fixed', 'reservation_fixed', 'idle_min')),
  price_minor int not null check (price_minor >= 0),   -- minor units (paise for INR)
  unique (tariff_id, type)
);

-- ---------- Bookings ----------------------------------------------------
create or replace function app.booking_reference() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  -- no 0/O/1/I/L
  bytes bytea := extensions.gen_random_bytes(8);
  ref text := 'EV-';
begin
  for i in 0..7 loop
    ref := ref || substr(alphabet, 1 + (get_byte(bytes, i) % 31), 1);
  end loop;
  return ref;
end $$;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default app.booking_reference(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete restrict,
  evse_id uuid not null references public.evses(id) on delete restrict,
  period tstzrange not null,            -- [start, end) the customer booked
  buffered_period tstzrange not null,   -- [start, end + buffer) blocked on the charging point
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'checked_in', 'completed', 'cancelled', 'expired', 'no_show')),
  hold_expires_at timestamptz,
  price_snapshot jsonb not null,        -- frozen tariff, breakdown and policy at booking time
  currency char(3) not null,
  reservation_fee_minor int not null default 0 check (reservation_fee_minor >= 0),
  estimated_total_minor int not null default 0 check (estimated_total_minor >= 0),
  cancellation_fee_minor int check (cancellation_fee_minor >= 0),
  confirmed_at timestamptz,
  checked_in_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text check (char_length(cancel_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not isempty(period) and lower_inc(period) and not upper_inc(period)
         and lower(period) is not null and upper(period) is not null),
  check (buffered_period @> period),
  check (status <> 'pending' or hold_expires_at is not null),
  -- The core guarantee: no two live bookings overlap on one charging point.
  constraint bookings_no_overlap exclude using gist (evse_id with =, buffered_period with &&)
    where (status in ('pending', 'confirmed', 'checked_in'))
);
create index bookings_user_idx on public.bookings (user_id, created_at desc);
create index bookings_pending_idx on public.bookings (hold_expires_at) where status = 'pending';
create index bookings_live_start_idx on public.bookings (lower(period)) where status in ('confirmed', 'checked_in');
create index bookings_station_idx on public.bookings (station_id);
create index bookings_evse_idx on public.bookings (evse_id);

create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid,
  reason text,
  created_at timestamptz not null default now()
);
create index booking_events_booking_idx on public.booking_events (booking_id, id);

create table public.idempotency_keys (
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null,
  endpoint text not null,
  request_hash text not null,
  booking_id uuid references public.bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, key)
);
create index idempotency_keys_expiry_idx on public.idempotency_keys (expires_at);
create index idempotency_keys_booking_idx on public.idempotency_keys (booking_id);

-- ---------- Guards: immutable snapshot + status transition model --------
--   pending    → confirmed | cancelled | expired
--   confirmed  → checked_in | cancelled | no_show
--   checked_in → completed
--   completed, cancelled, expired, no_show are terminal.
create or replace function app.bookings_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then
      raise exception 'invalid_transition' using errcode = 'EVB11', detail = 'New bookings start as a hold.';
    end if;
    return new;
  end if;

  if (new.reference, new.user_id, new.station_id, new.evse_id, new.period, new.buffered_period,
      new.price_snapshot, new.currency, new.reservation_fee_minor, new.estimated_total_minor, new.created_at)
     is distinct from
     (old.reference, old.user_id, old.station_id, old.evse_id, old.period, old.buffered_period,
      old.price_snapshot, old.currency, old.reservation_fee_minor, old.estimated_total_minor, old.created_at) then
    raise exception 'booking_immutable' using errcode = 'EVB10',
      detail = 'Booking time, charging point and price snapshot cannot be changed. Cancel and book again.';
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
create trigger bookings_guard before insert or update on public.bookings
  for each row execute function app.bookings_guard();

-- Audit trail: one event per status change (after the row exists).
create or replace function app.bookings_log() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.booking_events (booking_id, from_status, to_status, actor_id, reason)
    values (new.id, null, new.status, auth.uid(), 'Slot held');
  elsif new.status is distinct from old.status then
    insert into public.booking_events (booking_id, from_status, to_status, actor_id, reason)
    values (new.id, old.status, new.status, auth.uid(),
            coalesce(nullif(current_setting('app.transition_reason', true), ''), new.cancel_reason));
  end if;
  return null;
end $$;
create trigger bookings_log after insert or update on public.bookings
  for each row execute function app.bookings_log();

create or replace function app.booking_events_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'booking_events is append-only' using errcode = 'EVB10';
end $$;
create trigger booking_events_append_only before update on public.booking_events
  for each row execute function app.booking_events_append_only();

-- ---------- Opening hours as absolute time ranges ----------------------
create or replace function app.open_ranges(p_station uuid, p_from timestamptz, p_to timestamptz)
returns tstzmultirange language sql stable set search_path = '' as $$
  with st as (select time_zone as tz from public.stations where id = p_station),
  days as (
    select d::date as day
    from st, generate_series((p_from at time zone st.tz)::date - 1, (p_to at time zone st.tz)::date + 1, interval '1 day') d
  )
  select coalesce(range_agg(tstzrange((days.day + oh.opens_at) at time zone st.tz,
                                      (days.day + oh.closes_at) at time zone st.tz, '[)')),
                  '{}'::tstzmultirange)
  from st cross join days
  join public.operating_hours oh on oh.station_id = p_station and oh.weekday = extract(dow from days.day)
$$;

-- ---------- Server-side price calculation ------------------------------
-- Full, transparent breakdown. Energy is an ESTIMATE (80 % of the charging
-- point's rated power for the booked time): real energy depends on the
-- vehicle and its battery, so only the reservation fee is a firm amount.
create or replace function app.price_quote(p_evse_id uuid, p_start timestamptz, p_end timestamptz)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  ev record; t record; c record;
  mins numeric := extract(epoch from (p_end - p_start)) / 60;
  est_kwh numeric;
  lines jsonb := '[]'::jsonb;
  res_net bigint := 0; est_net bigint := 0; amt bigint; idle_price int;
  res_tax bigint; est_tax bigint; res_total bigint; est_total bigint;
begin
  select e.id, e.station_id, e.max_power_kw into ev from public.evses e where e.id = p_evse_id;
  select * into t from public.tariffs tf
   where tf.station_id = ev.station_id and (tf.evse_id = p_evse_id or tf.evse_id is null) and tf.is_active
     and tf.valid_from <= p_start and (tf.valid_to is null or tf.valid_to > p_start)
   order by (tf.evse_id is not null) desc, tf.valid_from desc
   limit 1;
  if not found then
    raise exception 'no_tariff' using errcode = 'EVB14',
      detail = 'This charging point has no published tariff for that time, so it cannot be booked.';
  end if;

  est_kwh := round(coalesce(ev.max_power_kw, 0) * (mins / 60) * 0.8, 2);

  for c in select * from public.tariff_components where tariff_id = t.id order by id loop
    if c.type = 'idle_min' then
      idle_price := c.price_minor;
      continue;
    end if;
    amt := case c.type
      when 'energy_kwh' then round(c.price_minor * est_kwh)
      when 'time_min' then round(c.price_minor * mins)
      else c.price_minor end;
    lines := lines || jsonb_build_object(
      'type', c.type,
      'label', case c.type
        when 'energy_kwh' then 'Energy (estimated)'
        when 'time_min' then 'Charging time'
        when 'session_fixed' then 'Session fee'
        when 'reservation_fixed' then 'Reservation fee' end,
      'unit_price_minor', c.price_minor,
      'quantity', case c.type when 'energy_kwh' then est_kwh when 'time_min' then mins else 1 end,
      'unit', case c.type when 'energy_kwh' then 'kWh' when 'time_min' then 'min' else 'each' end,
      'amount_minor', amt,
      'is_estimate', c.type in ('energy_kwh', 'time_min'),
      'payable', case when c.type = 'reservation_fixed' then 'reservation' else 'at_session' end);
    if c.type = 'reservation_fixed' then res_net := res_net + amt; else est_net := est_net + amt; end if;
  end loop;

  if t.tax_mode = 'exclusive' then
    res_tax := round(res_net * t.tax_rate_bp / 10000.0);
    est_tax := round(est_net * t.tax_rate_bp / 10000.0);
    res_total := res_net + res_tax;
    est_total := est_net + est_tax;
  else
    res_tax := round(res_net * t.tax_rate_bp / (10000.0 + t.tax_rate_bp));
    est_tax := round(est_net * t.tax_rate_bp / (10000.0 + t.tax_rate_bp));
    res_total := res_net;
    est_total := est_net;
  end if;

  return jsonb_build_object(
    'version', 1,
    'quoted_at', app.now(),
    'tariff', jsonb_build_object('id', t.id, 'name', t.name, 'source', t.source,
                                 'tax_mode', t.tax_mode, 'tax_rate_bp', t.tax_rate_bp),
    'currency', t.currency,
    'duration_min', mins,
    'assumptions', jsonb_build_object('evse_max_power_kw', ev.max_power_kw, 'assumed_power_share', 0.8,
                                      'estimated_kwh', est_kwh),
    'lines', lines,
    'reservation', jsonb_build_object('net_minor', res_net, 'tax_minor', res_tax, 'total_minor', res_total),
    'estimated_charging', jsonb_build_object('net_minor', est_net, 'tax_minor', est_tax, 'total_minor', est_total),
    'estimated_grand_total_minor', res_total + est_total,
    'idle_fee_per_min_minor', idle_price,
    'payment', 'pay_at_station');
end $$;

-- ---------- Shared validation for a requested window --------------------
create or replace function app.validate_window(p_evse_id uuid, p_start timestamptz, p_duration_min int)
returns table (station_id uuid, time_zone text, rules public.booking_rules)
language plpgsql stable set search_path = '' as $$
declare
  ev record; r public.booking_rules; v_now timestamptz := app.now(); local_start timestamp; v_end timestamptz;
begin
  if p_evse_id is null or p_start is null or p_duration_min is null then
    raise exception 'invalid_request' using errcode = 'EVB15', detail = 'Charging point, start time and duration are required.';
  end if;
  select e.id, e.station_id, e.is_bookable, e.is_active, s.time_zone into ev
    from public.evses e join public.stations s on s.id = e.station_id where e.id = p_evse_id;
  if not found then
    raise exception 'not_found' using errcode = 'EVB02', detail = 'Charging point not found.';
  end if;
  select * into r from public.booking_rules br where br.station_id = ev.station_id;
  if not found or not ev.is_bookable or not ev.is_active then
    raise exception 'not_bookable' using errcode = 'EVB03', detail = 'This charging point does not take bookings.';
  end if;
  if p_duration_min < r.min_duration_min or p_duration_min > r.max_duration_min or p_duration_min % r.slot_step_min <> 0 then
    raise exception 'invalid_duration' using errcode = 'EVB04',
      detail = format('Choose a duration between %s and %s minutes, in steps of %s.', r.min_duration_min, r.max_duration_min, r.slot_step_min);
  end if;
  local_start := p_start at time zone ev.time_zone;
  if extract(second from local_start) <> 0
     or (extract(hour from local_start) * 60 + extract(minute from local_start))::int % r.slot_step_min <> 0 then
    raise exception 'invalid_start' using errcode = 'EVB05',
      detail = format('Start times are every %s minutes (station local time).', r.slot_step_min);
  end if;
  if p_start < v_now + make_interval(mins => r.lead_time_min) then
    raise exception 'invalid_start' using errcode = 'EVB05',
      detail = format('Bookings must start at least %s minutes from now.', r.lead_time_min);
  end if;
  if p_start > v_now + make_interval(days => r.max_advance_days) then
    raise exception 'invalid_start' using errcode = 'EVB05',
      detail = format('You can book up to %s days ahead.', r.max_advance_days);
  end if;
  v_end := p_start + make_interval(mins => p_duration_min);
  if not (app.open_ranges(ev.station_id, p_start, v_end) @> tstzrange(p_start, v_end, '[)')) then
    raise exception 'outside_hours' using errcode = 'EVB06',
      detail = 'The station is closed for all or part of that time.';
  end if;
  return query select ev.station_id, ev.time_zone::text, r;
end $$;

-- ---------- Public API: availability -----------------------------------
create or replace function public.get_availability(p_station_id uuid, p_date date, p_duration_min int)
returns table (evse_id uuid, evse_label text, max_power_kw numeric, slot_start timestamptz, slot_end timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.booking_rules; tz text; v_now timestamptz := app.now();
  day_start timestamptz; day_end timestamptz; dur interval; open_mr tstzmultirange;
begin
  select * into r from public.booking_rules br where br.station_id = p_station_id;
  if not found then return; end if;
  if p_date is null or p_duration_min is null or p_duration_min < r.min_duration_min
     or p_duration_min > r.max_duration_min or p_duration_min % r.slot_step_min <> 0 then
    raise exception 'invalid_duration' using errcode = 'EVB04',
      detail = format('Choose a duration between %s and %s minutes, in steps of %s.', r.min_duration_min, r.max_duration_min, r.slot_step_min);
  end if;
  select s.time_zone into tz from public.stations s where s.id = p_station_id;
  day_start := p_date::timestamp at time zone tz;
  day_end := (p_date + 1)::timestamp at time zone tz;
  dur := make_interval(mins => p_duration_min);
  open_mr := app.open_ranges(p_station_id, day_start, day_end + dur);

  return query
  select e.id, e.label, e.max_power_kw, gs, gs + dur
  from public.evses e
  cross join generate_series(day_start, day_end - interval '1 minute', make_interval(mins => r.slot_step_min)) gs
  where e.station_id = p_station_id and e.is_active and e.is_bookable
    and gs >= v_now + make_interval(mins => r.lead_time_min)
    and gs <= v_now + make_interval(days => r.max_advance_days)
    and open_mr @> tstzrange(gs, gs + dur, '[)')
    and not exists (
      select 1 from public.bookings b
      where b.evse_id = e.id
        and b.status in ('pending', 'confirmed', 'checked_in')
        and not (b.status = 'pending' and b.hold_expires_at <= v_now)
        and b.buffered_period && tstzrange(gs, gs + dur + make_interval(mins => r.buffer_min), '[)'))
  order by e.label, gs;
end $$;

-- ---------- Public API: quote (creates nothing) -------------------------
create or replace function public.quote_booking(p_evse_id uuid, p_start timestamptz, p_duration_min int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare w record;
begin
  select * into w from app.validate_window(p_evse_id, p_start, p_duration_min);
  return app.price_quote(p_evse_id, p_start, p_start + make_interval(mins => p_duration_min));
end $$;

-- ---------- Public API: create a booking (a timed hold) ----------------
create or replace function public.create_booking(p_evse_id uuid, p_start timestamptz, p_duration_min int, p_idempotency_key text)
returns public.bookings language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); v_now timestamptz := app.now();
  w record; r public.booking_rules; k public.idempotency_keys; b public.bookings;
  v_hash text; v_end timestamptz; snap jsonb; active_count int;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = 'EVB01', detail = 'Sign in to book a charging slot.';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_-]{8,100}$' then
    raise exception 'invalid_request' using errcode = 'EVB15',
      detail = 'A valid Idempotency-Key (8–100 letters, digits, - or _) is required.';
  end if;

  -- 1. Idempotency. The first request with a key wins; repeats return the same booking.
  --    A concurrent repeat blocks on this insert until the first transaction finishes.
  v_hash := md5(concat_ws('|', p_evse_id::text, extract(epoch from p_start)::bigint::text, p_duration_min::text));
  --    An expired key (older than 24 h) is recycled as if it were new.
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

  -- 2. Serialise each user's bookings so the active-booking limit cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended('ev-booking-user:' || uid::text, 0));

  -- 3. Validate the window: bookable, duration, alignment, lead time, advance limit, hours.
  select * into w from app.validate_window(p_evse_id, p_start, p_duration_min);
  r := w.rules;
  v_end := p_start + make_interval(mins => p_duration_min);

  -- 3b. Queue writers per charging point. Without this, partly overlapping
  --     concurrent inserts can wait on each other inside the exclusion check
  --     and deadlock (40P01). Lock order is always user → charging point.
  perform pg_advisory_xact_lock(hashtextextended('ev-booking-evse:' || p_evse_id::text, 0));

  -- 4. Lapsed holds on this charging point must not block the slot.
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

  -- 5. Price on the server and freeze it, together with the policy for this booking.
  snap := app.price_quote(p_evse_id, p_start, v_end) || jsonb_build_object('policy', jsonb_build_object(
    'hold_minutes', r.hold_minutes, 'buffer_min', r.buffer_min, 'free_cancel_until_min', r.free_cancel_until_min,
    'late_cancel_fee', 'reservation_fee', 'check_in_early_min', r.check_in_early_min,
    'no_show_grace_min', r.no_show_grace_min, 'time_zone', w.time_zone));

  -- 6. Insert. The exclusion constraint is the final arbiter under concurrency.
  begin
    insert into public.bookings (user_id, station_id, evse_id, period, buffered_period, status, hold_expires_at,
                                 price_snapshot, currency, reservation_fee_minor, estimated_total_minor)
    values (uid, w.station_id, p_evse_id, tstzrange(p_start, v_end, '[)'),
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

-- ---------- Public API: confirm a held booking --------------------------
create or replace function public.confirm_booking(p_booking_id uuid)
returns public.bookings language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_now timestamptz := app.now(); b public.bookings;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'EVB01', detail = 'Sign in first.'; end if;
  select * into b from public.bookings bk where bk.id = p_booking_id and bk.user_id = uid for update;
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'Booking not found.'; end if;
  if b.status = 'confirmed' then return b; end if;   -- repeat = no-op
  if b.status <> 'pending' then
    raise exception 'invalid_transition' using errcode = 'EVB11', detail = format('A %s booking cannot be confirmed.', b.status);
  end if;
  if b.hold_expires_at <= v_now then
    raise exception 'hold_expired' using errcode = 'EVB12', detail = 'Your hold on this slot expired. Please choose the slot again.';
  end if;
  update public.bookings bk set status = 'confirmed', confirmed_at = v_now where bk.id = b.id returning * into b;
  return b;
end $$;

-- ---------- Public API: cancel -----------------------------------------
-- Holds: free. Confirmed: free until (start − free_cancel_until_min); after
-- that the reservation fee is recorded as a late-cancellation fee.
-- Not possible once the booking has started.
create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns public.bookings language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_now timestamptz := app.now(); b public.bookings; fee int := 0; free_until timestamptz;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'EVB01', detail = 'Sign in first.'; end if;
  select * into b from public.bookings bk where bk.id = p_booking_id and bk.user_id = uid for update;
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'Booking not found.'; end if;
  if b.status = 'cancelled' then return b; end if;   -- repeat = no-op
  if b.status not in ('pending', 'confirmed') then
    raise exception 'not_cancellable' using errcode = 'EVB13', detail = format('A %s booking cannot be cancelled.', b.status);
  end if;
  if b.status = 'confirmed' then
    if v_now >= lower(b.period) then
      raise exception 'not_cancellable' using errcode = 'EVB13',
        detail = 'This booking has already started and can no longer be cancelled.';
    end if;
    free_until := lower(b.period) - make_interval(mins => coalesce((b.price_snapshot->'policy'->>'free_cancel_until_min')::int, 0));
    if v_now >= free_until then fee := b.reservation_fee_minor; end if;
  end if;
  update public.bookings bk
     set status = 'cancelled', cancelled_at = v_now, cancellation_fee_minor = fee,
         cancel_reason = coalesce(nullif(left(btrim(p_reason), 300), ''), 'Cancelled by customer')
   where bk.id = b.id returning * into b;
  return b;
end $$;

-- ---------- Public API: manual check-in (no charger hardware yet) -------
create or replace function public.check_in_booking(p_booking_id uuid)
returns public.bookings language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_now timestamptz := app.now(); b public.bookings; early int; grace int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'EVB01', detail = 'Sign in first.'; end if;
  select * into b from public.bookings bk where bk.id = p_booking_id and bk.user_id = uid for update;
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'Booking not found.'; end if;
  if b.status = 'checked_in' then return b; end if;
  if b.status <> 'confirmed' then
    raise exception 'invalid_transition' using errcode = 'EVB11', detail = format('A %s booking cannot be checked in.', b.status);
  end if;
  early := coalesce((b.price_snapshot->'policy'->>'check_in_early_min')::int, 15);
  grace := coalesce((b.price_snapshot->'policy'->>'no_show_grace_min')::int, 15);
  if v_now < lower(b.period) - make_interval(mins => early) or v_now > lower(b.period) + make_interval(mins => grace) then
    raise exception 'check_in_window' using errcode = 'EVB16',
      detail = format('Check-in opens %s minutes before the start and closes %s minutes after it.', early, grace);
  end if;
  update public.bookings bk set status = 'checked_in', checked_in_at = v_now where bk.id = b.id returning * into b;
  return b;
end $$;

-- ---------- Sweeper (run every minute by pg_cron) -----------------------
create or replace function app.sweep_bookings() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_now timestamptz := app.now(); n_exp int; n_ns int; n_done int; n_keys int;
begin
  perform set_config('app.transition_reason', 'Hold expired', true);
  update public.bookings set status = 'expired' where status = 'pending' and hold_expires_at <= v_now;
  get diagnostics n_exp = row_count;

  perform set_config('app.transition_reason', 'Not checked in within the grace period', true);
  update public.bookings set status = 'no_show'
   where status = 'confirmed'
     and lower(period) + make_interval(mins => coalesce((price_snapshot->'policy'->>'no_show_grace_min')::int, 15)) < v_now;
  get diagnostics n_ns = row_count;

  perform set_config('app.transition_reason', 'Booked time ended', true);
  update public.bookings set status = 'completed' where status = 'checked_in' and upper(period) <= v_now;
  get diagnostics n_done = row_count;
  perform set_config('app.transition_reason', '', true);

  n_keys := app.purge_idempotency_keys(v_now);   -- defined in 20261028000002
  return jsonb_build_object('expired', n_exp, 'no_show', n_ns, 'completed', n_done, 'keys_purged', n_keys);
end $$;

-- ---------- Row level security -----------------------------------------
alter table public.evses enable row level security;
alter table public.operating_hours enable row level security;
alter table public.booking_rules enable row level security;
alter table public.tariffs enable row level security;
alter table public.tariff_components enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;
alter table public.idempotency_keys enable row level security;

create policy "evses readable" on public.evses for select using (true);
create policy "operating hours readable" on public.operating_hours for select using (true);
create policy "booking rules readable" on public.booking_rules for select using (true);
create policy "tariffs readable" on public.tariffs for select using (is_active);
create policy "tariff components readable" on public.tariff_components for select
  using (exists (select 1 from public.tariffs t where t.id = tariff_id and t.is_active));
create policy "own bookings readable" on public.bookings for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own booking events readable" on public.booking_events for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and b.user_id = (select auth.uid())));
-- No write policies: bookings change only through the functions above.
-- idempotency_keys has no policies at all (internal table).

-- ---------- Expose the station time zone in the summary view -----------
create or replace view public.station_summaries with (security_invoker = true) as
select s.id, s.name, s.address, s.city, s.lat, s.lng, s.operator, s.access, s.hours, s.price_info,
  s.is_demo, s.created_by, s.created_at,
  (select c.status from public.checkins c where c.station_id = s.id order by c.created_at desc limit 1) as last_status,
  (select c.created_at from public.checkins c where c.station_id = s.id order by c.created_at desc limit 1) as last_checkin_at,
  (select coalesce(max(k.power_kw),0) from public.connectors k where k.station_id = s.id) as max_power_kw,
  (select coalesce(array_agg(distinct k.type), '{}') from public.connectors k where k.station_id = s.id) as connector_types,
  s.city_is_approx, s.state, s.postal_code, s.data_source, s.external_id, s.source_updated_at,
  s.time_zone
from public.stations s;
