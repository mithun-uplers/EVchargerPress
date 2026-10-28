/** Lives outside the client form module so server components get the real object, not a client reference. */
export const VEHICLE_TYPE_LABEL: Record<string, string> = {
  car: "Electric car",
  motorcycle: "Electric motorcycle",
  scooter: "Electric scooter",
  bicycle: "Electric bicycle",
  other: "Other electric vehicle",
};
