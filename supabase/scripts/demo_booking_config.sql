-- Demo booking configuration for the 5 demo stations (is_demo = true).
-- Gives each a DC and an AC charging point, opening hours, booking rules and a
-- clearly labelled demo tariff. Safe to re-run: existing rows are left alone.
-- Imported OpenStreetMap stations are NOT made bookable: we have no verified
-- charging-point, hours or price data for them.

-- Charging points
insert into public.evses (station_id, evse_uid, label, max_power_kw, is_bookable)
select s.id, v.uid, v.label, case when v.uid = 'DC-1' and s.name like '%Highway%' then 120 else v.kw end, true
from public.stations s
cross join (values ('DC-1', 'DC fast charger 1', 60.0), ('AC-1', 'AC charger 1', 7.4)) as v(uid, label, kw)
where s.is_demo
on conflict (station_id, evse_uid) do nothing;

-- Attach existing demo connectors to their charging point
update public.connectors c set evse_id = e.id
from public.evses e
where e.station_id = c.station_id and c.evse_id is null
  and ((c.type = 'CCS2' and e.evse_uid = 'DC-1') or (c.type = 'Type 2' and e.evse_uid = 'AC-1'))
  and exists (select 1 from public.stations s where s.id = c.station_id and s.is_demo);

-- Opening hours (local time), matching each demo station's listed hours
insert into public.operating_hours (station_id, weekday, opens_at, closes_at)
select s.id, d, h.opens::time, h.closes::time
from public.stations s
join (values
  ('Demo Hub – Koramangala',          '00:00', '24:00', array[0,1,2,3,4,5,6]),
  ('Demo Mall Charger – Andheri',     '10:00', '22:00', array[0,1,2,3,4,5,6]),
  ('Demo Highway Stop – NH48',        '00:00', '24:00', array[0,1,2,3,4,5,6]),
  ('Demo Office Park – Hitech City',  '08:00', '20:00', array[1,2,3,4,5,6]),
  ('Demo Fuel Station – Anna Nagar',  '06:00', '23:00', array[0,1,2,3,4,5,6])
) as h(name, opens, closes, days) on h.name = s.name
cross join lateral unnest(h.days) as d
where s.is_demo
on conflict (station_id, weekday, opens_at) do nothing;

-- Booking rules (defaults: 15-min steps, 30–120 min, 10-min buffer, 10-min hold, free cancel until 60 min before)
insert into public.booking_rules (station_id)
select id from public.stations where is_demo
on conflict (station_id) do nothing;

-- Demo tariffs: energy price from the listed price, ₹50 reservation fee, 18% GST added
insert into public.tariffs (station_id, name, currency, tax_mode, tax_rate_bp, valid_from, source)
select s.id, 'Demo tariff', 'INR', 'exclusive', 1800, '2026-01-01', 'demo'
from public.stations s
where s.is_demo and not exists (select 1 from public.tariffs t where t.station_id = s.id);

insert into public.tariff_components (tariff_id, type, price_minor)
select t.id, c.type, c.price
from public.tariffs t
join public.stations s on s.id = t.station_id and s.is_demo
cross join lateral (values
  ('energy_kwh', case s.name
     when 'Demo Hub – Koramangala' then 1800
     when 'Demo Mall Charger – Andheri' then 2000
     when 'Demo Highway Stop – NH48' then 2200
     when 'Demo Office Park – Hitech City' then 0
     when 'Demo Fuel Station – Anna Nagar' then 1900 end),
  ('reservation_fixed', 5000),
  ('idle_min', 200)
) as c(type, price)
where t.source = 'demo'
on conflict (tariff_id, type) do nothing;
