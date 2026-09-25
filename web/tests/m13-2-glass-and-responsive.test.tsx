// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { ForecastDashboard } from "@/components/weather/ForecastDashboard";
import { WEATHER_BACKGROUND_CONFIG } from "@/lib/theme/background-assets";
import { NormalizedForecastData } from "@/lib/contracts/weather";
import { NormalizedObservationData } from "@/lib/contracts/observations";
import { NormalizedAirQualityData } from "@/lib/contracts/air-quality";
import { EXPECTED_TAIWAN_REGIONS } from "@/lib/data/county-coordinates";

// Mock child components that rely on Leaflet/window
vi.mock("@/components/weather/TaiwanWeatherMap", () => ({
  TaiwanWeatherMap: () => <div data-testid="mock-taiwan-weather-map">Taiwan Weather Map</div>,
}));

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
          uvIndex: 7,
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
        latitude: 25.037,
        longitude: 121.514,
        elevation: 5.3,
        observedAt: "2026-09-24T18:00:00+08:00",
        temperature: 28.5,
        relativeHumidity: 68,
        windSpeed: 2.3,
        windDirection: 90,
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
    stations: [
      {
        stationId: "1",
        stationName: "萬華",
        county: "臺北市",
        latitude: 25.046,
        longitude: 121.507,
        aqi: 38,
        pm25: 10,
        pm10: 22,
        ozone: 28,
        carbonMonoxide: 0.35,
        sulfurDioxide: 1.2,
        nitrogenDioxide: 9.5,
        primaryPollutant: "",
        status: "良好",
        publishedAt: "2026-09-24T17:00:00+08:00",
      },
    ],
    countySummaries: {
      臺北市: {
        county: "臺北市",
        maxAqi: 38,
        sourceStationId: "1",
        sourceStationName: "萬華",
        sourceStationCounty: "臺北市",
        status: "良好",
        primaryPollutant: null,
        pm25: 10,
        pm10: 22,
        publishedAt: "2026-09-24T17:00:00+08:00",
      },
    },
  };
}

