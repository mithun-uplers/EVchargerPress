/**
 * Personalised station recommendations (pure, explainable). Every point a station scores comes
 * with a reason shown to the driver, and only data we actually have is used.
 */

export type RecCandidate = {
  id: string;
  name: string;
  city: string | null;
  operator: string | null;
  is_bookable: boolean;
  max_power_kw: number | null;
  connector_types: string[];
  last_status: "working" | "busy" | "broken" | null;
  live_evse_count: number | null;
  live_available_count: number | null;
  live_is_simulated: boolean | null;
  distance_km: number | null;
  energy_price_minor: number | null; // from a published tariff, per kWh
  visits: number; // the driver's own recorded sessions here
};

export type RecContext = {
  vehicleConnectors: string[] | null; // null = no vehicle yet
  vehicleMaxDcKw: number | null;
  avgPricePaidMinor: number | null;
};

export type Recommendation = { station: RecCandidate; score: number; reasons: string[]; warnings: string[] };

export function recommend(cands: RecCandidate[], ctx: RecContext, limit = 4): Recommendation[] {
  const out: Recommendation[] = [];
  for (const s of cands) {
    if (ctx.vehicleConnectors && ctx.vehicleConnectors.length) {
      if (!s.connector_types.some((c) => ctx.vehicleConnectors!.includes(c))) continue; // can't charge here
    }
    if (s.last_status === "broken") continue;
    const reasons: { pts: number; text: string }[] = [];
    if (ctx.vehicleConnectors?.length) {
      const match = s.connector_types.filter((c) => ctx.vehicleConnectors!.includes(c));
      reasons.push({ pts: 10, text: `Fits your car (${match.join(", ")})` });
    }
    if (s.distance_km !== null) {
      const pts = Math.round(30 * Math.max(0, 1 - s.distance_km / 25));
      if (pts > 0) reasons.push({ pts, text: `${s.distance_km < 1 ? "Under 1" : s.distance_km.toFixed(1)} km away` });
    }
    if (s.live_evse_count) {
      const free = s.live_available_count ?? 0;
      reasons.push(free > 0
        ? { pts: 20, text: `${free} of ${s.live_evse_count} free now${s.live_is_simulated ? " (simulated)" : ""}` }
        : { pts: -10, text: `All ${s.live_evse_count} busy right now${s.live_is_simulated ? " (simulated)" : ""}` });
    }
    if (s.is_bookable) reasons.push({ pts: 12, text: "Book a slot ahead" });
    if (s.visits > 0) reasons.push({ pts: Math.min(15, s.visits * 5), text: `You’ve charged here ${s.visits} time${s.visits === 1 ? "" : "s"}` });
    if (s.energy_price_minor !== null && ctx.avgPricePaidMinor !== null && s.energy_price_minor < ctx.avgPricePaidMinor * 0.95) {
      reasons.push({ pts: 12, text: `₹${(s.energy_price_minor / 100).toFixed(0)}/kWh — below your average ₹${(ctx.avgPricePaidMinor / 100).toFixed(0)}` });
    }
    if (s.max_power_kw && Number(s.max_power_kw) >= 50 && (ctx.vehicleMaxDcKw ?? 0) >= 50) reasons.push({ pts: 8, text: "Fast DC your car can use" });
    if (s.last_status === "working") reasons.push({ pts: 5, text: "Reported working by drivers" });
    const score = reasons.reduce((a, r) => a + r.pts, 0);
    if (score <= 10) continue; // nothing specific to say
    out.push({
      station: s,
      score,
      reasons: reasons.filter((r) => r.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 3).map((r) => r.text),
      warnings: reasons.filter((r) => r.pts < 0).map((r) => r.text),
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
