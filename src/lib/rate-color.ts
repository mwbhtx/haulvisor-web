/**
 * Returns a Tailwind text color class for a GROSS rate per mile value
 * based on the user's cost per mile setting.
 *
 * Tiers (relative to cost per mile):
 *   Red:    below 1.3x cost  — below market, barely breaking even
 *   Yellow: 1.3x – 1.7x cost — acceptable margin
 *   Green:  above 1.7x cost  — strong margin
 *
 * With a default cost of $1.60/mi this maps roughly to:
 *   Red:    < $2.08   Yellow: $2.08–$2.72   Green: > $2.72
 */
export function rateColor(ratePerMile: number, costPerMile: number): string {
  const ratio = ratePerMile / costPerMile;
  if (ratio >= 1.7) return "text-green-500";
  if (ratio >= 1.3) return "text-yellow-500";
  return "text-red-500";
}

/**
 * Returns a Tailwind text color class for a NET (after costs) rate per mile.
 *
 * Industry averages for owner-operator net profit per mile (2026):
 *   Red:    below $0.50/mi — thin margin, at risk of loss
 *   Yellow: $0.50–$1.00/mi — decent, covers overhead with modest profit
 *   Green:  above $1.00/mi — strong profit margin
 */
export function netRateColor(netPerMile: number): string {
  if (netPerMile >= 1.0) return "text-green-500";
  if (netPerMile >= 0.5) return "text-yellow-500";
  return "text-red-500";
}
