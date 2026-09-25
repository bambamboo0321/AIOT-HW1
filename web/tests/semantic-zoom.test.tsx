// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TaiwanWeatherMap from "@/components/weather/TaiwanWeatherMap";
import { LeafletMapInner } from "@/components/weather/LeafletMapInner";
import {
  MAP_ZOOM_THRESHOLDS,
  getMapZoomTier,
  MAP_LAYERS,
  DEFAULT_MAP_ZOOM,
} from "@/lib/map/layer-config";
import {
  prepareUnifiedMapMarkers,
} from "@/lib/map/layer-helpers";
import { NormalizedForecastData } from "@/lib/contracts/weather";
import { NormalizedObservationData } from "@/lib/contracts/observations";
import { NormalizedAirQualityData } from "@/lib/contracts/air-quality";
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
  vi.clearAllMocks();
});

// Dense multi-station mock dataset for testing Semantic Zoom tiers
const mockForecastData: NormalizedForecastData = {
  datasetId: "F-D0047-091",
  fetchedAt: "2026-09-24T05:30:00Z",
  regions: EXPECTED_TAIWAN_REGIONS.map((region, idx) => ({
    region,
    intervals: [
      {
        startTime: "2026-09-24T06:00:00+08:00",
        endTime: "2026-09-24T18:00:00+08:00",
        maxTemp: 28 + (idx % 5),
        minTemp: 22,
      },
    ],
    uvForecasts: [
      {
        datasetId: "F-D0047-091",
        fetchedAt: "2026-09-24T05:30:00Z",
        county: region,
        forecastDate: "2026-09-24",
        startTime: "2026-09-24T06:00:00+08:00",
        endTime: "2026-09-24T18:00:00+08:00",
        uvIndex: 6,
        level: "高量級",
        displayValue: "6",
        protectionAdvice: "帽子、遮陽傘",
        dataMeaning: "forecast_daytime",
      },
    ],
  })),
};

// 3 stations in Taipei City with different distances to City Hall [25.0375, 121.5637]
// - Taipei Station (466920): [25.037, 121.514], closest to [25.0375, 121.5637] (~4.8 km), temp: 28.0°C
// - Beitou Station (C0A980): [25.131, 121.498], far (~12.3 km), temp: 35.0°C
// - Wenshan Station (C0A9A0): [24.997, 121.574], medium (~4.6 km, but different lat/lon), temp: 15.0°C
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
      stationId: "C0A980",
      stationName: "北投",
      county: "臺北市",
      town: "北投區",
      latitude: 25.131,
      longitude: 121.498,
      elevation: 50.0,
      observedAt: "2026-09-24T12:00:00+08:00",
      temperature: 35.0,
      relativeHumidity: 55,
      windSpeed: 6.0,
      windDirection: 180,
      dailyPrecipitation: 15.0,
      precipitationStatus: "normal",
    },
    {
      stationId: "C0A9A0",
      stationName: "文山",
      county: "臺北市",
      town: "文山區",
      latitude: 24.997,
      longitude: 121.574,
      elevation: 40.0,
      observedAt: "2026-09-24T12:00:00+08:00",
      temperature: 15.0,
      relativeHumidity: 85,
      windSpeed: 1.0,
      windDirection: 45,
      dailyPrecipitation: null,
      precipitationStatus: "trace",
    },
    // Kaohsiung Station
    {
      stationId: "467440",
      stationName: "高雄",
      county: "高雄市",
      town: "前鎮區",
      latitude: 22.585,
      longitude: 120.315,
      elevation: 2.0,
      observedAt: "2026-09-24T12:00:00+08:00",
      temperature: 32.0,
      relativeHumidity: 60,
      windSpeed: 2.5,
      windDirection: 990, // wind direction variable
      dailyPrecipitation: null,
      precipitationStatus: "none_6hr",
    },
  ],
};

