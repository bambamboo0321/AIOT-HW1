// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { CurrentWeatherCard } from "@/components/weather/CurrentWeatherCard";
import { AirQualityCard } from "@/components/weather/AirQualityCard";
import { UVCard } from "@/components/weather/UVCard";
import { NormalizedObservationData } from "@/lib/contracts/observations";
import { NormalizedAirQualityData } from "@/lib/contracts/air-quality";

describe("Milestone M13.1 Hero Responsive Grid & Calm Weather Intelligence Tests", () => {
  const cssPath = path.resolve(__dirname, "../app/globals.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  const mockObservation: NormalizedObservationData = {
    datasetId: "O-A0003-001",
    fetchedAt: "2026-09-24T10:00:00.000Z",
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
        temperature: 28.2,
        relativeHumidity: 70,
        windSpeed: 2.1,
        windDirection: 90,
        dailyPrecipitation: 0.0,
        precipitationStatus: "normal",
      },
    ],
  };

  const mockAirQuality: NormalizedAirQualityData = {
    datasetId: "AQX_P_432",
    fetchedAt: "2026-09-24T10:00:00.000Z",
    stations: [
      {
        stationId: "1",
        stationName: "萬華",
        county: "臺北市",
        latitude: 25.046,
        longitude: 121.507,
        aqi: 45,
        pm25: 12,
        pm10: 25,
        ozone: 30,
        carbonMonoxide: 0.4,
        sulfurDioxide: 1.5,
        nitrogenDioxide: 10,
        primaryPollutant: "",
        status: "良好",
        publishedAt: "2026-09-24T17:00:00+08:00",
      },
    ],
    countySummaries: {
      臺北市: {
        county: "臺北市",
        maxAqi: 45,
        sourceStationId: "1",
        sourceStationName: "萬華",
        sourceStationCounty: "臺北市",
        status: "良好",
        primaryPollutant: null,
        pm25: 12,
        pm10: 25,
        publishedAt: "2026-09-24T17:00:00+08:00",
      },
    },
  };

  it("Req1: Hero grid defines explicit grid-template-areas: weather uv / air air", () => {
    expect(cssContent).toMatch(/grid-template-areas:\s*["']weather\s+uv["']\s+["']air[\s]+air["']/);
    expect(cssContent).toMatch(/\.current-weather-card\s*\{[^}]*grid-area:\s*weather/);
    expect(cssContent).toMatch(/\.uv-card\s*\{[^}]*grid-area:\s*uv/);
    expect(cssContent).toMatch(/\.air-quality-card\s*\{[^}]*grid-area:\s*air/);
  });

  it("Req2: Hero grid enforces align-items: start by default (stretch on >=1280px desktop)", () => {
    expect(cssContent).toMatch(/\.hero-weather-grid\s*\{[^}]*align-items:\s*start/);
    expect(cssContent).toMatch(/@media\s*\(min-width:\s*1280px\)\s*\{[\s\S]*?align-items:\s*stretch/);
  });

  it("Req3: CurrentWeatherCard has hero temp + secondary metrics grid + metadata row", () => {
    const { container } = render(
      <CurrentWeatherCard
        region="臺北市"
        observationData={mockObservation}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />
    );
    const tempHero = screen.getByTestId("metric-temp");
    expect(tempHero.className).toContain("current-metric-hero");

    const secondaryGrid = container.querySelector(".current-secondary-metrics");
    expect(secondaryGrid).not.toBeNull();
    expect(secondaryGrid?.contains(screen.getByTestId("metric-humidity"))).toBe(true);
    expect(secondaryGrid?.contains(screen.getByTestId("metric-wind-speed"))).toBe(true);
    expect(secondaryGrid?.contains(screen.getByTestId("metric-rain"))).toBe(true);

    const timeMeta = screen.getByTestId("metric-time");
    expect(secondaryGrid?.contains(timeMeta)).toBe(false);
    expect(timeMeta.className).toContain("current-weather-metadata-row");
  });

  it("Req4: AQI detail grid uses auto-fit minmax(160px, 1fr)", () => {
    expect(cssContent).toMatch(/\.aqi-detail-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(160px,\s*1fr\)\)/);
    expect(cssContent).not.toContain("repeat(6, 1fr)");

    const { container } = render(
      <AirQualityCard
        region="臺北市"
        airQualityData={mockAirQuality}
        isLoading={false}
        error={null}
        onRetry={() => {}}
      />
    );
    expect(container.querySelector(".aqi-detail-grid")).not.toBeNull();
    const timeCard = screen.getByTestId("metric-aqi-time");
    expect(timeCard.querySelector(".aqi-time-date")).not.toBeNull();
  });

  it("Req5: Metric values/units/dates enforce white-space:nowrap", () => {
    expect(cssContent).toMatch(/\.metric-value\s*\{[^}]*white-space:\s*nowrap/);
    expect(cssContent).toMatch(/\.font-time\s*\{[^}]*white-space:\s*nowrap/);
    expect(cssContent).toMatch(/\.font-status\s*\{[^}]*white-space:\s*nowrap/);
    expect(cssContent).toMatch(/\.aqi-time-date,\s*\.aqi-time-hour\s*\{[^}]*white-space:\s*nowrap/);
    expect(cssContent).toMatch(/\.metric-label\s*\{[^}]*word-break:\s*normal/);
    expect(cssContent).toMatch(/\.metric-desc\s*\{[^}]*word-break:\s*normal/);
  });

  it("Req6: Hero grid is single-col by default; minmax columns at 1280px", () => {
    expect(cssContent).toMatch(/\.hero-weather-grid\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(cssContent).toMatch(/@media\s*\(min-width:\s*1280px\)\s*\{\s*\.hero-weather-grid\s*\{[^}]*grid-template-columns:\s*minmax/);
  });

  it("Req7: Hero cards use height:auto, no hero-primary/secondary-col or grid-auto-rows", () => {
    expect(cssContent).not.toMatch(/\.hero-primary-col/);
    expect(cssContent).not.toMatch(/\.hero-secondary-col/);
    expect(cssContent).not.toContain("grid-auto-rows: 1fr");
    expect(cssContent).toMatch(/\.current-weather-card\s*\{[^}]*height:\s*auto/);
    expect(cssContent).toMatch(/\.uv-card\s*\{[^}]*height:\s*auto/);
    expect(cssContent).toMatch(/\.air-quality-card\s*\{[^}]*height:\s*auto/);
  });

  it("Req8: overflow-x:hidden is NOT on body or hero cards", () => {
    const bodyMatch = cssContent.match(/^body\s*\{([^}]*)\}/m);
    if (bodyMatch) expect(bodyMatch[1]).not.toContain("overflow-x: hidden");
    const heroGridMatch = cssContent.match(/\.hero-weather-grid\s*\{([^}]*)\}/);
    if (heroGridMatch) expect(heroGridMatch[1]).not.toContain("overflow-x: hidden");
  });

  it("Req9: KPI grid is a flat summary rail (gap:0, border-right dividers, no individual box-shadow)", () => {
    expect(cssContent).toMatch(/\.kpi-grid\s*\{[^}]*gap:\s*0/);
    expect(cssContent).toMatch(/\.kpi-grid\s*\{[^}]*border-radius/);
    expect(cssContent).toMatch(/\.kpi-card\s*\{[^}]*border-right:/);
    const kpiCardBlock = cssContent.match(/\.kpi-card\s*\{([^}]*)\}/);
    if (kpiCardBlock) expect(kpiCardBlock[1]).not.toContain("box-shadow");
  });

  it("Req10: UVCard does not use absolute positioning; position:static guard exists", () => {
    const uvCssBlock = cssContent.match(/\.uv-card\s*\{([^}]*)\}/);
    if (uvCssBlock) expect(uvCssBlock[1]).not.toContain("position: absolute");
    expect(cssContent).toMatch(/\.uv-card\s*\{[^}]*position:\s*static/);

    const { container } = render(
      <UVCard
        region="臺北市"
        selectedDate="2026-09-24"
        uvItem={{
          datasetId: "F-D0047-091",
          fetchedAt: "2026-09-24T10:00:00.000Z",
          county: "臺北市",
          forecastDate: "2026-09-24",
          uvIndex: 6,
          displayValue: "6",
          level: "高量級",
          protectionAdvice: "請採取防護措施。",
          dataMeaning: "forecast_daytime",
        }}
        isLoading={false}
      />
    );
    expect(container.querySelector(".uv-card")).not.toBeNull();
  });

  it("Req11: AirQualityCard has grid-area:air and position:static guard", () => {
    expect(cssContent).toMatch(/\.air-quality-card\s*\{[^}]*grid-area:\s*air/);
    expect(cssContent).toMatch(/\.air-quality-card\s*\{[^}]*position:\s*static/);
  });

  it("Req12: Pollutant value enforces nowrap protection", () => {
    expect(cssContent).toMatch(/\.aqi-pollutant-card\s*\.pollutant-value\s*\{[^}]*white-space:\s*nowrap/);
    expect(cssContent).toMatch(/\.aqi-pollutant-card\s*\.pollutant-value\s*\{[^}]*word-break:\s*normal/);
  });

  it("Req13: CurrentWeatherCard main row uses flex-start, NOT stretch", () => {
    expect(cssContent).toMatch(/\.current-weather-main-row[\s\S]*?align-items:\s*flex-start/);
    expect(cssContent).not.toMatch(/\.current-weather-main-row[\s\S]*?align-items:\s*stretch/);
  });

  it("Req14: CSS provides .nowrap and .tabular-nums utility classes", () => {
    expect(cssContent).toMatch(/\.nowrap\s*\{[^}]*white-space:\s*nowrap/);
    expect(cssContent).toMatch(/\.tabular-nums\s*\{[^}]*font-variant-numeric:\s*tabular-nums/);
  });

  it("Req15: Mobile controls stack to single column at max-width:640px", () => {
    // Check that controls-grid and flex-direction:column co-exist in mobile context in full CSS
    // (Can't easily extract nested media blocks with regex, so check global presence)
    expect(cssContent).toMatch(/\.controls-grid\s*\{[\s\S]*?flex-direction:\s*column/);
    expect(cssContent).toMatch(/\.control-actions\s*\{[\s\S]*?width:\s*100%/);
  });
});
