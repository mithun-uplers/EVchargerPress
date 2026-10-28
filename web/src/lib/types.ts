export const CONNECTOR_TYPES = [
  "CCS2",
  "CCS1",
  "Type 2",
  "CHAdeMO",
  "Bharat DC-001",
  "Bharat AC-001",
  "GB/T",
  "NACS",
  "Type 1",
  "15A Socket",
  "Other",
] as const;
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

export type CheckinStatus = "working" | "broken" | "busy";

export type StationSummary = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  city_is_approx: boolean;
  state: string | null;
  postal_code: string | null;
  data_source: "community" | "demo" | "openstreetmap";
  time_zone?: string;
  is_bookable: boolean;
  external_id: string | null;
  source_updated_at: string | null;
  lat: number;
  lng: number;
  operator: string | null;
  access: "public" | "restricted";
  hours: string | null;
  price_info: string | null;
  is_demo: boolean;
  created_by: string | null;
  created_at: string;
  last_status: CheckinStatus | null;
  last_checkin_at: string | null;
  max_power_kw: number | null;
  connector_types: string[];
  // Live status from a connected charger (null when nothing fresh was reported in the last 15 minutes).
  live_evse_count?: number | null;
  live_available_count?: number | null;
  live_is_simulated?: boolean | null;
  live_updated_at?: string | null;
};

export type Connector = {
  id: string;
  station_id: string;
  type: string;
  power_kw: number | null;
  quantity: number;
};

export type Checkin = {
  id: string;
  status: CheckinStatus;
  comment: string | null;
  created_at: string;
  user_id: string;
  profiles: { display_name: string | null } | null;
};

/** "Street, City" — with "near <town>" when the town was derived from location, and null parts skipped. */
export function formatPlace(s: Pick<StationSummary, "address" | "city" | "city_is_approx" | "state">) {
  const city = s.city ? (s.city_is_approx ? `near ${s.city}` : s.city) : null;
  const parts = [s.address, city, s.state && !s.city_is_approx ? s.state : null].filter(Boolean);
  return parts.length ? parts.join(", ") : "Address not listed";
}

export const SOURCE_LABEL: Record<StationSummary["data_source"], string> = {
  community: "Added by a driver",
  demo: "Demo data",
  openstreetmap: "Source: OpenStreetMap",
};
