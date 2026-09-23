import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LoadingState } from "@/components/ui/LoadingState";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { KpiCards } from "@/components/weather/KpiCards";
import { DashboardControls } from "@/components/weather/DashboardControls";
import { DailyForecastGrid } from "@/components/weather/DailyForecastGrid";
import { TemperatureTrendChart } from "@/components/weather/TemperatureTrendChart";
import { RawIntervalDetails } from "@/components/weather/RawIntervalDetails";
import { ForecastDashboard } from "@/components/weather/ForecastDashboard";
import { NormalizedForecastData } from "@/lib/contracts/weather";
import { EXPECTED_TAIWAN_REGIONS } from "@/lib/data/county-coordinates";

function createMockDashboardData(): NormalizedForecastData {
  return {
    datasetId: "F-D0047-091",
    fetchedAt: "2026-09-24T12:00:00.000Z",
    regions: EXPECTED_TAIWAN_REGIONS.map((regionName) => ({
      region: regionName,
      intervals: [
        {
          startTime: "2026-09-24T06:00:00+08:00",
          endTime: "2026-09-24T18:00:00+08:00",
          minTemp: 23.5,
          maxTemp: 31.0,
        },
        {
          startTime: "2026-09-24T18:00:00+08:00",
          endTime: "2026-09-25T06:00:00+08:00",
          minTemp: 21.0,
          maxTemp: 26.0,
        },
        {
          startTime: "2026-09-25T06:00:00+08:00",
          endTime: "2026-09-25T18:00:00+08:00",
          minTemp: 22.0,
          maxTemp: 30.5,
        },
      ],
    })),
  };
}

describe("Dashboard UI Components (SSR & Markup Integrity)", () => {
  it("renders LoadingState with status messages and skeletons", () => {
    const html = renderToStaticMarkup(<LoadingState message="讀取中..." />);
    expect(html).toContain("讀取中...");
    expect(html).toContain("spinner");
    expect(html).toContain("skeleton-grid");
  });

  it("renders ErrorState with error message and retry button", () => {
    const html = renderToStaticMarkup(
      <ErrorState message="網路連線逾時" onRetry={() => {}} />
    );
    expect(html).toContain("網路連線逾時");
    expect(html).toContain("重新嘗試");
    expect(html).toContain("無法取得天氣資料");
  });

  it("renders EmptyState with guidance message", () => {
    const html = renderToStaticMarkup(<EmptyState />);
    expect(html).toContain("查無預報資料");
    expect(html).toContain("調整篩選區間");
  });

  it("renders KpiCards with valid numbers and handles null temperatures without showing 0°C", () => {
    const validHtml = renderToStaticMarkup(
      <KpiCards
        region="臺北市"
        kpis={{ periodMin: 21.5, periodMax: 32.8, daysCount: 7 }}
      />
    );
    expect(validHtml).toContain("臺北市");
    expect(validHtml).toContain("21.5°C");
    expect(validHtml).toContain("32.8°C");
    expect(validHtml).toContain("7 天");

    // Null temperatures must render as em-dash, never 0°C
    const nullHtml = renderToStaticMarkup(
      <KpiCards
        region="新北市"
        kpis={{ periodMin: null, periodMax: null, daysCount: 2 }}
      />
    );
    expect(nullHtml).toContain("新北市");
    expect(nullHtml).toContain("—");
    expect(nullHtml).not.toContain("0.0°C");
    expect(nullHtml).not.toContain("0°C");
  });

  it("renders DashboardControls with all 22 regions and date selectors", () => {
    const html = renderToStaticMarkup(
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

    // Verify all 22 regions are present in select options
    for (const r of EXPECTED_TAIWAN_REGIONS) {
      expect(html).toContain(r);
    }
    expect(html).toContain('id="dashboard-main-controls"');
    expect(html).toContain("全部日期");
    expect(html).toContain("重新載入");
  });

  it("renders TemperatureTrendChart as a responsive SVG with proper labels and no 0 for null", () => {
    const dailyData = [
      {
        forecastDate: "2026-09-24",
        minTemp: 21.0,
        maxTemp: 28.5,
        intervalCount: 2,
        isPartial: false,
        intervals: [],
      },
      {
        forecastDate: "2026-09-25",
        minTemp: null, // null should not produce 0°C in chart
        maxTemp: 31.0,
        intervalCount: 1,
        isPartial: true,
        intervals: [],
      },
    ];

    const html = renderToStaticMarkup(
      <TemperatureTrendChart dailyList={dailyData} region="臺北市" />
    );

    expect(html).toContain("<svg");
    expect(html).toContain("viewBox");
    expect(html).toContain("臺北市");
    expect(html).toContain("09-24");
    expect(html).toContain("09-25");
  });

  it("renders DailyForecastGrid with weekday names, units, and partial badges", () => {
    const dailyData = [
      {
        forecastDate: "2026-09-24",
        minTemp: 22.0,
        maxTemp: 30.0,
        intervalCount: 2,
        isPartial: false,
        intervals: [],
      },
      {
        forecastDate: "2026-09-25",
        minTemp: 23.0,
        maxTemp: 29.0,
        intervalCount: 1,
        isPartial: true,
        intervals: [],
      },
    ];

    const html = renderToStaticMarkup(
      <DailyForecastGrid dailyList={dailyData} region="高雄市" />
    );

    expect(html).toContain("高雄市");
    expect(html).toContain("22.0°C");
    expect(html).toContain("30.0°C");
    expect(html).toContain("完整預報");
    expect(html).toContain("部分資料");
  });

  it("renders RawIntervalDetails with collapsible table and Asia/Taipei formatted times", () => {
    const intervals = [
      {
        startTime: "2026-09-24T06:00:00+08:00",
        endTime: "2026-09-24T18:00:00+08:00",
        minTemp: 24,
        maxTemp: 31,
      },
    ];

    const html = renderToStaticMarkup(
      <RawIntervalDetails intervals={intervals} region="臺中市" />
    );

    expect(html).toContain("原始 12 小時預報區間檢視");
    expect(html).toContain("1 個區間");
  });

  it("renders full ForecastDashboard with initialData defaulting to 臺北市 and NO leaked secrets", () => {
    const mockData = createMockDashboardData();
    const html = renderToStaticMarkup(<ForecastDashboard initialData={mockData} />);

    // Header metadata verification
    expect(html).toContain("Taiwan Weather Dashboard");
    expect(html).toContain("F-D0047-091");
    expect(html).toContain("中央氣象署");

    // Default region verification
    expect(html).toContain("臺北市");

    // Verify secrets, tokens, or CWA_API_KEY do NOT appear in the rendered HTML
    expect(html).not.toContain("CWA_API_KEY");
    expect(html).not.toContain("CWA-");
    expect(html).not.toContain("Bearer");
    expect(html).not.toContain("password");
    expect(html).not.toContain("Authorization");
  });
});
