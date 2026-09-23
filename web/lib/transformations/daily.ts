/**
 * Daily Weather Forecast Aggregation and Transformation Module
 *
 * Pure functional transformations for converting raw 12-hour CWA forecast intervals
 * into aggregated daily summaries, date filtering, and KPI calculations.
 *
 * Rules:
 * 1. Calendar date assignment strictly governed by interval startTime in Asia/Taipei timezone.
 * 2. Overnight intervals belong solely to the date of their startTime (no double counting).
 * 3. Null temperatures are preserved as null, never defaulted to 0.
 * 4. Daily minTemp is the minimum of valid interval minTemp values (null if all null).
 * 5. Daily maxTemp is the maximum of valid interval maxTemp values (null if all null).
 * 6. Returned daily records are sorted chronologically by forecastDate ascending.
 * 7. Immutability: input objects and arrays are never mutated.
 * 8. Date range filtering is inclusive of both start and end dates.
 */

import { ForecastInterval } from "../contracts/weather";

export interface DailyForecast {
  forecastDate: string; // YYYY-MM-DD in Asia/Taipei
  minTemp: number | null;
  maxTemp: number | null;
  intervalCount: number;
  isPartial: boolean; // intervalCount < 2
  intervals: ForecastInterval[]; // Raw intervals belonging to this calendar date
}

export interface SummaryKpis {
  periodMin: number | null;
  periodMax: number | null;
  daysCount: number;
}

const TAIWAN_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const TAIWAN_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  weekday: "short",
});

/**
 * Converts an ISO-8601 timestamp string into a YYYY-MM-DD date string in Asia/Taipei timezone.
 */
export function getTaipeiDateString(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date string: ${isoString}`);
  }
  return TAIWAN_DATE_FORMATTER.format(date);
}

/**
 * Returns the short Chinese weekday name for a YYYY-MM-DD date string (e.g. "週一").
 */
export function getTaipeiWeekday(dateStr: string): string {
  // Append noon time in Asia/Taipei to prevent timezone shifts across UTC
  const date = new Date(`${dateStr}T12:00:00+08:00`);
  return TAIWAN_WEEKDAY_FORMATTER.format(date);
}

/**
 * Formats a Date or ISO timestamp into friendly display time in Asia/Taipei (e.g. "09/24 18:00").
 */
export function formatTaipeiDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;

  const formatter = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return formatter.format(date);
}

/**
 * Pure function that aggregates a list of 12-hour intervals for a single region into daily records.
 *
 * @param intervals Array of 12-hour forecast intervals
 * @returns Chronologically sorted array of DailyForecast records
 */
export function aggregateDailyForecasts(
  intervals: readonly ForecastInterval[]
): DailyForecast[] {
  if (!intervals || intervals.length === 0) {
    return [];
  }

  // Group copy of intervals by Asia/Taipei calendar date of startTime
  const groups = new Map<string, ForecastInterval[]>();

  for (const interval of intervals) {
    const dateKey = getTaipeiDateString(interval.startTime);
    const existing = groups.get(dateKey) ?? [];
    existing.push({ ...interval });
    groups.set(dateKey, existing);
  }

  // Sort date keys chronologically
  const sortedDateKeys = Array.from(groups.keys()).sort();

  const results: DailyForecast[] = [];

  for (const dateKey of sortedDateKeys) {
    const dayIntervals = groups.get(dateKey)!;
    const intervalCount = dayIntervals.length;
    const isPartial = intervalCount < 2;

    // Collect valid numeric min temperatures
    const validMins = dayIntervals
      .map((it) => it.minTemp)
      .filter((t): t is number => typeof t === "number" && Number.isFinite(t));

    // Collect valid numeric max temperatures
    const validMaxs = dayIntervals
      .map((it) => it.maxTemp)
      .filter((t): t is number => typeof t === "number" && Number.isFinite(t));

    const dailyMin = validMins.length > 0 ? Math.min(...validMins) : null;
    const dailyMax = validMaxs.length > 0 ? Math.max(...validMaxs) : null;

    results.push({
      forecastDate: dateKey,
      minTemp: dailyMin,
      maxTemp: dailyMax,
      intervalCount,
      isPartial,
      intervals: dayIntervals,
    });
  }

  return results;
}

/**
 * Filters a list of DailyForecast records by date range (inclusive).
 *
 * @param dailyList Daily forecast records
 * @param startDate Inclusive start date (YYYY-MM-DD), or undefined for no lower bound
 * @param endDate Inclusive end date (YYYY-MM-DD), or undefined for no upper bound
 */
export function filterDailyForecasts(
  dailyList: readonly DailyForecast[],
  startDate?: string,
  endDate?: string
): DailyForecast[] {
  if (!dailyList) return [];

  return dailyList.filter((item) => {
    if (startDate && item.forecastDate < startDate) {
      return false;
    }
    if (endDate && item.forecastDate > endDate) {
      return false;
    }
    return true;
  });
}

/**
 * Calculates high-level KPI metrics across a given list of daily forecasts.
 */
export function computeSummaryKpis(
  dailyList: readonly DailyForecast[]
): SummaryKpis {
  if (!dailyList || dailyList.length === 0) {
    return {
      periodMin: null,
      periodMax: null,
      daysCount: 0,
    };
  }

  const validMins = dailyList
    .map((d) => d.minTemp)
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t));

  const validMaxs = dailyList
    .map((d) => d.maxTemp)
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t));

  return {
    periodMin: validMins.length > 0 ? Math.min(...validMins) : null,
    periodMax: validMaxs.length > 0 ? Math.max(...validMaxs) : null,
    daysCount: dailyList.length,
  };
}
