/** Y-axis range and gridline values for small SVG charts (pure). */
export function axisRange(values: number[], min?: number, max?: number) {
  let lo = min ?? Math.min(...values);
  let hi = max ?? Math.max(...values);
  if (hi === lo) {
    // A flat series (same odometer or price every time) still needs a visible range.
    const pad = Math.abs(hi) * 0.05 || 1;
    if (min === undefined) lo -= pad;
    if (max === undefined) hi += pad;
  }
  const span = hi - lo || 1;
  return { lo, hi, span, ticks: [...new Set([hi, lo + span / 2, lo])] };
}
