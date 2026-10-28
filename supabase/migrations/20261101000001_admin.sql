-- =====================================================================
-- Admin role and admin panel support (2026-11-01). Additive only.
--
-- * user_roles + public.is_admin(): one 'admin' role for running the app.
-- * Stations and connectors become admin-managed: RESTRICTIVE policies
--   stop drivers adding, editing or deleting them (existing permissive
--   policies stay in place and keep their meaning for admins).
-- * Admins manage charging points, hours, booking rules and tariffs; can
--   read every booking and session; moderate check-ins and reviews.
-- * Suspended accounts cannot book, check in or review (EVB23).
-- * admin_audit records every admin change.
-- =====================================================================

-- ---------- Roles ----------------------------------------------------------
create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('admin')),
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,              -- kept for history instead of deleting the row
  revoked_by uuid references public.profiles(id) on delete set null,
  primary key (user_id, role)
);

-- True when the signed-in user is an active admin. Safe for anyone to call.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin' and r.revoked_at is null)
     and coalesce((select p.status from public.profiles p where p.id = auth.uid()), 'active') = 'active'
$$;

create or replace function app.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'EVB01', detail = 'Sign in first.'; end if;
  if not public.is_admin() then raise exception 'forbidden' using errcode = '42501', detail = 'Admins only.'; end if;
  return auth.uid();
end $$;

-- True unless the signed-in user's account is suspended.
create or replace function public.account_in_good_standing() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.status from public.profiles p where p.id = auth.uid()), 'active') <> 'suspended'
$$;

-- Network for real OCPP 1.6J chargers registered from the admin panel.
insert into public.charger_networks (slug, name, protocol, is_simulated)
values ('evcp-ocpp', 'EVChargePress OCPP', 'ocpp16j', false)
on conflict (slug) do nothing;

-- ---------- Station verification ------------------------------------------
alter table public.stations
  add column if not exists is_verified boolean not null default false,
  add column if not exists verified_at timestamptz,
  add column if not exists updated_at timestamptz;

-- ---------- Audit log -----------------------------------------------------
create table if not exists public.admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 1 and 60),
  target_table text not null,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_created_idx on public.admin_audit (created_at desc);
create index if not exists admin_audit_target_idx on public.admin_audit (target_table, target_id);

create or replace function app.audit(p_action text, p_table text, p_id text, p_detail jsonb default '{}'::jsonb)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.admin_audit (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), p_action, p_table, p_id, coalesce(p_detail, '{}'::jsonb));
$$;

create or replace function app.admin_audit_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'admin_audit is append-only' using errcode = 'EVB10';
end $$;
create or replace trigger admin_audit_append_only before update on public.admin_audit
  for each row execute function app.admin_audit_append_only();

-- Row-change audit for admin-managed tables; logs only changes made by an admin session.
create or replace function app.audit_admin_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o jsonb; n jsonb; changed jsonb; rid text;
begin
  if not public.is_admin() then return null; end if;
  o := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  n := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  rid := coalesce(n->>'id', o->>'id', n->>'station_id', o->>'station_id');
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(k, jsonb_build_object('from', o->k, 'to', n->k)), '{}'::jsonb) into changed
      from jsonb_object_keys(n) k
     where k not in ('updated_at', 'location', 'secret_hash') and (o->k) is distinct from (n->k);
    if changed = '{}'::jsonb then return null; end if;
  else
    changed := coalesce(n, o) - 'location' - 'secret_hash';
  end if;
  perform app.audit(lower(tg_op), tg_table_name, rid, changed);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['stations', 'connectors', 'evses', 'operating_hours', 'booking_rules', 'tariffs', 'tariff_components']
  loop
    execute format('create or replace trigger %I after insert or update or delete on public.%I for each row execute function app.audit_admin_row()', t || '_admin_audit', t);
  end loop;
  -- Moderation: only removals are audited (admins also check in as drivers).
  foreach t in array array['checkins', 'reviews']
  loop
    execute format('create or replace trigger %I after delete on public.%I for each row execute function app.audit_admin_row()', t || '_admin_audit', t);
  end loop;
