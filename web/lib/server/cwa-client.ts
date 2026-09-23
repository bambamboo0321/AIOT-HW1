/**
 * Server-only CWA Open Data API Client and Normalizer
 *
 * Dataset: F-D0047-091 (Taiwan 7-day county/city weather forecasts)
 * Upstream URL: https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-091
 *
 * Security & Design Rules:
 * - Server-only execution check
 * - Authorization key ONLY placed in request header, NEVER in URL query
 * - Explicit UTF-8 charset requested and enforced
 * - Normalizes ~685 KB raw response to clean, sorted ~15 KB schema
 * - Dynamic element discovery ("最低溫度" and "最高溫度") with StartTime+EndTime pairing
 * - Invalid temperatures converted to null, never default to 0
 * - Deterministic locale sorting for regions and chronological sorting for intervals
 */

import { getCwaApiKey } from "./env";
import { safeGetJson } from "./http-client";
import { ParseError, UpstreamError } from "./errors";
import {
  NormalizedForecastData,
  RegionForecast,
  ForecastInterval,
} from "../contracts/weather";

if (typeof window !== "undefined") {
  throw new Error("Security Error: cwa-client module cannot be imported in client-side code.");
}

export const CWA_FORECAST_DATASET_ID = "F-D0047-091";
export const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore";

export interface CwaFetchOptions {
  apiKey?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  fetchedAt?: string;
}

/**
 * Safely parses a raw temperature value into a number or null.
 * Valid numbers (including 0 and negative temperatures) are preserved.
 * Blank strings, "N/A", NaN, and non-numeric values are converted to null.
 */
export function parseTemperature(valRaw: unknown): number | null {
  if (valRaw === null || valRaw === undefined) {
    return null;
  }
  const str = String(valRaw).trim();
  if (str === "" || str.toUpperCase() === "N/A" || str.toUpperCase() === "NAN") {
    return null;
  }
  const num = Number(str);
  return Number.isFinite(num) ? num : null;
}

interface RawCwaTimeEntry {
  StartTime?: string;
  startTime?: string;
  EndTime?: string;
  endTime?: string;
  ElementValue?: Array<Record<string, unknown>>;
  elementValue?: Array<Record<string, unknown>>;
}

interface RawCwaWeatherElement {
  ElementName?: string;
  elementName?: string;
  Time?: RawCwaTimeEntry[];
  time?: RawCwaTimeEntry[];
}

interface RawCwaLocation {
  LocationName?: string;
  locationName?: string;
  WeatherElement?: RawCwaWeatherElement[];
  weatherElement?: RawCwaWeatherElement[];
}

interface RawCwaLocationsGroup {
  Location?: RawCwaLocation[];
  location?: RawCwaLocation[];
}

interface RawCwaRecords {
  Locations?: RawCwaLocationsGroup[];
  locations?: RawCwaLocationsGroup[];
}

interface RawCwaResponse {
  success?: string | boolean;
  records?: RawCwaRecords;
  Records?: RawCwaRecords;
}

/**
 * Normalizes raw CWA F-D0047-091 JSON response into a standardized schema.
 */
