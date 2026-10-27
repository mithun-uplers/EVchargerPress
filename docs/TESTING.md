# Testing

```bash
cd web
npm test              # unit + database tests
npm run test:db       # database tests only
```

## Database tests (`web/tests/db`)

They run the real migrations from `supabase/migrations/` against a throwaway Postgres, with a small stand-in for
Supabase's `auth` schema and roles (`tests/db/supabase-shim.sql`). Each request runs in its own connection as the
`authenticated` role with the clock pinned through `app.now`, so concurrency tests are genuinely parallel.

Requirements: Postgres 16+ with PostGIS (and the built-in `btree_gist`, `pgcrypto`). Point the tests at a server where
the `postgres` user may create databases:

```bash
export TEST_DATABASE_ADMIN_URL=postgres://postgres@127.0.0.1:54329/postgres   # default
```

The suite drops and recreates the `evcp_test` database each run. **Never** point it at Supabase.

macOS quick start (Homebrew):

```bash
brew install postgresql@17 postgis
brew services start postgresql@17
createuser -s postgres
export TEST_DATABASE_ADMIN_URL=postgres://postgres@127.0.0.1:5432/postgres
npm run test:db
```

Coverage: simultaneous conflicting requests (20 parallel for one slot; 16 partly overlapping, 5 rounds), duplicate
requests and idempotency keys, invalid slots (duration, alignment, lead time, advance limit, hours, bookability, auth),
time zones (IST half-hour offset, Europe/London spring-forward and 25-hour fall-back day, hours across midnight),
cancellation rules (free window, late fee from snapshot, after start, repeat, other users), expired holds, sweeper,
status transitions, immutability, RLS and pricing.

Last run: 2026-10-28, Postgres 16.15 + PostGIS: 58 passed (48 database, 10 unit).

## Unit tests (`web/tests/unit`)

Pure helpers: range parsing, status display, money/time formatting in the station's time zone, API input validation.
