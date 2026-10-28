-- =====================================================================
-- Admin user management (2026-11-01). Additive only.
--
-- Accounts are created and their email/password changed by the web app's
-- server with the Supabase Auth admin API (service-role key, server only).
-- These functions cover the profile side and the audit trail.
-- =====================================================================

-- One user with profile, roles and activity, for the admin user page.
create or replace function public.admin_get_user(p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform app.require_admin();
  select jsonb_build_object(
    'id', p.id, 'email', u.email, 'display_name', p.display_name, 'phone', p.phone, 'status', p.status,
    'is_admin', exists (select 1 from public.user_roles x where x.user_id = p.id and x.role = 'admin' and x.revoked_at is null),
    'created_at', p.created_at, 'last_sign_in_at', u.last_sign_in_at, 'email_confirmed', u.email_confirmed_at is not null,
    'onboarded_at', p.onboarded_at, 'deletion_requested_at', p.deletion_requested_at,
    'password_change_required', coalesce((u.raw_app_meta_data->>'password_change_required')::boolean, false),
    'bookings', (select count(*) from public.bookings x where x.user_id = p.id),
    'bookings_upcoming', (select count(*) from public.bookings x where x.user_id = p.id and x.status in ('pending', 'confirmed') and upper(x.period) > app.now()),
    'vehicles', (select count(*) from public.vehicles x where x.user_id = p.id and x.deleted_at is null),
    'sessions', (select count(*) from public.charging_sessions x where x.user_id = p.id),
    'checkins', (select count(*) from public.checkins x where x.user_id = p.id),
    'reviews', (select count(*) from public.reviews x where x.user_id = p.id)
  ) into r
  from public.profiles p join auth.users u on u.id = p.id
  where p.id = p_user_id;
  if r is null then raise exception 'not_found' using errcode = 'EVB02', detail = 'User not found.'; end if;
  return r;
end $$;

-- Name and phone, edited by an admin.
create or replace function public.admin_update_profile(p_user_id uuid, p_display_name text, p_phone text default null)
returns public.profiles language plpgsql volatile security definer set search_path = '' as $$
declare p public.profiles; o public.profiles; name text := nullif(btrim(coalesce(p_display_name, '')), '');
        ph text := nullif(regexp_replace(coalesce(p_phone, ''), '[\s()-]', '', 'g'), '');
begin
  perform app.require_admin();
  if name is null or char_length(name) > 80 then
    raise exception 'invalid' using errcode = 'EVB24', detail = 'Enter a name (up to 80 characters).';
  end if;
  if ph is not null and ph !~ '^\+?[0-9]{8,15}$' then
    raise exception 'invalid' using errcode = 'EVB24', detail = 'Enter a phone number with 8–15 digits, e.g. +919876543210.';
  end if;
  select * into o from public.profiles where id = p_user_id for update;
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'User not found.'; end if;
  update public.profiles set display_name = name, phone = ph where id = p_user_id returning * into p;
  if (o.display_name, o.phone) is distinct from (p.display_name, p.phone) then
    perform app.audit('update_profile', 'profiles', p_user_id::text,
      case when o.display_name is distinct from p.display_name
           then jsonb_build_object('display_name', jsonb_build_object('from', o.display_name, 'to', p.display_name)) else '{}'::jsonb end
      || case when o.phone is distinct from p.phone
           then jsonb_build_object('phone', jsonb_build_object('from', o.phone, 'to', p.phone)) else '{}'::jsonb end);
  end if;
  return p;
end $$;

-- Audit entries for account changes the server makes through the Auth admin API.
-- Never pass passwords or tokens in p_detail.
create or replace function public.admin_record_account_change(p_action text, p_user_id uuid, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform app.require_admin();
  if p_action not in ('create_user', 'change_email', 'set_password') then
    raise exception 'invalid' using errcode = 'EVB24', detail = 'Unknown account change.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'not_found' using errcode = 'EVB02', detail = 'User not found.';
  end if;
  perform app.audit(p_action, 'auth.users', p_user_id::text, coalesce(p_detail, '{}'::jsonb) - 'password');
end $$;
