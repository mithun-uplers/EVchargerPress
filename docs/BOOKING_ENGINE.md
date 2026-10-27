# Reservation engine (Module F)

Customers reserve **one charging point (EVSE) for one time window**. Every rule lives in Postgres
(`supabase/migrations/20261028000001_reservation_engine.sql`), so the web app, the `/api/v1` API and any
future client get identical behaviour. No payments and no charger hardware are involved yet.

## Flow

1. **Availability**: `get_availability(station, local date, duration)` returns free start times per bookable charging point.
2. **Hold**: `create_booking(evse, start, duration, idempotency_key)` validates the window, prices it on the server,
   freezes the price and policy into `price_snapshot`, and inserts a `pending` booking that expires after `hold_minutes`.
3. **Confirm**: `confirm_booking(id)` turns a live hold into `confirmed` (a payment step would go here later).
4. **Check in**: `check_in_booking(id)` from `check_in_early_min` before to `no_show_grace_min` after the start (manual, no hardware).
5. **Cancel**: `cancel_booking(id, reason)`, free for holds; for confirmed bookings free until
   `free_cancel_until_min` before the start, then the reservation fee is recorded as a late-cancellation fee; impossible after the start.
6. **Sweeper**: `app.sweep_bookings()` runs every minute (pg_cron) to expire holds, mark no-shows, complete finished check-ins and purge old idempotency keys.

## Status model

```
pending ──► confirmed ──► checked_in ──► completed
   │            │
   │            ├──► cancelled
   │            └──► no_show
   ├──► cancelled
   └──► expired
```

A trigger rejects any other transition (error `EVB11`), even from an admin SQL session, and logs every change to the
append-only `booking_events` table. Time window, charging point, prices and snapshot can never be edited (`EVB10`).

## Guarantees and how they are enforced

| Guarantee | Mechanism |
| --- | --- |
| No overlapping bookings per charging point | `EXCLUDE USING gist (evse_id WITH =, buffered_period WITH &&)` for live statuses |
| Turnover buffer | `buffered_period = [start, end + buffer_min)` |
| No deadlocks under partial overlap | per-charging-point advisory lock before insert (lock order: user → charging point) |
| Active-booking limit per user can't be raced | per-user advisory lock |
| Duplicate requests | `idempotency_keys (user_id, key)` + request hash; concurrent duplicates wait and get the same booking; reuse with other parameters → `EVB08`; keys live 24 h |
| Lapsed holds never block a slot | expired in the same transaction before insert, and by the sweeper |
| Opening hours in local time, DST-safe | station `time_zone` (IANA); hours converted to absolute ranges per day (`tstzmultirange`) |
| Server-side pricing, immutable snapshot | `app.price_quote` → `price_snapshot` JSON; guard trigger blocks edits |
| Customers can't write bookings directly | RLS: select-own only; all writes via `security definer` functions |

## Configuration (per station)

`booking_rules`: `slot_step_min` (5–60), `min_duration_min`, `max_duration_min`, `buffer_min`, `lead_time_min`,
`max_advance_days`, `hold_minutes`, `free_cancel_until_min`, `check_in_early_min`, `no_show_grace_min`, `max_active_per_user`.

`operating_hours`: weekday 0 = Sunday … 6 = Saturday, local `opens_at`–`closes_at` (`24:00` allowed; overnight = two rows).
No rows means the station is closed and can't be booked.

`tariffs` + `tariff_components`: `energy_kwh`, `time_min`, `session_fixed`, `reservation_fixed`, `idle_min` in minor
units (paise), currency, `tax_mode` (inclusive/exclusive), `tax_rate_bp` (1800 = 18%), validity dates. A tariff can target a
whole station or one charging point (the charging-point tariff wins).

Energy in quotes is an **estimate**: 80% of the charging point's rated power for the booked time. Only the reservation
fee is a firm amount.

Demo stations are configured by `supabase/scripts/demo_booking_config.sql`. Imported OpenStreetMap stations are not bookable
(there's no verified charging-point, hours or price data for them).

## API (`/api/v1`)

All responses are `{ "data": … }` or `{ "error": { "code", "message", "fields"?, "request_id" } }`.
Writes need the session cookie and a same-origin `Origin` header.

| Method + path | Auth | Notes |
| --- | --- | --- |
| `GET /stations/{id}/availability?date=YYYY-MM-DD&duration_min=60` | public | `date` is the station's local date |
| `POST /quotes` `{evse_id, start_at, duration_min}` | public | price breakdown, nothing is booked |
| `POST /bookings` + `Idempotency-Key` header, same body | user | 201 with the hold; repeat with the same key returns it |
| `GET /bookings?tab=upcoming\|completed\|cancelled\|expired\|no_show` | user | own bookings only |
| `GET /bookings/{reference}` | user | own booking + status history; others' → 404 |
| `POST /bookings/{reference}/confirm` | user | repeat-safe |
| `POST /bookings/{reference}/cancel` `{reason?}` | user | repeat-safe; returns the fee applied |
| `POST /bookings/{reference}/check-in` | user | repeat-safe |

| Error code (SQLSTATE) | HTTP | Meaning |
| --- | --- | --- |
| `not_authenticated` (EVB01) | 401 | sign in first |
| `not_found` (EVB02) | 404 | unknown, or not yours |
| `not_bookable` (EVB03) | 422 | charging point/station doesn't take bookings |
| `invalid_duration` (EVB04) | 422 | outside min/max or not a multiple of the step |
| `invalid_start` (EVB05) | 422 | misaligned, past, inside lead time, beyond advance limit |
| `outside_hours` (EVB06) | 422 | station closed for part of the window |
| `slot_unavailable` (EVB07) | 409 | overlaps another booking or its buffer |
| `idempotency_mismatch` (EVB08) | 409 | key reused with different parameters |
| `too_many_active` (EVB09) | 422 | user's active-booking limit reached |
| `booking_immutable` (EVB10) | 409 | attempt to edit a frozen field |
| `invalid_transition` (EVB11) | 409 | status change not allowed |
| `hold_expired` (EVB12) | 409 | confirm after the hold lapsed |
| `not_cancellable` (EVB13) | 422 | already started, or a terminal status |
| `no_tariff` (EVB14) | 422 | no published tariff for that time |
| `invalid_request` (EVB15) | 400 | malformed input / idempotency key |
| `check_in_window` (EVB16) | 422 | too early or too late to check in |

## Not included yet

Online payments (the reservation fee is "pay at station"), charger hardware/OCPP (availability is calendar-only and check-in is
manual), admin screens for rules/tariffs (edit the tables directly for now), notification emails, vehicle compatibility
filtering when booking.
