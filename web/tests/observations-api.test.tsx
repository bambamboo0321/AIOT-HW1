import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GET,
  OBSERVATIONS_CACHE_CONTROL,
  ERROR_CACHE_CONTROL,
} from "@/app/api/weather/observations/route";
import * as obsClientModule from "@/lib/server/cwa-observation-client";
import { ConfigError, UpstreamError } from "@/lib/server/errors";
import { ForecastDashboard } from "@/components/weather/ForecastDashboard";
import { CurrentWeatherCard } from "@/components/weather/CurrentWeatherCard";
import { NormalizedForecastData } from "@/lib/contracts/weather";
import { NormalizedObservationData } from "@/lib/contracts/observations";
import { EXPECTED_TAIWAN_REGIONS } from "@/lib/data/county-coordinates";

describe("Milestone M10: GET /api/weather/observations Route, UI Labels & Resilience", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.CWA_API_KEY = "test-cwa-key-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns HTTP 200 with standard success envelope and Cache-Control header", async () => {
    const mockObsData: NormalizedObservationData = {
      datasetId: "O-A0003-001",
      fetchedAt: "2026-09-23T14:30:00.000Z",
      stations: [
        {
          stationId: "466940",
          stationName: "基隆",
          county: "基隆市",
          town: "仁愛區",
          latitude: 25.133,
          longitude: 121.74,
          elevation: 26.7,
          observedAt: "2026-09-23T22:30:00+08:00",
          temperature: 25.8,
          relativeHumidity: 78,
          windSpeed: 1.2,
          windDirection: 135,
          dailyPrecipitation: 0,
          precipitationStatus: "normal",
        },
      ],
    };

    vi.spyOn(obsClientModule, "fetchCwaObservations").mockResolvedValue(mockObsData);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(OBSERVATIONS_CACHE_CONTROL);

    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      data: mockObsData,
      error: null,
    });
  });

  // Test 8: Missing CWA_API_KEY returns CONFIG_ERROR safely
  it("returns HTTP 500 with CONFIG_ERROR and no-store when CWA_API_KEY is missing", async () => {
    vi.spyOn(obsClientModule, "fetchCwaObservations").mockRejectedValue(
      new ConfigError("CWA_API_KEY")
    );

    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe(ERROR_CACHE_CONTROL);

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("CONFIG_ERROR");
    expect(body.error.message).toContain("CWA_API_KEY");
  });

  // Test 9: Upstream error does not leak Key or raw body
  it("returns HTTP 502 with UPSTREAM_ERROR without leaking raw secrets or body", async () => {
    vi.spyOn(obsClientModule, "fetchCwaObservations").mockRejectedValue(
      new UpstreamError(503)
    );

    const response = await GET();
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe(ERROR_CACHE_CONTROL);

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UPSTREAM_ERROR");
    expect(body.error.message).not.toContain("test-cwa-key-secret");
    expect(body.error.message).not.toContain("raw body");
  });

  // Test 10: UI labels test: confirms 「當日降水量」 label and special status display
  it("renders CurrentWeatherCard with 「當日降水量」 label and handles special status (風向不定, 雨跡, 連續6小時無降水)", () => {
    const mockObsData: NormalizedObservationData = {
      datasetId: "O-A0003-001",
      fetchedAt: "2026-09-23T14:30:00.000Z",
      stations: [
        {
          stationId: "466920",
          stationName: "臺北",
          county: "臺北市",
          town: "中正區",
          latitude: 25.037,
          longitude: 121.514,
          elevation: 5.3,
          observedAt: "2026-09-23T22:30:00+08:00",
          temperature: 28.5,
          relativeHumidity: 75,
          windSpeed: 0.8,
          windDirection: 990, // Variable wind direction
          dailyPrecipitation: null,
          precipitationStatus: "none_6hr", // -98
        },
      ],
    };

    const cardHtml = renderToStaticMarkup(
      <CurrentWeatherCard
        region="臺北市"
        observationData={mockObsData}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />
    );

    // Verify UI label is exactly 「當日降水量」
    expect(cardHtml).toContain("當日降水量");
    expect(cardHtml).not.toContain("現在雨量 (10分鐘累積)");

    // Verify wind direction displays 「風向不定」
    expect(cardHtml).toContain("風向不定");

    // Verify precipitation displays 「連續6小時無降水」
    expect(cardHtml).toContain("連續6小時無降水");
  });

  // Test 11: Observation API failure does not crash or break forecast Dashboard
  it("preserves forecast dashboard when observation loading fails", () => {
    const mockForecastData: NormalizedForecastData = {
      datasetId: "F-D0047-091",
      fetchedAt: "2026-09-23T12:00:00.000Z",
      regions: EXPECTED_TAIWAN_REGIONS.map((regionName) => ({
        region: regionName,
        intervals: [
          {
            startTime: "2026-09-23T06:00:00+08:00",
            endTime: "2026-09-23T18:00:00+08:00",
            minTemp: 22,
            maxTemp: 28,
          },
        ],
      })),
    };

    // Render CurrentWeatherCard with error state
    const cardHtml = renderToStaticMarkup(
      <CurrentWeatherCard
        region="臺北市"
        observationData={null}
        isLoading={false}
        error="無法連線至中央氣象署觀測服務。"
        onRetry={() => {}}
      />
    );

    expect(cardHtml).toContain("無法連線至中央氣象署觀測服務。");
    expect(cardHtml).toContain("七天預報功能不受影響");
    expect(cardHtml).toContain("重新載入觀測");

    // Render full ForecastDashboard with initialData
    const dashboardHtml = renderToStaticMarkup(
      <ForecastDashboard initialData={mockForecastData} initialObservations={null} />
    );

    // Seven-day forecast, KPI cards, and trend chart remain completely intact
    expect(dashboardHtml).toContain("Taiwan Weather Dashboard");
    expect(dashboardHtml).toContain("臺北市");
    expect(dashboardHtml).toContain("氣溫趨勢變化");
    expect(dashboardHtml).toContain("F-D0047-091");
  });
});
