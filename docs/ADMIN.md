# Admin panel

Only admins can add, edit or delete stations. Everything that runs the network lives at `/admin`.

## Who is an admin

Admins are rows in `public.user_roles` (`role = 'admin'`, `revoked_at is null`) on an **active**
profile. The first admin is **mithun.r@mavlers.com**, granted when migration
`20261101000001_admin.sql` was applied. More admins are added from **Admin → Users → Make admin**.

- Accounts are only created by people signing up. Admins never set or see passwords.
- The last admin can't be removed, and an admin can't be suspended until admin access is removed.
- Revoking keeps the row (`revoked_at`, `revoked_by`) for history.

Emergency grant (Supabase SQL Editor), for an existing confirmed account:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'someone@example.com' and email_confirmed_at is not null
on conflict (user_id, role) do update set revoked_at = null, revoked_by = null;
```

## What admins can do

| Section | What |
| --- | --- |
| Dashboard | Bookings today, charging now, chargers online, broken reports, stations, users, 30-day booking mix |
| Stations | Search/filter (bookable, verified, source), add, edit details, verify, delete (refused while bookings exist) |
| Station page | Charging points (EVSEs: bookable, active, linked OCPP charger + connector #), connectors, opening hours, booking rules, tariff; a **Ready for bookings?** checklist |
| Bookings | All bookings, filter by status or reference; cancel pending/confirmed with a reason and **no fee** |
| Users | Search, make/remove admin, suspend (reason required) / reactivate |
| Charging sessions | Every session with source (charger, operator, manual) and *Simulated* label |
| Live chargers | Heartbeat/online status, enable/disable, register a real OCPP charger (secret shown once) |
| Reports | Driver check-ins and reviews; remove spam or abuse |
| Audit log | Every admin change, append-only |

## How it is enforced

All rules live in Postgres, so a forged request from a driver does nothing:

- `public.is_admin()` (security definer) is used by RLS policies.
- **Restrictive** policies on `stations` and `connectors` block insert/update/delete for non-admins
  (the old "own station" policies remain but can no longer pass on their own).
- Admin policies on `evses`, `operating_hours`, `booking_rules`, `tariffs`, `tariff_components`,
  read access to all `bookings`, `booking_events`, `charging_sessions`, `meter_values`.
- RPCs `admin_dashboard`, `admin_list_users`, `admin_set_admin`, `admin_set_user_status`,
  `admin_cancel_booking`, `admin_charge_points` (never returns secret hashes),
  `admin_register_charge_point`, `admin_set_charge_point_active`, `admin_set_tariff` all call
  `app.require_admin()` first (EVB01 signed out, 42501 not an admin, EVB24 invalid admin action).
- Suspended accounts: bookings refused with **EVB23**; check-ins and reviews blocked by policy.
- `admin_audit` is filled by triggers on the admin-managed tables and by the RPCs; it can't be updated.
- Publishing a tariff deactivates the old one; existing bookings keep their frozen price snapshot.

Tests: `web/tests/db/admin.test.ts`.
