// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import TaiwanWeatherMap from "@/components/weather/TaiwanWeatherMap";
import { LeafletMapInner } from "@/components/weather/LeafletMapInner";
import { MAP_LAYERS } from "@/lib/map/layer-config";
import {
  prepareUnifiedMapMarkers,
  getTemperatureColor,
  getHumidityColor,
  getWindColor,
  getPrecipitationColor,
  getPm25Color,
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

// Mock datasets for testing
const mockForecastData: NormalizedForecastData = {
  datasetId: "F-D0047-091",
  fetchedAt: "2026-09-24T05:30:00Z",
  regions: EXPECTED_TAIWAN_REGIONS.map((region, idx) => ({
    region,
    intervals: [
      {
        startTime: "2026-09-24T06:00:00+08:00",
        endTime: "2026-09-24T18:00:00+08:00",
        maxTemp: 28 + (idx % 8),
        minTemp: 22,
      },
      {
        startTime: "2026-09-25T06:00:00+08:00",
        endTime: "2026-09-25T18:00:00+08:00",
        maxTemp: 30,
        minTemp: 23,
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
        uvIndex: region === "花蓮縣" ? null : 1 + (idx % 11),
        level: region === "花蓮縣" ? "低量級" : idx % 2 === 0 ? "高量級" : "中量級",
        displayValue: region === "花蓮縣" ? "N/A" : String(1 + (idx % 11)),
        protectionAdvice: "一般防護",
        dataMeaning: "forecast_daytime",
      },
    ],
  })),
};

const mockObservationData: NormalizedObservationData = {
  datasetId: "O-A0003-001",
  fetchedAt: "2026-09-24T12:10:00Z",
  stations: [
    {
      stationId: "466920",
      stationName: "臺北",
      county: "臺北市",
      town: "中正區",
      latitude: 25.037,
      longitude: 121.514,
      elevation: 6.0,
      observedAt: "2026-09-24T12:00:00+08:00",
      temperature: 28.5,
      relativeHumidity: 75,
      windSpeed: 3.2,
      windDirection: 90,
      dailyPrecipitation: 12.5,
      precipitationStatus: "normal",
    },
    {
      stationId: "467410",
      stationName: "臺南",
      county: "臺南市",
      town: "中西區",
      latitude: 22.993,
      longitude: 120.203,
      elevation: 13.0,
      observedAt: "2026-09-24T12:00:00+08:00",
      temperature: 33.0,
      relativeHumidity: 45,
      windSpeed: 1.5,
      windDirection: 990, // 990: 風向不定
      dailyPrecipitation: null,
      precipitationStatus: "trace", // T 雨跡
    },
    {
      stationId: "C0X010",
      stationName: "西屯",
      county: "臺中市",
      town: "西屯區",
      latitude: 24.162,
      longitude: 120.647,
      elevation: 90.0,
      observedAt: "2026-09-24T12:00:00+08:00",
      temperature: 22.0,
      relativeHumidity: 90,
      windSpeed: 0.8,
      windDirection: 180,
      dailyPrecipitation: null,
      precipitationStatus: "none_6hr", // -98 無降水
    },
    {
      stationId: "C0X020",
      stationName: "旗津",
      county: "高雄市",
      town: "旗津區",
      latitude: 22.585,
      longitude: 120.283,
      elevation: 3.0,
      observedAt: "2026-09-24T12:00:00+08:00",
      temperature: null, // missing
      relativeHumidity: null,
      windSpeed: null,
      windDirection: null,
      dailyPrecipitation: null,
      precipitationStatus: "missing", // -99 缺測
    },
    {
      stationId: "C0X030",
      stationName: "壽豐",
      county: "花蓮縣",
      town: "壽豐鄉",
      latitude: 23.865,
      longitude: 121.505,
      elevation: 70.0,
      observedAt: "2026-09-24T12:00:00+08:00",
      temperature: 19.5,
      relativeHumidity: 60,
      windSpeed: 12.0,
      windDirection: 45,
      dailyPrecipitation: null,
      precipitationStatus: "fault", // X 儀器故障
    },
    {
      stationId: "467490",
      stationName: "恆春",
      county: "屏東縣",
      town: "恆春鎮",
      latitude: 22.004,
      longitude: 120.746,
      elevation: 22.0,
      observedAt: "2026-09-24T12:00:00+08:00",
      temperature: 31.0,
      relativeHumidity: 65,
      windSpeed: 4.5,
      windDirection: 45,
      dailyPrecipitation: 0.0,
      precipitationStatus: "normal", // 正常 0.0 mm
    },
  ],
};

const mockAirQualityData: NormalizedAirQualityData = {
  datasetId: "AQX_P_432",
  fetchedAt: "2026-09-24T12:05:00Z",
  countySummaries: {},
  stations: [
    {
      stationId: "1",
      stationName: "基隆",
      county: "基隆市",
      latitude: 25.129,
      longitude: 121.76,
      publishedAt: "2026-09-24 12:00",
      aqi: 35,
      status: "良好",
      primaryPollutant: null,
      pm25: 8,
      pm10: 20,
      ozone: 30,
      carbonMonoxide: 0.3,
      sulfurDioxide: 1.5,
      nitrogenDioxide: 10,
    },
    {
      stationId: "2",
      stationName: "萬華",
      county: "臺北市",
      latitude: 25.046,
      longitude: 121.507,
      publishedAt: "2026-09-24 12:00",
      aqi: 75,
      status: "普通",
      primaryPollutant: "細懸浮微粒",
      pm25: 22,
      pm10: 40,
      ozone: 40,
      carbonMonoxide: 0.5,
      sulfurDioxide: 2.0,
      nitrogenDioxide: 15,
    },
    {
      stationId: "3",
      stationName: "新莊",
      county: "新北市",
      latitude: 25.037,
      longitude: 121.451,
      publishedAt: "2026-09-24 12:00",
      aqi: 125,
      status: "對敏感族群不健康",
      primaryPollutant: "細懸浮微粒",
      pm25: 42,
      pm10: 60,
      ozone: 50,
      carbonMonoxide: 0.7,
      sulfurDioxide: 3.0,
      nitrogenDioxide: 25,
    },
    {
      stationId: "4",
      stationName: "彰化",
      county: "彰化縣",
      latitude: 24.075,
      longitude: 120.541,
      publishedAt: "2026-09-24 12:00",
      aqi: 165,
      status: "對所有族群不健康",
      primaryPollutant: "細懸浮微粒",
      pm25: 65,
      pm10: 90,
      ozone: 60,
      carbonMonoxide: 1.0,
      sulfurDioxide: 4.0,
      nitrogenDioxide: 30,
    },
    {
      stationId: "5",
      stationName: "安南",
      county: "臺南市",
      latitude: 23.048,
      longitude: 120.218,
      publishedAt: "2026-09-24 12:00",
      aqi: 220,
      status: "非常不健康",
      primaryPollutant: "細懸浮微粒",
      pm25: 120,
      pm10: 150,
      ozone: 70,
      carbonMonoxide: 1.5,
      sulfurDioxide: 5.0,
      nitrogenDioxide: 35,
    },
    {
      stationId: "6",
      stationName: "前鎮",
      county: "高雄市",
      latitude: 22.605,
      longitude: 120.312,
      publishedAt: "2026-09-24 12:00",
      aqi: 350,
      status: "危害",
      primaryPollutant: "細懸浮微粒",
      pm25: 280,
      pm10: 320,
      ozone: 85,
      carbonMonoxide: 2.2,
      sulfurDioxide: 8.0,
      nitrogenDioxide: 50,
    },
    {
      stationId: "7",
      stationName: "宜蘭缺測站",
      county: "宜蘭縣",
      latitude: 24.757,
      longitude: 121.756,
      publishedAt: "2026-09-24 12:00",
      aqi: null,
      status: "設備維護",
      primaryPollutant: null,
      pm25: null,
      pm10: null,
      ozone: null,
      carbonMonoxide: null,
      sulfurDioxide: null,
      nitrogenDioxide: null,
    },
    {
      stationId: "8",
      stationName: "無座標站",
      county: "澎湖縣",
      latitude: null, // should be filtered out
      longitude: null,
      publishedAt: "2026-09-24 12:00",
      aqi: 50,
      status: "良好",
      primaryPollutant: null,
      pm25: 10,
      pm10: 20,
      ozone: 25,
      carbonMonoxide: 0.2,
      sulfurDioxide: 1.0,
      nitrogenDioxide: 8,
    },
  ],
};

describe("Milestone M13 - Multi-layer Weather Map (多圖層互動氣象地圖)", () => {
  it("Requirement 1: Default layer is '預報最高溫' (forecast_max_temp)", () => {
    render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
      />
    );

    // Default button should be is-active and aria-selected=true
    const defaultBtn = screen.getByTestId("layer-btn-forecast_max_temp");
    expect(defaultBtn).toBeDefined();
    expect(defaultBtn.getAttribute("aria-selected")).toBe("true");
    expect(defaultBtn.classList.contains("is-active")).toBe(true);

    // Legend bar should display 氣溫圖例 and °C
    const legendBar = screen.getByTestId("map-legend-bar");
    expect(legendBar.textContent).toContain("氣溫圖例");
    expect(legendBar.textContent).toContain("°C");

    // Date selector must be visible for forecast layer
    const dateSelect = screen.getByLabelText("選擇預報日期");
    expect(dateSelect).toBeDefined();
  });

  it("Requirement 2: All 8 layers are switchable and have proper accessibility attributes", () => {
    const onLayerChange = vi.fn();
    render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        onLayerChange={onLayerChange}
        selectedRegion="臺北市"
      />
    );

    expect(MAP_LAYERS).toHaveLength(8);

    for (const layer of MAP_LAYERS) {
      const btn = screen.getByTestId(`layer-btn-${layer.id}`);
      expect(btn).toBeDefined();
      expect(btn.getAttribute("role")).toBe("tab");
      expect(btn.getAttribute("aria-label")).toBe(`切換至${layer.name}圖層`);

      fireEvent.click(btn);
      expect(btn.getAttribute("aria-selected")).toBe("true");
      expect(onLayerChange).toHaveBeenCalledWith(layer.id);
    }

    expect(onLayerChange).toHaveBeenCalledTimes(8);
  });

  it("Requirement 3: Switching layer synchronizes legend, unit, and marker content", () => {
    render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
      />
    );

    // Switch to Relative Humidity
    fireEvent.click(screen.getByTestId("layer-btn-relative_humidity"));
    let legendBar = screen.getByTestId("map-legend-bar");
    expect(legendBar.textContent).toContain("濕度圖例");
    expect(legendBar.textContent).toContain("%");

    // Switch to Wind
    fireEvent.click(screen.getByTestId("layer-btn-wind"));
    legendBar = screen.getByTestId("map-legend-bar");
    expect(legendBar.textContent).toContain("風速");
    expect(legendBar.textContent).toContain("m/s");

    // Switch to Daily Precipitation
    fireEvent.click(screen.getByTestId("layer-btn-daily_precipitation"));
    legendBar = screen.getByTestId("map-legend-bar");
    expect(legendBar.textContent).toContain("降水圖例");
    expect(legendBar.textContent).toContain("mm");
    expect(legendBar.textContent).toContain("無雨 (0.0 mm)");
    expect(legendBar.textContent).toContain("6h無雨 (-98)");
    expect(legendBar.textContent).toContain("雨跡 (T)");

    // Switch to AQI
    fireEvent.click(screen.getByTestId("layer-btn-aqi"));
    legendBar = screen.getByTestId("map-legend-bar");
    expect(legendBar.textContent).toContain("AQI 圖例");
    expect(legendBar.textContent).toContain("良好");
    expect(legendBar.textContent).toContain("危害");

    // Switch to PM2.5
    fireEvent.click(screen.getByTestId("layer-btn-pm25"));
    legendBar = screen.getByTestId("map-legend-bar");
    expect(legendBar.textContent).toContain("PM2.5 圖例");
    expect(legendBar.textContent).toContain("μg/m³");

    // Switch to UV
    fireEvent.click(screen.getByTestId("layer-btn-uv"));
    legendBar = screen.getByTestId("map-legend-bar");
    expect(legendBar.textContent).toContain("紫外線圖例");
    expect(legendBar.textContent).toContain("低量級");
  });

  it("Requirement 4 & 5: Forecast date only affects forecast layers; realtime layers show realtime note and ignore date picker", () => {
    render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
      />
    );

    // 1. Forecast Max Temp: date select exists
    expect(screen.queryByLabelText("選擇預報日期")).not.toBeNull();
    expect(screen.queryByTestId("map-realtime-note")).toBeNull();

    // 2. Switch to Realtime Temp (O-A0003-001): date select is replaced by realtime notice
    fireEvent.click(screen.getByTestId("layer-btn-realtime_temp"));
    expect(screen.queryByLabelText("選擇預報日期")).toBeNull();
    const realtimeNote = screen.getByTestId("map-realtime-note");
    expect(realtimeNote).toBeDefined();
    expect(realtimeNote.textContent).toContain("當前即時觀測");
    expect(realtimeNote.textContent).toContain("日期僅套用於預報圖層");

    // 3. Switch to AQI (AQX_P_432): date select is replaced by realtime notice
    fireEvent.click(screen.getByTestId("layer-btn-aqi"));
    expect(screen.queryByLabelText("選擇預報日期")).toBeNull();
    expect(screen.getByTestId("map-realtime-note")).toBeDefined();

    // 4. Switch to UV (F-D0047-091): date select reappears
    fireEvent.click(screen.getByTestId("layer-btn-uv"));
    expect(screen.getByLabelText("選擇預報日期")).toBeDefined();
    expect(screen.queryByTestId("map-realtime-note")).toBeNull();
  });

  it("Requirement 6: Clicking station marker popup button triggers onSelectRegion with correct region", () => {
    const onSelectRegion = vi.fn();
    const { container } = render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        onSelectRegion={onSelectRegion}
        selectedRegion="臺北市"
      />
    );

    // Switch to Realtime Temp layer (contains CWA stations)
    fireEvent.click(screen.getByTestId("layer-btn-realtime_temp"));

    // Click on the station marker for 臺南市 to open popup
    const markers = container.querySelectorAll(".custom-leaflet-marker");
    expect(markers.length).toBeGreaterThanOrEqual(2);
    const tainanMarker =
      Array.from(markers).find(
        (m) =>
          m.getAttribute("title")?.includes("臺南") ||
          m.getAttribute("aria-label")?.includes("臺南") ||
          m.textContent?.includes("臺南")
      ) ?? markers[1];
    fireEvent.click(tainanMarker);

    // Find the button to switch dashboard to 臺南市
    const switchBtn = screen.getByRole("button", { name: "切換主面板至臺南市 ↑" });
    expect(switchBtn).toBeDefined();

    fireEvent.click(switchBtn);
    expect(onSelectRegion).toHaveBeenCalledTimes(1);
    expect(onSelectRegion).toHaveBeenCalledWith("臺南市");
  });

  it("Requirement 7: Missing values are not disguised as 0 (shows '—' or '無資料' with gray badge)", () => {
    // 1. Missing CWA observation station (C0X020, 旗津, 高雄市)
    const markers = prepareUnifiedMapMarkers({
      layerId: "realtime_temp",
      mapDate: "2026-09-24",
      forecastData: mockForecastData,
      observationData: mockObservationData,
      airQualityData: mockAirQualityData,
    });

    const missingStation = markers.find((m) => m.stationId === "C0X020");
    expect(missingStation).toBeDefined();
    expect(missingStation!.badgeValue).toBe("—");
    expect(missingStation!.colorHex).toBe("#6b7280");
    expect(missingStation!.colorStyle.label).toBe("無資料");

    // 2. Missing AQI station (siteId 7, 宜蘭缺測站)
    const aqiMarkers = prepareUnifiedMapMarkers({
      layerId: "aqi",
      mapDate: "2026-09-24",
      forecastData: mockForecastData,
      observationData: mockObservationData,
      airQualityData: mockAirQualityData,
    });

    const missingAqi = aqiMarkers.find((m) => m.stationId === "7");
    expect(missingAqi).toBeDefined();
    expect(missingAqi!.badgeValue).toBe("—");
    expect(["#6b7280", "#94a3b8"]).toContain(missingAqi!.colorHex);
    expect(missingAqi!.colorStyle.label).toBe("無資料");

    // 3. Stations without coordinates are safely omitted
    expect(aqiMarkers.find((m) => m.stationId === "8")).toBeUndefined();
  });

  it("Requirement 8: Precipitation preserves special states (0.0, T, -98, -99, X) and clearly separates 0.0 from -98", () => {
    const markers = prepareUnifiedMapMarkers({
      layerId: "daily_precipitation",
      mapDate: "2026-09-24",
      forecastData: mockForecastData,
      observationData: mockObservationData,
      airQualityData: mockAirQualityData,
    });

    // 1. Measured 12.5mm (Taipei)
    const taipei = markers.find((m) => m.stationId === "466920")!;
    expect(taipei.badgeValue).toBe("12.5");
    expect(taipei.colorHex).toBe("#3b82f6"); // 10.0-39.9mm medium rain
    const taipeiRow = taipei.popupRows.find((r) => r.label.includes("當日降水量"))!;
    expect(taipeiRow.value).toBe("12.5 mm");

    // 2. Normal 0.0 mm (Hengchun: 正常數值 0.0)
    const hengchun = markers.find((m) => m.stationId === "467490")!;
    expect(hengchun.badgeValue).toBe("0");
    expect(hengchun.colorHex).toBe("#94a3b8"); // slate-400
    expect(hengchun.colorStyle.label).toBe("無雨 (0.0 mm)");
    const hengchunRow = hengchun.popupRows.find((r) => r.label.includes("當日降水量"))!;
    expect(hengchunRow.value).toBe("0.0 mm");
    const hengchunDesc = hengchun.popupRows.find((r) => r.label.includes("狀態說明"))!;
    expect(hengchunDesc.value).toBe("今日 00:00 至今尚無降水");

    // 3. None (-98 / none_6hr: 連續 6 小時無降水)
    const xitun = markers.find((m) => m.stationId === "C0X010")!;
    expect(xitun.badgeValue).toBe("6h無雨");
    expect(xitun.colorHex).toBe("#64748b"); // slate-500
    expect(xitun.colorStyle.label).toBe("6h無雨 (-98)");
    const xitunRow = xitun.popupRows.find((r) => r.label.includes("當日降水量"))!;
    expect(xitunRow.value).toBe("連續 6 小時無降水");
    const xitunDesc = xitun.popupRows.find((r) => r.label.includes("狀態說明"))!;
    expect(xitunDesc.value).toBe("過去連續 6 小時未有降雨記錄");

    // Explicit check: 0.0 and -98 MUST NOT be merged or have identical semantics
    expect(hengchun.badgeValue).not.toBe(xitun.badgeValue);
    expect(hengchun.colorHex).not.toBe(xitun.colorHex);
    expect(hengchun.colorStyle.label).not.toBe(xitun.colorStyle.label);
    expect(hengchunRow.value).not.toBe(xitunRow.value);
    expect(hengchunDesc.value).not.toBe(xitunDesc.value);

    // 4. Trace (T 雨跡: 微量降水)
    const tainan = markers.find((m) => m.stationId === "467410")!;
    expect(tainan.badgeValue).toBe("雨跡");
    expect(tainan.colorHex).toBe("#38bdf8"); // trace
    expect(tainan.colorStyle.label).toBe("雨跡 (T)");
    const tainanRow = tainan.popupRows.find((r) => r.label.includes("當日降水量"))!;
    expect(tainanRow.value).toBe("雨跡（未達 0.1 mm）");
    const tainanDesc = tainan.popupRows.find((r) => r.label.includes("狀態說明"))!;
    expect(tainanDesc.value).toContain("微量降水");

    // 5. Missing (-99 / missing: 缺測)
    const qijin = markers.find((m) => m.stationId === "C0X020")!;
    expect(qijin.badgeValue).toBe("缺測");
    expect(qijin.colorHex).toBe("#6b7280"); // gray
    expect(qijin.colorStyle.label).toBe("缺測");
    const qijinRow = qijin.popupRows.find((r) => r.label.includes("當日降水量"))!;
    expect(qijinRow.value).toBe("缺測");
    const qijinDesc = qijin.popupRows.find((r) => r.label.includes("狀態說明"))!;
    expect(qijinDesc.value).toBe("測站缺測或未設置雨量計");

    // 6. Fault (X / fault: 故障)
    const shoufeng = markers.find((m) => m.stationId === "C0X030")!;
    expect(shoufeng.badgeValue).toBe("故障");
    expect(shoufeng.colorHex).toBe("#6b7280"); // gray
    expect(shoufeng.colorStyle.label).toBe("故障");
    const shoufengRow = shoufeng.popupRows.find((r) => r.label.includes("當日降水量"))!;
    expect(shoufengRow.value).toBe("故障");
    const shoufengDesc = shoufeng.popupRows.find((r) => r.label.includes("狀態說明"))!;
    expect(shoufengDesc.value).toBe("測站雨量感應器故障");
  });

  it("Requirement 9: Wind direction 990 displays '風向不定' and does not disguise null speed as 0", () => {
    const markers = prepareUnifiedMapMarkers({
      layerId: "wind",
      mapDate: "2026-09-24",
      forecastData: mockForecastData,
      observationData: mockObservationData,
      airQualityData: mockAirQualityData,
    });

    // Station 467410 has windDirection: 990, windSpeed: 1.5
    const tainan = markers.find((m) => m.stationId === "467410")!;
    expect(tainan.badgeValue).toBe("1.5");
    const dirRow = tainan.popupRows.find((r) => r.label.includes("風向"))!;
    expect(dirRow.value).toContain("風向不定");

    // Station C0X020 has null windSpeed & direction
    const qijin = markers.find((m) => m.stationId === "C0X020")!;
    expect(qijin.badgeValue).toBe("—");
    expect(qijin.colorHex).toBe("#6b7280");
    const speedRow = qijin.popupRows.find((r) => r.label.includes("風速"))!;
    expect(speedRow.value).toBe("無資料");
  });

  it("Requirement 10: Pure functions correctly classify AQI 6 tiers and UV 5 tiers boundaries", () => {
    // AQI 6 Tiers
    const aqiMarkers = prepareUnifiedMapMarkers({
      layerId: "aqi",
      mapDate: "2026-09-24",
      forecastData: mockForecastData,
      observationData: mockObservationData,
      airQualityData: mockAirQualityData,
    });

    const m1 = aqiMarkers.find((m) => m.stationId === "1")!;
    expect(m1.colorStyle.label).toBe("良好");
    expect(m1.colorHex).toBe("#10b981");

    const m2 = aqiMarkers.find((m) => m.stationId === "2")!;
    expect(m2.colorStyle.label).toBe("普通");
    expect(m2.colorHex).toBe("#eab308");

    const m3 = aqiMarkers.find((m) => m.stationId === "3")!;
    expect(m3.colorStyle.label).toBe("對敏感族群不健康");
    expect(m3.colorHex).toBe("#f97316");

    const m4 = aqiMarkers.find((m) => m.stationId === "4")!;
    expect(m4.colorStyle.label).toBe("對所有族群不健康");
    expect(m4.colorHex).toBe("#ef4444");

    const m5 = aqiMarkers.find((m) => m.stationId === "5")!;
    expect(m5.colorStyle.label).toBe("非常不健康");
    expect(m5.colorHex).toBe("#a855f7");

    const m6 = aqiMarkers.find((m) => m.stationId === "6")!;
    expect(m6.colorStyle.label).toBe("危害");
    expect(m6.colorHex).toBe("#b91c1c");

    // UV 5 Tiers in layer-helpers
    const uvMarkers = prepareUnifiedMapMarkers({
      layerId: "uv",
      mapDate: "2026-09-24",
      forecastData: mockForecastData,
      observationData: mockObservationData,
      airQualityData: mockAirQualityData,
    });

    // UV values must map to one of the 5 official levels or missing
    for (const m of uvMarkers) {
      expect([
        "低量級",
        "中量級",
        "高量級",
        "過量級",
        "危險級",
        "無資料",
      ]).toContain(m.colorStyle.label);
    }
  });

  it("Requirement 11: Switching layers is pure client-side transformation and does not fetch APIs", () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
      />
    );

    // Switch across all 8 layers
    for (const layer of MAP_LAYERS) {
      fireEvent.click(screen.getByTestId(`layer-btn-${layer.id}`));
    }

    // Zero API fetch calls
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("Requirement 12: Contextual footer note clearly distinguishes county forecast, CWA station, and MOENV station", () => {
    render(
      <TaiwanWeatherMap
        data={mockForecastData}
        observationData={mockObservationData}
        airQualityData={mockAirQualityData}
        selectedRegion="臺北市"
      />
    );

    // 1. Forecast layer footer note
    let footerNote = screen.getByTestId("map-footer-note");
    expect(footerNote.textContent).toContain("行政座標");

    // 2. CWA obs layer footer note
    fireEvent.click(screen.getByTestId("layer-btn-realtime_temp"));
    footerNote = screen.getByTestId("map-footer-note");
    expect(footerNote.textContent).toContain("交通部中央氣象署綜觀氣象觀測站");

    // 3. MOENV layer footer note
    fireEvent.click(screen.getByTestId("layer-btn-aqi"));
    footerNote = screen.getByTestId("map-footer-note");
    expect(footerNote.textContent).toContain("環境部空氣品質即時監測站");
  });

  it("Requirement 13: Pure helper color classifications handle edge cases properly", () => {
    // Temperature: null, freezing, cold, moderate, hot, very_hot
    expect(getTemperatureColor(null).label).toBe("無資料");
    expect(getTemperatureColor(32).label).toBe("炎熱 (≥30°C)");
    expect(getTemperatureColor(26).label).toBe("偏熱 (25-29°C)");
    expect(getTemperatureColor(22).label).toBe("舒適 (20-24°C)");
    expect(getTemperatureColor(15).label).toBe("偏涼 (<20°C)");

    // Humidity: null, dry, moderate, humid, saturated
    expect(getHumidityColor(null).label).toBe("無資料");
    expect(getHumidityColor(40).label).toBe("乾燥 (<50%)");
    expect(getHumidityColor(60).label).toBe("舒適 (50-69%)");
    expect(getHumidityColor(75).label).toBe("潮濕 (70-84%)");
    expect(getHumidityColor(92).label).toBe("極潮濕 (≥85%)");

    // Wind speed: null, calm, gentle, moderate, strong, gale
    expect(getWindColor(null).label).toBe("無資料");
    expect(getWindColor(0.2).label).toBe("微風 (<1.6 m/s)");
    expect(getWindColor(1.0).label).toBe("微風 (<1.6 m/s)");
    expect(getWindColor(4.0).label).toBe("和緩 (1.6-5.4 m/s)");
    expect(getWindColor(8.0).label).toBe("清勁 (5.5-10.7 m/s)");
    expect(getWindColor(15.0).label).toBe("強風 (≥10.8 m/s)");

    // Precipitation: null status, 0, light, moderate, heavy, torrent, special codes
    expect(getPrecipitationColor(null, "missing").label).toBe("缺測");
    expect(getPrecipitationColor(null, "fault").label).toBe("故障");
    expect(getPrecipitationColor(null, "none_6hr").label).toBe("6h無雨 (-98)");
    expect(getPrecipitationColor(null, "trace").label).toBe("雨跡 (T)");
    expect(getPrecipitationColor(0, "normal").label).toBe("無雨 (0.0 mm)");
    expect(getPrecipitationColor(5, "normal").label).toBe("小雨 (0.1-9.9 mm)");
    expect(getPrecipitationColor(25, "normal").label).toBe("中雨 (10.0-39.9 mm)");
    expect(getPrecipitationColor(60, "normal").label).toBe("大雨以上 (≥40.0 mm)");

    // PM2.5: null, low, moderate, unhealthy_sensitive, unhealthy, very_unhealthy, hazardous
    expect(getPm25Color(null).label).toBe("無資料");
    expect(getPm25Color(10).label).toBe("低 (≤15.4 μg/m³)");
    expect(getPm25Color(25).label).toBe("中 (15.5-35.4 μg/m³)");
    expect(getPm25Color(45).label).toBe("高 (35.5-54.4 μg/m³)");
    expect(getPm25Color(65).label).toBe("非常高 (≥54.5 μg/m³)");
  });
});