end $$;

create or replace function app.stations_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := pg_catalog.now();
  if new.is_verified and not coalesce(old.is_verified, false) then new.verified_at := pg_catalog.now(); end if;
  if not new.is_verified then new.verified_at := null; end if;
  return new;
end $$;
create or replace trigger stations_touch before update on public.stations
  for each row execute function app.stations_touch();

-- ---------- Suspended accounts cannot book ---------------------------------
create or replace function app.bookings_block_suspended() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.profiles p where p.id = new.user_id and p.status = 'suspended') then
    raise exception 'account_suspended' using errcode = 'EVB23', detail = 'This account is suspended. Contact EVChargePress support.';
  end if;
  return new;
end $$;
create or replace trigger bookings_block_suspended before insert on public.bookings
  for each row execute function app.bookings_block_suspended();

-- ---------- Row level security -------------------------------------------
alter table public.user_roles enable row level security;
alter table public.admin_audit enable row level security;

create policy "own roles readable" on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "admins read audit" on public.admin_audit for select to authenticated
  using ((select public.is_admin()));

-- Drivers can no longer add, edit or delete stations and connectors.
create policy "only admins add stations" on public.stations as restrictive for insert to authenticated
  with check ((select public.is_admin()));
create policy "only admins edit stations" on public.stations as restrictive for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "only admins delete stations" on public.stations as restrictive for delete to authenticated
  using ((select public.is_admin()));
create policy "admins manage stations" on public.stations for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "only admins add connectors" on public.connectors as restrictive for insert to authenticated
  with check ((select public.is_admin()));
create policy "only admins edit connectors" on public.connectors as restrictive for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "only admins delete connectors" on public.connectors as restrictive for delete to authenticated
  using ((select public.is_admin()));
create policy "admins manage connectors" on public.connectors for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins manage evses" on public.evses for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage operating hours" on public.operating_hours for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage booking rules" on public.booking_rules for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage tariffs" on public.tariffs for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admins manage tariff components" on public.tariff_components for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admins read bookings" on public.bookings for select to authenticated using ((select public.is_admin()));
create policy "admins read booking events" on public.booking_events for select to authenticated using ((select public.is_admin()));
create policy "admins read sessions" on public.charging_sessions for select to authenticated using ((select public.is_admin()));
create policy "admins read meter values" on public.meter_values for select to authenticated using ((select public.is_admin()));
create policy "admins read charger commands" on public.charger_commands for select to authenticated using ((select public.is_admin()));

-- Moderation.
create policy "admins remove checkins" on public.checkins for delete to authenticated using ((select public.is_admin()));
create policy "admins remove reviews" on public.reviews for delete to authenticated using ((select public.is_admin()));
create policy "suspended accounts cannot check in" on public.checkins as restrictive for insert to authenticated
  with check ((select public.account_in_good_standing()));
create policy "suspended accounts cannot review" on public.reviews as restrictive for insert to authenticated
  with check ((select public.account_in_good_standing()));

-- ---------- Views ---------------------------------------------------------
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
  l.live_evse_count, l.live_available_count, l.live_is_simulated, l.live_updated_at,
  s.is_verified
from public.stations s
left join lateral (
  select count(*)::int as live_evse_count,
         count(*) filter (where e.live_status = 'available')::int as live_available_count,
         bool_or(e.live_is_simulated) as live_is_simulated,
         max(e.live_status_at) as live_updated_at
    from public.evses e
   where e.station_id = s.id and e.is_active
     and e.live_status is not null and e.live_status_at > pg_catalog.now() - interval '15 minutes'
) l on true;

