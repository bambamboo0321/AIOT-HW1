/**
 * Runtime Boundary Validator for Weather API Responses
 *
 * Validates untrusted JSON responses received by client code from /api/weather/forecast.
 * Enforces strict typing, rejects malformed envelopes, unparseable timestamps,
 * invalid temperature types, and detects UTF-8 corruption characters (\uFFFD).
 */

import { NormalizedForecastData, ForecastInterval, RegionForecast } from "../contracts/weather";
import { ApiSuccess } from "../contracts/api";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Validates a single forecast interval.
 */
export function isValidForecastInterval(val: unknown): val is ForecastInterval {
  if (!val || typeof val !== "object") return false;
  const item = val as Record<string, unknown>;

  if (typeof item.startTime !== "string" || isNaN(Date.parse(item.startTime))) {
    return false;
  }
  if (typeof item.endTime !== "string" || isNaN(Date.parse(item.endTime))) {
    return false;
  }

  const isValidTemp = (t: unknown) => t === null || (typeof t === "number" && Number.isFinite(t));
  if (!isValidTemp(item.minTemp) || !isValidTemp(item.maxTemp)) {
    return false;
  }

  return true;
}

/**
 * Validates a single region forecast structure.
 */
export function isValidRegionForecast(val: unknown): val is RegionForecast {
  if (!val || typeof val !== "object") return false;
  const item = val as Record<string, unknown>;

  if (typeof item.region !== "string" || !item.region.trim()) {
    return false;
  }

  // Reject characters that indicate decoding corruption
  if (item.region.includes("\uFFFD")) {
    return false;
  }

  if (!Array.isArray(item.intervals)) {
    return false;
  }

  return item.intervals.every(isValidForecastInterval);
}

/**
 * Validates that an object conforms to the NormalizedForecastData contract.
 */
export function isValidNormalizedForecastData(val: unknown): val is NormalizedForecastData {
  if (!val || typeof val !== "object") return false;
  const item = val as Record<string, unknown>;

  if (typeof item.datasetId !== "string" || !item.datasetId.trim()) {
    return false;
  }
  if (typeof item.fetchedAt !== "string" || isNaN(Date.parse(item.fetchedAt))) {
    return false;
  }
  if (!Array.isArray(item.regions) || item.regions.length === 0) {
    return false;
  }

  return item.regions.every(isValidRegionForecast);
}

/**
 * Asserts and extracts NormalizedForecastData from a raw API response.
 *
 * @throws ValidationError with safe, diagnostic message if validation fails.
 */
export function validateWeatherApiResponse(rawJson: unknown): NormalizedForecastData {
  if (!rawJson || typeof rawJson !== "object") {
    throw new ValidationError("API response is empty or not a valid JSON object.");
  }

  const envelope = rawJson as Partial<ApiSuccess<unknown>>;

  if (envelope.ok !== true) {
    throw new ValidationError("API response indicated failure (ok !== true).");
  }

  if (!envelope.data) {
    throw new ValidationError("API response missing data payload.");
  }

  const data = envelope.data as Partial<NormalizedForecastData>;

  if (typeof data.datasetId !== "string" || !data.datasetId.trim()) {
    throw new ValidationError("Invalid datasetId: expected non-empty string.");
  }

  if (typeof data.fetchedAt !== "string" || isNaN(Date.parse(data.fetchedAt))) {
    throw new ValidationError("Invalid fetchedAt: expected valid ISO-8601 timestamp string.");
  }

  if (!Array.isArray(data.regions) || data.regions.length === 0) {
    throw new ValidationError("Invalid regions: expected non-empty array of regions.");
  }

  for (let i = 0; i < data.regions.length; i++) {
    const reg = data.regions[i];
    if (!reg || typeof reg !== "object") {
      throw new ValidationError(`Region at index ${i} is not an object.`);
    }

    if (typeof reg.region !== "string" || !reg.region.trim()) {
      throw new ValidationError(`Region name at index ${i} is missing or empty.`);
    }

    if (reg.region.includes("\uFFFD")) {
      throw new ValidationError(`Region name at index ${i} contains corrupt unicode character U+FFFD.`);
    }

    if (!Array.isArray(reg.intervals)) {
      throw new ValidationError(`Region '${reg.region}' intervals is not an array.`);
    }

    for (let j = 0; j < reg.intervals.length; j++) {
      const interval = reg.intervals[j];
      if (!isValidForecastInterval(interval)) {
        throw new ValidationError(
          `Region '${reg.region}' interval at index ${j} has invalid time or temperature values.`
        );
      }
    }
  }

  return envelope.data as NormalizedForecastData;
}
