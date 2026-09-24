/**
 * Weather Forecast Contracts for Taiwan Weather Dashboard V2
 *
 * Defines the normalized data schema for CWA 7-day county/city weather forecasts (F-D0047-091).
 */

export type UVExposureLevel =
  | "低量級"
  | "中量級"
  | "高量級"
  | "過量級"
  | "危險級"
  | "無資料";

export interface UVForecastItem {
  datasetId: string; // e.g. "F-D0047-091"
  fetchedAt: string; // ISO-8601 UTC timestamp
  county: string;    // e.g. "臺北市"
  forecastDate: string; // YYYY-MM-DD in Asia/Taipei
  startTime?: string;   // ISO-8601 string, e.g. "2026-09-24T06:00:00+08:00"
  endTime?: string;     // ISO-8601 string, e.g. "2026-09-24T18:00:00+08:00"
  uvIndex: number | null;
  level: UVExposureLevel;
  displayValue: string; // e.g. "7", "11+", "N/A"
  protectionAdvice: string;
  dataMeaning: "forecast_daytime";
}

export interface ForecastInterval {
  startTime: string; // ISO-8601 string
  endTime: string;   // ISO-8601 string
  minTemp: number | null;
  maxTemp: number | null;
}

export interface RegionForecast {
  region: string;
  intervals: ForecastInterval[];
  uvForecasts?: UVForecastItem[];
}

export interface NormalizedForecastData {
  datasetId: string; // e.g. "F-D0047-091"
  fetchedAt: string; // ISO-8601 UTC timestamp
  regions: RegionForecast[];
}
