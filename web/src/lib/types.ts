export const CONNECTOR_TYPES = [
  "CCS2",
  "Type 2",
  "CHAdeMO",
  "Bharat DC-001",
  "Bharat AC-001",
  "GB/T",
  "NACS",
  "Type 1",
  "15A Socket",
] as const;
export type ConnectorType = (typeof CONNECTOR_TYPES)[number];

export type CheckinStatus = "working" | "broken" | "busy";

export type StationSummary = {
  id: string;
  name: string;
  address: string;
  city: string;
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
  max_power_kw: number;
  connector_types: string[];
};

export type Connector = {
  id: string;
  station_id: string;
  type: string;
  power_kw: number;
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
