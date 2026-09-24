/**
 * Wind Direction Conversion & Formatting Utility
 *
 * Rules:
 * - Accepts degree between 0 and 360, or special code 990 (風向不定)
 * - 8 cardinal/intercardinal compass points: 北、東北、東、東南、南、西南、西、西北
 * - 0° and 360° are both "北"
 * - 990 represents "風向不定" (Variable wind direction)
 * - Special codes (-99, X), values outside valid range, NaN, null, or undefined map to null
 * - Null returns "—"
 */

export const WIND_8_DIRECTIONS = [
  "北",
  "東北",
  "東",
  "東南",
  "南",
  "西南",
  "西",
  "西北",
] as const;

export type Wind8Direction = (typeof WIND_8_DIRECTIONS)[number];

export const WIND_VARIABLE_DEGREE = 990;

/**
 * Converts a wind direction degree (0-360) into one of the 8 Chinese compass directions.
 * Returns null if the degree is null, non-numeric, 990 (variable), or outside [0, 360].
 */
export function getWind8Direction(deg: number | null | undefined): Wind8Direction | null {
  if (deg === null || deg === undefined || !Number.isFinite(deg)) {
    return null;
  }
  if (deg < 0 || deg > 360) {
    return null;
  }

  // Normalize 360 to 0
  const normalized = deg === 360 ? 0 : deg;
  // Each of the 8 sectors spans 45 degrees, centered around the cardinal direction (+22.5 offset)
  const index = Math.floor((normalized + 22.5) / 45) % 8;
  return WIND_8_DIRECTIONS[index];
}

/**
 * Formats a wind direction degree into a human-readable display string:
 * - 990 -> "風向不定"
 * - 0° -> "北 (0°)"
 * - 130° -> "東南 (130°)"
 * - null or invalid -> "—"
 */
export function formatWindDirection(deg: number | null | undefined): string {
  if (deg === WIND_VARIABLE_DEGREE) {
    return "風向不定";
  }
  const dir = getWind8Direction(deg);
  if (dir === null || deg === null || deg === undefined || !Number.isFinite(deg)) {
    return "—";
  }
  return `${dir} (${Math.round(deg)}°)`;
}
