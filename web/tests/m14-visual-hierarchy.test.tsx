// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { ForecastDashboard } from "@/components/weather/ForecastDashboard";
import { NormalizedForecastData } from "@/lib/contracts/weather";
import { NormalizedObservationData } from "@/lib/contracts/observations";
import { NormalizedAirQualityData } from "@/lib/contracts/air-quality";
import { NormalizedAlertsData } from "@/lib/contracts/alerts";
import { EXPECTED_TAIWAN_REGIONS } from "@/lib/data/county-coordinates";

// Mock Leaflet and WebGL Rain overlay to isolate UI hierarchy assertions
vi.mock("@/components/weather/TaiwanWeatherMap", () => ({
  TaiwanWeatherMap: () => <div data-testid="mock-taiwan-weather-map">Taiwan Weather Map</div>,
}));

vi.mock("@/components/weather/RainLabViewer", () => ({
  RainLabViewer: () => null,
}));

function createMockForecast(): NormalizedForecastData {
  return {
    datasetId: "F-D0047-091",
    fetchedAt: "2026-09-25T12:00:00.000Z",
    regions: EXPECTED_TAIWAN_REGIONS.map((region) => ({
      region,
      intervals: [
        {
          startTime: "2026-09-25T06:00:00+08:00",
          endTime: "2026-09-25T18:00:00+08:00",
          minTemp: 24.0,
          maxTemp: 32.0,
          uvIndex: 8,
        },
        {
          startTime: "2026-09-25T18:00:00+08:00",
          endTime: "2026-09-26T06:00:00+08:00",
          minTemp: 22.0,
          maxTemp: 26.5,
        },
      ],
      uvForecasts: [
        {
          forecastDate: "2026-09-25",
          uvIndex: 8,
          level: "過量級",
          datasetId: "F-D0047-091",
          fetchedAt: "2026-09-25T12:00:00.000Z",
          county: region,
          displayValue: "8",
          protectionAdvice: "外出請做好防護",
          status: "active",
          dataMeaning: "forecast_daytime" as const,
        },
      ],
    })),
  };
}

function createMockObservations(): NormalizedObservationData {
  return {
    datasetId: "O-A0003-001",
    fetchedAt: "2026-09-25T12:00:00.000Z",
    stations: [
      {
        stationId: "466920",
        stationName: "臺北",
        county: "臺北市",
        town: "中正區",
        latitude: 25.037,
        longitude: 121.514,
        elevation: 5.3,
        observedAt: "2026-09-25T18:00:00+08:00",
        temperature: 26.2,
        relativeHumidity: 81,
        windSpeed: 0.1,
        windDirection: 0,
        dailyPrecipitation: 0.0,
        precipitationStatus: "normal",
      },
    ],
  };
}

function createMockAirQuality(): NormalizedAirQualityData {
  return {
    datasetId: "AQX_P_432",
    fetchedAt: "2026-09-25T12:00:00.000Z",
    stations: [
      {
        stationId: "1",
        stationName: "士林",
        county: "臺北市",
        latitude: 25.09,
        longitude: 121.52,
        aqi: 42,
        status: "良好",
        pm25: 11,
        pm10: 22,
        ozone: 28,
        carbonMonoxide: 0.35,
        sulfurDioxide: 1.2,
        nitrogenDioxide: 9.5,
        primaryPollutant: "",
        publishedAt: "2026-09-25T18:00:00+08:00",
      },
    ],
    countySummaries: {
      臺北市: {
        county: "臺北市",
        maxAqi: 42,
        sourceStationId: "1",
        sourceStationName: "士林",
        sourceStationCounty: "臺北市",
        status: "良好",
        primaryPollutant: null,
        pm25: 11,
        pm10: 22,
        publishedAt: "2026-09-25T18:00:00+08:00",
      },
    },
  };
}

function createMockAlerts(): NormalizedAlertsData {
  return {
    datasetId: "W-C0033-002",
    fetchedAt: "2026-09-25T12:00:00.000Z",
    alertCount: 0,
    alerts: [],
  };
}