describe("Milestone M13.2 Apple Weather Glassmorphism & Responsive Polish Tests", () => {
  const cssPath = path.resolve(__dirname, "../app/globals.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  describe("Section 1: 1280px Breakpoint Regression Prevention", () => {
    it("Default rule (< 1280px) stacks hero grid in single column without named grid-template-areas", () => {
      expect(cssContent).toMatch(/\.hero-weather-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
      expect(cssContent).toMatch(/\.current-weather-card\s*\{[^}]*grid-area:\s*auto/);
      expect(cssContent).toMatch(/\.uv-card\s*\{[^}]*grid-area:\s*auto/);
      expect(cssContent).toMatch(/\.air-quality-card\s*\{[^}]*grid-area:\s*auto/);
    });

    it("Min-width 1280px sets up 2-column grid and grid-template-areas", () => {
      expect(cssContent).toMatch(/@media\s*\(min-width:\s*1280px\)\s*\{\s*\.hero-weather-grid\s*\{[^}]*grid-template-columns:\s*minmax/);
      expect(cssContent).toMatch(/grid-template-areas:\s*["']weather\s+uv["']\s+["']air\s+air["']/);
    });

    it("768px～1279px provides dedicated horizontal layout for UVCard without breaking flow", () => {
      expect(cssContent).toMatch(/@media\s*\(min-width:\s*768px\)\s*and\s*\(max-width:\s*1279px\)\s*\{\s*\.uv-primary-metric\s*\{[^}]*display:\s*grid/);
    });

    it("Hero cards never use display:none or hidden visibility", () => {
      expect(cssContent).not.toMatch(/\.current-weather-card\s*\{[^}]*display:\s*none/);
      expect(cssContent).not.toMatch(/\.uv-card\s*\{[^}]*display:\s*none/);
      expect(cssContent).not.toMatch(/\.air-quality-card\s*\{[^}]*display:\s*none/);
      expect(cssContent).not.toMatch(/\.current-weather-card\s*\{[^}]*visibility:\s*hidden/);
      expect(cssContent).not.toMatch(/\.uv-card\s*\{[^}]*visibility:\s*hidden/);
    });
  });

  describe("Section 2: Immersive 3-Layer Background Architecture", () => {
    it("CSS defines 3 layers: .weather-bg-layer, .weather-overlay-layer, .weather-content-layer", () => {
      expect(cssContent).toContain(".weather-bg-layer");
      expect(cssContent).toContain(".weather-overlay-layer");
      expect(cssContent).toContain(".weather-content-layer");
    });

    it("Weather background layer is fixed, cover, center, with CSS gradient and color fallback", () => {
      const bgMatch = cssContent.match(/\.weather-bg-layer\s*\{([^}]+)\}/);
      expect(bgMatch).not.toBeNull();
      const bgRules = bgMatch![1];
      expect(bgRules).toContain("position: fixed");
      expect(bgRules).toContain("background-size: cover");
      expect(bgRules).toContain("background-position: center");
      expect(bgRules).toContain("background-color:");
      expect(bgRules).toContain("pointer-events: none");
    });

    it("Background config contract is defined with paths, fallback, and recommended dimensions", () => {
      expect(WEATHER_BACKGROUND_CONFIG.webpSrc).toBe("/images/weather-bg.webp");
      expect(WEATHER_BACKGROUND_CONFIG.jpegSrc).toBe("/images/weather-bg.jpg");
      expect(WEATHER_BACKGROUND_CONFIG.cssGradientFallback).toBeTruthy();
      expect(WEATHER_BACKGROUND_CONFIG.assetDirectory).toBe("web/public/images/");
      expect(WEATHER_BACKGROUND_CONFIG.recommendedSpecs.width).toBe(1920);
      expect(WEATHER_BACKGROUND_CONFIG.recommendedSpecs.height).toBe(1080);
      expect(WEATHER_BACKGROUND_CONFIG.recommendedSpecs.format).toBe("webp");
    });
  });

  describe("Section 3: Unified Glassmorphism Design Tokens", () => {
    it("Defines all required glass tokens in :root", () => {
      expect(cssContent).toContain("--glass-bg:");
      expect(cssContent).toContain("--glass-bg-strong:");
      expect(cssContent).toContain("--glass-border:");
      expect(cssContent).toContain("--glass-shadow:");
      expect(cssContent).toContain("--glass-blur:");
      expect(cssContent).toContain("--glass-radius:");
    });

    it("Applies backdrop-filter and -webkit-backdrop-filter across core dashboard cards", () => {
      expect(cssContent).toMatch(/\.dashboard-card[^{]*\{[^}]*backdrop-filter:\s*blur\(var\(--glass-blur\)\)/);
      expect(cssContent).toMatch(/\.dashboard-card[^{]*\{[^}]*-webkit-backdrop-filter:\s*blur\(var\(--glass-blur\)\)/);
      expect(cssContent).toMatch(/\.current-weather-card[^{]*\{[^}]*backdrop-filter:\s*blur\(var\(--glass-blur\)\)/);
      expect(cssContent).toMatch(/\.uv-card[^{]*\{[^}]*backdrop-filter:\s*blur\(var\(--glass-blur\)\)/);
      expect(cssContent).toMatch(/\.air-quality-card[^{]*\{[^}]*backdrop-filter:\s*blur\(var\(--glass-blur\)\)/);
    });

    it("Leaflet map wrapper is protected from backdrop-filter", () => {
      const mapWrapperMatch = cssContent.match(/\.map-wrapper\s*\{([^}]+)\}/);
      expect(mapWrapperMatch).not.toBeNull();
      expect(mapWrapperMatch![1]).not.toContain("backdrop-filter");
    });
  });

  describe("Section 4 & 5: Card Heaviness & Accessibility", () => {
    it("Enforces no body overflow-x:hidden", () => {
      const bodyMatch = cssContent.match(/^body\s*\{([^}]*)\}/m);
      if (bodyMatch) {
        expect(bodyMatch[1]).not.toContain("overflow-x: hidden");
      }
    });

    it("Supports prefers-reduced-motion", () => {
      expect(cssContent).toContain("@media (prefers-reduced-motion: reduce)");
    });

    it("Supports prefers-reduced-transparency with opaque solid backgrounds", () => {
      expect(cssContent).toContain("@media (prefers-reduced-transparency: reduce)");
      expect(cssContent).toMatch(/prefers-reduced-transparency[\s\S]*?backdrop-filter:\s*none/);
    });

    it("Enforces clear focus-visible outline", () => {
      expect(cssContent).toContain("*:focus-visible");
      expect(cssContent).toMatch(/\*:focus-visible\s*\{[^}]*outline:/);
    });
  });

  describe("Section 6: Dashboard Content Render Completeness", () => {
    it("Renders CurrentWeatherCard, UVCard, and AirQualityCard in the document", () => {
      const { container } = render(
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

      // Verify all 3 primary cards exist and are labeled
      const currentWeather = container.querySelector(".current-weather-card");
      expect(currentWeather).not.toBeNull();
      expect(screen.getByText(/即時天氣/)).toBeDefined();

      const uvCard = container.querySelector(".uv-card");
      expect(uvCard).not.toBeNull();
      expect(screen.getByText(/紫外線指數預報/)).toBeDefined();

      const aqiCard = container.querySelector(".air-quality-card");
      expect(aqiCard).not.toBeNull();
      expect(screen.getAllByText(/空氣品質/).length).toBeGreaterThan(0);

      // Controls and KPI rail also exist
      expect(container.querySelector(".controls-card")).not.toBeNull();
      expect(container.querySelector(".kpi-grid")).not.toBeNull();
    });
  });
});
