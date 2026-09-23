/**
 * Map Marker Preparation and Temperature Color Classification
 *
 * Rules:
 * - maxTemp < 20: blue ("#3b82f6")
 * - 20 <= maxTemp < 25: green ("#10b981")
 * - 25 <= maxTemp < 30: orange ("#f59e0b")
 * - maxTemp >= 30: red ("#ef4444")
 * - null / missing: gray ("#6b7280")
 */

import { NormalizedForecastData } from "../contracts/weather";
import { TAIWAN_COUNTY_COORDINATES, EXPECTED_TAIWAN_REGIONS } from "../data/county-coordinates";
import { aggregateDailyForecasts, DailyForecast } from "../transformations/daily";

export type TemperatureColorCategory = "blue" | "green" | "orange" | "red" | "gray";

export interface TemperatureColorStyle {
  category: TemperatureColorCategory;
  hex: string;
  label: string;
}

export const COLOR_MAP: Record<TemperatureColorCategory, TemperatureColorStyle> = {
  blue: { category: "blue", hex: "#3b82f6", label: "偏涼 (<20°C)" },
  green: { category: "green", hex: "#10b981", label: "舒適 (20-24°C)" },
  orange: { category: "orange", hex: "#f59e0b", label: "偏熱 (25-29°C)" },
  red: { category: "red", hex: "#ef4444", label: "炎熱 (≥30°C)" },
  gray: { category: "gray", hex: "#6b7280", label: "無資料" },
};

/**
 * Returns the temperature color style based on the daily maximum forecast temperature.
 */
export function getTemperatureColorStyle(maxTemp: number | null | undefined): TemperatureColorStyle {
  if (maxTemp === null || maxTemp === undefined || !Number.isFinite(maxTemp)) {
    return COLOR_MAP.gray;
  }
  if (maxTemp < 20) {
    return COLOR_MAP.blue;
  }
  if (maxTemp < 25) {
    return COLOR_MAP.green;
  }
  if (maxTemp < 30) {
    return COLOR_MAP.orange;
  }
  return COLOR_MAP.red;
}

export interface CountyMapMarkerData {
  region: string;
  latitude: number;
  longitude: number;
  forecastDate: string;
  minTemp: number | null;
  maxTemp: number | null;
  intervalCount: number;
  isPartial: boolean;
  colorStyle: TemperatureColorStyle;
}

/**
 * Finds the default map date from the normalized forecast data.
 * Selects the earliest date where all available expected regions have isPartial === false.
 * If no fully complete date exists, selects the earliest available date.
 */
export function getDefaultMapDate(data: NormalizedForecastData): string | null {
  if (!data.regions || data.regions.length === 0) {
    return null;
  }

  // Map each region to its aggregated daily forecasts
  const regionDailyMap = new Map<string, Map<string, DailyForecast>>();
  const allDatesSet = new Set<string>();

  for (const reg of data.regions) {
    const dailyList = aggregateDailyForecasts(reg.intervals);
    const dayMap = new Map<string, DailyForecast>();
    for (const d of dailyList) {
      dayMap.set(d.forecastDate, d);
      allDatesSet.add(d.forecastDate);
    }
    regionDailyMap.set(reg.region, dayMap);
  }

  const sortedDates = Array.from(allDatesSet).sort();
  if (sortedDates.length === 0) return null;

  // Search for the earliest date that is complete across all expected regions
  for (const dateStr of sortedDates) {
    let allComplete = true;
    for (const expectedRegion of EXPECTED_TAIWAN_REGIONS) {
      const dayData = regionDailyMap.get(expectedRegion)?.get(dateStr);
      if (!dayData || dayData.isPartial) {
        allComplete = false;
        break;
      }
    }
    if (allComplete) {
      return dateStr;
    }
  }

  // Fallback to earliest available date
  return sortedDates[0];
}

/**
 * Prepares map marker records for all 22 counties on a specified forecast date.
 * Uses the single NormalizedForecastData response without making separate requests.
 */
export function prepareCountyMapMarkers(
  data: NormalizedForecastData,
  selectedDate: string
): CountyMapMarkerData[] {
  if (!data.regions || data.regions.length === 0) {
    return [];
  }

  const regionDailyLookup = new Map<string, DailyForecast>();

  for (const reg of data.regions) {
    const daily = aggregateDailyForecasts(reg.intervals);
    const matchedDay = daily.find((d) => d.forecastDate === selectedDate);
    if (matchedDay) {
      regionDailyLookup.set(reg.region, matchedDay);
    }
  }

  const markers: CountyMapMarkerData[] = [];

  for (const regionName of EXPECTED_TAIWAN_REGIONS) {
    const coords = TAIWAN_COUNTY_COORDINATES[regionName];
    if (!coords) continue;

    const dayData = regionDailyLookup.get(regionName);

    if (dayData) {
      markers.push({
        region: regionName,
        latitude: coords.latitude,
        longitude: coords.longitude,
        forecastDate: selectedDate,
        minTemp: dayData.minTemp,
        maxTemp: dayData.maxTemp,
        intervalCount: dayData.intervalCount,
        isPartial: dayData.isPartial,
        colorStyle: getTemperatureColorStyle(dayData.maxTemp),
      });
    } else {
      // Region missing from forecast data for this date; render safely with nulls
      markers.push({
        region: regionName,
        latitude: coords.latitude,
        longitude: coords.longitude,
        forecastDate: selectedDate,
        minTemp: null,
        maxTemp: null,
        intervalCount: 0,
        isPartial: true,
        colorStyle: COLOR_MAP.gray,
      });
    }
  }

  return markers;
}