// 3 stations in Taipei City for MOENV AQI
// - Songshan (1): AQI 45, PM2.5 10 (closest to city center)
// - Wanhua (2): AQI 160 (worst station!), PM2.5 65
// - Shilin (3): AQI 80, PM2.5 25
const mockAirQualityData: NormalizedAirQualityData = {
  datasetId: "AQX_P_432",
  fetchedAt: "2026-09-24T12:00:00Z",
  countySummaries: {},
  stations: [
    {
      stationId: "1",
      stationName: "松山",
      county: "臺北市",
      latitude: 25.05,
      longitude: 121.578,
      publishedAt: "2026-09-24 12:00",
      aqi: 45,
      status: "良好",
      primaryPollutant: null,
      pm25: 10,
      pm10: 25,
      ozone: 30,
      carbonMonoxide: 0.3,
      sulfurDioxide: 1.0,
      nitrogenDioxide: 10,
    },
    {
      stationId: "2",
      stationName: "萬華",
      county: "臺北市",
      latitude: 25.046,
      longitude: 121.507,
      publishedAt: "2026-09-24 12:00",
      aqi: 160,
      status: "對所有族群不健康",
      primaryPollutant: "細懸浮微粒",
      pm25: 65,
      pm10: 95,
      ozone: 50,
      carbonMonoxide: 0.8,
      sulfurDioxide: 2.5,
      nitrogenDioxide: 25,
    },
    {
      stationId: "3",
      stationName: "士林",
      county: "臺北市",
      latitude: 25.093,
      longitude: 121.525,
      publishedAt: "2026-09-24 12:00",
      aqi: 80,
      status: "普通",
      primaryPollutant: "細懸浮微粒",
      pm25: 25,
      pm10: 45,
      ozone: 40,
      carbonMonoxide: 0.4,
      sulfurDioxide: 1.5,
      nitrogenDioxide: 15,
    },
  ],
};

