import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GET,
  AIR_QUALITY_CACHE_CONTROL,
  ERROR_CACHE_CONTROL,
} from "@/app/api/air-quality/route";
import * as moenvClientModule from "@/lib/server/moenv-client";
import { ConfigError, UpstreamError, TimeoutError, ParseError } from "@/lib/server/errors";
import { ForecastDashboard } from "@/components/weather/ForecastDashboard";
import { AirQualityCard } from "@/components/weather/AirQualityCard";
import { NormalizedForecastData } from "@/lib/contracts/weather";
import { NormalizedObservationData } from "@/lib/contracts/observations";
import { NormalizedAirQualityData } from "@/lib/contracts/air-quality";
import { EXPECTED_TAIWAN_REGIONS } from "@/lib/data/county-coordinates";

describe("Milestone M11: GET /api/air-quality Route, UI Labels & Resilience", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.MOENV_API_KEY = "test-moenv-key-secret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns HTTP 200 with standard success envelope and Cache-Control header", async () => {
    const mockAqData: NormalizedAirQualityData = {
      datasetId: "AQX_P_432",
      fetchedAt: "2026-09-24T01:00:00.000Z",
      stations: [
        {
          stationId: "2",
          stationName: "汐止",
          county: "新北市",
          latitude: 25.066,
          longitude: 121.64,
          publishedAt: "2026-09-24T09:00:00+08:00",
          aqi: 48,
          status: "良好",
          primaryPollutant: null,
          pm25: 11,
          pm10: 18,
          ozone: 30,
          carbonMonoxide: 0.15,
          sulfurDioxide: 0.7,
          nitrogenDioxide: 7,
        },
      ],
      countySummaries: {
        新北市: {
          county: "新北市",
          maxAqi: 48,
          status: "良好",
          primaryPollutant: null,
          sourceStationId: "2",
          sourceStationName: "汐止",
          sourceStationCounty: "新北市",
          pm25: 11,
          pm10: 18,
          publishedAt: "2026-09-24T09:00:00+08:00",
        },
      },
    };

    vi.spyOn(moenvClientModule, "fetchMoenvAirQuality").mockResolvedValue(mockAqData);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(AIR_QUALITY_CACHE_CONTROL);

    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      data: mockAqData,
      error: null,
    });
  });

  // Test 10: Missing MOENV_API_KEY returns CONFIG_ERROR safely
  it("returns HTTP 500 with CONFIG_ERROR and no-store when MOENV_API_KEY is missing", async () => {
    vi.spyOn(moenvClientModule, "fetchMoenvAirQuality").mockRejectedValue(
      new ConfigError("MOENV_API_KEY")
    );

    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe(ERROR_CACHE_CONTROL);

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("CONFIG_ERROR");
    expect(body.error.message).toContain("MOENV_API_KEY");
  });

  // Test 11: Upstream errors (401, 403, 429, 500, timeout, parse) handled safely
  it("returns appropriate HTTP status and classified error without leaking secrets or raw body", async () => {
    // Upstream 403 maps safely to 502 Bad Gateway
    vi.spyOn(moenvClientModule, "fetchMoenvAirQuality").mockRejectedValue(
      new UpstreamError(403)
    );
    let response = await GET();
    expect(response.status).toBe(502);
    let body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UPSTREAM_ERROR");
    expect(body.error.message).not.toContain("test-moenv-key-secret");

    // Timeout
    vi.spyOn(moenvClientModule, "fetchMoenvAirQuality").mockRejectedValue(
      new TimeoutError()
    );
    response = await GET();
    expect(response.status).toBe(504);
    body = await response.json();
    expect(body.error.code).toBe("TIMEOUT_ERROR");

    // Parse Error
    vi.spyOn(moenvClientModule, "fetchMoenvAirQuality").mockRejectedValue(
      new ParseError("Invalid JSON")
    );
    response = await GET();
    expect(response.status).toBe(502);
    body = await response.json();
    expect(body.error.code).toBe("PARSE_ERROR");
  });

  // Test 12: UI Label test: confirms 「縣市 AQI 採區內最高值」 is displayed
  it("renders AirQualityCard with prominent 「縣市 AQI 採區內最高值」 label and county summary details", () => {
    const mockAqData: NormalizedAirQualityData = {
      datasetId: "AQX_P_432",
      fetchedAt: "2026-09-24T01:00:00.000Z",
      stations: [
        {
          stationId: "11",
          stationName: "中山",
          county: "臺北市",
          latitude: 25.06,
          longitude: 121.52,
          publishedAt: "2026-09-24T09:00:00+08:00",
          aqi: 35,
          status: "良好",
          primaryPollutant: null,
          pm25: 8,
          pm10: 15,
          ozone: 28,
          carbonMonoxide: 0.1,
          sulfurDioxide: 0.5,
          nitrogenDioxide: 6,
        },
        {
          stationId: "12",
          stationName: "萬華",
          county: "臺北市",
          latitude: 25.03,
          longitude: 121.5,
          publishedAt: "2026-09-24T09:00:00+08:00",
          aqi: 58, // Higher AQI
          status: "普通",
          primaryPollutant: "細懸浮微粒",
          pm25: 18,
          pm10: 30,
          ozone: 22,
          carbonMonoxide: 0.2,
          sulfurDioxide: 0.8,
          nitrogenDioxide: 10,
        },
      ],
      countySummaries: {
        臺北市: {
          county: "臺北市",
          maxAqi: 58,
          status: "普通",
          primaryPollutant: "細懸浮微粒",
          sourceStationId: "12",
          sourceStationName: "萬華",
          sourceStationCounty: "臺北市",
          pm25: 18,
          pm10: 30,
          publishedAt: "2026-09-24T09:00:00+08:00",
        },
      },
    };

    const cardHtml = renderToStaticMarkup(
      <AirQualityCard
        region="臺北市"
        airQualityData={mockAqData}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />
    );

    // Verify prominent rule label
    expect(cardHtml).toContain("縣市 AQI 採區內最高值");
    expect(cardHtml).toContain("最差空氣品質測站代表");
    expect(cardHtml).toContain("非全縣市平均");

    // Verify county summary details
    expect(cardHtml).toContain("58");
    expect(cardHtml).toContain("普通");
    expect(cardHtml).toContain("萬華");

    // Verify pollutants
    expect(cardHtml).toContain("細懸浮微粒 (PM2.5)");
    expect(cardHtml).toContain("懸浮微粒 (PM10)");
    expect(cardHtml).toContain("臭氧 (O₃)");
  });

  // Test 13: AQI failure does not crash or break ForecastDashboard or CurrentWeatherCard
  it("preserves forecast dashboard and observation card when air quality loading fails", () => {
    const mockForecastData: NormalizedForecastData = {
      datasetId: "F-D0047-091",
      fetchedAt: "2026-09-24T00:00:00.000Z",
      regions: EXPECTED_TAIWAN_REGIONS.map((regionName) => ({
        region: regionName,
        intervals: [
          {
            startTime: "2026-09-24T06:00:00+08:00",
            endTime: "2026-09-24T18:00:00+08:00",
            minTemp: 24,
            maxTemp: 30,
          },
        ],
      })),
    };

    const mockObsData: NormalizedObservationData = {
      datasetId: "O-A0003-001",
      fetchedAt: "2026-09-24T01:00:00.000Z",
      stations: [
        {
          stationId: "466920",
          stationName: "臺北",
          county: "臺北市",
          town: "中正區",
          latitude: 25.037,
          longitude: 121.514,
          elevation: 5.3,
          observedAt: "2026-09-24T09:00:00+08:00",
          temperature: 28.0,
          relativeHumidity: 70,
          windSpeed: 1.5,
          windDirection: 90,
          dailyPrecipitation: 0,
          precipitationStatus: "normal",
        },
      ],
    };

    // Render AirQualityCard in error state
    const cardHtml = renderToStaticMarkup(
      <AirQualityCard
        region="臺北市"
        airQualityData={null}
        isLoading={false}
        error="無法連線至環境部空氣品質服務。"
        onRetry={() => {}}
      />
    );

    expect(cardHtml).toContain("無法連線至環境部空氣品質服務。");
    expect(cardHtml).toContain("預報與即時天氣功能不受影響");
    expect(cardHtml).toContain("重新載入空氣品質");

    // Render full ForecastDashboard with initialData & initialObservations but airQuality failed
    const dashboardHtml = renderToStaticMarkup(
      <ForecastDashboard
        initialData={mockForecastData}
        initialObservations={mockObsData}
        initialAirQuality={null}
      />
    );

    // Seven-day forecast, KPI cards, trend chart, and current weather card remain intact
    expect(dashboardHtml).toContain("Taiwan Weather Dashboard");
    expect(dashboardHtml).toContain("臺北市 即時天氣");
    expect(dashboardHtml).toContain("氣溫趨勢變化");
    expect(dashboardHtml).toContain("F-D0047-091");
  });

  // Test 14: Upstream HTTP request strictly uses official api_key query parameter & URL sanitization
  it("strictly uses official api_key query parameter for upstream request and sanitizes sensitive URLs", async () => {
    const testSecret = "my-secret-token-xyz789";
    const builtUrl = moenvClientModule.buildMoenvUpstreamUrl(testSecret);

    // Verify official query parameters are present
    expect(builtUrl).toContain("api_key=my-secret-token-xyz789");
    expect(builtUrl).toContain("limit=1000");
    expect(builtUrl).toContain("format=json");

    // Verify sanitizeUrl masks api_key in URL
    const { sanitizeUrl } = await import("@/lib/server/redaction");
    const sanitized = sanitizeUrl(builtUrl);
    expect(sanitized).not.toContain("my-secret-token-xyz789");
    expect(sanitized).toContain("api_key=");

    // Verify fetchMoenvAirQuality passes the query parameter to upstream fetch
    let capturedUrl = "";
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    });

    await moenvClientModule.fetchMoenvAirQuality({
      apiKey: testSecret,
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(capturedUrl).toContain("api_key=my-secret-token-xyz789");
  });
});
