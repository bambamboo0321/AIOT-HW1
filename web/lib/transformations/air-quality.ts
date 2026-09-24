/**
 * Air Quality (AQI) Pure Transformation & Formatting Utilities
 *
 * Implements:
 * - County name normalization ("台" <-> "臺")
 * - Official MOENV 6-tier AQI level and color mapping:
 *   - 0-50: 良好 (官方色彩：綠色)
 *   - 51-100: 普通 (官方色彩：黃色)
 *   - 101-150: 對敏感族群不健康 (官方色彩：橘色)
 *   - 151-200: 對所有族群不健康 (官方色彩：紅色)
 *   - 201-300: 非常不健康 (官方色彩：紫色)
 *   - 301-500: 危害 (官方色彩：褐紅色)
 *   (註：各 Hex 色碼如 #10b981、#eab308 等為本專案 UI 視覺呈現對應色，非環境部官方公布之絕對色碼規範)
 * - County-level maximum AQI aggregation (worst air quality) strictly within the same county,
 *   with deterministic tie-breaking on stationId
 * - Station filtering by county
 */

import {
  NormalizedStationAirQuality,
  CountyAirQualitySummary,
} from "../contracts/air-quality";

/**
 * Normalizes county name to official standard (replacing "台" with "臺").
 */
export function normalizeCountyName(name: string): string {
  if (!name) return "";
  return name.trim().replace(/^台/, "臺");
}

export interface AqiCategoryInfo {
  level: string;
  officialColorName: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}

/**
 * Maps an AQI numeric value to official MOENV 6-tier classifications and project UI colors.
 * - 0-50: 良好 (綠色)
 * - 51-100: 普通 (黃色)
 * - 101-150: 對敏感族群不健康 (橘色)
 * - 151-200: 對所有族群不健康 (紅色)
 * - 201-300: 非常不健康 (紫色)
 * - 301-500: 危害 (褐紅色)
 * - null or invalid: 無資料 (灰色)
 */
export function getAqiCategory(aqi: number | null | undefined): AqiCategoryInfo {
  if (aqi === null || aqi === undefined || !Number.isFinite(aqi) || aqi < 0) {
    return {
      level: "無資料",
      officialColorName: "灰色",
      color: "#94a3b8",
      bgColor: "rgba(148, 163, 184, 0.1)",
      borderColor: "rgba(148, 163, 184, 0.3)",
      description: "目前暫無有效之監測數值",
    };
  }

  const rounded = Math.round(aqi);

  if (rounded <= 50) {
    return {
      level: "良好",
      officialColorName: "綠色",
      color: "#10b981",
      bgColor: "rgba(16, 185, 129, 0.15)",
      borderColor: "rgba(16, 185, 129, 0.4)",
      description: "空氣品質良好，對健康無影響",
    };
  }
  if (rounded <= 100) {
    return {
      level: "普通",
      officialColorName: "黃色",
      color: "#eab308",
      bgColor: "rgba(234, 179, 8, 0.15)",
      borderColor: "rgba(234, 179, 8, 0.4)",
      description: "空氣品質普通，對極少數極敏感族群有輕微影響",
    };
  }
  if (rounded <= 150) {
    return {
      level: "對敏感族群不健康",
      officialColorName: "橘色",
      color: "#f97316",
      bgColor: "rgba(249, 115, 22, 0.15)",
      borderColor: "rgba(249, 115, 22, 0.4)",
      description: "對敏感族群有輕微影響，建議減少戶外劇烈運動",
    };
  }
  if (rounded <= 200) {
    return {
      level: "對所有族群不健康",
      officialColorName: "紅色",
      color: "#ef4444",
      bgColor: "rgba(239, 68, 68, 0.15)",
      borderColor: "rgba(239, 68, 68, 0.4)",
      description: "對所有族群健康有影響，敏感族群應留在室內",
    };
  }
  if (rounded <= 300) {
    return {
      level: "非常不健康",
      officialColorName: "紫色",
      color: "#a855f7",
      bgColor: "rgba(168, 85, 247, 0.15)",
      borderColor: "rgba(168, 85, 247, 0.4)",
      description: "對所有族群產生較嚴重健康威脅，應避免戶外活動",
    };
  }
  return {
    level: "危害",
    officialColorName: "褐紅色",
    color: "#b91c1c",
    bgColor: "rgba(185, 28, 28, 0.2)",
    borderColor: "rgba(185, 28, 28, 0.5)",
    description: "產生嚴重的健康危害，應立即停止所有戶外活動",
  };
}

/**
 * Filters air quality stations matching the specified county.
 * Automatically normalizes "台" and "臺".
 */
export function filterAirQualityStationsByCounty(
  stations: NormalizedStationAirQuality[],
  targetCounty: string
): NormalizedStationAirQuality[] {
  const normalizedTarget = normalizeCountyName(targetCounty);
  return stations.filter(
    (s) => normalizeCountyName(s.county) === normalizedTarget
  );
}

/**
 * Computes county-level AQI summary:
 * - Uses the maximum AQI value among valid stations in the county (representing worst air quality).
 * - Source station MUST genuinely belong to the same county (never crosses county boundaries).
 * - If multiple stations have the same maximum AQI, uses deterministic tie-breaker (alphabetically smaller stationId).
 * - If all stations are missing AQI (or county has no stations), returns maxAqi: null (never 0).
 */
export function computeCountyAqiSummary(
  stations: NormalizedStationAirQuality[],
  targetCounty: string
): CountyAirQualitySummary {
  const normalizedTarget = normalizeCountyName(targetCounty);
  const countyStations = filterAirQualityStationsByCounty(stations, targetCounty);

  const validStations = countyStations.filter(
    (s) => s.aqi !== null && Number.isFinite(s.aqi) && s.aqi >= 0
  );

  if (validStations.length === 0) {
    return {
      county: normalizedTarget,
      maxAqi: null,
      status: null,
      primaryPollutant: null,
      sourceStationId: null,
      sourceStationName: null,
      sourceStationCounty: null,
      pm25: null,
      pm10: null,
      publishedAt: countyStations[0]?.publishedAt || null,
    };
  }

  // Find worst station (maximum AQI) with deterministic tie-breaking on stationId
  let worstStation = validStations[0];
  for (let i = 1; i < validStations.length; i++) {
    const current = validStations[i];
    const currAqi = current.aqi as number;
    const worstAqi = worstStation.aqi as number;

    if (currAqi > worstAqi) {
      worstStation = current;
    } else if (currAqi === worstAqi) {
      // Deterministic tie-breaking on stationId
      if (current.stationId.localeCompare(worstStation.stationId) < 0) {
        worstStation = current;
      }
    }
  }

  const category = getAqiCategory(worstStation.aqi);

  return {
    county: normalizedTarget,
    maxAqi: worstStation.aqi,
    status: worstStation.status || category.level,
    primaryPollutant: worstStation.primaryPollutant || null,
    sourceStationId: worstStation.stationId,
    sourceStationName: worstStation.stationName,
    sourceStationCounty: worstStation.county,
    pm25: worstStation.pm25,
    pm10: worstStation.pm10,
    publishedAt: worstStation.publishedAt,
  };
}

/**
 * Computes county summaries for a given list of counties.
 */
export function computeAllCountySummaries(
  stations: NormalizedStationAirQuality[],
  counties: string[]
): Record<string, CountyAirQualitySummary> {
  const result: Record<string, CountyAirQualitySummary> = {};
  for (const c of counties) {
    const norm = normalizeCountyName(c);
    result[norm] = computeCountyAqiSummary(stations, norm);
  }
  return result;
}
