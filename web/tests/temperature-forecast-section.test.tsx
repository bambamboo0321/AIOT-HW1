// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TemperatureForecastSection } from "@/components/weather/TemperatureForecastSection";
import { TemperatureTrendChart } from "@/components/weather/TemperatureTrendChart";
import { DailyForecastGrid } from "@/components/weather/DailyForecastGrid";
import { ForecastDashboard } from "@/components/weather/ForecastDashboard";
import { LeafletMapInner } from "@/components/weather/LeafletMapInner";
import { DailyForecast } from "@/lib/transformations/daily";
import { EXPECTED_TAIWAN_REGIONS } from "@/lib/data/county-coordinates";
import { NormalizedForecastData } from "@/lib/contracts/weather";

// Mock next/dynamic for Leaflet
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

const mockDailyList: DailyForecast[] = [
  {
    forecastDate: "2026-09-24",
    minTemp: 22.5,
    maxTemp: 31.0,
    intervalCount: 2,
    isPartial: false,
    intervals: [],
  },
  {
    forecastDate: "2026-09-25",
    minTemp: 23.0,
    maxTemp: 32.5,
    intervalCount: 2,
    isPartial: false,
    intervals: [],
  },
  {
    forecastDate: "2026-09-26",
    minTemp: 21.0,
    maxTemp: 28.0,
    intervalCount: 1,
    isPartial: true,
    intervals: [],
  },
];

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
          minTemp: 22.5,
          maxTemp: 31.0,
        },
        {
          startTime: "2026-09-24T18:00:00+08:00",
          endTime: "2026-09-25T06:00:00+08:00",
          minTemp: 23.0,
          maxTemp: 32.5,
        },
      ],
    })),
  };
}

function createMockObservations() {
  return {
    datasetId: "O-A0003-001" as const,
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
        precipitationStatus: "normal" as const,
      },
    ],
  };
}

