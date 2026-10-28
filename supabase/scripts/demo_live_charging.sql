-- Connects the 5 demo stations to the built-in charger simulator so live status,
-- live sessions and charger SoC can be tested end to end. Everything the simulator
-- writes is flagged is_simulated and labelled "Simulated" in the app.
-- Safe to re-run.

insert into public.charger_networks (slug, name, protocol, is_simulated)
values ('evcp-simulator', 'EVChargePress simulator', 'simulator', true)
on conflict (slug) do nothing;

-- One simulated charge point per demo station (secrets are not needed: the simulator runs in-database).
select app.register_charge_point('evcp-simulator', s.id, 'SIM-' || upper(substr(md5(s.id::text), 1, 8)), true)
from public.stations s
where s.is_demo
  and not exists (select 1 from public.charge_points cp where cp.station_id = s.id and cp.is_simulated);

-- Wire each demo charging point to its station's simulated charge point: DC-1 = connector 1, AC-1 = connector 2.
update public.evses e
   set charge_point_id = cp.id,
       ocpp_connector_id = case e.evse_uid when 'DC-1' then 1 else 2 end
  from public.charge_points cp
 where cp.station_id = e.station_id and cp.is_simulated and e.charge_point_id is null
   and exists (select 1 from public.stations s where s.id = e.station_id and s.is_demo);

-- Run the simulator every 10 seconds.
select cron.schedule('ev-charger-simulator', '10 seconds', $$select app.simulator_tick()$$);
