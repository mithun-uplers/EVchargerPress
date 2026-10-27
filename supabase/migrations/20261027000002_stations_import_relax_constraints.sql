-- Applied 2026-10-27
alter table public.stations alter column address drop not null;
alter table public.stations alter column city drop not null;
alter table public.connectors alter column power_kw drop not null;
alter table public.connectors drop constraint connectors_type_check;
alter table public.connectors add constraint connectors_type_check check (type in
  ('CCS2','CCS1','CHAdeMO','Type 2','Type 1','GB/T','NACS','Bharat AC-001','Bharat DC-001','15A Socket','Other'));
