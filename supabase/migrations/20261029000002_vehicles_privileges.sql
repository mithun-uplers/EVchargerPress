-- =====================================================================
-- Vehicles, part 2 — connector replacement and function privileges.
-- Separate file because these statements need an extra confirmation in Supabase.
-- =====================================================================

-- Replace a vehicle's connector list in one step (owner only).
create or replace function public.set_vehicle_connectors(p_vehicle_id uuid, p_types text[], p_powers numeric[] default null)
returns setof public.vehicle_connectors
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'EVB01', detail = 'Sign in first.'; end if;
  if not exists (select 1 from public.vehicles v where v.id = p_vehicle_id and v.user_id = auth.uid() and v.deleted_at is null) then
    raise exception 'not_found' using errcode = 'EVB02', detail = 'Vehicle not found.';
  end if;
  delete from public.vehicle_connectors where vehicle_id = p_vehicle_id;
  insert into public.vehicle_connectors (vehicle_id, connector_type, supported_power_kw)
  select p_vehicle_id, t.type, case when p_powers is not null then p_powers[t.ord] end
  from unnest(coalesce(p_types, '{}')) with ordinality as t(type, ord)
  on conflict (vehicle_id, connector_type) do nothing;
  return query select * from public.vehicle_connectors where vehicle_id = p_vehicle_id;
end $$;

revoke execute on all functions in schema app from public, anon, authenticated;
revoke execute on function public.book_slot(uuid, uuid, timestamptz, int, text) from public, anon;
revoke execute on function public.quote_for_vehicle(uuid, uuid, timestamptz, int) from public, anon;
revoke execute on function public.compatible_evses(uuid, uuid) from public, anon;
revoke execute on function public.request_account_deletion() from public, anon;
revoke execute on function public.set_vehicle_connectors(uuid, text[], numeric[]) from public, anon;
grant execute on function public.book_slot(uuid, uuid, timestamptz, int, text) to authenticated;
grant execute on function public.quote_for_vehicle(uuid, uuid, timestamptz, int) to authenticated;
grant execute on function public.compatible_evses(uuid, uuid) to authenticated;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.set_vehicle_connectors(uuid, text[], numeric[]) to authenticated;