describe("Milestone M14: Visual Hierarchy & Editorial Layout", () => {
  it("Requirement 1: Header Brand Hierarchy prioritizes 臺灣即時氣象 with quiet metadata", () => {
    render(
      <ForecastDashboard
        initialData={createMockForecast()}
        initialObservations={createMockObservations()}
        initialAirQuality={createMockAirQuality()}
        initialAlerts={createMockAlerts()}
      />
    );

    // Primary brand title in H1
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).not.toBeNull();
    expect(heading.textContent).toContain("臺灣即時氣象");
    expect(heading.textContent).toContain("Taiwan Weather Dashboard");

    // Supporting subtitle
    expect(screen.getByText(/中央氣象署即時觀測・七天預報・空氣品質儀表板/)).not.toBeNull();

    // Quiet utility metadata remains present
    expect(screen.getAllByText(/交通部中央氣象署/).length).toBeGreaterThanOrEqual(1);
  });

  it("Requirement 2: Current Weather Hero prominently displays Hero temperature and subordinate secondary metrics", () => {
    render(
      <ForecastDashboard
        initialData={createMockForecast()}
        initialObservations={createMockObservations()}
        initialAirQuality={createMockAirQuality()}
        initialAlerts={createMockAlerts()}
      />
    );

    // Hero temperature metric
    const tempMetric = screen.getByTestId("metric-temp");
    expect(tempMetric).not.toBeNull();
    expect(tempMetric.textContent).toContain("26.2°");

    // Subordinate secondary metrics remain intact
    expect(screen.getByTestId("metric-humidity")).not.toBeNull();
    expect(screen.getByTestId("metric-wind-speed")).not.toBeNull();
    expect(screen.getByTestId("metric-wind-dir")).not.toBeNull();
    expect(screen.getByTestId("metric-rain")).not.toBeNull();

    // Observation time metadata
    expect(screen.getByTestId("metric-time")).not.toBeNull();
  });

  it("Requirement 3: UV Supporting Card retains essential severity, advice, and period badges", () => {
    render(
      <ForecastDashboard
        initialData={createMockForecast()}
        initialObservations={createMockObservations()}
        initialAirQuality={createMockAirQuality()}
        initialAlerts={createMockAlerts()}
      />
    );

    const uvCard = screen.getByTestId("uv-card");
    expect(uvCard).not.toBeNull();
    expect(uvCard.textContent).toContain("紫外線指數預報");
    expect(uvCard.textContent).toContain("8");
    expect(uvCard.textContent).toContain("過量級");
  });

  it("Requirement 4: Air Quality Card retains MOENV source badge, AQI indicator, and pollutants", () => {
    render(
      <ForecastDashboard
        initialData={createMockForecast()}
        initialObservations={createMockObservations()}
        initialAirQuality={createMockAirQuality()}
        initialAlerts={createMockAlerts()}
      />
    );

    expect(screen.getByTestId("metric-aqi")).not.toBeNull();
    expect(screen.getByText(/空氣品質監測 \(MOENV\)/)).not.toBeNull();
  });

  it("Requirement 5: Summary Rail (KPIs) renders all 4 summary metrics cleanly", () => {
    render(
      <ForecastDashboard
        initialData={createMockForecast()}
        initialObservations={createMockObservations()}
        initialAirQuality={createMockAirQuality()}
        initialAlerts={createMockAlerts()}
      />
    );

    expect(screen.getByTestId("kpi-region")).not.toBeNull();
    expect(screen.getByTestId("kpi-min-temp")).not.toBeNull();
    expect(screen.getByTestId("kpi-max-temp")).not.toBeNull();
    expect(screen.getByTestId("kpi-days-count")).not.toBeNull();
  });

  it("Requirement 6: Calm Weather Alert renders as low-profile status rail", () => {
    render(
      <ForecastDashboard
        initialData={createMockForecast()}
        initialObservations={createMockObservations()}
        initialAirQuality={createMockAirQuality()}
        initialAlerts={createMockAlerts()}
      />
    );

    const calmAlert = screen.getByTestId("weather-alerts-none");
    expect(calmAlert).not.toBeNull();
    expect(calmAlert.textContent).toContain("目前無有效天氣警特報");
  });

  it("Requirement 7: CSS Architecture defines 3 distinct surface levels and hero typography", () => {
    const cssPath = path.resolve(__dirname, "../app/globals.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");

    // 3 Surface level tokens exist in :root
    expect(cssContent).toContain("--surface-primary-bg");
    expect(cssContent).toContain("--surface-supporting-bg");
    expect(cssContent).toContain("--surface-grouping-bg");

    // Surface specialization classes exist
    expect(cssContent).toContain(".surface-primary");
    expect(cssContent).toContain(".surface-supporting");
    expect(cssContent).toContain(".surface-grouping");

    // Current Weather Hero typography breaks existing scale
    expect(cssContent).toContain(".metric-temp-hero");
    expect(cssContent).toMatch(/\.metric-temp-hero[^{]*\{[^}]*font-size:\s*4\.75rem/);

    // Summary rail and calm alert styles exist
    expect(cssContent).toContain(".kpi-grid");
    expect(cssContent).toContain(".alerts-calm");
    expect(cssContent).toContain(".raw-details-card");
  });
});
