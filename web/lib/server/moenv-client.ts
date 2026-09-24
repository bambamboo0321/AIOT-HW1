/**
 * Server-only MOENV Air Quality API Client and Normalizer
 *
 * Dataset: AQX_P_432 (即時空氣品質指標 AQI)
 * Upstream URL: https://data.moenv.gov.tw/api/v2/aqx_p_432
 *
 * Security & Design Rules:
 * - Server-only execution check
 * - MOENV_API_KEY retrieved via server environment (never exposed in client bundle)
 * - Header authentication used (`api_key: <key>`), avoiding exposing keys in URL queries
 * - Full URL and secret keys are redacted in all logs and error objects
 * - Strict domain-specific parsing: empty string, '-', 'ND', '-99' convert to null; legitimate 0 preserved
 * - Normalizes "台" to "臺" for county names
 * - Computes county-level summary with maximum AQI (representing worst air quality)
 */

import { getMoenvApiKey } from "./env";
import { safeGetJson } from "./http-client";
import { ParseError, UpstreamError } from "./errors";
import {
  NormalizedAirQualityData,
  NormalizedStationAirQuality,
} from "../contracts/air-quality";
import {
  normalizeCountyName,
  computeAllCountySummaries,
} from "../transformations/air-quality";
import { EXPECTED_TAIWAN_REGIONS } from "../data/county-coordinates";

if (typeof window !== "undefined") {
  throw new Error("Security Error: moenv-client cannot be imported in client-side code.");
}

export const MOENV_AQI_DATASET_ID = "AQX_P_432";
export const MOENV_AQI_BASE_URL = "https://data.moenv.gov.tw/api/v2/aqx_p_432";

/**
 * Builds the official MOENV upstream request URL containing the required api_key query parameter.
 * Strictly used within server-to-server HTTP calls; never exposed to clients or in logs.
 */
export function buildMoenvUpstreamUrl(apiKey: string): string {
  const url = new URL(MOENV_AQI_BASE_URL);
  url.searchParams.set("api_key", apiKey.trim());
  url.searchParams.set("limit", "1000");
  url.searchParams.set("format", "json");
  return url.toString();
}

export interface MoenvFetchOptions {
  apiKey?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  fetchedAt?: string;
}

/**
 * Parses numeric pollutant and air quality values safely.
 * Missing / invalid indicators ('', '-', 'ND', 'N/A', '-99', 'X') become null.
 * Legitimate 0 and valid positive numbers are preserved.
 */
export function parseAirQualityNumber(
  val: unknown,
  min: number = 0,
  max?: number
): number | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim().toUpperCase();
  if (
    str === "" ||
    str === "-" ||
    str === "ND" ||
    str === "N/A" ||
    str === "NAN" ||
    str === "-99" ||
    str === "-99.0" ||
    str === "X"
  ) {
    return null;
  }
  const num = Number(str);
  if (!Number.isFinite(num)) return null;
  if (num < min) return null;
  if (max !== undefined && num > max) return null;
  return num;
}

/**
 * Normalizes publish time into ISO-8601 with timezone offset (+08:00).
 * e.g. "2026/09/24 09:00:00" -> "2026-09-24T09:00:00+08:00"
 */
