import type { AdminUser, AdminUserDetail, AuditEntry, Dashboard, StationDetail } from "@/server/admin";

/** Fictional sample data for the admin design preview. */
export const previewDashboard: Dashboard = {
  users: 128, admins: 1, suspended: 2, stations: 4312, stations_by_source: { openstreetmap: 4280, demo: 26, community: 6 },
  verified_stations: 9, bookable_stations: 14, evses: 41, bookings_upcoming: 37, bookings_today: 12,
  bookings_by_status_30d: { completed: 96, confirmed: 31, cancelled: 14, no_show: 4, expired: 22 },
  sessions_active: 3, sessions_30d: 118, kwh_30d: 2364.5, charge_points: 18, charge_points_online: 16, charge_points_simulated: 16,
  broken_reports_7d: 2, checkins_7d: 23, reviews: 57, generated_at: "2026-10-28T09:12:00Z",
};

export const previewAdminStation: StationDetail = {
  station: {
    id: "00000000-0000-4000-8000-0000000000a1", name: "Sample Hub — Baner", address: "12 Example Road, Baner", city: "Pune", state: "Maharashtra", postal_code: "411045",
    lat: 18.559, lng: 73.786, operator: "Sample Charge Co.", access: "public", hours: "24x7", price_info: null, time_zone: "Asia/Kolkata",
    data_source: "community", is_demo: false, is_verified: true, verified_at: "2026-10-20T06:00:00Z", created_at: "2026-10-18T06:00:00Z", updated_at: "2026-10-27T06:00:00Z",
  },
  connectors: [
    { id: "c1", type: "CCS2", power_kw: 60, quantity: 1, evse_id: "e1" },
    { id: "c2", type: "Type 2", power_kw: 22, quantity: 1, evse_id: "e2" },
  ],
  evses: [
    { id: "e1", evse_uid: "E1", label: "DC-1", max_power_kw: 60, is_bookable: true, is_active: true, charge_point_id: "cp1", ocpp_connector_id: 1, live_status: "charging", live_status_at: "2026-10-28T09:10:00Z", live_is_simulated: true },
    { id: "e2", evse_uid: "E2", label: "AC-1", max_power_kw: 22, is_bookable: false, is_active: true, charge_point_id: null, ocpp_connector_id: null, live_status: null, live_status_at: null, live_is_simulated: false },
  ],
  hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ id: d, weekday: d, opens_at: "06:00:00", closes_at: "23:00:00" })),
  rules: null,
  tariff: { id: "t1", name: "Standard", currency: "INR", tax_mode: "exclusive", tax_rate_bp: 1800, valid_from: "2026-10-20T06:00:00Z", components: [{ type: "energy_kwh", price_minor: 1800 }, { type: "reservation_fixed", price_minor: 5000 }] },
  chargePoints: [{ id: "cp1", identity: "SAMPLE-BANER-01" }],
};

export const previewUsers: AdminUser[] = [
  { id: "u1", email: "admin@example.com", display_name: "Admin Person", status: "active", is_admin: true, created_at: "2026-10-01T06:00:00Z", last_sign_in_at: "2026-10-28T05:00:00Z", email_confirmed: true, bookings: 4, vehicles: 1, sessions: 6, total: 3 },
  { id: "u2", email: "driver.one@example.com", display_name: "Driver One", status: "active", is_admin: false, created_at: "2026-10-12T06:00:00Z", last_sign_in_at: "2026-10-27T15:00:00Z", email_confirmed: true, bookings: 11, vehicles: 2, sessions: 14, total: 3 },
  { id: "u3", email: "driver.two@example.com", display_name: "Driver Two", status: "suspended", is_admin: false, created_at: "2026-10-15T06:00:00Z", last_sign_in_at: null, email_confirmed: false, bookings: 5, vehicles: 1, sessions: 0, total: 3 },
];

export const previewUserDetail: AdminUserDetail = {
  id: "00000000-0000-4000-8000-0000000000u2", email: "driver.one@example.com", display_name: "Driver One", phone: "+919800000001", status: "active",
  is_admin: false, created_at: "2026-10-12T06:00:00Z", last_sign_in_at: "2026-10-27T15:00:00Z", email_confirmed: true, onboarded_at: "2026-10-12T06:10:00Z",
  deletion_requested_at: null, password_change_required: true, bookings: 11, bookings_upcoming: 2, vehicles: 2, sessions: 14, checkins: 5, reviews: 2,
};
export const previewUserAudit: AuditEntry[] = [
  { id: 3, actor_id: null, action: "update_profile", target_table: "profiles", target_id: "u2", detail: {}, created_at: "2026-10-20T08:00:00Z" },
  { id: 2, actor_id: null, action: "reactivate_user", target_table: "profiles", target_id: "u2", detail: {}, created_at: "2026-10-18T08:00:00Z" },
  { id: 1, actor_id: null, action: "suspend_user", target_table: "profiles", target_id: "u2", detail: { reason: "Repeated no-shows" }, created_at: "2026-10-16T08:00:00Z" },
];