-- ---------- Admin RPCs ----------------------------------------------------
create or replace function public.admin_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_now timestamptz := app.now(); r jsonb;
begin
  perform app.require_admin();
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'admins', (select count(*) from public.user_roles where role = 'admin' and revoked_at is null),
    'suspended', (select count(*) from public.profiles where status = 'suspended'),
    'stations', (select count(*) from public.stations),
    'stations_by_source', (select coalesce(jsonb_object_agg(data_source, n), '{}'::jsonb)
                             from (select data_source, count(*) n from public.stations group by 1) x),
    'verified_stations', (select count(*) from public.stations where is_verified),
    'bookable_stations', (select count(distinct e.station_id) from public.evses e
                           join public.booking_rules br on br.station_id = e.station_id
                          where e.is_bookable and e.is_active),
    'evses', (select count(*) from public.evses where is_active),
    'bookings_upcoming', (select count(*) from public.bookings where status in ('pending', 'confirmed') and upper(period) > v_now),
    'bookings_today', (select count(*) from public.bookings b join public.stations s on s.id = b.station_id
                        where (lower(b.period) at time zone s.time_zone)::date = (v_now at time zone s.time_zone)::date
                          and b.status not in ('expired')),
    'bookings_by_status_30d', (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                                 from (select status, count(*) n from public.bookings where created_at > v_now - interval '30 days' group by 1) x),
    'sessions_active', (select count(*) from public.charging_sessions where status = 'in_progress'),
    'sessions_30d', (select count(*) from public.charging_sessions where started_at > v_now - interval '30 days'),
    'kwh_30d', (select coalesce(round(sum(energy_kwh)::numeric, 1), 0) from public.charging_sessions where started_at > v_now - interval '30 days'),
    'charge_points', (select count(*) from public.charge_points where is_active),
    'charge_points_online', (select count(*) from public.charge_points where is_active and last_heartbeat_at > v_now - interval '5 minutes'),
    'charge_points_simulated', (select count(*) from public.charge_points where is_active and is_simulated),
    'broken_reports_7d', (select count(*) from public.checkins where status = 'broken' and created_at > v_now - interval '7 days'),
    'checkins_7d', (select count(*) from public.checkins where created_at > v_now - interval '7 days'),
    'reviews', (select count(*) from public.reviews),
    'generated_at', v_now
  ) into r;
  return r;
end $$;

create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, display_name text, status text, is_admin boolean, created_at timestamptz,
               last_sign_in_at timestamptz, email_confirmed boolean, bookings int, vehicles int, sessions int, total int)
language plpgsql stable security definer set search_path = '' as $$
declare q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform app.require_admin();
  return query
  with base as (
    select p.id, u.email::text as email, p.display_name, p.status, p.created_at,
           u.last_sign_in_at, (u.email_confirmed_at is not null) as email_confirmed
      from public.profiles p join auth.users u on u.id = p.id
     where q is null or u.email ilike '%' || q || '%' or p.display_name ilike '%' || q || '%'
  )
  select b.id, b.email, b.display_name, b.status,
         exists (select 1 from public.user_roles r where r.user_id = b.id and r.role = 'admin' and r.revoked_at is null),
         b.created_at, b.last_sign_in_at, b.email_confirmed,
         (select count(*)::int from public.bookings x where x.user_id = b.id),
         (select count(*)::int from public.vehicles x where x.user_id = b.id and x.deleted_at is null),
         (select count(*)::int from public.charging_sessions x where x.user_id = b.id),
         (count(*) over ())::int
    from base b
   order by b.created_at desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create or replace function public.admin_set_admin(p_user_id uuid, p_admin boolean)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := app.require_admin();
begin
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'not_found' using errcode = 'EVB02', detail = 'User not found.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(hashtext('evcp.admin_roles'));
  if p_admin then
    if exists (select 1 from public.profiles where id = p_user_id and status <> 'active') then
      raise exception 'invalid' using errcode = 'EVB24', detail = 'Only active accounts can be made admins.';
    end if;
    if exists (select 1 from public.user_roles where user_id = p_user_id and role = 'admin' and revoked_at is null) then return true; end if;
    insert into public.user_roles (user_id, role, granted_by) values (p_user_id, 'admin', me)
    on conflict (user_id, role) do update set granted_by = me, granted_at = pg_catalog.now(), revoked_at = null, revoked_by = null;
    perform app.audit('grant_admin', 'user_roles', p_user_id::text);
  else
    if not exists (select 1 from public.user_roles where user_id = p_user_id and role = 'admin' and revoked_at is null) then return false; end if;
    if not exists (select 1 from public.user_roles where role = 'admin' and revoked_at is null and user_id <> p_user_id) then
      raise exception 'last_admin' using errcode = 'EVB24', detail = 'At least one admin is required.';
    end if;
    update public.user_roles set revoked_at = pg_catalog.now(), revoked_by = me where user_id = p_user_id and role = 'admin';
    perform app.audit('revoke_admin', 'user_roles', p_user_id::text);
  end if;
  return p_admin;