export function normalizePublishTime(publishtimeRaw: unknown): string {
  if (!publishtimeRaw) return "";
  const str = String(publishtimeRaw).trim();
  const match = str.match(/^(\d{4})[/-](\d{2})[/-](\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    const [, y, m, d, hh, mm, ss] = match;
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}+08:00`;
  }
  return str;
}

interface RawMoenvStationRecord {
  siteid?: string | number;
  sitename?: string;
  county?: string;
  aqi?: string | number;
  status?: string;
  pollutant?: string;
  "pm2.5"?: string | number;
  pm10?: string | number;
  o3?: string | number;
  co?: string | number;
  so2?: string | number;
  no2?: string | number;
  publishtime?: string;
  longitude?: string | number;
  latitude?: string | number;
}

interface RawMoenvResponseObject {
  records?: RawMoenvStationRecord[];
  success?: boolean | string;
}

/**
 * Normalizes raw MOENV API response into clean, deduplicated NormalizedAirQualityData.
 */
export function normalizeMoenvAirQuality(
  raw: unknown,
  fetchedAt?: string
): NormalizedAirQualityData {
  if (!raw || (typeof raw !== "object" && !Array.isArray(raw))) {
    throw new ParseError("MOENV response is not a valid JSON array or object.");
  }

  let rawRecords: RawMoenvStationRecord[] | undefined;

  if (Array.isArray(raw)) {
    rawRecords = raw as RawMoenvStationRecord[];
  } else {
    const obj = raw as RawMoenvResponseObject;
    if (obj.success === false || obj.success === "false") {
      throw new UpstreamError(400);
    }
    rawRecords = obj.records;
  }

  if (!Array.isArray(rawRecords)) {
    throw new ParseError("MOENV response missing records array.");
  }

  const seenIds = new Set<string>();
  const stations: NormalizedStationAirQuality[] = [];

  for (const r of rawRecords) {
    const stationId = String(r.siteid ?? "").trim();
    if (!stationId) continue;

    // Deduplicate by stationId
    if (seenIds.has(stationId)) continue;
    seenIds.add(stationId);

    const stationName = String(r.sitename ?? "").trim();
    const rawCounty = String(r.county ?? "").trim();
    if (!stationName || !rawCounty) continue;

    // Normalize county name to "臺"
    const county = normalizeCountyName(rawCounty);

    // Coordinates
    const parsedLat = Number(r.latitude);
    const parsedLon = Number(r.longitude);
    let lat: number | null = null;
    let lon: number | null = null;
    if (
      Number.isFinite(parsedLat) &&
      Number.isFinite(parsedLon) &&
      parsedLat >= 18 &&
      parsedLat <= 28 &&
      parsedLon >= 115 &&
      parsedLon <= 126
    ) {
      lat = parsedLat;
      lon = parsedLon;
    }

    const publishedAt = normalizePublishTime(r.publishtime);

    // Weather / Pollutant elements
    const rawAqi = parseAirQualityNumber(r.aqi, 0, 500);
    const aqi = rawAqi !== null ? Math.round(rawAqi) : null;

    const rawStatus = r.status ? String(r.status).trim() : null;
    const status = rawStatus && rawStatus !== "" && rawStatus !== "-" ? rawStatus : null;

    const rawPollutant = r.pollutant ? String(r.pollutant).trim() : null;
    const primaryPollutant =
      rawPollutant && rawPollutant !== "" && rawPollutant !== "-" ? rawPollutant : null;

    const pm25 = parseAirQualityNumber(r["pm2.5"], 0, 1000);
    const pm10 = parseAirQualityNumber(r.pm10, 0, 1000);
    const ozone = parseAirQualityNumber(r.o3, 0, 1000);
    const carbonMonoxide = parseAirQualityNumber(r.co, 0, 100);
    const sulfurDioxide = parseAirQualityNumber(r.so2, 0, 1000);
    const nitrogenDioxide = parseAirQualityNumber(r.no2, 0, 1000);

    stations.push({
      stationId,
      stationName,
      county,
      latitude: lat,
      longitude: lon,
      publishedAt,
      aqi,
      status,
      primaryPollutant,
      pm25,
      pm10,
      ozone,
      carbonMonoxide,
      sulfurDioxide,
      nitrogenDioxide,
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

  // Precompute county summaries for all 22 standard Taiwan regions
  const countySummaries = computeAllCountySummaries(
    stations,
    EXPECTED_TAIWAN_REGIONS as string[]
  );

  return {
    datasetId: "AQX_P_432",
    fetchedAt: fetchedAt || new Date().toISOString(),
    stations,
    countySummaries,
  };
}

/**
 * Fetches and normalizes MOENV AQX_P_432 real-time air quality data.
 */
export async function fetchMoenvAirQuality(
  options: MoenvFetchOptions = {}
): Promise<NormalizedAirQualityData> {
  const apiKey = options.apiKey || getMoenvApiKey();
  const upstreamUrl = buildMoenvUpstreamUrl(apiKey);

  const rawJson = await safeGetJson<unknown>(upstreamUrl, {
    fetchFn: options.fetchFn,
    timeoutMs: options.timeoutMs ?? 10000,
  });

  return normalizeMoenvAirQuality(rawJson, options.fetchedAt);
}
