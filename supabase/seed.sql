-- Demo stations (flagged is_demo = true; not real locations)
with s as (
  insert into public.stations (name, address, city, lat, lng, operator, access, hours, price_info, is_demo) values
  ('Demo Hub – Koramangala', '80 Feet Rd, Koramangala', 'Bengaluru', 12.9352, 77.6245, 'Demo Operator', 'public', '24x7', '₹18/kWh', true),
  ('Demo Mall Charger – Andheri', 'Link Rd, Andheri West', 'Mumbai', 19.1364, 72.8296, 'Demo Operator', 'public', '10:00–22:00', '₹20/kWh', true),
  ('Demo Highway Stop – NH48', 'NH48, near Manesar', 'Gurugram', 28.3540, 76.9366, 'Demo Operator', 'public', '24x7', '₹22/kWh', true),
  ('Demo Office Park – Hitech City', 'Hitech City Rd', 'Hyderabad', 17.4474, 78.3762, 'Demo Operator', 'restricted', 'Mon–Sat 08:00–20:00', 'Free for tenants', true),
  ('Demo Fuel Station – Anna Nagar', '2nd Ave, Anna Nagar', 'Chennai', 13.0850, 80.2101, 'Demo Operator', 'public', '06:00–23:00', '₹19/kWh', true)
  returning id, name
)
insert into public.connectors (station_id, type, power_kw, quantity)
select id, t.type, t.kw, t.q from s
cross join lateral (values
  ('CCS2', case when s.name like '%Highway%' then 120 else 60 end, 2),
  ('Type 2', 7.4, 2)
) as t(type, kw, q);
-- To remove demo data later:  delete from public.stations where is_demo;
