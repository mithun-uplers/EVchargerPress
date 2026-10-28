-- Route planning: charging stations near a driving route, ordered by distance along it.
-- The route geometry comes from a routing service (OSRM by default) as a GeoJSON LineString.

create or replace function public.stations_along_route(p_route jsonb, p_buffer_km double precision default 5, p_limit int default 300)
returns table (
  id uuid, name text, lat double precision, lng double precision, address text, city text, operator text,
  is_bookable boolean, max_power_kw numeric, connector_types text[],
  live_evse_count int, live_available_count int, live_is_simulated boolean,
  along_km double precision, detour_km double precision
)
language plpgsql stable security invoker set search_path = '' as $$
declare g extensions.geometry; len_km double precision;
begin
  if p_route is null or p_route->>'type' <> 'LineString' or jsonb_array_length(p_route->'coordinates') < 2
     or jsonb_array_length(p_route->'coordinates') > 2000 then
    raise exception 'invalid_route' using errcode = 'EVB15', detail = 'Route must be a GeoJSON LineString with 2–2000 points.';
  end if;
  g := extensions.st_setsrid(extensions.st_geomfromgeojson(p_route::text), 4326);
  len_km := extensions.st_length(g::extensions.geography) / 1000.0;
  return query
  select s.id, s.name, s.lat, s.lng, s.address, s.city, s.operator, s.is_bookable, s.max_power_kw, s.connector_types,
         s.live_evse_count, s.live_available_count, s.live_is_simulated,
         extensions.st_linelocatepoint(g, extensions.st_setsrid(extensions.st_makepoint(s.lng, s.lat), 4326)) * len_km as along_km,
         extensions.st_distance(g::extensions.geography, st.location) / 1000.0 as detour_km
  from public.stations st
  join public.station_summaries s on s.id = st.id
  where extensions.st_dwithin(st.location, g::extensions.geography, least(greatest(p_buffer_km, 0.5), 25) * 1000)
  order by along_km
  limit least(greatest(p_limit, 1), 500);
end $$;
