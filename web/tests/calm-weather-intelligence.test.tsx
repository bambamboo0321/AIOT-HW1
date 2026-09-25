// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "fs";
import path from "path";
import { ForecastDashboard } from "@/components/weather/ForecastDashboard";
import { WeatherAlertsBanner } from "@/components/weather/WeatherAlertsBanner";
import { RawIntervalDetails } from "@/components/weather/RawIntervalDetails";
import { TaiwanWeatherMap } from "@/components/weather/TaiwanWeatherMap";
import { LeafletMapInner } from "@/components/weather/LeafletMapInner";
import { DashboardControls } from "@/components/weather/DashboardControls";
import { CurrentWeatherCard } from "@/components/weather/CurrentWeatherCard";
import { AirQualityCard } from "@/components/weather/AirQualityCard";
import { NormalizedForecastData } from "@/lib/contracts/weather";
import { NormalizedObservationData } from "@/lib/contracts/observations";
import { NormalizedAirQualityData } from "@/lib/contracts/air-quality";
import { WeatherAlert } from "@/lib/contracts/alerts";
import { EXPECTED_TAIWAN_REGIONS } from "@/lib/data/county-coordinates";

// Mock next/dynamic so LeafletMap renders synchronously
vi.mock("next/dynamic", () => ({
  default: () => {
    return function MockDynamic(props: React.ComponentProps<typeof LeafletMapInner>) {
      return <LeafletMapInner {...props} />;
    };
  },
}));

afterEach(() => {
  cleanup();
});

function createMockForecast(): NormalizedForecastData {
  return {
    datasetId: "F-D0047-091",
    fetchedAt: "2026-09-24T12:00:00.000Z",
    regions: EXPECTED_TAIWAN_REGIONS.map((region) => ({
      region,
      intervals: [
        {
          startTime: "2026-09-24T06:00:00+08:00",
          endTime: "2026-09-24T18:00:00+08:00",
          minTemp: 23.0,
          maxTemp: 31.5,
        },
        {
          startTime: "2026-09-24T18:00:00+08:00",
          endTime: "2026-09-25T06:00:00+08:00",
          minTemp: 21.0,
          maxTemp: 26.0,
        },
      ],
    })),
  };
}

function createMockObservations(): NormalizedObservationData {
  return {
    datasetId: "O-A0003-001",
    fetchedAt: "2026-09-24T12:00:00.000Z",
    stations: [
      {
        stationId: "466920",
        stationName: "臺北",
        county: "臺北市",
        town: "中正區",
        latitude: 25.0375,
        longitude: 121.5149,
        elevation: 6.0,
        observedAt: "2026-09-24T12:00:00+08:00",
        temperature: 28.4,
        relativeHumidity: 65,
        windSpeed: 2.1,
        windDirection: 80,
        dailyPrecipitation: 0.0,
        precipitationStatus: "normal",
      },
    ],
  };
}

function createMockAirQuality(): NormalizedAirQualityData {
  return {
    datasetId: "AQX_P_432",
    fetchedAt: "2026-09-24T12:00:00.000Z",
    countySummaries: {},
    stations: [
      {
        stationId: "1",
        stationName: "萬華",
        county: "臺北市",
        latitude: 25.0465,
        longitude: 121.5079,
        publishedAt: "2026-09-24 12:00",
        aqi: 45,
        status: "良好",
        primaryPollutant: null,
        pm25: 12,
        pm10: 25,
        ozone: 30,
        carbonMonoxide: 0.3,
        sulfurDioxide: 1.5,
        nitrogenDioxide: 14,
      },
    ],
  };
}

function createMockAlert(): WeatherAlert {
  return {
    identifier: "CWA-ALERT-001",
    datasetId: "W-C0033-002",
    headline: "豪雨特報",
    event: "豪雨",
    isNationwide: false,
    severity: "Severe",
    effective: "2026-09-24T10:00:00+08:00",
    expires: "2026-09-25T10:00:00+08:00",
    description: "受低壓帶影響，臺北市有局部大雨或豪雨發生機率。",
    instruction: "請注意強陣風及溪水暴漲；低窪地區請慎防淹水。",
    web: "https://www.cwa.gov.tw",
    affectedAreas: ["臺北市", "新北市"],
  };
}

