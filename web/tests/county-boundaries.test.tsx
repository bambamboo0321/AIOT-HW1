// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TaiwanWeatherMap from "@/components/weather/TaiwanWeatherMap";
import { LeafletMapInner, getCountyPolygonStyle } from "@/components/weather/LeafletMapInner";
import {
  TAIWAN_COUNTIES_GEOJSON,
  TAIWAN_COUNTIES_METADATA,
  TAIWAN_MAP_BOUNDARY_DISCLAIMER,
  normalizeCountyName,
  getCountyBounds,
  TAIWAN_COUNTY_BOUNDS,
} from "@/lib/data/taiwan-counties";
import { EXPECTED_TAIWAN_REGIONS } from "@/lib/data/county-coordinates";
import { NormalizedForecastData } from "@/lib/contracts/weather";
import { NormalizedObservationData } from "@/lib/contracts/observations";
import { NormalizedAirQualityData } from "@/lib/contracts/air-quality";

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
  vi.clearAllMocks();
});

const mockForecastData: NormalizedForecastData = {
  datasetId: "F-D0047-091",
  fetchedAt: "2026-09-24T05:30:00Z",
  regions: EXPECTED_TAIWAN_REGIONS.map((region) => ({
    region,
    intervals: [
      {
        startTime: "2026-09-24T06:00:00+08:00",
        endTime: "2026-09-24T18:00:00+08:00",
        maxTemp: 28,
        minTemp: 22,
      },
    ],
  })),
};

const mockObservationData: NormalizedObservationData = {
  datasetId: "O-A0003-001",
  fetchedAt: "2026-09-24T12:00:00Z",
  stations: [
    {
      stationId: "466920",
      stationName: "臺北",
      county: "臺北市",
      town: "信義區",
      latitude: 25.0375,
      longitude: 121.5637,
      elevation: 6.0,
      observedAt: "2026-09-24T12:00:00+08:00",
      temperature: 28.0,
      relativeHumidity: 70,
      windSpeed: 3.0,
      windDirection: 90,
      dailyPrecipitation: 0.0,
      precipitationStatus: "normal",
    },
    {
      stationId: "467350",
      stationName: "澎湖",
      county: "澎湖縣",
      town: "馬公市",
      latitude: 23.5656,
      longitude: 119.5631,
      elevation: 11.0,
      observedAt: "2026-09-24T12:00:00+08:00",
      temperature: 27.5,
      relativeHumidity: 75,
      windSpeed: 5.0,
      windDirection: 45,
      dailyPrecipitation: 0.0,
      precipitationStatus: "normal",
    },
    {
      stationId: "467110",
      stationName: "金門",
      county: "金門縣",
      town: "金城鎮",
      latitude: 24.4073,
      longitude: 118.2893,
      elevation: 48.0,
      observedAt: "2026-09-24T12:00:00+08:00",
      temperature: 26.0,
      relativeHumidity: 80,
      windSpeed: 4.0,
      windDirection: 60,
      dailyPrecipitation: 0.0,
      precipitationStatus: "normal",
    },
    {
      stationId: "466990",
      stationName: "馬祖",
      county: "連江縣",
      town: "南竿鄉",
      latitude: 26.1694,
      longitude: 119.9231,
      elevation: 98.0,
      observedAt: "2026-09-24T12:00:00+08:00",
      temperature: 24.0,
      relativeHumidity: 85,
      windSpeed: 6.0,
      windDirection: 30,
      dailyPrecipitation: 0.0,
      precipitationStatus: "normal",
    },
  ],
};

const mockAirQualityData: NormalizedAirQualityData = {
  datasetId: "AQX_P_432",
  fetchedAt: "2026-09-24T12:00:00Z",
  stations: [
    {
      stationId: "1",
      stationName: "士林",
      county: "臺北市",
      latitude: 25.093,
      longitude: 121.525,
      publishedAt: "2026-09-24 12:00",
      aqi: 50,
      status: "良好",
      primaryPollutant: null,
      pm25: 12,
      pm10: 30,
      ozone: 35,
      carbonMonoxide: 0.3,
      sulfurDioxide: 1.0,
      nitrogenDioxide: 12,
    },
  ],
  countySummaries: {},
};

