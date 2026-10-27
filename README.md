# EVChargePress — MVP

Community EV charging-station finder. Drivers search stations, see connector types and the latest
"working / busy / broken" report, and post their own check-ins. Signed-in users can add stations.

## Stack
- **web/** — Next.js 16 (App Router, Turbopack) + Tailwind v4 + `@supabase/ssr`
- **Supabase** project `igvdjixjrqmrfzrvsqps` — Postgres + Auth (email/password) + RLS
- **supabase/** — migrations (already applied unless marked) and demo seed

## Run locally
```bash
cd web
cp .env.example .env.local   # then fill in values (already present on Mithun's machine)
npm install
npm run dev                  # http://localhost:3000
```
The publishable key is safe for the browser; RLS protects the data.

## Supabase settings to check
- **Auth → URL Configuration**: Site URL `http://localhost:3000` (later your prod URL); add
  `http://localhost:3000/auth/confirm` to Redirect URLs.
- **Auth → Providers → Email**: "Confirm email" on = users confirm via link; off = instant sign-in (handy for testing).

## Bookings (reservation engine)
Drivers can reserve a charging point at stations that take bookings (currently the 5 demo stations):
`/stations/{id}/book` → hold → review the frozen price and rules → confirm; `/bookings` lists upcoming, completed,
cancelled, expired and no-show bookings. All rules are enforced in Postgres. See [docs/BOOKING_ENGINE.md](docs/BOOKING_ENGINE.md)
for the rules, status model and `/api/v1` endpoints, and [docs/TESTING.md](docs/TESTING.md) to run the tests.

## Data model
| table | purpose | who can write |
|---|---|---|
| profiles | display name per auth user (auto-created on signup) | owner |
| stations | name, address, city, lat/lng, operator, access, hours, price | creator (insert/update/delete own) |
| connectors | type, kW, quantity per station | station creator |
| checkins | working/busy/broken + comment | any signed-in user (own rows) |
| station_summaries (view) | station + last status, max kW, connector types | read-only |

Everyone (including signed-out visitors) can read.

## Pages
- `/` search by city/name/address, connector filter, "working only", "Near me" distance sort
- `/stations/[id]` map (OpenStreetMap), connectors, details, directions, report status, recent reports
- `/stations/new` add a station (with "use my location")
- `/login` sign in / sign up · `/auth/confirm` email-link handler

## Next steps (post-MVP ideas)
- Interactive map view (Leaflet/MapLibre) with clustering; PostGIS for radius search
- Edit station + connectors UI; photo uploads (Supabase Storage)
- Moderation / report abuse; operator-verified badge
- Google / phone OTP login; PWA for mobile
- Re-enable `cacheComponents` for faster pages
