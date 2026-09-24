/**
 * Server-only CWA Observation API Client and Normalizer
 *
 * Dataset: O-A0003-001 (10-minute synoptic weather observations)
 * Upstream URL: https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001
 *
 * Security & Design Rules:
 * - Server-only execution check
 * - Authorization key ONLY placed in request header, NEVER in URL query
 * - Explicit UTF-8 fatal decoding enforced via safeGetJson
 * - Normalizes raw response to strictly typed NormalizedObservationData
 * - Domain-specific individual parsers for each weather element (NO blunt generic <= -90 filter)
 * - Daily precipitation preserves special semantics: 'T' (雨跡), -98 (連續6小時無降水), -99 (缺測), 'X' (故障)
 * - Wind direction preserves 990 (風向不定), 0-360° valid angles, and 0° (北)
 * - Valid 0 values (0.0 mm precipitation, 0.0 m/s wind speed, 0° direction, 0.0°C temp) preserved
 * - Deduplicates stations by stationId
 * - Stably sorted by county -> stationName -> stationId
 */

import { getCwaApiKey } from "./env";
import { safeGetJson } from "./http-client";
import { ParseError, UpstreamError } from "./errors";
import {
  NormalizedObservationData,
  NormalizedStationObservation,
  PrecipitationStatus,
} from "../contracts/observations";

if (typeof window !== "undefined") {
  throw new Error("Security Error: cwa-observation-client cannot be imported in client-side code.");
}

export const CWA_OBSERVATIONS_DATASET_ID = "O-A0003-001";
export const CWA_OBSERVATIONS_URL = `https://opendata.cwa.gov.tw/api/v1/rest/datastore/${CWA_OBSERVATIONS_DATASET_ID}`;

export interface CwaObservationFetchOptions {
  apiKey?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  fetchedAt?: string;
}

/**
 * Parses temperature (°C).
 * Special codes: -99, -99.0, X, N/A -> null.
 * Valid meteorological range: -50°C to 60°C.
 * Legitimate 0.0°C and negative sub-zero temperatures are preserved.
 */
export function parseTemperature(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim().toUpperCase();
  if (str === "" || str === "N/A" || str === "NAN" || str === "X" || str === "-99" || str === "-99.0" || str === "-990.0") {
    return null;
  }
  const num = Number(str);
  if (!Number.isFinite(num)) return null;
  if (num < -50 || num > 60) return null;
  return num;
}

/**
 * Parses relative humidity (%).
 * Special codes: -99, -99.0, X, N/A -> null.
 * Valid range: 0% to 100%. Legitimate 0% is preserved.
 */
export function parseRelativeHumidity(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim().toUpperCase();
  if (str === "" || str === "N/A" || str === "NAN" || str === "X" || str === "-99" || str === "-99.0" || str === "-990.0") {
    return null;
  }
  const num = Number(str);
  if (!Number.isFinite(num)) return null;
  if (num < 0 || num > 100) return null;
  return Math.round(num);
}

/**
 * Parses wind speed (m/s).
 * Special codes: -99, -99.0, X, N/A -> null.
 * Valid range: 0 to 150 m/s. Legitimate 0.0 m/s (calm) is preserved.
 */
export function parseWindSpeed(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim().toUpperCase();
  if (str === "" || str === "N/A" || str === "NAN" || str === "X" || str === "-99" || str === "-99.0" || str === "-990.0") {
    return null;
  }
  const num = Number(str);
  if (!Number.isFinite(num)) return null;
  if (num < 0 || num > 150) return null;
  return num;
}

/**
 * Parses wind direction (degrees).
 * Special codes:
 * - 990: Variable wind direction (風向不定)
 * - 0 to 360: Valid compass degrees (0° and 360° are North)
 * - -99, -99.0, -990.0, X, N/A -> null
 */
