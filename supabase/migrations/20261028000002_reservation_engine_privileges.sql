-- =====================================================================
-- Reservation engine, part 2 — privileges and housekeeping (2026-10-28)
-- Kept separate from part 1 because these statements need an extra
-- confirmation in the Supabase dashboard.
-- =====================================================================

revoke all on schema app from public;

create or replace function app.purge_idempotency_keys(p_now timestamptz) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  delete from public.idempotency_keys where expires_at <= p_now;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- Function privileges ----------------------------------------
revoke execute on all functions in schema app from public, anon, authenticated;
revoke execute on function public.get_availability(uuid, date, int) from public;
revoke execute on function public.quote_booking(uuid, timestamptz, int) from public;
revoke execute on function public.create_booking(uuid, timestamptz, int, text) from public, anon;
revoke execute on function public.confirm_booking(uuid) from public, anon;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
revoke execute on function public.check_in_booking(uuid) from public, anon;
grant execute on function public.get_availability(uuid, date, int) to anon, authenticated;
grant execute on function public.quote_booking(uuid, timestamptz, int) to anon, authenticated;
grant execute on function public.create_booking(uuid, timestamptz, int, text) to authenticated;
grant execute on function public.confirm_booking(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.check_in_booking(uuid) to authenticated;

