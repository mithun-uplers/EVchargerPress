# Connected cars and saved trips

## Connected cars

Drivers can connect a vehicle from its page (**My vehicles → a vehicle → Connected car**):

- **Smartcar** — the owner signs in with their car brand's account through Smartcar Connect and
  chooses what to share (battery, charging, odometer, location, vehicle info). We use the
  Smartcar Vehicles API **v3** (v2 is deprecated on 1 Dec 2026).
- **Simulated car** — a virtual car for testing, run in the database every 5 minutes
  (`app.vehicle_sim_tick()`, pg_cron job `ev-vehicle-simulator`). It slowly drains, adds distance in
  commute hours and follows the battery % of a live charging session for that vehicle.

Every reading is stored in `vehicle_telemetry` with `source` and `is_simulated`, and battery % /
odometer are mirrored into `battery_readings` (`source = 'vehicle_api'`) so existing charts include
them. The app labels them "From car", "Smartcar · test vehicle" or "Simulated car". Drivers can't
write vehicle data themselves: only the server, with an integration key, can call
`public.ingest_vehicle_telemetry`.

### How Smartcar sync works

1. `public.start_vehicle_connection(vehicle, 'smartcar')` creates a pending connection with a random
   `state` (valid 30 minutes).
2. The driver is sent to `https://connect.smartcar.com/oauth/authorize` with our `application_id`,
   scopes, `mode` and that `state`.
3. Smartcar redirects to `/api/vehicle-connect/smartcar/callback?userId=…&state=…`;
   `public.complete_vehicle_connection` checks the state belongs to the signed-in driver.
4. The server gets an app token (`POST https://iam.smartcar.com/oauth2/token`, client credentials),
   finds the vehicle via `GET /v3/connections?filter[userId]=…`, and reads
   `GET /v3/vehicles/{id}/signals` (headers `Authorization: Bearer …` and `sc-user-id`).
5. Signals used: `tractionbattery-stateofcharge`, `tractionbattery-range`, `odometer-traveleddistance`,
   `charge-ischarging`, `charge-ischargingcableconnected`, `charge-wattage`, `charge-chargelimits`,
   `location-preciselocation`. Only values with status `SUCCESS` are stored.
6. The vehicle page re-syncs when the last reading is over 15 minutes old; **Sync now** forces it.

### Set up Smartcar

1. Create a free account at https://dashboard.smartcar.com and an application.
2. Add the redirect URI `http://localhost:3000/api/vehicle-connect/smartcar/callback` (and your
   Vercel URL with the same path).
3. Put these in `web/.env.local` and in Vercel → Settings → Environment Variables (server-only):

   ```
   SMARTCAR_CLIENT_ID=...
   SMARTCAR_CLIENT_SECRET=...
   SMARTCAR_MODE=simulated        # test vehicles; use "live" for real cars
   VEHICLE_INGEST_KEY=...         # any long random value, e.g. from: openssl rand -hex 32
   ```

4. Register the same `VEHICLE_INGEST_KEY` value with the database (it stores only a bcrypt hash).
   Run once in the Supabase SQL Editor, pasting your value:
   `select app.set_integration_key('vehicle_ingest', '<your VEHICLE_INGEST_KEY>');`
   Run it again with a new value to rotate the key, then update the env var.
5. Restart `npm run dev` (or redeploy on Vercel). The **Connect car** button switches from
   "Not set up yet" to active.

Indian brands (Tata, MG, Mahindra) have no public car API yet, so manual readings and live charger
data remain the main sources for those cars.

## Saved trips

On **Plan a trip**, **Save trip** re-plans on the server from the form inputs (posted route data is
never trusted) and calls `public.save_trip`, which stores the trip and **every charging station
within 5 km of the route** (`trip_stations`), with planned stops flagged and station details
snapshotted. `/trips` lists saved trips; `/trips/{id}` shows the route, stops, battery chart, map and
all stations (filters: all, fits my car, planned stops) with today's live availability, plus
"Plan again with today's battery" and Delete.

## Which connection is used — and why not Bluetooth

| Method | Used? | How it works | Limits |
| --- | --- | --- | --- |
| **Smartcar (cloud API)** | Yes, for cars | The driver signs in with their car brand's account; Smartcar reads battery, range, odometer, charging and location from the maker's cloud over HTTPS. | Cars from supported brands only. Works anywhere — no need to be near the car. |
| **Simulator** | Yes, for testing | A virtual car/scooter in the database reports every 5 minutes and follows live charging. | Always labelled *Simulated*. |
| **Charger data (OCPP)** | Yes, during sessions | Connected chargers can report the battery % while charging. | Only while plugged in at a connected charger. |
| **Manual readings** | Yes | The driver types battery % / odometer from the dashboard. | As accurate as the entry. |
| **Bluetooth** | No | Would need a Bluetooth OBD-II dongle (cars) or the maker's private Bluetooth protocol (Ather, Ola, etc.). | Web Bluetooth works only in Chrome/Edge on Android and desktop, not on iPhone. EV battery data over OBD-II uses brand-specific codes, and two-wheeler protocols are private, so results would be unreliable. A native mobile app would be needed for a dependable Bluetooth link. |

Two-wheelers and e-bikes: no public data API exists yet, so the Smartcar option is disabled for them
(server-side check in `app/vehicles/connect-actions.ts`); the simulator, manual readings and charger
data still work. Labels follow the vehicle type ("Connect scooter", "Simulated motorcycle") via
`connectLabels()` in `src/lib/vehicle-types.ts`.