end $$;

create or replace function public.admin_set_user_status(p_user_id uuid, p_status text, p_reason text default null)
returns public.profiles language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := app.require_admin(); p public.profiles; v_now timestamptz := app.now(); n int := 0;
        why text := nullif(left(btrim(coalesce(p_reason, '')), 300), '');
begin
  if p_status not in ('active', 'suspended') then
    raise exception 'invalid' using errcode = 'EVB24', detail = 'Status must be active or suspended.';
  end if;
  if p_user_id = me then raise exception 'invalid' using errcode = 'EVB24', detail = 'You cannot change your own account status.'; end if;
  select * into p from public.profiles where id = p_user_id for update;
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'User not found.'; end if;
  if p_status = 'suspended' and exists (select 1 from public.user_roles where user_id = p_user_id and role = 'admin' and revoked_at is null) then
    raise exception 'invalid' using errcode = 'EVB24', detail = 'Remove admin access before suspending this account.';
  end if;
  if p_status = 'suspended' and why is null then
    raise exception 'invalid' using errcode = 'EVB24', detail = 'Give a reason for the suspension.';
  end if;
  if p.status = 'deletion_requested' then
    raise exception 'invalid' using errcode = 'EVB24', detail = 'This account has asked to be deleted.';
  end if;
  if p.status = p_status then return p; end if;
  update public.profiles set status = p_status where id = p_user_id returning * into p;
  if p_status = 'suspended' then
    perform set_config('app.transition_reason', 'Account suspended', true);
    update public.bookings set status = 'cancelled', cancelled_at = v_now, cancellation_fee_minor = 0,
           cancel_reason = 'Cancelled by EVChargePress: account suspended'
     where user_id = p_user_id and status in ('pending', 'confirmed') and lower(period) > v_now;
    get diagnostics n = row_count;
  end if;
  perform app.audit(case when p_status = 'suspended' then 'suspend_user' else 'reactivate_user' end, 'profiles', p_user_id::text,
                    jsonb_build_object('reason', why, 'bookings_cancelled', n));
  return p;
end $$;

create or replace function public.admin_cancel_booking(p_booking_id uuid, p_reason text)
returns public.bookings language plpgsql volatile security definer set search_path = '' as $$
declare b public.bookings; v_now timestamptz := app.now(); why text := nullif(left(btrim(coalesce(p_reason, '')), 250), '');
begin
  perform app.require_admin();
  if why is null then raise exception 'invalid' using errcode = 'EVB24', detail = 'Give a reason for cancelling.'; end if;
  select * into b from public.bookings where id = p_booking_id for update;
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'Booking not found.'; end if;
  if b.status = 'cancelled' then return b; end if;
  if b.status not in ('pending', 'confirmed') then
    raise exception 'not_cancellable' using errcode = 'EVB13', detail = format('A %s booking cannot be cancelled.', b.status);
  end if;
  perform set_config('app.transition_reason', 'Cancelled by admin: ' || why, true);
  update public.bookings set status = 'cancelled', cancelled_at = v_now, cancellation_fee_minor = 0,
         cancel_reason = 'Cancelled by EVChargePress: ' || why
   where id = b.id returning * into b;
  perform app.audit('cancel_booking', 'bookings', b.id::text, jsonb_build_object('reference', b.reference, 'reason', why));
  return b;
end $$;