describe("Milestone M13 Taiwan 22 Counties Administrative Boundaries & Precision Verification", () => {
  it("Requirement 1 & 8: Metadata 正確區分原始 EPSG:3824 與目標 EPSG:4326，不混淆 CRS (Strict CRS separation)", () => {
    // 1. Raw source CRS is strictly EPSG:3824 (TWD97 geographic), NEVER called EPSG:4326
    expect(TAIWAN_COUNTIES_METADATA.originalCrs).toBe("EPSG:3824");
    expect(TAIWAN_COUNTIES_METADATA.originalCrs).not.toBe("EPSG:4326");
    expect(TAIWAN_COUNTIES_METADATA.originalCrsDescription).toContain("TWD97");
    expect(TAIWAN_COUNTIES_METADATA.originalCrsDescription).toContain("GRS 1980");

    // 2. Web display target CRS is EPSG:4326 (WGS84)
    expect(TAIWAN_COUNTIES_METADATA.targetCrs).toBe("EPSG:4326");
    expect(TAIWAN_COUNTIES_METADATA.targetCrs).not.toBe("EPSG:3824");
    expect(TAIWAN_COUNTIES_METADATA.targetCrsDescription).toContain("WGS 84");
    expect(TAIWAN_COUNTIES_METADATA.isReprojected).toBe(true);

    // 3. Provenance and attribution tracking
    expect(TAIWAN_COUNTIES_METADATA.sourceAgency).toContain("內政部");
    expect(TAIWAN_COUNTIES_METADATA.datasetId).toBe("7442");
    expect(TAIWAN_COUNTIES_METADATA.license).toContain("政府資料開放授權條款");

    // 4. Clearly designated as Web display optimized scope, NOT "完整官方界線"
    expect(TAIWAN_COUNTIES_METADATA.scope).toBe("Web 顯示優化版行政邊界（排除部分遠洋島礁）");
    expect(TAIWAN_COUNTIES_METADATA.scope).not.toContain("完整官方界線");
    expect(TAIWAN_COUNTIES_METADATA.excludedGeometriesNote).toContain("太平島");
    expect(TAIWAN_COUNTIES_METADATA.excludedGeometriesNote).toContain("東沙群島");
    expect(TAIWAN_COUNTIES_METADATA.excludedGeometriesNote).toContain("釣魚臺");

    // 5. Legal disclaimer against land surveying / navigation use
    expect(TAIWAN_COUNTIES_METADATA.disclaimer).toContain("不作土地測量");
    expect(TAIWAN_COUNTIES_METADATA.disclaimer).toContain("法律界址");
    expect(TAIWAN_COUNTIES_METADATA.disclaimer).toContain("導航用途");
  });

  it("Requirement 4 & 6: GeoJSON 包含 22 個唯一標準行政縣市，名稱無重複 (22 unique standard counties)", () => {
    expect(TAIWAN_COUNTIES_GEOJSON.type).toBe("FeatureCollection");
    expect(TAIWAN_COUNTIES_GEOJSON.features.length).toBe(22);

    const geojsonCountyNames = TAIWAN_COUNTIES_GEOJSON.features.map(
      (f) => f.properties?.COUNTYNAME
    );

    // Verify uniqueness: exactly 22 distinct county names
    const uniqueNames = new Set(geojsonCountyNames);
    expect(uniqueNames.size).toBe(22);

    // Verify all 22 expected regions match exactly
    for (const expectedRegion of EXPECTED_TAIWAN_REGIONS) {
      expect(uniqueNames.has(expectedRegion)).toBe(true);
    }
  });

  it("Requirement 4 & 5: 所有 Feature Geometry 均非空、無 NaN，且座標順序為 [longitude, latitude] 在合理臺灣範圍內", () => {
    function inspectCoords(coords: unknown): void {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === "number" && typeof coords[1] === "number") {
        const [lon, lat] = coords as [number, number];
        expect(Number.isFinite(lon)).toBe(true);
        expect(Number.isFinite(lat)).toBe(true);
        expect(Number.isNaN(lon)).toBe(false);
        expect(Number.isNaN(lat)).toBe(false);

        // Taiwan longitude bounds: 118 <= lon <= 123
        expect(lon).toBeGreaterThanOrEqual(118.0);
        expect(lon).toBeLessThanOrEqual(123.0);

        // Taiwan latitude bounds: 21 <= lat <= 27
        expect(lat).toBeGreaterThanOrEqual(21.0);
        expect(lat).toBeLessThanOrEqual(27.0);
        return;
      }
      for (const item of coords) {
        inspectCoords(item);
      }
    }

    for (const feature of TAIWAN_COUNTIES_GEOJSON.features) {
      expect(feature.geometry).toBeDefined();
      expect(feature.geometry).not.toBeNull();
      expect(["Polygon", "MultiPolygon"]).toContain(feature.geometry.type);

      const geom = feature.geometry;
      if (geom.type === "Polygon") {
        expect(geom.coordinates.length).toBeGreaterThan(0);
        expect(geom.coordinates[0].length).toBeGreaterThanOrEqual(4); // closed ring
        inspectCoords(geom.coordinates);
      } else if (geom.type === "MultiPolygon") {
        expect(geom.coordinates.length).toBeGreaterThan(0);
        for (const poly of geom.coordinates) {
          expect(poly.length).toBeGreaterThan(0);
          expect(poly[0].length).toBeGreaterThanOrEqual(4);
        }
        inspectCoords(geom.coordinates);
      }
    }
  });

  it("Requirement 5: 「台／臺」能正確對應 selectedRegion (Normalizes colloquial '台' to '臺')", () => {
    // Normalization function tests
    expect(normalizeCountyName("台北市")).toBe("臺北市");
    expect(normalizeCountyName("台中市")).toBe("臺中市");
    expect(normalizeCountyName("台南市")).toBe("臺南市");
    expect(normalizeCountyName("台東縣")).toBe("臺東縣");
    expect(normalizeCountyName("臺北市")).toBe("臺北市");
    expect(normalizeCountyName("基隆市")).toBe("基隆市");

    // Style helper tests with colloquial inputs
    const taipeiStyleWithColloquial = getCountyPolygonStyle("臺北市", "台北市");
    expect(taipeiStyleWithColloquial.color).toBe("#38bdf8"); // Highlighted!
    expect(taipeiStyleWithColloquial.weight).toBe(2.5);

    const taichungStyleWithColloquial = getCountyPolygonStyle("臺中市", "台中市");
    expect(taichungStyleWithColloquial.color).toBe("#38bdf8");

    const tainanStyleWithColloquial = getCountyPolygonStyle("臺南市", "台南市");
    expect(tainanStyleWithColloquial.color).toBe("#38bdf8");

    const taitungStyleWithColloquial = getCountyPolygonStyle("臺東縣", "台東縣");
    expect(taitungStyleWithColloquial.color).toBe("#38bdf8");
  });

  it("Requirement 6: selectedRegion 只有對應 Polygon 使用 selected style (Only selected polygon uses highlight style)", () => {
    const selectedRegion = "臺北市";

    // Selected polygon style: accent color, 2.5 weight, 0.12 fill
    const selectedStyle = getCountyPolygonStyle("臺北市", selectedRegion);
    expect(selectedStyle.color).toBe("#38bdf8");
    expect(selectedStyle.weight).toBe(2.5);
    expect(selectedStyle.fillColor).toBe("#38bdf8");
    expect(selectedStyle.fillOpacity).toBe(0.12);

    // Unselected polygon style: slate-400 thin border (1px), subtle near-transparent fill
    const unselectedStyle = getCountyPolygonStyle("新北市", selectedRegion);
    expect(unselectedStyle.color).toBe("rgba(148, 163, 184, 0.45)");
    expect(unselectedStyle.weight).toBe(1);
    expect(unselectedStyle.fillOpacity).toBe(0.03);

    // Kaohsiung unselected
    const kaohsiungStyle = getCountyPolygonStyle("高雄市", selectedRegion);
    expect(kaohsiungStyle.weight).toBe(1);
    expect(kaohsiungStyle.color).not.toBe("#38bdf8");
  });

  it("Requirement 7 & 8: 地圖顯示校正後之精確免責說明 (Displays calibrated boundary disclaimer)", () => {
    render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
      />
    );

    const notice = screen.getByTestId("map-boundary-notice");
    expect(notice).toBeDefined();
    expect(notice.textContent).toContain(TAIWAN_MAP_BOUNDARY_DISCLAIMER);
    expect(notice.textContent).toContain("原始資料：內政部 2025-03-18 TWD97 經緯度縣市界線 (EPSG:3824)");
    expect(notice.textContent).toContain("Web 顯示資料：轉換為 WGS84 (EPSG:4326) 並經拓撲保留簡化");
    expect(notice.textContent).toContain("為避免 Web 地圖 fitBounds 視野過度縮放，顯示版未納入部分遠洋島礁");
    expect(notice.textContent).toContain("不作土地測量、法律界址或導航用途");
  });

  it("Requirement 8: 提供「聚焦所選縣市」控制並使用所選縣市完整 bounds 與 padding (Focus county button with full bounds)", () => {
    render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
      />
    );

    // Hint bar focus button
    const focusBtn = screen.getByTestId("map-focus-btn");
    expect(focusBtn).toBeDefined();
    // Hint bar focus button — text contains region name (emoji was replaced with SVG icon in M13.1)
    expect(focusBtn.textContent).toContain("聚焦臺北市");

    // Precomputed bounds for Taipei City exist and are valid WGS84 coordinates
    const taipeiBounds = getCountyBounds("臺北市");
    expect(taipeiBounds).toBeDefined();
    expect(taipeiBounds![0][0]).toBeLessThan(taipeiBounds![1][0]); // southLat < northLat
    expect(taipeiBounds![0][1]).toBeLessThan(taipeiBounds![1][1]); // westLon < eastLon
    expect(taipeiBounds![0][0]).toBeCloseTo(24.96, 1);
    expect(taipeiBounds![1][0]).toBeCloseTo(25.21, 1);
  });

  it("Requirement 9: 切換圖層不重設地圖或重新抓取 API (Switching layers preserves map without re-fetching API)", () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const onLayerChangeSpy = vi.fn();

    render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
        onLayerChange={onLayerChangeSpy}
      />
    );

    // Switch layer to Realtime Temp
    fireEvent.click(screen.getByTestId("layer-btn-realtime_temp"));
    expect(onLayerChangeSpy).toHaveBeenCalledWith("realtime_temp");

    // Switch layer to AQI
    fireEvent.click(screen.getByTestId("layer-btn-aqi"));
    expect(onLayerChangeSpy).toHaveBeenCalledWith("aqi");

    // No network fetch triggered by layer switcher
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("Requirement 10: 離島縣市（澎湖、金門、連江）皆可被選取與聚焦 (Offshore islands selectable and focusable)", () => {
    const offshoreCounties = ["澎湖縣", "金門縣", "連江縣"];

    for (const county of offshoreCounties) {
      // 1. Verify existence in GeoJSON
      const feature = TAIWAN_COUNTIES_GEOJSON.features.find(
        (f) => f.properties?.COUNTYNAME === county
      );
      expect(feature).toBeDefined();

      // 2. Verify selected styling
      const style = getCountyPolygonStyle(county, county);
      expect(style.color).toBe("#38bdf8");
      expect(style.weight).toBe(2.5);

      // 3. Verify bounds calculation
      const bounds = getCountyBounds(county);
      expect(bounds).toBeDefined();
      expect(bounds![0][0]).toBeLessThan(bounds![1][0]);
      expect(bounds![0][1]).toBeLessThan(bounds![1][1]);
    }

    // Verify Penghu bounds in Taiwan Strait
    expect(TAIWAN_COUNTY_BOUNDS["澎湖縣"][0][1]).toBeGreaterThan(119.0);
    expect(TAIWAN_COUNTY_BOUNDS["澎湖縣"][1][1]).toBeLessThan(120.0);

    // Verify Kinmen bounds near Fujian coast
    expect(TAIWAN_COUNTY_BOUNDS["金門縣"][0][1]).toBeGreaterThan(118.0);
    expect(TAIWAN_COUNTY_BOUNDS["金門縣"][1][1]).toBeLessThan(120.0);

    // Verify Lienchiang (Matsu) northern latitude
    expect(TAIWAN_COUNTY_BOUNDS["連江縣"][0][0]).toBeGreaterThan(25.8);
  });

  it("Requirement 11: Polygon 位於 overlayPane，不阻礙 Marker 點擊 (Polygon stays in overlayPane below markers)", () => {
    const taipeiStyle = getCountyPolygonStyle("臺北市", "臺北市");
    expect(taipeiStyle.pane).toBe("overlayPane");

    const newTaipeiStyle = getCountyPolygonStyle("新北市", "臺北市");
    expect(newTaipeiStyle.pane).toBe("overlayPane");
  });
});
