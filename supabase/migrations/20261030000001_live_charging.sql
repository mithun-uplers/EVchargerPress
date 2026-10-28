-- Live charging: charger networks, OCPP 1.6J ingestion, live EVSE status, meter values,
-- remote start/stop commands and a charger simulator.
--
-- Principles
--  * Live data is only ever written by a charger integration (OCPP / operator API) or the
--    simulator. Every row records where it came from and whether it is simulated, and the
--    UI must label simulated data as such.
--  * Additive only: new tables, new nullable columns, new functions.
--  * OCPP over WebSocket needs a long-lived connection, which serverless hosting can't keep.
--    A gateway (or the bundled simulator) relays OCPP-J frames to public.ocpp_ingest over
--    HTTPS and polls public.ocpp_poll_commands for CSMS→charger calls.

-- ---------- Networks and charge points ---------------------------------
create table public.charger_networks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(name) between 1 and 80),
  protocol text not null check (protocol in ('ocpp16j', 'ocpp201', 'ocpi221', 'simulator')),
  is_simulated boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- One OCPP connection (chargeBoxIdentity). Its secret is stored only as a bcrypt hash.
create table public.charge_points (
  id uuid primary key default gen_random_uuid(),
  network_id uuid not null references public.charger_networks(id) on delete restrict,
  station_id uuid not null references public.stations(id) on delete cascade,
  identity text not null unique check (identity ~ '^[A-Za-z0-9._-]{3,48}$'),
  secret_hash text not null,
  is_simulated boolean not null default false,
  vendor text check (char_length(vendor) <= 50),
  model text check (char_length(model) <= 50),
  firmware_version text check (char_length(firmware_version) <= 50),
  last_boot_at timestamptz,
  last_heartbeat_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index charge_points_station_idx on public.charge_points (station_id);

-- ---------- Live status on charging points -----------------------------
alter table public.evses
  add column if not exists charge_point_id uuid references public.charge_points(id) on delete set null,
  add column if not exists ocpp_connector_id int check (ocpp_connector_id between 1 and 32),
  add column if not exists live_status text check (live_status in
    ('available', 'preparing', 'charging', 'suspended_ev', 'suspended_evse', 'finishing', 'reserved', 'unavailable', 'faulted')),
  add column if not exists live_status_at timestamptz,
  add column if not exists live_error_code text check (char_length(live_error_code) <= 50),
  add column if not exists live_source text check (live_source in ('charger_ocpp', 'operator_api')),
  add column if not exists live_is_simulated boolean not null default false,
  add column if not exists sim_register_wh numeric(14,1) not null default 0;  -- simulator's energy meter
create unique index if not exists evses_charge_point_connector_idx
  on public.evses (charge_point_id, ocpp_connector_id) where charge_point_id is not null;

-- ---------- Live sessions ----------------------------------------------
alter table public.charging_sessions
  add column if not exists charge_point_id uuid references public.charge_points(id) on delete set null,
  add column if not exists ocpp_transaction_id int,
  add column if not exists id_tag text check (char_length(id_tag) <= 20),
  add column if not exists meter_start_wh numeric(14,1),
  add column if not exists meter_stop_wh numeric(14,1),
  add column if not exists last_meter_at timestamptz,
  add column if not exists last_power_kw numeric(7,2),
  add column if not exists start_soc_percent numeric(5,2) check (start_soc_percent between 0 and 100),
  add column if not exists last_soc_percent numeric(5,2) check (last_soc_percent between 0 and 100),
  add column if not exists stop_reason text check (char_length(stop_reason) <= 40),
  add column if not exists is_simulated boolean not null default false,
  add column if not exists cost_basis text check (cost_basis in ('tariff_snapshot', 'operator_receipt', 'manual'));
create unique index if not exists charging_sessions_ocpp_tx_idx
  on public.charging_sessions (charge_point_id, ocpp_transaction_id) where ocpp_transaction_id is not null;
create index if not exists charging_sessions_live_idx on public.charging_sessions (status) where status = 'in_progress';

create sequence if not exists app.ocpp_transaction_seq start 1000;

-- Samples reported by the charger during a session (energy is session energy, not the register).
create table public.meter_values (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.charging_sessions(id) on delete cascade,
  recorded_at timestamptz not null,
  energy_wh numeric(12,1) check (energy_wh >= 0),
  power_w numeric(10,1) check (power_w >= 0),
  soc_percent numeric(5,2) check (soc_percent between 0 and 100),
  voltage_v numeric(7,1),
  current_a numeric(7,1),
  source text not null check (source in ('charger_ocpp', 'operator_api')),
  is_simulated boolean not null default false,
  created_at timestamptz not null default now()
);
create index meter_values_session_idx on public.meter_values (session_id, recorded_at);

-- CSMS → charger calls (RemoteStart/RemoteStop). A gateway polls and reports results.
create table public.charger_commands (
  id uuid primary key default gen_random_uuid(),
  charge_point_id uuid not null references public.charge_points(id) on delete cascade,
  evse_id uuid references public.evses(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  session_id uuid references public.charging_sessions(id) on delete set null,
  action text not null check (action in ('RemoteStartTransaction', 'RemoteStopTransaction')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'accepted', 'rejected', 'expired')),
  result jsonb,
  requested_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  completed_at timestamptz
);
create index charger_commands_pending_idx on public.charger_commands (charge_point_id, created_at) where status = 'pending';
create index charger_commands_booking_idx on public.charger_commands (booking_id);

-- Raw OCPP traffic for audit and debugging (no policies: not readable through the API).
create table public.ocpp_messages (
  id bigint generated always as identity primary key,
  charge_point_id uuid references public.charge_points(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  action text,
  message_id text,
  frame jsonb not null,
  response jsonb,
  created_at timestamptz not null default now()
);
create index ocpp_messages_cp_idx on public.ocpp_messages (charge_point_id, created_at desc);

-- ---------- Helpers ------------------------------------------------------
-- Cost of a session from the booking's frozen price snapshot (idle fees are not measured yet).
create or replace function app.session_cost(p_snapshot jsonb, p_kwh numeric, p_minutes numeric)
returns int language plpgsql immutable set search_path = '' as $$
declare l jsonb; net numeric := 0; bp int; total numeric;
begin
  if p_snapshot is null then return null; end if;
  for l in select x from jsonb_array_elements(coalesce(p_snapshot->'lines', '[]'::jsonb)) as t(x) loop
    if l->>'payable' <> 'at_session' then continue; end if;
    net := net + case l->>'type'
      when 'energy_kwh' then (l->>'unit_price_minor')::numeric * greatest(p_kwh, 0)
      when 'time_min' then (l->>'unit_price_minor')::numeric * greatest(p_minutes, 0)
      when 'session_fixed' then (l->>'amount_minor')::numeric
      else 0 end;
  end loop;
  bp := coalesce((p_snapshot->'tariff'->>'tax_rate_bp')::int, 0);
  total := case when p_snapshot->'tariff'->>'tax_mode' = 'exclusive' then net * (1 + bp / 10000.0) else net end;
  return round(total)::int;
end $$;

-- OCPP 1.6 sampledValue → number in base units (Wh, W, %, V, A). Measurand defaults to the energy register.
create or replace function app.ocpp_sample(p_meter_value jsonb, p_measurand text)
returns numeric language plpgsql immutable set search_path = '' as $$
declare s jsonb; v numeric;
begin
  for s in select x from jsonb_array_elements(coalesce(p_meter_value->'sampledValue', '[]'::jsonb)) as t(x) loop
    if coalesce(s->>'measurand', 'Energy.Active.Import.Register') = p_measurand
       and s->>'phase' is null                                       -- totals, not per-phase values
       and coalesce(s->>'context', 'Sample.Periodic') <> 'Transaction.Begin' then
      begin v := (s->>'value')::numeric; exception when others then continue; end;
      if s->>'unit' in ('kWh', 'kW') then v := v * 1000; end if;
      return v;
    end if;
  end loop;
  return null;
end $$;

create or replace function app.ocpp_status(p text) returns text
language sql immutable set search_path = '' as $$
  select case p
    when 'Available' then 'available' when 'Preparing' then 'preparing' when 'Charging' then 'charging'
    when 'SuspendedEV' then 'suspended_ev' when 'SuspendedEVSE' then 'suspended_evse' when 'Finishing' then 'finishing'
    when 'Reserved' then 'reserved' when 'Unavailable' then 'unavailable' when 'Faulted' then 'faulted' end
$$;

create or replace function app.ocpp_time(p text, p_now timestamptz) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare t timestamptz;
begin
  begin t := p::timestamptz; exception when others then t := null; end;
  -- Charger clocks drift; never accept timestamps from the future.
  if t is null or t > p_now + interval '5 minutes' then return p_now; end if;
  return t;
end $$;

-- ---------- OCPP 1.6J message handling (charger → CSMS) -----------------
create or replace function app.ocpp_handle(p_cp public.charge_points, p_action text, p in jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_now timestamptz := app.now();
  ev public.evses;
  bk public.bookings;
  ses public.charging_sessions;
  mv jsonb;
  t timestamptz;
  e_wh numeric; p_w numeric; soc numeric; volt numeric; amp numeric;
  tx int;
  kwh numeric;
  src text := 'charger_ocpp';
begin
  case p_action
  when 'BootNotification' then
    update public.charge_points set vendor = left(p->>'chargePointVendor', 50), model = left(p->>'chargePointModel', 50),
      firmware_version = left(p->>'firmwareVersion', 50), last_boot_at = v_now, last_heartbeat_at = v_now
     where id = p_cp.id;
    return jsonb_build_object('status', 'Accepted', 'currentTime', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'interval', 60);

  when 'Heartbeat' then
    update public.charge_points set last_heartbeat_at = v_now where id = p_cp.id;
    return jsonb_build_object('currentTime', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));

  when 'StatusNotification' then
    update public.charge_points set last_heartbeat_at = v_now where id = p_cp.id;
    if coalesce((p->>'connectorId')::int, 0) > 0 then
      if app.ocpp_status(p->>'status') is null then
        raise exception 'bad_status' using errcode = '22023', detail = 'PropertyConstraintViolation';
      end if;
      update public.evses
         set live_status = app.ocpp_status(p->>'status'),
             live_status_at = app.ocpp_time(p->>'timestamp', v_now),
             live_error_code = nullif(left(p->>'errorCode', 50), 'NoError'),
             live_source = src, live_is_simulated = p_cp.is_simulated
       where charge_point_id = p_cp.id and ocpp_connector_id = (p->>'connectorId')::int;
    end if;
    return '{}'::jsonb;

  when 'Authorize' then
    select b.* into bk from public.bookings b join public.evses e on e.id = b.evse_id
     where b.reference = upper(p->>'idTag') and b.status = 'checked_in' and e.charge_point_id = p_cp.id
       and v_now < upper(b.period);
    return jsonb_build_object('idTagInfo', jsonb_build_object('status', case when found then 'Accepted' else 'Invalid' end));

  when 'StartTransaction' then
    select * into ev from public.evses where charge_point_id = p_cp.id and ocpp_connector_id = (p->>'connectorId')::int;
    if found then
      select * into bk from public.bookings b
       where b.reference = upper(p->>'idTag') and b.status = 'checked_in' and b.evse_id = ev.id and v_now < upper(b.period)
       for update;
    end if;
    if ev.id is null or bk.id is null then
      return jsonb_build_object('transactionId', 0, 'idTagInfo', jsonb_build_object('status', 'Invalid'));
    end if;
    -- One live session per booking: a repeated StartTransaction returns the same transaction.
    select * into ses from public.charging_sessions s where s.booking_id = bk.id and s.status = 'in_progress' and s.charge_point_id = p_cp.id;
    if found then
      return jsonb_build_object('transactionId', ses.ocpp_transaction_id, 'idTagInfo', jsonb_build_object('status', 'Accepted'));
    end if;
    tx := nextval('app.ocpp_transaction_seq');
    insert into public.charging_sessions (user_id, booking_id, vehicle_id, started_at, energy_kwh, currency, source, status,
                                          charge_point_id, ocpp_transaction_id, id_tag, meter_start_wh, last_meter_at, is_simulated, cost_basis)
    values (bk.user_id, bk.id, bk.vehicle_id, least(app.ocpp_time(p->>'timestamp', v_now), v_now), 0, bk.currency, src, 'in_progress',
            p_cp.id, tx, bk.reference, coalesce((p->>'meterStart')::numeric, 0), v_now, p_cp.is_simulated, 'tariff_snapshot');
    return jsonb_build_object('transactionId', tx, 'idTagInfo', jsonb_build_object('status', 'Accepted'));

  when 'MeterValues' then
    select * into ses from public.charging_sessions
     where charge_point_id = p_cp.id and ocpp_transaction_id = (p->>'transactionId')::int and status = 'in_progress' for update;
    if not found then return '{}'::jsonb; end if;   -- samples outside a transaction are ignored
    for mv in select x from jsonb_array_elements(coalesce(p->'meterValue', '[]'::jsonb)) as t(x) loop
      t := app.ocpp_time(mv->>'timestamp', v_now);
      e_wh := app.ocpp_sample(mv, 'Energy.Active.Import.Register');
      p_w := app.ocpp_sample(mv, 'Power.Active.Import');
      soc := app.ocpp_sample(mv, 'SoC');
      volt := app.ocpp_sample(mv, 'Voltage');
      amp := app.ocpp_sample(mv, 'Current.Import');
      if soc is not null and (soc < 0 or soc > 100) then soc := null; end if;
      insert into public.meter_values (session_id, recorded_at, energy_wh, power_w, soc_percent, voltage_v, current_a, source, is_simulated)
      values (ses.id, t, case when e_wh is not null then greatest(e_wh - ses.meter_start_wh, 0) end, greatest(p_w, 0), soc, volt, amp,
              src, p_cp.is_simulated);
      if t >= coalesce(ses.last_meter_at, '-infinity') then
        update public.charging_sessions s
           set energy_kwh = coalesce(round(greatest(e_wh - s.meter_start_wh, 0) / 1000.0, 3), s.energy_kwh),
               last_power_kw = coalesce(round(p_w / 1000.0, 2), s.last_power_kw),
               last_soc_percent = coalesce(soc, s.last_soc_percent),
               start_soc_percent = coalesce(s.start_soc_percent, soc),
               last_meter_at = t
         where s.id = ses.id returning * into ses;
      end if;
    end loop;
    return '{}'::jsonb;

  when 'StopTransaction' then
    select * into ses from public.charging_sessions
     where charge_point_id = p_cp.id and ocpp_transaction_id = (p->>'transactionId')::int for update;
    if not found then return jsonb_build_object('idTagInfo', jsonb_build_object('status', 'Invalid')); end if;
    if ses.status = 'in_progress' then
      t := greatest(app.ocpp_time(p->>'timestamp', v_now), ses.started_at + interval '1 second');
      kwh := round(greatest(coalesce((p->>'meterStop')::numeric, ses.meter_start_wh + coalesce(ses.energy_kwh, 0) * 1000) - ses.meter_start_wh, 0) / 1000.0, 3);
      select * into bk from public.bookings where id = ses.booking_id;
      update public.charging_sessions s
         set status = 'completed', ended_at = t, energy_kwh = kwh, meter_stop_wh = (p->>'meterStop')::numeric,
             stop_reason = left(coalesce(p->>'reason', 'Local'), 40), last_power_kw = 0,
             total_cost_minor = app.session_cost(bk.price_snapshot, kwh, extract(epoch from t - s.started_at) / 60)
       where s.id = ses.id;
    end if;
    return jsonb_build_object('idTagInfo', jsonb_build_object('status', 'Accepted'));

  else
    raise exception 'not_supported' using errcode = '0A000', detail = 'NotSupported';
  end case;
end $$;

create or replace function app.ocpp_charge_point(p_identity text, p_secret text) returns public.charge_points
language plpgsql stable security definer set search_path = '' as $$
declare cp public.charge_points;
begin
  select * into cp from public.charge_points c where c.identity = p_identity and c.is_active;
  if not found or p_secret is null or cp.secret_hash <> extensions.crypt(p_secret, cp.secret_hash) then
    raise exception 'invalid_credentials' using errcode = '28000', detail = 'Unknown charge point or wrong secret.';
  end if;
  return cp;
end $$;

-- ---------- Public API: OCPP gateway ------------------------------------
-- Accepts one OCPP-J frame from a charger (via a gateway) and returns the reply frame.
--   CALL        [2, "<id>", "<Action>", {payload}]  → [3, "<id>", {result}] or [4, "<id>", "<ErrorCode>", "<desc>", {}]
--   CALLRESULT  [3, "<id>", {payload}]               → reply to a command we sent (RemoteStart/Stop); returns null
--   CALLERROR   [4, "<id>", code, desc, {}]          → command rejected; returns null
create or replace function public.ocpp_ingest(p_identity text, p_secret text, p_frame jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare cp public.charge_points; kind int; msg_id text; action text; reply jsonb; payload jsonb;
begin
  cp := app.ocpp_charge_point(p_identity, p_secret);
  if jsonb_typeof(p_frame) <> 'array' or jsonb_array_length(p_frame) < 3 then
    raise exception 'bad_frame' using errcode = '22023', detail = 'Expected an OCPP-J array frame.';
  end if;
  kind := (p_frame->>0)::int;
  msg_id := left(p_frame->>1, 36);

  if kind in (3, 4) then   -- answer to one of our commands
    update public.charger_commands c
       set status = case when kind = 3 and p_frame->2->>'status' = 'Accepted' then 'accepted' else 'rejected' end,
           result = p_frame, completed_at = app.now()
     where c.id::text = msg_id and c.charge_point_id = cp.id and c.status = 'sent';
    insert into public.ocpp_messages (charge_point_id, direction, action, message_id, frame) values (cp.id, 'in', 'CommandResult', msg_id, p_frame);
    return null;
  end if;
  if kind <> 2 or jsonb_array_length(p_frame) <> 4 then
    raise exception 'bad_frame' using errcode = '22023', detail = 'Expected [2, id, action, payload].';
  end if;
  action := p_frame->>2;
  payload := p_frame->3;
  begin
    reply := jsonb_build_array(3, msg_id, app.ocpp_handle(cp, action, payload));
  exception
    when sqlstate '0A000' then reply := jsonb_build_array(4, msg_id, 'NotImplemented', format('%s is not supported', action), '{}'::jsonb);
    when sqlstate '22023' or sqlstate '22P02' or sqlstate '22003' then
      reply := jsonb_build_array(4, msg_id, 'FormationViolation', 'Invalid payload', '{}'::jsonb);
    when others then
      reply := jsonb_build_array(4, msg_id, 'InternalError', 'Could not process the message', '{}'::jsonb);
  end;
  insert into public.ocpp_messages (charge_point_id, direction, action, message_id, frame, response)
  values (cp.id, 'in', left(action, 40), msg_id, p_frame, reply);
  return reply;
end $$;

-- Hands pending commands to the gateway as OCPP-J CALL frames and marks them sent.
create or replace function public.ocpp_poll_commands(p_identity text, p_secret text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare cp public.charge_points; frames jsonb;
begin
  cp := app.ocpp_charge_point(p_identity, p_secret);
  update public.charger_commands set status = 'expired', completed_at = app.now()
   where charge_point_id = cp.id and status in ('pending', 'sent') and created_at < app.now() - interval '2 minutes';
  with sent as (
    update public.charger_commands c set status = 'sent', sent_at = app.now()
     where c.charge_point_id = cp.id and c.status = 'pending'
    returning c.id, c.action, c.payload, c.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_array(2, id::text, action, payload) order by created_at), '[]'::jsonb) into frames from sent;
  if jsonb_array_length(frames) > 0 then
    insert into public.ocpp_messages (charge_point_id, direction, action, frame) values (cp.id, 'out', 'Commands', frames);
  end if;
  return frames;
end $$;

-- ---------- Public API: drivers ------------------------------------------
-- Ask the charger to start charging for a booking. Checks in first if the booking is confirmed.
create or replace function public.start_charging(p_booking_id uuid)
returns public.charger_commands language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_now timestamptz := app.now(); b public.bookings; ev public.evses; cmd public.charger_commands;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'EVB01', detail = 'Sign in first.'; end if;
  select * into b from public.bookings bk where bk.id = p_booking_id and bk.user_id = uid for update;
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'Booking not found.'; end if;
  if b.status = 'confirmed' then b := public.check_in_booking(b.id); end if;
  if b.status <> 'checked_in' or v_now >= upper(b.period) then
    raise exception 'invalid_transition' using errcode = 'EVB11', detail = 'Charging can start only during a checked-in booking.';
  end if;
  select * into ev from public.evses e where e.id = b.evse_id;
  if ev.charge_point_id is null then
    raise exception 'not_connected' using errcode = 'EVB19',
      detail = 'This charger isn’t connected to EVChargePress yet. Start charging on the charger itself.';
  end if;
  if exists (select 1 from public.charging_sessions s where s.booking_id = b.id and s.status = 'in_progress') then
    raise exception 'already_charging' using errcode = 'EVB20', detail = 'Charging has already started.';
  end if;
  select * into cmd from public.charger_commands c
   where c.booking_id = b.id and c.action = 'RemoteStartTransaction' and c.status in ('pending', 'sent')
     and c.created_at > v_now - interval '2 minutes';
  if found then return cmd; end if;   -- repeat tap = same request
  insert into public.charger_commands (charge_point_id, evse_id, booking_id, action, payload, requested_by, created_at)
  values (ev.charge_point_id, ev.id, b.id, 'RemoteStartTransaction',
          jsonb_build_object('connectorId', ev.ocpp_connector_id, 'idTag', b.reference), uid, v_now)
  returning * into cmd;
  return cmd;
end $$;

create or replace function public.stop_charging(p_session_id uuid)
returns public.charger_commands language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_now timestamptz := app.now(); s public.charging_sessions; cmd public.charger_commands;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'EVB01', detail = 'Sign in first.'; end if;
  select * into s from public.charging_sessions cs where cs.id = p_session_id and cs.user_id = uid;
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'Session not found.'; end if;
  if s.status <> 'in_progress' or s.charge_point_id is null then
    raise exception 'not_charging' using errcode = 'EVB21', detail = 'This session isn’t charging.';
  end if;
  select * into cmd from public.charger_commands c
   where c.session_id = s.id and c.action = 'RemoteStopTransaction' and c.status in ('pending', 'sent')
     and c.created_at > v_now - interval '2 minutes';
  if found then return cmd; end if;
  insert into public.charger_commands (charge_point_id, evse_id, booking_id, session_id, action, payload, requested_by, created_at)
  values (s.charge_point_id, s.evse_id, s.booking_id, s.id, 'RemoteStopTransaction',
          jsonb_build_object('transactionId', s.ocpp_transaction_id), uid, v_now)
  returning * into cmd;
  return cmd;
end $$;

-- Everything the live session screen needs in one call (polled every few seconds).
create or replace function public.live_session(p_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); v_now timestamptz := app.now(); s public.charging_sessions; b public.bookings; r jsonb;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'EVB01', detail = 'Sign in first.'; end if;
  select * into s from public.charging_sessions cs where cs.id = p_session_id and cs.user_id = uid;
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'Session not found.'; end if;
  select * into b from public.bookings where id = s.booking_id;
  select jsonb_build_object(
    'session', to_jsonb(s) - 'id_tag' - 'created_by',
    'now', v_now,
    'cost_so_far_minor', case when s.status = 'in_progress' and b.id is not null
      then app.session_cost(b.price_snapshot, coalesce(s.energy_kwh, 0), extract(epoch from v_now - s.started_at) / 60) end,
    'booking', case when b.id is null then null else jsonb_build_object('id', b.id, 'reference', b.reference, 'status', b.status,
      'start', lower(b.period), 'end', upper(b.period), 'currency', b.currency,
      'energy_unit_price_minor', (select (l->>'unit_price_minor')::int from jsonb_array_elements(b.price_snapshot->'lines') l where l->>'type' = 'energy_kwh' limit 1)) end,
    'station', (select jsonb_build_object('id', st.id, 'name', st.name, 'time_zone', st.time_zone, 'address', st.address) from public.stations st where st.id = s.station_id),
    'evse', (select jsonb_build_object('id', e.id, 'label', e.label, 'max_power_kw', e.max_power_kw, 'live_status', e.live_status, 'live_status_at', e.live_status_at)
             from public.evses e where e.id = s.evse_id),
    'vehicle', (select jsonb_build_object('id', v.id, 'label', coalesce(v.nickname, v.make || ' ' || v.model), 'battery_capacity_kwh', v.battery_capacity_kwh)
                from public.vehicles v where v.id = s.vehicle_id),
    'pending_command', (select jsonb_build_object('action', c.action, 'status', c.status, 'created_at', c.created_at)
                        from public.charger_commands c where (c.session_id = s.id or (c.booking_id = s.booking_id and c.action = 'RemoteStopTransaction'))
                         and c.status in ('pending', 'sent') order by c.created_at desc limit 1),
    'samples', (select coalesce(jsonb_agg(jsonb_build_object('t', m.recorded_at, 'wh', m.energy_wh, 'w', m.power_w, 'soc', m.soc_percent) order by m.recorded_at), '[]'::jsonb)
                from (select * from public.meter_values mv where mv.session_id = s.id order by mv.recorded_at desc limit 240) m)
  ) into r;
  return r;
end $$;

-- ---------- Views ----------------------------------------------------------
-- Live status is only shown while fresh (≤ 15 minutes old); otherwise "no live status".
create or replace view public.evse_live_status with (security_invoker = true) as
select e.id as evse_id, e.station_id, e.label, e.max_power_kw, e.is_bookable,
  e.charge_point_id is not null as is_connected,
  e.live_status, e.live_status_at, e.live_error_code, e.live_source, e.live_is_simulated,
  (e.live_status is not null and e.live_status_at > pg_catalog.now() - interval '15 minutes') as is_fresh
from public.evses e
where e.is_active;

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
   and exists (select 1 from public.evses e where e.station_id = s.id and e.is_bookable and e.is_active)) as is_bookable,
  l.live_evse_count, l.live_available_count, l.live_is_simulated, l.live_updated_at
from public.stations s
left join lateral (
  select count(*)::int as live_evse_count,
         count(*) filter (where e.live_status = 'available')::int as live_available_count,
         bool_or(e.live_is_simulated) as live_is_simulated,
         max(e.live_status_at) as live_updated_at
  from public.evses e
  where e.station_id = s.id and e.is_active and e.live_status is not null and e.live_status_at > pg_catalog.now() - interval '15 minutes'
) l on true;

-- ---------- Charger simulator ----------------------------------------------
-- Drives simulated charge points through the same app.ocpp_handle path a real charger uses.
-- Run by pg_cron every 10 seconds. Everything it writes carries is_simulated = true.
create or replace function app.simulator_tick() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_now timestamptz := app.now();
  c record; s record; e record;
  cp public.charge_points;
  res jsonb;
  hrs numeric; bat numeric; pmax numeric; pw numeric; soc numeric; add_wh numeric; reg numeric;
  n_cmd int := 0; n_mv int := 0; n_stop int := 0;
  ts text := to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
begin
  -- 1. Commands addressed to simulated charge points.
  for c in select cmd.*, ev.ocpp_connector_id, ev.sim_register_wh from public.charger_commands cmd
             join public.charge_points p on p.id = cmd.charge_point_id and p.is_simulated
             left join public.evses ev on ev.id = cmd.evse_id
            where cmd.status = 'pending' order by cmd.created_at loop
    select * into cp from public.charge_points where id = c.charge_point_id;
    n_cmd := n_cmd + 1;
    if c.action = 'RemoteStartTransaction' then
      perform app.ocpp_handle(cp, 'StatusNotification', jsonb_build_object('connectorId', c.ocpp_connector_id, 'status', 'Preparing', 'errorCode', 'NoError', 'timestamp', ts));
      res := app.ocpp_handle(cp, 'StartTransaction', jsonb_build_object('connectorId', c.ocpp_connector_id, 'idTag', c.payload->>'idTag',
               'meterStart', c.sim_register_wh, 'timestamp', ts));
      if res->'idTagInfo'->>'status' = 'Accepted' then
        update public.charging_sessions set evse_id = c.evse_id where charge_point_id = cp.id and ocpp_transaction_id = (res->>'transactionId')::int and evse_id is null;
        perform app.ocpp_handle(cp, 'StatusNotification', jsonb_build_object('connectorId', c.ocpp_connector_id, 'status', 'Charging', 'errorCode', 'NoError', 'timestamp', ts));
        update public.charger_commands set status = 'accepted', sent_at = v_now, completed_at = v_now, result = jsonb_build_object('status', 'Accepted'),
               session_id = (select id from public.charging_sessions where charge_point_id = cp.id and ocpp_transaction_id = (res->>'transactionId')::int)
         where id = c.id;
      else
        perform app.ocpp_handle(cp, 'StatusNotification', jsonb_build_object('connectorId', c.ocpp_connector_id, 'status', 'Available', 'errorCode', 'NoError', 'timestamp', ts));
        update public.charger_commands set status = 'rejected', sent_at = v_now, completed_at = v_now, result = jsonb_build_object('status', 'Rejected') where id = c.id;
      end if;
    else
      update public.charger_commands set status = 'accepted', sent_at = v_now, completed_at = v_now, result = jsonb_build_object('status', 'Accepted') where id = c.id;
      -- The stop itself happens in step 2 on this tick.
    end if;
  end loop;

  -- 2. Meter values for simulated sessions in progress (power tapers above 80 % SoC).
  for s in select cs.*, ev.max_power_kw, ev.ocpp_connector_id, ev.sim_register_wh, v.battery_capacity_kwh, v.max_dc_kw, v.max_ac_kw,
                  upper(b.period) as booking_end,
                  (select br.soc_percent from public.battery_readings br where br.vehicle_id = cs.vehicle_id and br.soc_percent is not null
                    order by br.recorded_at desc limit 1) as manual_soc,
                  exists (select 1 from public.charger_commands k where k.session_id = cs.id and k.action = 'RemoteStopTransaction' and k.status = 'accepted') as stop_requested
             from public.charging_sessions cs
             join public.charge_points p on p.id = cs.charge_point_id and p.is_simulated
             join public.evses ev on ev.id = cs.evse_id
             left join public.vehicles v on v.id = cs.vehicle_id
             left join public.bookings b on b.id = cs.booking_id
            where cs.status = 'in_progress' loop
    select * into cp from public.charge_points where id = s.charge_point_id;
    hrs := greatest(extract(epoch from v_now - coalesce(s.last_meter_at, s.started_at)) / 3600.0, 0);
    bat := coalesce(s.battery_capacity_kwh, 40);
    pmax := least(coalesce(s.max_power_kw, 7.4),
                  case when coalesce(s.max_power_kw, 7.4) > 22 then coalesce(s.max_dc_kw, s.max_power_kw, 50) else coalesce(s.max_ac_kw, s.max_power_kw, 7.4) end);
    soc := coalesce(s.last_soc_percent, s.manual_soc, 30);
    pw := case when soc < 80 then pmax else greatest(pmax * (1 - (soc - 80) / 25.0), pmax * 0.15) end;
    if soc >= 100 then pw := 0; end if;
    add_wh := least(pw * 1000 * hrs, (100 - soc) / 100.0 * bat * 1000);
    soc := least(100, soc + add_wh / (bat * 1000) * 100);
    reg := s.sim_register_wh + add_wh;
    update public.evses set sim_register_wh = reg where id = s.evse_id;
    perform app.ocpp_handle(cp, 'MeterValues', jsonb_build_object('connectorId', s.ocpp_connector_id, 'transactionId', s.ocpp_transaction_id,
      'meterValue', jsonb_build_array(jsonb_build_object('timestamp', ts, 'sampledValue', jsonb_build_array(
        jsonb_build_object('measurand', 'Energy.Active.Import.Register', 'unit', 'Wh', 'value', round(reg, 1)::text),
        jsonb_build_object('measurand', 'Power.Active.Import', 'unit', 'W', 'value', round(case when soc >= 100 then 0 else pw * 1000 end)::text),
        jsonb_build_object('measurand', 'SoC', 'unit', 'Percent', 'value', round(soc, 1)::text))))));
    n_mv := n_mv + 1;
    if s.stop_requested or soc >= 100 or (s.booking_end is not null and v_now >= s.booking_end) then
      perform app.ocpp_handle(cp, 'StopTransaction', jsonb_build_object('transactionId', s.ocpp_transaction_id, 'meterStop', round(reg, 1),
        'timestamp', ts, 'reason', case when s.stop_requested then 'Remote' when soc >= 100 then 'EVDisconnected' else 'Local' end));
      perform app.ocpp_handle(cp, 'StatusNotification', jsonb_build_object('connectorId', s.ocpp_connector_id, 'status', 'Available', 'errorCode', 'NoError', 'timestamp', ts));
      n_stop := n_stop + 1;
    end if;
  end loop;

  -- 3. Heartbeat + idle status for simulated connectors (Reserved while a booking holds the slot).
  for e in select ev.id, ev.ocpp_connector_id, ev.charge_point_id, ev.live_status,
                  exists (select 1 from public.bookings b where b.evse_id = ev.id and b.status in ('confirmed', 'checked_in') and b.period @> v_now) as reserved,
                  exists (select 1 from public.charging_sessions cs where cs.evse_id = ev.id and cs.status = 'in_progress') as busy
             from public.evses ev join public.charge_points p on p.id = ev.charge_point_id and p.is_simulated and p.is_active loop
    select * into cp from public.charge_points where id = e.charge_point_id;
    if not e.busy then
      perform app.ocpp_handle(cp, 'StatusNotification', jsonb_build_object('connectorId', e.ocpp_connector_id,
        'status', case when e.reserved then 'Reserved' else 'Available' end, 'errorCode', 'NoError', 'timestamp', ts));
    else
      update public.evses set live_status_at = v_now where id = e.id;   -- still charging: keep it fresh
    end if;
  end loop;
  update public.charge_points set last_heartbeat_at = v_now where is_simulated and is_active;

  return jsonb_build_object('commands', n_cmd, 'meter_values', n_mv, 'stopped', n_stop);
end $$;

-- Registers a charge point and returns its one-time secret (admin / setup scripts only).
create or replace function app.register_charge_point(p_network_slug text, p_station_id uuid, p_identity text, p_simulated boolean default false)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare secret text := encode(extensions.gen_random_bytes(24), 'hex'); nid uuid;
begin
  select id into nid from public.charger_networks where slug = p_network_slug;
  if nid is null then raise exception 'unknown network %', p_network_slug; end if;
  insert into public.charge_points (network_id, station_id, identity, secret_hash, is_simulated)
  values (nid, p_station_id, p_identity, extensions.crypt(secret, extensions.gen_salt('bf', 10)), p_simulated)
  on conflict (identity) do update set secret_hash = excluded.secret_hash, is_active = true;
  return secret;
end $$;

-- ---------- Row level security ---------------------------------------------
alter table public.charger_networks enable row level security;
alter table public.charge_points enable row level security;      -- no policies: secret hashes stay private
alter table public.meter_values enable row level security;
alter table public.charger_commands enable row level security;
alter table public.ocpp_messages enable row level security;      -- no policies: audit log only

create policy "networks readable" on public.charger_networks for select using (true);
create policy "own meter values readable" on public.meter_values for select to authenticated
  using (exists (select 1 from public.charging_sessions s where s.id = session_id and s.user_id = (select auth.uid())));
create policy "own charger commands readable" on public.charger_commands for select to authenticated
  using (requested_by = (select auth.uid()));
