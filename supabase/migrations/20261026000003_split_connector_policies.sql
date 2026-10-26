-- NOT YET APPLIED: run in Supabase SQL editor (or ask Claude to apply it).
-- Fixes the "multiple permissive policies" performance advisor on connectors.
drop policy "manage connectors of own station" on public.connectors;
create policy "insert connectors of own station" on public.connectors for insert to authenticated
  with check (exists (select 1 from public.stations s where s.id = station_id and s.created_by = (select auth.uid())));
create policy "update connectors of own station" on public.connectors for update to authenticated
  using (exists (select 1 from public.stations s where s.id = station_id and s.created_by = (select auth.uid())))
  with check (exists (select 1 from public.stations s where s.id = station_id and s.created_by = (select auth.uid())));
create policy "delete connectors of own station" on public.connectors for delete to authenticated
  using (exists (select 1 from public.stations s where s.id = station_id and s.created_by = (select auth.uid())));
-- leading-wildcard ILIKE search can't use this btree index
drop index if exists public.stations_city_idx;