-- Charge points without their secret hashes.
create or replace function public.admin_charge_points()
returns table (id uuid, identity text, station_id uuid, station_name text, network_name text, is_simulated boolean,
               vendor text, model text, firmware_version text, last_boot_at timestamptz, last_heartbeat_at timestamptz,
               is_active boolean, is_online boolean, evse_count int, charging_count int, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_admin();
  return query
  select cp.id, cp.identity, cp.station_id, s.name, n.name, cp.is_simulated, cp.vendor, cp.model, cp.firmware_version,
         cp.last_boot_at, cp.last_heartbeat_at, cp.is_active,
         coalesce(cp.last_heartbeat_at > app.now() - interval '5 minutes', false),
         (select count(*)::int from public.evses e where e.charge_point_id = cp.id),
         (select count(*)::int from public.evses e where e.charge_point_id = cp.id and e.live_status = 'charging'),
         cp.created_at
    from public.charge_points cp
    join public.stations s on s.id = cp.station_id
    join public.charger_networks n on n.id = cp.network_id
   order by s.name, cp.identity;
end $$;

-- Registers (or re-keys) a charge point and returns its new secret once; only the hash is stored.
create or replace function public.admin_register_charge_point(p_station_id uuid, p_identity text, p_network_slug text default 'evcp-ocpp', p_simulated boolean default false)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare secret text; other uuid;
begin
  perform app.require_admin();
  select station_id into other from public.charge_points where identity = p_identity;
  if other is not null and other <> p_station_id then
    raise exception 'invalid' using errcode = 'EVB24', detail = 'That charger ID is already used at another station.';
  end if;
  if not exists (select 1 from public.stations where id = p_station_id) then
    raise exception 'not_found' using errcode = 'EVB02', detail = 'Station not found.';
  end if;
  secret := app.register_charge_point(p_network_slug, p_station_id, p_identity, p_simulated);
  perform app.audit(case when other is null then 'register_charge_point' else 'rotate_charge_point_secret' end, 'charge_points', p_identity,
                    jsonb_build_object('station_id', p_station_id, 'network', p_network_slug, 'simulated', p_simulated));
  return secret;
end $$;

create or replace function public.admin_set_charge_point_active(p_charge_point_id uuid, p_active boolean)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_admin();
  update public.charge_points set is_active = p_active where id = p_charge_point_id;
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'Charger not found.'; end if;
  perform app.audit(case when p_active then 'enable_charge_point' else 'disable_charge_point' end, 'charge_points', p_charge_point_id::text);
  return p_active;
end $$;

-- Replaces a station's tariff in one step: old tariffs are deactivated (kept for history), a new one is created.
create or replace function public.admin_set_tariff(p_station_id uuid, p_name text, p_currency text, p_tax_mode text, p_tax_rate_bp int, p_components jsonb)
returns public.tariffs language plpgsql volatile security definer set search_path = '' as $$
declare t public.tariffs; v_now timestamptz := app.now();
begin
  perform app.require_admin();
  if not exists (select 1 from public.stations where id = p_station_id) then
    raise exception 'not_found' using errcode = 'EVB02', detail = 'Station not found.';
  end if;
  if jsonb_typeof(p_components) <> 'object' or not exists (select 1 from jsonb_each(p_components)) then
    raise exception 'invalid' using errcode = 'EVB24', detail = 'Add at least one price.';
  end if;
  update public.tariffs set is_active = false, valid_to = greatest(valid_from + interval '1 second', v_now)
   where station_id = p_station_id and evse_id is null and is_active;
  insert into public.tariffs (station_id, name, currency, tax_mode, tax_rate_bp, valid_from, source)
  values (p_station_id, btrim(p_name), upper(p_currency), p_tax_mode, p_tax_rate_bp, v_now, 'admin')
  returning * into t;
  insert into public.tariff_components (tariff_id, type, price_minor)
  select t.id, c.key, (c.value #>> '{}')::int from jsonb_each(p_components) c;
  return t;
end $$;

-- Lets the signed-in user know whether they are an admin (for showing the admin link).
create or replace function public.my_roles() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(r.role order by r.role), '{}') from public.user_roles r
   where r.user_id = auth.uid() and r.revoked_at is null and public.is_admin()
$$;