export function parseWindDirection(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim().toUpperCase();
  if (str === "" || str === "N/A" || str === "NAN" || str === "X" || str === "-99" || str === "-99.0" || str === "-990.0") {
    return null;
  }
  const num = Number(str);
  if (!Number.isFinite(num)) return null;
  if (num === 990) {
    return 990;
  }
  if (num >= 0 && num <= 360) {
    return num;
  }
  return null;
}

/**
 * Parses station elevation (meters).
 * Special codes: -99, -99.0, X, N/A -> null.
 * Valid range: -50m to 4500m (Taiwan's Yushan is 3952m).
 */
export function parseElevation(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim().toUpperCase();
  if (str === "" || str === "N/A" || str === "NAN" || str === "X" || str === "-99" || str === "-99.0" || str === "-990.0") {
    return null;
  }
  const num = Number(str);
  if (!Number.isFinite(num)) return null;
  if (num < -50 || num > 4500) return null;
  return num;
}

export interface ParsedPrecipitationResult {
  value: number | null;
  status: PrecipitationStatus;
}

/**
 * Parses daily precipitation (WeatherElement.Now.Precipitation).
 * Official CWA O-A0003-001 semantics:
 * - Normal number (>= 0): Actual cumulative precipitation in mm (including legitimate 0.0)
 * - 'T': Trace of rain (雨跡, < 0.1 mm) -> { value: null, status: "trace" }
 * - '-98' / -98: Continuous 6 hours without precipitation -> { value: null, status: "none_6hr" }
 * - '-99' / -99 / '-990.0' / N/A: Missing / abnormal -> { value: null, status: "missing" }
 * - 'X': Sensor fault -> { value: null, status: "fault" }
 */
export function parsePrecipitation(val: unknown): ParsedPrecipitationResult {
  if (val === null || val === undefined) {
    return { value: null, status: "missing" };
  }
  const str = String(val).trim().toUpperCase();
  if (str === "" || str === "N/A" || str === "NAN" || str === "-99" || str === "-99.0" || str === "-990" || str === "-990.0" || str === "-999") {
    return { value: null, status: "missing" };
  }
  if (str === "T") {
    return { value: null, status: "trace" };
  }
  if (str === "-98" || str === "-98.0") {
    return { value: null, status: "none_6hr" };
  }
  if (str === "X") {
    return { value: null, status: "fault" };
  }

  const num = Number(str);
  if (!Number.isFinite(num)) {
    return { value: null, status: "missing" };
  }
  if (num < 0 || num > 2500) {
    return { value: null, status: "missing" };
  }
  return { value: num, status: "normal" };
}

interface RawCoordinate {
  CoordinateName?: string;
  StationLatitude?: string | number;
  StationLongitude?: string | number;
}

interface RawStation {
  StationId?: string;
  StationName?: string;
  ObsTime?: {
    DateTime?: string;
  };
  GeoInfo?: {
    CountyName?: string;
    TownName?: string;
    StationAltitude?: string | number;
    Coordinates?: RawCoordinate[];
  };
  WeatherElement?: {
    AirTemperature?: string | number;
    RelativeHumidity?: string | number;
    WindSpeed?: string | number;
    WindDirection?: string | number;
    Now?: {
      Precipitation?: string | number;
    };
  };
}

interface RawCwaObservationResponse {
  success?: string | boolean;
  records?: {
    Station?: RawStation[];
  };
}

/**
 * Normalizes raw CWA O-A0003-001 payload into clean, deduplicated NormalizedObservationData.
 */