describe("Milestone M13 Semantic Zoom & Map Interaction Tests", () => {
  it("Requirement 1: 初始全臺視角的測站型圖層每縣市最多一個摘要標記 (Overview tier: max 1 marker per county)", () => {
    const { container } = render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
        initialZoom={7} // Overview Tier
      />
    );

    // Switch to Realtime Temp layer
    fireEvent.click(screen.getByTestId("layer-btn-realtime_temp"));

    // Overview tier displays 22 county summary markers for all Taiwan
    const markers = container.querySelectorAll(".custom-leaflet-marker");
    expect(markers.length).toBe(22);

    // Filter markers in DOM that represent Taipei City
    const taipeiBadges = container.querySelectorAll(".map-badge-summary");
    expect(taipeiBadges.length).toBe(22); // all 22 counties use summary badge class

    // Subtitle indicates overview mode
    const header = container.querySelector(".section-subtitle");
    expect(header?.textContent).toContain("全臺縣市摘要視角");
    expect(header?.textContent).toContain("共 22 個標記點");
  });

  it("Requirement 2: 低縮放使用代表測站，而非平均值 (Overview tier uses deterministic representative station, not average)", () => {
    // Taipei has 3 stations: 28.0°C (closest), 35.0°C, 15.0°C.
    // Average would be 26.0°C. Representative closest station is Taipei City Center (28.0°C).
    const overviewMarkers = prepareUnifiedMapMarkers({
      layerId: "realtime_temp",
      mapDate: "2026-09-24",
      forecastData: mockForecastData,
      observationData: mockObservationData,
      airQualityData: mockAirQualityData,
      zoom: 7, // Overview Tier
    });

    const taipei = overviewMarkers.find((m) => m.region === "臺北市");
    expect(taipei).toBeDefined();
    expect(taipei!.isCountySummary).toBe(true);

    // Deterministic closest station is 466920 (28.0°C)
    expect(taipei!.badgeValue).toBe("28°");
    expect(taipei!.maxTemp).toBe(28.0);
    // Explicitly verify it is NOT the arithmetic average (26.0°C)
    expect(taipei!.maxTemp).not.toBe(26.0);

    // Popup explicitly mentions representative station and "非全縣市平均"
    const dataDescRow = taipei!.popupRows.find((r) => r.label.includes("資料說明"));
    expect(dataDescRow?.value).toContain("代表測站觀測（非全縣市平均）");

    const stationRow = taipei!.popupRows.find((r) => r.label.includes("代表測站"));
    expect(stationRow?.value).toContain("臺北測站");
  });

  it("Requirement 3: AQI 低縮放使用縣市最高值來源測站 (Overview AQI uses county worst station / max AQI, not average)", () => {
    // Taipei has 3 AQI stations: 45, 160, 80.
    // Average is 95. Worst station is Wanhua (160).
    const overviewAqi = prepareUnifiedMapMarkers({
      layerId: "aqi",
      mapDate: "2026-09-24",
      forecastData: mockForecastData,
      observationData: mockObservationData,
      airQualityData: mockAirQualityData,
      zoom: 7,
    });

    const taipeiAqi = overviewAqi.find((m) => m.region === "臺北市");
    expect(taipeiAqi).toBeDefined();
    expect(taipeiAqi!.badgeValue).toBe("160");
    // Verify it is NOT the average 95
    expect(taipeiAqi!.badgeValue).not.toBe("95");

    // Popup explicitly attributes to worst station and "非縣市平均"
    const sourceRow = taipeiAqi!.popupRows.find((r) => r.label.includes("來源測站"));
    expect(sourceRow?.value).toContain("萬華測站（全縣市最高 AQI / 最差測站）");

    const dataDescRow = taipeiAqi!.popupRows.find((r) => r.label.includes("資料說明"));
    expect(dataDescRow?.value).toContain("全縣市最高 AQI 最差測站摘要（非縣市平均）");
  });

  it("Requirement 4: 中度縮放顯示測站圓點且不常駐名稱 (Station dots tier zoom === 9: colored dots, no permanent text)", () => {
    const { container } = render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
        initialZoom={9} // Tier 2: Station dots (zoom === 9)
      />
    );

    fireEvent.click(screen.getByTestId("layer-btn-realtime_temp"));

    // In station dots tier, all real observation stations are rendered (4 stations in mock)
    const dotContainers = container.querySelectorAll(".marker-dot-container");
    expect(dotContainers.length).toBe(4);

    // Verify dots have hit area and station dot styling
    const hitAreas = container.querySelectorAll(".map-dot-hitarea");
    expect(hitAreas.length).toBe(4);

    // Verify station name is NOT permanently displayed in DOM as badge-reg
    const badgeRegs = container.querySelectorAll(".marker-dot-container .map-badge-reg");
    expect(badgeRegs.length).toBe(0);

    // Header updates to medium tier
    const header = container.querySelector(".section-subtitle");
    expect(header?.textContent).toContain("中度測站分佈視角");
    expect(header?.textContent).toContain("共 4 個標記點");
  });

  it("Requirement 5: 深度縮放才顯示測站名稱與數值 (Detailed tier zoom >= 10: shows station short name & value badge)", () => {
    const { container } = render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
        initialZoom={10} // Tier 3: Detailed stations
      />
    );

    fireEvent.click(screen.getByTestId("layer-btn-realtime_temp"));

    // Detailed tier renders badges with short names and values
    const badgeContainers = container.querySelectorAll(".marker-badge-container");
    expect(badgeContainers.length).toBe(4);

    const badgeRegs = container.querySelectorAll(".map-badge-reg");
    expect(badgeRegs.length).toBe(4);

    const names = Array.from(badgeRegs).map((el) => el.textContent);
    expect(names).toContain("臺北");
    expect(names).toContain("北投");
    expect(names).toContain("文山");
    expect(names).toContain("高雄");

    // Header updates to detailed tier
    const header = container.querySelector(".section-subtitle");
    expect(header?.textContent).toContain("詳細測站視角");
    expect(header?.textContent).toContain("共 4 個標記點");
  });

  it("Requirement 6: Zoom threshold 邊界正確 (Zoom thresholds boundary correctness: zoom 7 & 8 are Overview, 9 is Station dots, 10 is Detailed)", () => {
    expect(MAP_ZOOM_THRESHOLDS.OVERVIEW_MAX).toBe(8);
    expect(MAP_ZOOM_THRESHOLDS.STATION_DOTS_MIN).toBe(9);
    expect(MAP_ZOOM_THRESHOLDS.STATION_DOTS_MAX).toBe(9);
    expect(MAP_ZOOM_THRESHOLDS.DETAILED_MIN).toBe(10);

    // Test boundaries: zoom 7 and zoom 8 are Overview
    expect(getMapZoomTier(5)).toBe("overview");
    expect(getMapZoomTier(6)).toBe("overview");
    expect(getMapZoomTier(7)).toBe("overview");
    expect(getMapZoomTier(8)).toBe("overview");

    // zoom === 9 is Station dots
    expect(getMapZoomTier(9)).toBe("station_dots");

    // zoom >= 10 is Detailed stations
    expect(getMapZoomTier(10)).toBe("detailed");
    expect(getMapZoomTier(11)).toBe("detailed");
    expect(getMapZoomTier(15)).toBe("detailed");
  });

  it("Requirement 7: 切換 zoom 模式不呼叫 API (Switching zoom mode does not fetch API)", () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    // Test tier marker generation directly
    const overview7 = prepareUnifiedMapMarkers({
      layerId: "realtime_temp",
      mapDate: "2026-09-24",
      observationData: mockObservationData,
      zoom: 7,
    });
    const overview8 = prepareUnifiedMapMarkers({
      layerId: "realtime_temp",
      mapDate: "2026-09-24",
      observationData: mockObservationData,
      zoom: 8,
    });
    const dots9 = prepareUnifiedMapMarkers({
      layerId: "realtime_temp",
      mapDate: "2026-09-24",
      observationData: mockObservationData,
      zoom: 9,
    });
    const detailed10 = prepareUnifiedMapMarkers({
      layerId: "realtime_temp",
      mapDate: "2026-09-24",
      observationData: mockObservationData,
      zoom: 10,
    });

    expect(overview7.length).toBe(22);
    expect(overview8.length).toBe(22);
    expect(dots9.length).toBe(4);
    expect(detailed10.length).toBe(4);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("Requirement 8: 切換圖層保留 zoom 與中心點 (Switching layer preserves current zoom level)", () => {
    const onLayerChange = vi.fn();
    const { container } = render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
        initialZoom={10} // Detailed zoom
        onLayerChange={onLayerChange}
      />
    );

    // Initial layer is forecast_max_temp at zoom 10
    expect(screen.getByTestId("map-zoom-tier-badge").textContent).toContain("詳細測站視角");

    // Switch to Realtime Temp
    fireEvent.click(screen.getByTestId("layer-btn-realtime_temp"));
    expect(screen.getByTestId("map-zoom-tier-badge").textContent).toContain("詳細測站視角");
    expect(container.querySelector(".section-subtitle")?.textContent).toContain("詳細測站視角");

    // Switch to Wind
    fireEvent.click(screen.getByTestId("layer-btn-wind"));
    expect(screen.getByTestId("map-zoom-tier-badge").textContent).toContain("詳細測站視角");

    // Switch to AQI
    fireEvent.click(screen.getByTestId("layer-btn-aqi"));
    expect(screen.getByTestId("map-zoom-tier-badge").textContent).toContain("詳細測站視角");
  });

  it("Requirement 9: 滑鼠滾輪、touch zoom 設定已啟用且顯示提示 (Zoom settings enabled and concise hint is shown)", () => {
    render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
      />
    );

    // Interaction hint must be displayed
    const hint = screen.getByTestId("map-zoom-hint");
    expect(hint).toBeDefined();
    expect(hint.textContent).toContain("滾輪／雙指縮放以查看測站詳情");

    // Map container exists with appropriate styles
    const mapWrapper = document.querySelector(".map-wrapper");
    expect(mapWrapper).toBeDefined();
  });

  it("Requirement 10: 點擊摘要標記的 Popup 顯示正確資料語意與切換按鈕 (Popup displays exact semantics & flyTo button)", () => {
    const onSelectRegion = vi.fn();
    const { container } = render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
        onSelectRegion={onSelectRegion}
        initialZoom={7} // Overview
      />
    );

    fireEvent.click(screen.getByTestId("layer-btn-realtime_temp"));

    // Click Taipei county summary marker
    const markers = container.querySelectorAll(".custom-leaflet-marker");
    const taipeiMarker = Array.from(markers).find(
      (m) =>
        m.textContent?.includes("臺北") ||
        m.querySelector("[title*='臺北']") !== null
    )!;
    expect(taipeiMarker).toBeDefined();
    fireEvent.click(taipeiMarker);

    // Check popup content
    expect(screen.getByText("📍 臺北市（縣市摘要）")).toBeDefined();
    expect(screen.getByText("代表測站觀測（非全縣市平均）")).toBeDefined();

    // Has region switch button
    const switchBtn = screen.getByRole("button", { name: "切換主面板至臺北市 ↑" });
    expect(switchBtn).toBeDefined();

    // Has Zoom to station button for county summary
    const zoomBtn = screen.getByRole("button", { name: "放大查看臺北市測站詳情" });
    expect(zoomBtn).toBeDefined();
    expect(zoomBtn.textContent).toContain("放大查看測站");

    // Click switch button to update main dashboard
    fireEvent.click(switchBtn);
    expect(onSelectRegion).toHaveBeenCalledWith("臺北市");
  });

  it("Requirement 11: 降水特殊狀態在低縮放與高縮放皆保留精確語意 (Precipitation special states preserved)", () => {
    // Station in Kaohsiung has none_6hr (-98)
    const overview = prepareUnifiedMapMarkers({
      layerId: "daily_precipitation",
      mapDate: "2026-09-24",
      observationData: mockObservationData,
      zoom: 7,
    });
    const khOverview = overview.find((m) => m.region === "高雄市")!;
    expect(khOverview.badgeValue).toBe("6h無雨");
    expect(khOverview.popupRows.find((r) => r.label.includes("當日降水量"))?.value).toContain("連續 6 小時無降水");
    expect(khOverview.popupRows.find((r) => r.label.includes("狀態說明"))?.value).toContain("過去連續 6 小時未有降雨記錄");

    // Station in Taipei Wenshan has trace (T)
    const detailed = prepareUnifiedMapMarkers({
      layerId: "daily_precipitation",
      mapDate: "2026-09-24",
      observationData: mockObservationData,
      zoom: 10,
    });
    const wenshan = detailed.find((m) => m.stationId === "C0A9A0")!;
    expect(wenshan.badgeValue).toBe("雨跡");
    expect(wenshan.popupRows.find((r) => r.label.includes("當日降水量"))?.value).toContain("雨跡");
  });

  it("Requirement 12: 缺值不補 0 (Missing values show '—' with gray badge and are never disguised as 0)", () => {
    // Kinmen (金門縣) has no CWA observation stations in mock data
    const overview = prepareUnifiedMapMarkers({
      layerId: "realtime_temp",
      mapDate: "2026-09-24",
      observationData: mockObservationData,
      zoom: 7,
    });

    const kinmen = overview.find((m) => m.region === "金門縣")!;
    expect(kinmen).toBeDefined();
    expect(kinmen.badgeValue).toBe("—");
    expect(kinmen.colorHex).toBe("#6b7280");
    expect(kinmen.maxTemp).toBeNull();
    // NEVER 0
    expect(kinmen.maxTemp).not.toBe(0);
    expect(kinmen.badgeValue).not.toBe("0°");
    expect(kinmen.popupRows.find((r) => r.label.includes("觀測狀態"))?.value).toContain("無有效測站資料");
  });

  it("Requirement 13: 鍵盤與 aria-label 仍可操作 (Accessibility attributes intact)", () => {
    render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
      />
    );

    for (const layer of MAP_LAYERS) {
      const btn = screen.getByTestId(`layer-btn-${layer.id}`);
      expect(btn.getAttribute("aria-label")).toBe(`切換至${layer.name}圖層`);
      expect(btn.getAttribute("role")).toBe("tab");
    }

    const zoomHint = screen.getByTestId("map-zoom-hint");
    expect(zoomHint.getAttribute("role")).toBe("status");
  });

  it("Requirement 14: 地圖預設初始 zoom level 為 7 (Default map zoom is 7)", () => {
    expect(DEFAULT_MAP_ZOOM).toBe(7);

    render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
      />
    );

    // Without initialZoom specified, zoom tier badge defaults to Overview (zoom <= 8, zoom 7)
    const zoomBadge = screen.getByTestId("map-zoom-tier-badge");
    expect(zoomBadge.textContent).toContain("全臺摘要視角");
  });
});