function createMockAirQuality() {
  return {
    datasetId: "AQX_P_432" as const,
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

function createMockAlerts() {
  return {
    datasetId: "W-C0033-002" as const,
    fetchedAt: "2026-09-24T12:00:00.000Z",
    alertCount: 0,
    alerts: [],
  };
}

describe("Milestone M13.1: Unified 7-Day Temperature Forecast Section", () => {
  it("Requirement 1 & 2: 初始顯示「趨勢圖」，且初始不顯示完整 DailyForecastGrid", () => {
    const { container } = render(
      <TemperatureForecastSection
        dailyList={mockDailyList}
        region="臺北市"
        startDate="2026-09-24"
        endDate="2026-09-26"
      />
    );

    // Section title & subtitle
    expect(screen.getByText("未來 7 日氣溫")).toBeDefined();
    expect(screen.getByTestId("temp-section-subtitle").textContent).toContain("臺北市・2026-09-24 至 2026-09-26");

    // Trend chart panel exists
    expect(screen.getByTestId("temp-tabpanel-chart")).toBeDefined();
    expect(container.querySelector(".trend-svg")).not.toBeNull();

    // Chart tab is selected
    const chartTab = screen.getByTestId("temp-view-tab-chart");
    expect(chartTab.getAttribute("aria-selected")).toBe("true");

    // Daily panel and grid do NOT exist initially
    expect(screen.queryByTestId("temp-tabpanel-daily")).toBeNull();
    expect(screen.queryByTestId("daily-forecast-grid")).toBeNull();
  });

  it("Requirement 3 & 4: 點擊「每日詳情」後顯示每日卡片，且不再顯示趨勢圖 SVG", () => {
    const { container } = render(
      <TemperatureForecastSection
        dailyList={mockDailyList}
        region="臺北市"
        startDate="2026-09-24"
        endDate="2026-09-26"
      />
    );

    const dailyTab = screen.getByTestId("temp-view-tab-daily");
    fireEvent.click(dailyTab);

    // Daily tab is now selected
    expect(dailyTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("temp-view-tab-chart").getAttribute("aria-selected")).toBe("false");

    // Daily panel and grid are now rendered
    expect(screen.getByTestId("temp-tabpanel-daily")).toBeDefined();
    expect(screen.getByTestId("daily-forecast-grid")).toBeDefined();

    // Check content of daily cards
    expect(screen.getByText("2026-09-24")).toBeDefined();
    expect(screen.getByText("2026-09-25")).toBeDefined();
    expect(screen.getByText("2026-09-26")).toBeDefined();
    expect(screen.getAllByText("完整預報")).toHaveLength(2);
    expect(screen.getByText("部分資料")).toBeDefined();
    expect(screen.getByText("22.5°C")).toBeDefined();
    expect(screen.getByText("31.0°C")).toBeDefined();

    // Trend chart SVG is completely unmounted
    expect(container.querySelector(".trend-svg")).toBeNull();
    expect(screen.queryByTestId("temp-tabpanel-chart")).toBeNull();
  });

  it("Requirement 5: 可從「每日詳情」切換回「趨勢圖」，且兩者絕不同時渲染", () => {
    const { container } = render(
      <TemperatureForecastSection
        dailyList={mockDailyList}
        region="臺北市"
      />
    );

    // Initial: chart only
    expect(container.querySelector(".trend-svg")).not.toBeNull();
    expect(screen.queryByTestId("daily-forecast-grid")).toBeNull();

    // Switch to daily: daily only
    fireEvent.click(screen.getByTestId("temp-view-tab-daily"));
    expect(container.querySelector(".trend-svg")).toBeNull();
    expect(screen.queryByTestId("daily-forecast-grid")).not.toBeNull();

    // Switch back to chart: chart only
    fireEvent.click(screen.getByTestId("temp-view-tab-chart"));
    expect(container.querySelector(".trend-svg")).not.toBeNull();
    expect(screen.queryByTestId("daily-forecast-grid")).toBeNull();
  });

  it("Requirement 6: aria-selected、role=tablist、role=tab、role=tabpanel 屬性與關聯完整", () => {
    render(
      <TemperatureForecastSection
        dailyList={mockDailyList}
        region="臺北市"
      />
    );

    // Tablist role
    const tablist = screen.getByRole("tablist", { name: "氣溫預報檢視模式" });
    expect(tablist).toBeDefined();

    const chartTab = screen.getByRole("tab", { name: /趨勢圖/i });
    const dailyTab = screen.getByRole("tab", { name: /每日詳情/i });

    expect(chartTab.getAttribute("aria-controls")).toBe("panel-temp-chart");
    expect(dailyTab.getAttribute("aria-controls")).toBe("panel-temp-daily");
    expect(chartTab.getAttribute("aria-selected")).toBe("true");
    expect(dailyTab.getAttribute("aria-selected")).toBe("false");

    const chartPanel = screen.getByRole("tabpanel");
    expect(chartPanel.id).toBe("panel-temp-chart");
    expect(chartPanel.getAttribute("aria-labelledby")).toBe("tab-temp-chart");
  });

  it("Requirement 7: 支援鍵盤方向鍵與 Home/End 導覽操作", () => {
    render(
      <TemperatureForecastSection
        dailyList={mockDailyList}
        region="臺北市"
      />
    );

    const chartTab = screen.getByTestId("temp-view-tab-chart");
    const dailyTab = screen.getByTestId("temp-view-tab-daily");

    // ArrowRight on chart tab switches to daily tab
    fireEvent.keyDown(chartTab, { key: "ArrowRight" });
    expect(dailyTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("temp-tabpanel-daily")).toBeDefined();

    // ArrowLeft on daily tab switches back to chart tab
    fireEvent.keyDown(dailyTab, { key: "ArrowLeft" });
    expect(chartTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("temp-tabpanel-chart")).toBeDefined();

    // End key switches to daily tab
    fireEvent.keyDown(chartTab, { key: "End" });
    expect(dailyTab.getAttribute("aria-selected")).toBe("true");

    // Home key switches to chart tab
    fireEvent.keyDown(dailyTab, { key: "Home" });
    expect(chartTab.getAttribute("aria-selected")).toBe("true");
  });

  it("Requirement 8 & 9: 在 ForecastDashboard 整合中切換檢視不觸發 API fetch，且 selectedRegion 與日期範圍不變", () => {
    const fetchSpy = vi.spyOn(global, "fetch");

    render(
      <ForecastDashboard
        initialData={createMockForecast()}
        initialObservations={createMockObservations()}
        initialAirQuality={createMockAirQuality()}
        initialAlerts={createMockAlerts()}
      />
    );

    // Initial render: default region is 臺北市
    const regionSelect = screen.getByLabelText("預報縣市") as HTMLSelectElement;
    expect(regionSelect.value).toBe("臺北市");

    // No API calls on mount with initialData
    expect(fetchSpy).not.toHaveBeenCalled();

    // Switch view to 每日詳情
    const dailyTab = screen.getByTestId("temp-view-tab-daily");
    fireEvent.click(dailyTab);

    // Verify daily cards rendered
    expect(screen.getByTestId("daily-forecast-grid")).toBeDefined();

    // Verify NO additional fetch was triggered
    expect(fetchSpy).not.toHaveBeenCalled();

    // Verify selectedRegion is unchanged
    expect(regionSelect.value).toBe("臺北市");

    // Switch back to 趨勢圖
    const chartTab = screen.getByTestId("temp-view-tab-chart");
    fireEvent.click(chartTab);
    expect(screen.getByTestId("temp-tabpanel-chart")).toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(regionSelect.value).toBe("臺北市");

    fetchSpy.mockRestore();
  });

  it("Requirement 10: 既有 TemperatureTrendChart 與 DailyForecastGrid 單獨渲染時未退化", () => {
    // Standalone TemperatureTrendChart has full chart-card and aria-label
    const { container: chartContainer } = render(
      <TemperatureTrendChart dailyList={mockDailyList} region="新竹市" />
    );
    const chartCard = chartContainer.querySelector(".chart-card");
    expect(chartCard).not.toBeNull();
    expect(chartCard!.getAttribute("aria-label")).toBe("氣溫趨勢圖");
    expect(chartContainer.querySelector(".trend-svg")).not.toBeNull();

    // Standalone DailyForecastGrid has full dashboard-card and aria-label
    const { container: gridContainer } = render(
      <DailyForecastGrid dailyList={mockDailyList} region="新竹市" />
    );
    const gridCard = gridContainer.querySelector("section.dashboard-card");
    expect(gridCard).not.toBeNull();
    expect(gridCard!.getAttribute("aria-label")).toBe("每日預報明細");
    expect(gridContainer.querySelectorAll(".daily-card")).toHaveLength(3);
  });
});
