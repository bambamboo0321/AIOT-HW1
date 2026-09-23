/**
 * Weather Forecast Contracts for Taiwan Weather Dashboard V2
 *
 * Defines the normalized data schema for CWA 7-day county/city weather forecasts (F-D0047-091).
 */

export interface ForecastInterval {
  startTime: string; // ISO-8601 string
  endTime: string;   // ISO-8601 string
  minTemp: number | null;
  maxTemp: number | null;
}

export interface RegionForecast {
  region: string;
  intervals: ForecastInterval[];
}

export interface NormalizedForecastData {
  datasetId: string; // e.g. "F-D0047-091"
  fetchedAt: string; // ISO-8601 UTC timestamp
  regions: RegionForecast[];
}
