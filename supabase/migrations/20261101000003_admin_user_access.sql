-- =====================================================================
-- Admin: confirm a user's email and delete a user (2026-11-01).
-- Additive: new functions only. Both run inside Postgres, so they are atomic
-- and audited, and do not need the service-role key.
-- =====================================================================

-- Marks the email as confirmed so the person can sign in without the confirmation link.
create or replace function public.admin_confirm_email(p_user_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_email text; v_confirmed timestamptz;
begin
  perform app.require_admin();
  select u.email, u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = p_user_id for update;
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'User not found.'; end if;
  if v_confirmed is not null then
    return jsonb_build_object('email', v_email, 'already_confirmed', true);
  end if;
  update auth.users set email_confirmed_at = pg_catalog.now() where id = p_user_id;
  perform app.audit('confirm_email', 'auth.users', p_user_id::text, jsonb_build_object('email', v_email));
  return jsonb_build_object('email', v_email, 'already_confirmed', false);
end $$;

-- Permanently deletes an account and its data (vehicles, bookings, history, trips, check-ins, reviews).
-- Not allowed for yourself or another admin. p_confirm_email must match the account's email.
create or replace function public.admin_delete_user(p_user_id uuid, p_confirm_email text, p_reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare me uuid := app.require_admin(); v_email text; n_cancel int := 0; n_book int := 0; v_name text;
        why text := nullif(left(btrim(coalesce(p_reason, '')), 300), '');
begin
  if p_user_id = me then
    raise exception 'invalid' using errcode = 'EVB24', detail = 'You can’t delete your own account here.';
  end if;
  select u.email into v_email from auth.users u where u.id = p_user_id for update;
  if not found then raise exception 'not_found' using errcode = 'EVB02', detail = 'User not found.'; end if;
  if lower(btrim(coalesce(p_confirm_email, ''))) <> lower(coalesce(v_email, '')) then
    raise exception 'invalid' using errcode = 'EVB24', detail = 'Type the user’s email exactly to confirm.';
  end if;
  if exists (select 1 from public.user_roles where user_id = p_user_id and role = 'admin' and revoked_at is null) then
    raise exception 'invalid' using errcode = 'EVB24', detail = 'Remove admin access before deleting this account.';
  end if;
  if exists (select 1 from public.payments pm join public.bookings b on b.id = pm.booking_id where b.user_id = p_user_id) then
    raise exception 'invalid' using errcode = 'EVB24', detail = 'This account has payment records that must be kept. Suspend it instead.';
  end if;
  select display_name into v_name from public.profiles where id = p_user_id;

  -- Free their charging points first (so the audit shows what was cancelled), then remove bookings
  -- explicitly: bookings reference vehicles, and both would otherwise be removed in an undefined order.
  perform set_config('app.transition_reason', 'Account deleted', true);
  update public.bookings set status = 'cancelled', cancelled_at = app.now(), cancellation_fee_minor = 0,
         cancel_reason = 'Cancelled by EVChargePress: account deleted'
   where user_id = p_user_id and status in ('pending', 'confirmed') and lower(period) > app.now();
  get diagnostics n_cancel = row_count;
  delete from public.bookings where user_id = p_user_id;
  get diagnostics n_book = row_count;

  -- Removing the auth user cascades to the profile and everything owned by it.
  delete from auth.users where id = p_user_id;

  perform app.audit('delete_user', 'auth.users', p_user_id::text, jsonb_build_object(
    'email', v_email, 'display_name', v_name, 'reason', why, 'bookings_cancelled', n_cancel, 'bookings_removed', n_book));
  return jsonb_build_object('email', v_email, 'bookings_cancelled', n_cancel, 'bookings_removed', n_book);
end $$;