export function normalizeCwaObservations(
  raw: unknown,
  fetchedAt?: string
): NormalizedObservationData {
  if (!raw || typeof raw !== "object") {
    throw new ParseError("CWA observations response is not a valid JSON object.");
  }

  const payload = raw as RawCwaObservationResponse;

  if (payload.success === false || payload.success === "false") {
    throw new UpstreamError(400);
  }

  const rawStations = payload.records?.Station;
  if (!Array.isArray(rawStations)) {
    throw new ParseError("CWA observations missing 'records.Station' array.");
  }

  const seenIds = new Set<string>();
  const stations: NormalizedStationObservation[] = [];

  for (const rawStation of rawStations) {
    const stationId = String(rawStation.StationId || "").trim();
    if (!stationId) continue;

    // Deduplicate stations by stationId
    if (seenIds.has(stationId)) continue;
    seenIds.add(stationId);

    const stationName = String(rawStation.StationName || "").trim();
    const county = String(rawStation.GeoInfo?.CountyName || "").trim();

    // Must have station name and county
    if (!stationName || !county) continue;

    const townRaw = rawStation.GeoInfo?.TownName;
    const town = townRaw && typeof townRaw === "string" && townRaw.trim() !== "" && townRaw.trim() !== "-"
      ? townRaw.trim()
      : null;

    // Extract WGS84 coordinates
    const coordsList = rawStation.GeoInfo?.Coordinates;
    let lat: number | null = null;
    let lon: number | null = null;

    if (Array.isArray(coordsList)) {
      const wgs84 = coordsList.find(
        (c) => String(c.CoordinateName || "").toUpperCase() === "WGS84"
      ) || coordsList[0];

      if (wgs84) {
        const parsedLat = Number(wgs84.StationLatitude);
        const parsedLon = Number(wgs84.StationLongitude);
        if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon)) {
          // Broad Taiwan coordinates check (lat 18-28, lon 115-126)
          if (parsedLat >= 18 && parsedLat <= 28 && parsedLon >= 115 && parsedLon <= 126) {
            lat = parsedLat;
            lon = parsedLon;
          }
        }
      }
    }

    // Require valid coordinates
    if (lat === null || lon === null) continue;

    // Altitude
    const elevation = parseElevation(rawStation.GeoInfo?.StationAltitude);

    // ObservedAt time
    const observedAt = String(rawStation.ObsTime?.DateTime || "").trim();
    if (!observedAt) continue;

    // Weather elements using individual domain-specific parsers
    const we = rawStation.WeatherElement || {};
    const temperature = parseTemperature(we.AirTemperature);
    const relativeHumidity = parseRelativeHumidity(we.RelativeHumidity);
    const windSpeed = parseWindSpeed(we.WindSpeed);
    const windDirection = parseWindDirection(we.WindDirection);

    // Precipitation (Now.Precipitation - 當日降水量)
    const precipResult = parsePrecipitation(we.Now?.Precipitation);

    stations.push({
      stationId,
      stationName,
      county,
      town,
      latitude: lat,
      longitude: lon,
      elevation,
      observedAt,
      temperature,
      relativeHumidity,
      windSpeed,
      windDirection,
      dailyPrecipitation: precipResult.value,
      precipitationStatus: precipResult.status,
    });
  }

  // Stable deterministic sorting: county -> stationName -> stationId
  stations.sort((a, b) => {
    const countyCmp = a.county.localeCompare(b.county, "zh-Hant");
    if (countyCmp !== 0) return countyCmp;
    const nameCmp = a.stationName.localeCompare(b.stationName, "zh-Hant");
    if (nameCmp !== 0) return nameCmp;
    return a.stationId.localeCompare(b.stationId);
  });

  return {
    datasetId: "O-A0003-001",
    fetchedAt: fetchedAt || new Date().toISOString(),
    stations,
  };
}

/**
 * Fetches and normalizes CWA O-A0003-001 weather station observations.
 */
export async function fetchCwaObservations(
  options: CwaObservationFetchOptions = {}
): Promise<NormalizedObservationData> {
  const apiKey = options.apiKey || getCwaApiKey();

  const rawJson = await safeGetJson<unknown>(CWA_OBSERVATIONS_URL, {
    headers: {
      Authorization: apiKey,
    },
    fetchFn: options.fetchFn,
    timeoutMs: options.timeoutMs ?? 10000,
  });

  return normalizeCwaObservations(rawJson, options.fetchedAt);
}
