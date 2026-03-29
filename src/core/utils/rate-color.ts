import { profitThresholds } from "@mwbhtx/haulvisor-core";

/**
 * Returns a Tailwind text color class for a GROSS rate per mile value
 * based on the user's cost per mile setting.
 */
export function rateColor(ratePerMile: number, costPerMile: number): string {
  const ratio = ratePerMile / costPerMile;
  if (ratio >= 1.7) return "text-green-500";
  if (ratio >= 1.3) return "text-yellow-500";
  return "text-red-500";
}

/**
 * Returns a Tailwind text color class for a NET (after costs) rate per mile.
 */
export function netRateColor(netPerMile: number): string {
  if (netPerMile >= 1.0) return "text-green-500";
  if (netPerMile >= 0.5) return "text-yellow-500";
  return "text-red-500";
}

/**
 * Returns a Tailwind text color class for route profitability metrics
 * based on daily net profit. Thresholds from design tokens.
 */
export function routeProfitColor(dailyNetProfit: number): string {
  if (dailyNetProfit >= profitThresholds.good) return "text-green-400";
  if (dailyNetProfit >= profitThresholds.okay) return "text-yellow-500";
  return "text-red-500";
}
