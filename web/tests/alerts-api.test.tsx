import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GET,
  ALERTS_CACHE_CONTROL,
  ERROR_CACHE_CONTROL,
} from "@/app/api/weather/alerts/route";
import * as cwaAlertClientModule from "@/lib/server/cwa-alert-client";
import { ConfigError, UpstreamError, TimeoutError } from "@/lib/server/errors";
import { WeatherAlertsBanner } from "@/components/weather/WeatherAlertsBanner";
import { ForecastDashboard } from "@/components/weather/ForecastDashboard";
import { NormalizedAlertsData, WeatherAlert } from "@/lib/contracts/alerts";
import { NormalizedForecastData } from "@/lib/contracts/weather";
import { NormalizedObservationData } from "@/lib/contracts/observations";
import { EXPECTED_TAIWAN_REGIONS } from "@/lib/data/county-coordinates";

describe("Milestone M12: Canonical W-C0033-002 Alerts Route, Client & UI", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.CWA_API_KEY = "test-cwa-api-key-secret-12345";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns HTTP 200 with standard success envelope and Cache-Control headers", async () => {
    const mockAlertsData: NormalizedAlertsData = {
      datasetId: "W-C0033-002",
      fetchedAt: "2026-09-24T09:00:00Z",
      alertCount: 1,
      alerts: [
        {
          identifier: "W-C0033-002_豪雨_2026-09-24T08:00:00+08:00_新北市-臺北市",
          datasetId: "W-C0033-002",
          event: "豪雨",
          headline: "豪雨特報",
          description: "東北季風影響，臺北市山區有大豪雨發生的機率。",
          significance: "特報",
          effective: "2026-09-24T08:00:00+08:00",
          expires: "2026-09-24T20:00:00+08:00",
          affectedAreas: ["新北市", "臺北市"],
          isNationwide: false,
        },
      ],
    };

    vi.spyOn(cwaAlertClientModule, "fetchCwaAlerts").mockResolvedValueOnce(mockAlertsData);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(ALERTS_CACHE_CONTROL);
    expect(response.headers.get("Content-Type")).toContain("application/json");

    const json = await response.json();
    expect(json).toHaveProperty("ok", true);
    expect(json).toHaveProperty("data");
    expect(json).toHaveProperty("error", null);
    expect(json).not.toHaveProperty("success");
    expect(json.data.datasetId).toBe("W-C0033-002");
    expect(json.data.alertCount).toBe(1);
    expect(json.data.alerts[0].headline).toBe("豪雨特報");
  });

  it("returns HTTP 200 with empty alert list when no active alerts exist", async () => {
    const emptyAlertsData: NormalizedAlertsData = {
      datasetId: "W-C0033-002",
      fetchedAt: "2026-09-24T09:00:00Z",
      alertCount: 0,
      alerts: [],
    };

    vi.spyOn(cwaAlertClientModule, "fetchCwaAlerts").mockResolvedValueOnce(emptyAlertsData);

    const response = await GET();
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json).toHaveProperty("ok", true);
    expect(json).toHaveProperty("data");
    expect(json).toHaveProperty("error", null);
    expect(json).not.toHaveProperty("success");
    expect(json.data.alertCount).toBe(0);
    expect(json.data.alerts).toEqual([]);
  });

  it("handles missing API key with ConfigError and standard failure envelope without success field", async () => {
    vi.spyOn(cwaAlertClientModule, "fetchCwaAlerts").mockRejectedValueOnce(
      new ConfigError("CWA_API_KEY environment variable is missing")
    );

    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe(ERROR_CACHE_CONTROL);

    const json = await response.json();
    expect(json).toHaveProperty("ok", false);
    expect(json).toHaveProperty("data", null);
    expect(json).toHaveProperty("error");
    expect(json.error.code).toBe("CONFIG_ERROR");
    expect(json).not.toHaveProperty("success");

    const serialized = JSON.stringify(json);
    expect(serialized).not.toContain("test-cwa-api-key");
    expect(serialized).not.toContain("secrets.toml");
  });

  it("handles UpstreamError (500) and TimeoutError safely without leaking URLs or Keys", async () => {
    const sensitiveUrl = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0033-002?Authorization=SUPER_SECRET_KEY";

    vi.spyOn(cwaAlertClientModule, "fetchCwaAlerts").mockRejectedValueOnce(
      new UpstreamError(500)
    );

    const response500 = await GET();
    expect(response500.status).toBe(502);

    const json500 = await response500.json();
    const str500 = JSON.stringify(json500);
    expect(str500).not.toContain("SUPER_SECRET_KEY");
    expect(str500).not.toContain("Authorization=");

    // Test TimeoutError (504)
    vi.spyOn(cwaAlertClientModule, "fetchCwaAlerts").mockRejectedValueOnce(
      new TimeoutError(`Request timeout for ${sensitiveUrl}`)
    );

    const response504 = await GET();
    expect(response504.status).toBe(504);
    const json504 = await response504.json();
    const str504 = JSON.stringify(json504);
    expect(str504).not.toContain("SUPER_SECRET_KEY");
  });

  describe("Canonical Client: Exactly One Call to W-C0033-002 Only", () => {
    it("calls W-C0033-002 exactly once and never calls CAP or 404 datasets", async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        expect(url).toContain("W-C0033-002");
        expect(url).not.toContain("W-C0033-003");
        expect(url).not.toContain("W-C0033-004");
        expect(url).not.toContain("W-C0033-005");
        expect(url).not.toContain("W-C0033-006");
        expect(url).not.toContain("W-C0034-001");

        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: "true",
              records: {
                record: [
                  {
                    phenomena: "大雨",
                    significance: "特報",
                    startTime: "2026-09-24T08:00:00+08:00",
                    endTime: "2026-09-24T20:00:00+08:00",
                    contentText: "局部大雨發生的機率。",
                    locationName: "基隆市、新北市",
                  },
                ],
              },
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json; charset=utf-8" },
            }
          )
        );
      });

      const result = await cwaAlertClientModule.fetchCwaAlerts({
        apiKey: "test-key-abc",
        fetchFn: mockFetch,
        now: new Date("2026-09-24T12:00:00+08:00"),
      });

      // Exactly 1 network request made
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.datasetId).toBe("W-C0033-002");
      expect(result.alertCount).toBe(1);
      expect(result.alerts[0].headline).toBe("大雨特報");
    });
  });

  describe("WeatherAlertsBanner Component", () => {
    const sampleAlert: WeatherAlert = {
      identifier: "ALERT-TP-01",
      datasetId: "W-C0033-002",
      event: "豪雨",
      headline: "豪雨特報",
      description: "東北季風影響，易有大豪雨。",
      significance: "特報",
      effective: "2026-09-24T08:00:00+08:00",
      expires: "2026-09-24T20:00:00+08:00",
      affectedAreas: ["新北市", "臺北市"],
      isNationwide: false,
    };

    it("renders calm low-disturbance banner when there are no active alerts", () => {
      const html = renderToStaticMarkup(
        <WeatherAlertsBanner selectedRegion="臺北市" alerts={[]} />
      );

      expect(html).toContain("目前無有效天氣警特報");
      expect(html).toContain("中央氣象署目前無針對全臺發布生效中之災害性天氣警特報");
    });

    it("renders active alert banner without fabricating CAP severity", () => {
      const html = renderToStaticMarkup(
        <WeatherAlertsBanner selectedRegion="臺北市" alerts={[sampleAlert]} />
      );

      expect(html).toContain("天氣警特報");
      expect(html).toContain("臺北市 有 1 則警報");
      expect(html).toContain("豪雨特報");
      expect(html).toContain("新北市、臺北市");
      expect(html).toContain("詳細說明與防護指引");
      expect(html).toContain("東北季風影響，易有大豪雨。");

      // Verify no fabricated CAP severity
      expect(html).not.toContain("極重度 (Extreme)");
      expect(html).not.toContain("一般 (Unknown)");
    });

    it("renders error state when alerts loading fails", () => {
      const html = renderToStaticMarkup(
        <WeatherAlertsBanner
          selectedRegion="臺北市"
          alerts={[]}
          error="無法連線至氣象警特報服務"
        />
      );

      expect(html).toContain("警特報載入異常");
      expect(html).toContain("無法連線至氣象警特報服務");
    });
  });

  describe("Resilience & Strict UV Semantics in ForecastDashboard", () => {
    it("renders ForecastDashboard completely without crashing and strictly adheres to daytime UV semantics", () => {
      const mockForecast: NormalizedForecastData = {
        datasetId: "F-D0047-091",
        fetchedAt: "2026-09-24T00:00:00.000Z",
        regions: EXPECTED_TAIWAN_REGIONS.map((region) => ({
          region,
          intervals: [
            {
              startTime: "2026-09-24T06:00:00+08:00",
              endTime: "2026-09-24T18:00:00+08:00",
              minTemp: 24,
              maxTemp: 31,
            },
          ],
          uvForecasts: [
            {
              datasetId: "F-D0047-091",
              fetchedAt: "2026-09-24T00:00:00.000Z",
              county: region,
              forecastDate: "2026-09-24",
              startTime: "2026-09-24T06:00:00+08:00",
              endTime: "2026-09-24T18:00:00+08:00",
              uvIndex: 7,
              level: "高量級",
              displayValue: "7",
              protectionAdvice: "加強防曬、遮蔽皮膚，減少中午時段長時間曝曬。",
              dataMeaning: "forecast_daytime",
            },
          ],
        })),
      };

      const mockObservations: NormalizedObservationData = {
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
            temperature: 28.5,
            relativeHumidity: 65,
            windSpeed: 2.1,
            windDirection: 90,
            dailyPrecipitation: 0,
            precipitationStatus: "normal",
          },
        ],
      };

      const mockAlerts: NormalizedAlertsData = {
        datasetId: "W-C0033-002",
        fetchedAt: "2026-09-24T01:00:00.000Z",
        alertCount: 0,
        alerts: [],
      };

      const html = renderToStaticMarkup(
        <ForecastDashboard
          initialData={mockForecast}
          initialObservations={mockObservations}
          initialAirQuality={null}
          initialAlerts={mockAlerts}
        />
      );

      // Verify all sections render properly
      expect(html).toContain("Taiwan Weather Dashboard");
      expect(html).toContain("目前無有效天氣警特報");
      expect(html).toContain("臺北市 即時天氣");
      expect(html).toContain("空氣品質監測");
      expect(html).toContain("紫外線指數預報");
      expect(html).toContain("白天 UV 預報");
      expect(html).toContain("高量級");
      expect(html).toContain("氣溫趨勢圖");
      expect(html).toContain("七天天氣預報");

      // Verify strict UV semantics: must not claim instant or unverified daily max/representative UV
      expect(html).not.toContain("即時 UV");
      expect(html).not.toContain("當日最大 UV");
      expect(html).not.toContain("代表性 UV");

      // Verify no secrets leaked
      expect(html).not.toContain("test-cwa-api-key");
      expect(html).not.toContain("Authorization");
    });
  });
});
