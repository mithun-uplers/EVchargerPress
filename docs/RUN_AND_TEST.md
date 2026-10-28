# Run EVChargePress locally and test the new features

## 1. Start the app (Mac)

```bash
cd "/Users/up0183/projects List/EVChargerPress/web"
npm install            # safe to re-run; no new app packages were added
npm run dev            # http://localhost:3000
```

`web/.env.local` needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (already set).
To see the design previews with sample data, add this line and restart `npm run dev`:

```
ENABLE_DESIGN_PREVIEW=1
```

Phone on the same Wi-Fi: open `http://<your-Mac-IP>:3000` (System Settings → Wi-Fi → Details shows the IP).
"Near me" needs HTTPS on phones — use the deployed Vercel URL for that test.

## 2. Look at every screen without an account (sample data)

| Screen | URL |
| --- | --- |
| Home (hero, recommendations, station cards) | /preview/home |
| Station details + live charging points | /preview/station |
| My bookings | /preview/bookings |
| Live charging | /preview/live |
| Trip planner | /preview/route |
| Charging history | /preview/history |
| Analytics | /preview/analytics |
| Vehicle dashboard / My vehicles | /preview/vehicle · /preview/vehicles |
| Saved trips / one trip | /preview/trips · /preview/trip |
| Connected car | /preview/connect |
| Account menu (Sign out) | /preview/account |
| Sign in / Create account | /login · /login?mode=signup |
| Admin dashboard / manage station / users | /preview/admin · /preview/admin-station · /preview/admin-users |
| Admin: one user / add a user | /preview/admin-user · /preview/admin-new-user |

Check each on desktop and on mobile width (browser dev tools → toggle device toolbar → iPhone 12/13).

## 3. Test the real features end to end

1. **Sign up / sign in** at `/login` → confirm the email link → you land on **/onboarding**.
2. **Add a vehicle**: connector **CCS2**, battery **40 kWh**, max DC **50 kW**. Make it preferred and finish setup.
3. **Add a battery reading** on the vehicle page (e.g. 40 %, odometer 12 000 km).
4. **Home**: tap **Near me** (or search "Demo") → "Recommended for you" shows reasons. Tick **Bookable only**.
5. Open a **demo station** (e.g. *Demo Hub – Koramangala*). The **Charging points** card shows
   *Available · Simulated · a few seconds ago* — it refreshes every 15 s.
6. **Book a slot**: pick your vehicle → today → 30–60 min → the earliest time → **Hold** → **Confirm**.
7. Check-in opens **15 minutes before the start**. When it does, open the booking and tap
   **Start charging from your phone** → **Start charging**.
8. Within ~10 seconds the live screen switches from *Waiting for the charger…* to **Charging**:
   battery ring, power, kWh, duration, cost so far, power curve — all labelled **Simulated**.
   Home shows a **Charging at …** banner; the station shows the charger as *Charging*.
9. Tap **Stop charging** → within ~10 s you get the **session summary** with energy and cost.
10. **Charging history** (`/history`) lists the session with *From charger · Simulated*;
    **Analytics** (`/analytics`) includes it; the **vehicle page** shows battery % "Simulated charger · as of …".
11. **Plan a trip** (`/route`, desktop sidebar or Home → Plan a trip): e.g. *Bengaluru* → *Chennai*,
    battery 70 %, consumption 15 kWh/100 km → stops, battery-along-route chart and map.

If charging never starts: the booking must be checked in or within its check-in window, and the
station must be a demo station (only those are connected to the simulator).

## 4. Account menu, saved trips and connected cars

- **Sign out**: desktop — the account card at the bottom of the left sidebar (it now stays on screen
  while you scroll); phone — tap your initials (top right) → **Sign out**; also on **My profile**.
- **Save a trip**: plan a route on **Plan a trip** → give it a name → **Save trip**. Open
  **Saved trips** (`/trips`, sidebar or account menu) to see the stops, battery chart, map and the
  full list of charging stations on the route (filters: All · Fits my car · Planned stops), plus
  **Plan again with today's battery** and **Delete**.
- **Connect a car**: **My vehicles** → your vehicle → **Connected car**.
  - **Connect simulated car** works straight away: battery, range, odometer, charging and location
    appear (labelled *Simulated*) and update every 5 minutes; during a live charging session it
    follows the charger's battery %.
  - **Connect with Smartcar** needs the Smartcar keys first — see `docs/VEHICLE_CONNECT.md`.

## 5. Admin panel

Sign in as **mithun.r@mavlers.com** (the admin account). An **Admin** section appears at the bottom of
the left sidebar (phone: initials menu → **Admin panel**). Drivers no longer see "Add a station".

1. **Admin → Stations → Add a station**: create one, then on its page add a charging point (tick
   *Bookable*), save opening hours, booking rules and a tariff. The **Ready for bookings?** card
   turns all green and the station becomes bookable for drivers.
2. **Bookings**: filter *Live*, open **Cancel…** on a booking and give a reason — no fee is charged.
3. **Users**: **Add a user** (needs `SUPABASE_SERVICE_ROLE_KEY` in `web/.env.local`, see
   docs/ADMIN.md) → sign in as that person in a private window: you're asked to choose a new password
   first. **Edit** a user to change name/phone/email or set a new password. **Make admin** /
   **Remove admin** (the last admin can't be removed), **Suspend…** with a reason (upcoming bookings
   are cancelled free; they can't book, check in or review) and **Activate**.
4. **Live chargers**: status of every registered charger; **Register a charger** shows its secret once.
5. **Reports**: remove spam check-ins or reviews. **Audit log**: every admin change.

Signed in as a normal driver, `/admin` redirects home and `/stations/new` is not available.

## 6. Automated checks (optional)

```bash
cd web
npx vitest run --project unit     # pure logic, no database needed
npm run lint && npm run build
```

The database tests (`--project db`) need a local Postgres 16 + PostGIS — see docs/TESTING.md.

## 7. Optional: a "real" OCPP charger

See `tools/ocpp-gateway/README.md` to run the WebSocket gateway and the command-line charger
simulator against your local app.
