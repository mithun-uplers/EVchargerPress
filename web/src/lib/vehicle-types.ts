/** Lives outside the client form module so server components get the real object, not a client reference. */
export const VEHICLE_TYPE_LABEL: Record<string, string> = {
  car: "Electric car",
  motorcycle: "Electric motorcycle",
  scooter: "Electric scooter",
  bicycle: "Electric bicycle",
  other: "Other electric vehicle",
};

/** Short noun used in buttons and headings: "Connect scooter", "Simulated motorcycle". */
const VEHICLE_NOUN: Record<string, string> = {
  car: "car",
  motorcycle: "motorcycle",
  scooter: "scooter",
  bicycle: "e-bike",
  other: "vehicle",
};
export const vehicleNoun = (type?: string | null) => VEHICLE_NOUN[type ?? ""] ?? "vehicle";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Every label the connect feature shows, worded for the vehicle type. */
export function connectLabels(type?: string | null) {
  const n = vehicleNoun(type);
  return {
    connect: `Connect ${n}`,
    connected: `${cap(n)} connected`,
    heading: `Connected ${n}`,
    simulated: `Simulated ${n}`,
    useSimulated: `Use a simulated ${n}`,
    connectSimulated: `Connect simulated ${n}`,
    fromVehicle: `From ${n}`,
    noun: n,
  };
}

/**
 * Smartcar (the cloud connection we use) covers cars from supported brands only.
 * Two-wheelers and e-bikes have no public data API we can connect to yet.
 */
export const supportsCloudConnect = (type?: string | null) => type === "car";
