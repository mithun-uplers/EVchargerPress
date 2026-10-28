# Smart EV features

Live charging, battery telemetry, charging analytics, route planning, recommendations and
charger-network integrations. The ground rule is the same as everywhere else: **we only show
what a source actually reported, and every value says where it came from** — Live, Simulated,
Manual or Estimate.

## Charger-network integrations (OCPP 1.6J)

Migration `20261030000001_live_charging.sql`.

| Piece | What it does |
| --- | --- |
| `charger_networks` | A network/CPMS and its protocol (`ocpp16j`, `ocpp201`, `ocpi221`, `simulator`). |
| `charge_points` | One OCPP connection (chargeBoxIdentity) at a station. Secret stored as a bcrypt hash; no API read access. |
| `evses.charge_point_id / ocpp_connector_id` | Wires a bookable charging point to a connector on a charge point. |
| `public.ocpp_ingest(identity, secret, frame)` | Handles one OCPP-J frame: BootNotification, Heartbeat, StatusNotification, Authorize, StartTransaction, MeterValues, StopTransaction. Returns the reply frame. |
| `public.ocpp_poll_commands(identity, secret)` | Hands RemoteStart/RemoteStop calls to the gateway. |
| `meter_values` | Energy, power, SoC, voltage, current per sample, with `source` and `is_simulated`. |
| `charger_commands` | CSMS → charger calls and their outcome. |
| `ocpp_messages` | Raw traffic for audit (no API access). |

HTTP endpoints for the gateway (Basic auth `identity:secret`):

- `POST /api/integrations/ocpp/{identity}` — one frame or up to 20.
- `GET /api/integrations/ocpp/{identity}/commands`.

Serverless hosting can't keep OCPP WebSockets open, so `tools/ocpp-gateway/` holds them and relays
over HTTPS (see its README). The idTag is the booking reference: a charger only starts for a
checked-in booking on one of its own connectors, and one booking has at most one live session.
Session cost is computed from the booking's frozen price snapshot (`cost_basis = 'tariff_snapshot'`);
the operator's receipt is the final word.

OCPI 2.2.1 (roaming) is listed as a protocol but not implemented yet — the same tables take its
Locations/Sessions data when it is.

## Simulator

The 5 demo stations are connected to an in-database simulator
(`supabase/scripts/demo_live_charging.sql`; pg_cron job `ev-charger-simulator`, every 10 s).
`app.simulator_tick()` sends its messages through the same `app.ocpp_handle` code path as a real
charger: it answers RemoteStart/Stop, reports status (Reserved while a booking holds the slot),
and meters sessions at min(charger, vehicle) power with a taper above 80 %. It starts from the
vehicle's last manual battery reading (30 % if there is none). Everything it writes has
`is_simulated = true`, and the app labels it "Simulated" on every screen.

## Live availability and live sessions

- Station page, list and map show charging-point status **only if reported in the last 15 minutes**
  (`evse_live_status`, `station_summaries.live_*`), labelled Live or Simulated with its age.
- `/bookings/{ref}/live`: start charging (checks in if needed), live power, energy, battery %,
  duration, cost so far (estimate), power curve, stop. Polls `GET /api/v1/bookings/{ref}/live` every 5 s.
- `POST /api/v1/bookings/{ref}/start-charging`, `POST /api/v1/sessions/{id}/stop`.
- Chargers that aren't connected say so and point the driver to the charger's own screen.

## Battery telemetry

Battery % reported by a charger during a session is telemetry from that charger and is shown with
its source ("From charger" / "Simulated charger"). The vehicle dashboard uses whichever is newer:
the last manual reading or the last charger-reported value. There is no vehicle-API (OEM
telematics) adapter yet; `battery_readings.source = 'vehicle_api'` is reserved for it. We still never
calculate battery health from SoC.

## Charging analytics — `/analytics`

Recorded sessions from the last 12 months (booking estimates excluded): energy, spend, average
price per kWh (only sessions with both cost and kWh), average power, monthly spend, price trend,
start-hour and weekday pattern, DC vs AC split (by charging-point power), data source split
(charger / manual / simulated) and top stations. Logic: `web/src/lib/analytics.ts`.

## Route planning — `/route`

1. Geocode both ends (Nominatim) or accept "lat, lng".
2. Driving route from OSRM. If it can't be reached, a straight line is used and the page says so.
3. `public.stations_along_route(route, buffer_km)` (migration `20261030000002`) returns stations
   within 5 km of the route with distance along it and the detour.
4. `planRoute()` (`web/src/lib/route-plan.ts`) keeps the driver above their reserve, prefers far,
   DC, bookable and reported-free chargers, charges to at most 80 % (or just enough to finish), and
   reports a gap when no compatible charger is in range.

Inputs come from the driver: battery %, reserve, and consumption (prefilled from their own
odometer readings and sessions when there's enough data — we don't guess). Battery size and
connectors come from the vehicle.

Configure before real traffic (the public OSM servers are rate-limited demo services):

```
GEOCODER_URL=https://nominatim.openstreetmap.org   # or a self-hosted / commercial Nominatim
ROUTING_URL=https://router.project-osrm.org        # or self-hosted OSRM / GraphHopper adapter
OSM_USER_AGENT="EVChargePress/0.1 (you@example.com)"
```

## Recommendations (Home)

`recommend()` (`web/src/lib/recommend.ts`) scores nearby (when Near me is used), previously
used and bookable stations. It drops incompatible and reported-broken stations, and every point
comes with a reason the driver sees: distance, live free count, bookable, how often you charged
there, published energy price below your average paid, fast DC your car can use, recent working
reports. "All busy" is shown as a warning.

## Privileges (optional)

`20261030000003_live_charging_privileges.sql` removes anonymous EXECUTE from `start_charging`,
`stop_charging` and `live_session` (they already refuse anonymous callers). Run it in the Supabase
SQL Editor.