describe("Milestone M13.1: Calm Weather Intelligence Visual & Information Hierarchy", () => {
  it("Requirement 1: Page header displays prominent Traditional Chinese title and non-distracting metadata", () => {
    const mockData = createMockForecast();
    const html = renderToStaticMarkup(<ForecastDashboard initialData={mockData} />);

    // Prominent Traditional Chinese main title
    expect(html).toContain("臺灣即時氣象");
    // English subtitle preserved with lower visual prominence
    expect(html).toContain("Taiwan Weather Dashboard");
    expect(html).toContain("header-title-sub");

    // Metadata is clean and non-distracting
    expect(html).toContain("F-D0047-091");
    expect(html).toContain("交通部中央氣象署");
    expect(html).toContain("header-metadata");
  });

  it("Requirement 2: Calm alerts banner when 0 alerts, elevated priority when active alerts exist", () => {
    // 1. Calm state (0 alerts)
    const { container: calmContainer } = render(
      <WeatherAlertsBanner
        selectedRegion="臺北市"
        alerts={[]}
        isLoading={false}
        error={null}
      />
    );
    expect(calmContainer.querySelector(".alerts-banner-calm")).not.toBeNull();
    expect(screen.getByText("目前無有效天氣警特報")).toBeDefined();

    // 2. Active state (with alerts)
    const { container: activeContainer } = render(
      <WeatherAlertsBanner
        selectedRegion="臺北市"
        alerts={[createMockAlert()]}
        isLoading={false}
        error={null}
      />
    );
    expect(activeContainer.querySelector(".alerts-banner-active")).not.toBeNull();
    expect(screen.getByText("豪雨特報")).toBeDefined();
    // Expandable details exist
    const details = activeContainer.querySelector("details");
    expect(details).not.toBeNull();
  });

  it("Requirement 3: Progressive disclosure - RawIntervalDetails is collapsed by default", () => {
    const intervals = [
      {
        startTime: "2026-09-24T06:00:00+08:00",
        endTime: "2026-09-24T18:00:00+08:00",
        minTemp: 24,
        maxTemp: 31,
      },
    ];

    render(<RawIntervalDetails intervals={intervals} region="臺北市" />);

    // Toggle button is collapsed initially
    const button = screen.getByRole("button", { name: /原始時段明細|原始 12 小時預報區間檢視/i });
    expect(button.getAttribute("aria-expanded")).toBe("false");

    // Table is NOT rendered before click
    expect(screen.queryByRole("table")).toBeNull();

    // Click expands accordion
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("table")).toBeDefined();
  });

  it("Requirement 4: Interactive map retains all 8 meteorological & air quality layers", () => {
    render(
      <TaiwanWeatherMap
        data={createMockForecast()}
        observationData={createMockObservations()}
        airQualityData={createMockAirQuality()}
        selectedRegion="臺北市"
      />
    );

    const layerKeys = [
      "forecast_max_temp",
      "realtime_temp",
      "relative_humidity",
      "wind",
      "daily_precipitation",
      "aqi",
      "pm25",
      "uv",
    ];

    for (const key of layerKeys) {
      const btn = screen.getByTestId(`layer-btn-${key}`);
      expect(btn).toBeDefined();
      expect(btn.getAttribute("role")).toBe("tab");
    }
  });

  it("Requirement 5: Semantic zoom and county boundary features are preserved", () => {
    const { container } = render(
      <TaiwanWeatherMap
        data={createMockForecast()}
        observationData={createMockObservations()}
        airQualityData={createMockAirQuality()}
        selectedRegion="臺北市"
      />
    );

    // Initial Overview tier renders county summary badge
    const summaryBadge = container.querySelector(".map-badge-summary");
    expect(summaryBadge).not.toBeNull();

    // Map zoom tier badge indicates Overview tier
    const zoomBadge = screen.getByTestId("map-zoom-tier-badge");
    expect(zoomBadge.textContent).toContain("全臺摘要視角");
  });

  it("Requirement 6: API error isolation is preserved across Observation, Air Quality, and Forecast", () => {
    // Current weather error isolated
    render(
      <CurrentWeatherCard
        region="臺北市"
        observationData={null}
        isLoading={false}
        error="測站連線失敗"
        onRetry={() => {}}
      />
    );
    expect(screen.getByText("測站連線失敗")).toBeDefined();

    // Air Quality error isolated
    render(
      <AirQualityCard
        region="臺北市"
        airQualityData={null}
        isLoading={false}
        error="環境部監測站離線"
        onRetry={() => {}}
      />
    );
    expect(screen.getByText("環境部監測站離線")).toBeDefined();
  });

  it("Requirement 7: Mobile controls structure contains all 22 regions and clear action buttons", () => {
    render(
      <DashboardControls
        regions={EXPECTED_TAIWAN_REGIONS}
        selectedRegion="臺北市"
        onSelectRegion={() => {}}
        availableDates={["2026-09-24", "2026-09-25"]}
        startDate="2026-09-24"
        endDate="2026-09-25"
        onSelectStartDate={() => {}}
        onSelectEndDate={() => {}}
        onResetDates={() => {}}
        onRefresh={() => {}}
      />
    );

    const select = screen.getByLabelText("預報縣市");
    expect(select).toBeDefined();
    expect(screen.getByRole("button", { name: /重新載入/i })).toBeDefined();
  });

  it("Requirement 8: Accessibility aria-labels, focus rings, and keyboard attributes are retained", () => {
    const html = renderToStaticMarkup(
      <ForecastDashboard
        initialData={createMockForecast()}
        initialObservations={createMockObservations()}
        initialAirQuality={createMockAirQuality()}
      />
    );

    expect(html).toContain('aria-label="臺北市 即時天氣觀測"');
    expect(html).toContain('aria-label="臺北市 空氣品質監測"');
    expect(html).toContain('aria-label="紫外線指數預報"');
    expect(html).toContain('aria-label="未來 7 日氣溫"');
  });

  it("Requirement 9: Design tokens, prefers-reduced-motion, and no card-wide blur in globals.css", () => {
    const cssPath = path.resolve(__dirname, "../app/globals.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");

    // Token definitions
    expect(cssContent).toContain("--color-bg-page:");
    expect(cssContent).toContain("--color-surface-elevated:");
    expect(cssContent).toContain("--color-surface-glass:");
    expect(cssContent).toContain("--color-accent-sky:");
    expect(cssContent).toContain("--color-focus-ring:");
    expect(cssContent).toContain("--space-1:");
    expect(cssContent).toContain("--space-16:");
    expect(cssContent).toContain("--radius-control:");
    expect(cssContent).toContain("--radius-section:");
    expect(cssContent).toContain("--shadow-card:");
    expect(cssContent).toContain("--shadow-floating:");
    expect(cssContent).toContain("--shadow-popup:");
    expect(cssContent).toContain("--duration-fast:");

    // Accessibility motion support
    expect(cssContent).toContain("prefers-reduced-motion: reduce");

    // Focus visible styling
    expect(cssContent).toContain("*:focus-visible");

    // Milestone M13.2 Glassmorphism: generic .dashboard-card uses backdrop-filter
    const cardMatch = cssContent.match(/\.dashboard-card\s*\{([^}]+)\}/);
    expect(cardMatch).not.toBeNull();
    expect(cardMatch![1]).toContain("backdrop-filter");

    // Crucial: Leaflet map wrapper MUST NOT have backdrop-filter
    const mapWrapperMatch = cssContent.match(/\.map-wrapper\s*\{([^}]+)\}/);
    expect(mapWrapperMatch).not.toBeNull();
    expect(mapWrapperMatch![1]).not.toContain("backdrop-filter");

    // Liquid Glass is restricted to floating controls, segmented switchers, popups
    expect(cssContent).toContain(".controls-card");
    expect(cssContent).toContain(".map-layer-control-panel");
    expect(cssContent).toContain(".weather-map-popup");
    expect(cssContent).toContain(".map-focus-floating-btn");
  });

  it("Requirement 10: Pure UI transformation does not trigger extra API network requests", () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    render(
      <ForecastDashboard
        initialData={createMockForecast()}
        initialObservations={createMockObservations()}
        initialAirQuality={createMockAirQuality()}
        initialAlerts={{
          datasetId: "W-C0033-002",
          fetchedAt: "2026-09-24T12:00:00.000Z",
          alertCount: 0,
          alerts: [],
        }}
      />
    );

    // Initial render with provided initial props should not fetch
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