export function normalizeCwaForecast(
  rawJson: unknown,
  fetchedAt?: string
): NormalizedForecastData {
  if (!rawJson || typeof rawJson !== "object") {
    throw new ParseError("Malformed CWA dataset structure: payload is not an object.");
  }

  const payload = rawJson as RawCwaResponse;

  if (payload.success !== undefined && String(payload.success).toLowerCase() === "false") {
    throw new UpstreamError(400);
  }

  const records = payload.records ?? payload.Records;
  if (!records || typeof records !== "object") {
    throw new ParseError("Malformed CWA dataset structure: 'records' object is missing.");
  }

  const locationsContainer = records.Locations ?? records.locations;
  if (!Array.isArray(locationsContainer) || locationsContainer.length === 0) {
    throw new ParseError("Malformed CWA dataset structure: 'records.Locations' is missing or empty.");
  }

  const locationsGroup = locationsContainer[0];
  if (!locationsGroup || typeof locationsGroup !== "object") {
    throw new ParseError("Malformed CWA dataset structure: 'records.Locations[0]' is not an object.");
  }

  const locationList = locationsGroup.Location ?? locationsGroup.location;
  if (!Array.isArray(locationList) || locationList.length === 0) {
    throw new ParseError("Malformed CWA dataset structure: 'records.Locations[0].Location' is missing or empty.");
  }

  const regions: RegionForecast[] = [];

  for (const loc of locationList) {
    if (!loc || typeof loc !== "object") continue;

    const rawLocName = loc.LocationName ?? loc.locationName;
    if (!rawLocName || typeof rawLocName !== "string" || !rawLocName.trim()) {
      continue;
    }
    const regionName = rawLocName.trim();

    const weatherElements = loc.WeatherElement ?? loc.weatherElement;
    if (!Array.isArray(weatherElements)) continue;

    // Dynamically locate "最低溫度" and "最高溫度" regardless of array position
    let minElem: RawCwaWeatherElement | undefined;
    let maxElem: RawCwaWeatherElement | undefined;

    for (const elem of weatherElements) {
      if (!elem || typeof elem !== "object") continue;
      const elemName = (elem.ElementName ?? elem.elementName)?.trim();
      if (elemName === "最低溫度") {
        minElem = elem;
      } else if (elemName === "最高溫度") {
        maxElem = elem;
      }
    }

    if (!minElem && !maxElem) continue;

    // Helper to extract temperature map keyed by "startTime__endTime"
    const extractTempMap = (
      element: RawCwaWeatherElement | undefined,
      preferredKey: "MinTemperature" | "MaxTemperature"
    ): Map<string, { startTime: string; endTime: string; temp: number | null }> => {
      const map = new Map<string, { startTime: string; endTime: string; temp: number | null }>();
      if (!element) return map;

      const timeList = element.Time ?? element.time;
      if (!Array.isArray(timeList)) return map;

      for (const tEntry of timeList) {
        if (!tEntry || typeof tEntry !== "object") continue;
        const start = (tEntry.StartTime ?? tEntry.startTime)?.trim();
        const end = (tEntry.EndTime ?? tEntry.endTime)?.trim();
        if (!start || !end) continue;

        const valList = tEntry.ElementValue ?? tEntry.elementValue;
        let rawVal: unknown = null;
        if (Array.isArray(valList) && valList.length > 0 && typeof valList[0] === "object") {
          const firstVal = valList[0] as Record<string, unknown>;
          rawVal = firstVal[preferredKey] ?? firstVal.value ?? firstVal.Value;
        }

        const temp = parseTemperature(rawVal);
        const key = `${start}__${end}`;
        map.set(key, { startTime: start, endTime: end, temp });
      }

      return map;
    };

    const minMap = extractTempMap(minElem, "MinTemperature");
    const maxMap = extractTempMap(maxElem, "MaxTemperature");

    // Union of all interval keys
    const allIntervalKeys = new Set([...minMap.keys(), ...maxMap.keys()]);
    if (allIntervalKeys.size === 0) continue;

    const intervals: ForecastInterval[] = [];

    for (const intervalKey of allIntervalKeys) {
      const minEntry = minMap.get(intervalKey);
      const maxEntry = maxMap.get(intervalKey);

      const startTime = minEntry?.startTime ?? maxEntry?.startTime;
      const endTime = minEntry?.endTime ?? maxEntry?.endTime;
      if (!startTime || !endTime) continue;

      intervals.push({
        startTime,
        endTime,
        minTemp: minEntry ? minEntry.temp : null,
        maxTemp: maxEntry ? maxEntry.temp : null,
      });
    }

    // Chronologically sort intervals by startTime, then endTime
    intervals.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));

    if (intervals.length > 0) {
      regions.push({
        region: regionName,
        intervals,
      });
    }
  }

  if (regions.length === 0) {
    throw new ParseError("Malformed CWA dataset structure: no valid forecast intervals could be extracted.");
  }

  // Deterministically sort regions by name
  regions.sort((a, b) => a.region.localeCompare(b.region, "zh-TW"));

  return {
    datasetId: CWA_FORECAST_DATASET_ID,
    fetchedAt: fetchedAt ?? new Date().toISOString(),
    regions,
  };
}

/**
 * Fetches and normalizes CWA 7-day county/city weather forecast.
 *
 * @param options Optional credentials, timeout, and fetch injection for testing
 */
export async function fetchCwaForecast(
  options: CwaFetchOptions = {}
): Promise<NormalizedForecastData> {
  const apiKey = options.apiKey ?? getCwaApiKey();

  const url = `${CWA_API_BASE_URL}/${CWA_FORECAST_DATASET_ID}`;
  const headers = {
    Authorization: apiKey,
    Accept: "application/json; charset=utf-8",
    "User-Agent": "AIOT-HW1-Weather-Dashboard-V2/1.0",
  };

  const rawData = await safeGetJson<unknown>(url, {
    headers,
    fetchFn: options.fetchFn,
    timeoutMs: options.timeoutMs,
  });

  return normalizeCwaForecast(rawData, options.fetchedAt);
}
