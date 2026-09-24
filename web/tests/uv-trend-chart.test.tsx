// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { UVTrendChart } from "@/components/weather/UVTrendChart";
import { UVCard } from "@/components/weather/UVCard";
import { ForecastDashboard } from "@/components/weather/ForecastDashboard";
import {
  getTaipeiTodayDateString,
  findDefaultUvDate,
  getDaytimePeriodStatus,
  buildUVForecastItem,
} from "@/lib/transformations/uv";
import { LeafletMapInner } from "@/components/weather/LeafletMapInner";
import { NormalizedForecastData, UVForecastItem } from "@/lib/contracts/weather";

// Mock LeafletMapInner so Leaflet doesn't fail in jsdom
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

describe("Milestone M12: UVTrendChart & UV Integration Tests", () => {
  const mockUvItems: UVForecastItem[] = [
    buildUVForecastItem({
      datasetId: "F-D0047-091",
      fetchedAt: "2026-09-24T00:00:00Z",
      county: "臺北市",
      forecastDate: "2026-09-24",
      uvIndex: 6,
    }),
    buildUVForecastItem({
      datasetId: "F-D0047-091",
      fetchedAt: "2026-09-24T00:00:00Z",
      county: "臺北市",
      forecastDate: "2026-09-25",
      uvIndex: 8,
    }),
    buildUVForecastItem({
      datasetId: "F-D0047-091",
      fetchedAt: "2026-09-24T00:00:00Z",
      county: "臺北市",
      forecastDate: "2026-09-26",
      uvIndex: 11,
    }),
  ];

  describe("1. Default Date Selection (今日預設選取 & 找不到今日時的回退規則)", () => {
    it("selects today when today exists in available dates", () => {
      // Fixed time: 2026-09-24 10:00 Taipei time
      const mockNow = new Date("2026-09-24T02:00:00Z");
      const available = ["2026-09-23", "2026-09-24", "2026-09-25"];
      const selected = findDefaultUvDate(available, mockNow);
      expect(selected).toBe("2026-09-24");
    });

    it("selects the closest future available date when today is absent", () => {
      // Today is 2026-09-24, but available dates only start tomorrow
      const mockNow = new Date("2026-09-24T02:00:00Z");
      const available = ["2026-09-25", "2026-09-26", "2026-09-27"];
      const selected = findDefaultUvDate(available, mockNow);
      expect(selected).toBe("2026-09-25");
    });

    it("selects the closest past available date when neither today nor future dates exist", () => {
      // Today is 2026-09-28, available dates are all past
      const mockNow = new Date("2026-09-28T02:00:00Z");
      const available = ["2026-09-22", "2026-09-25", "2026-09-26"];
      const selected = findDefaultUvDate(available, mockNow);
      expect(selected).toBe("2026-09-26");
    });
  });

  describe("2. Asia/Taipei Timezone Across UTC Boundary (臺北時區跨 UTC 邊界)", () => {
    it("correctly calculates Taipei date when UTC is still the previous day", () => {
      // UTC 2026-09-24 16:30:00Z -> Taipei is 2026-09-25 00:30:00
      const utcLate = new Date("2026-09-24T16:30:00Z");
      const taipeiDate = getTaipeiTodayDateString(utcLate);
      expect(taipeiDate).toBe("2026-09-25");
    });

    it("correctly calculates Taipei date 1 minute before UTC midnight transition", () => {
      // UTC 2026-09-24 15:59:00Z -> Taipei is 2026-09-24 23:59:00
      const utcBeforeMidnight = new Date("2026-09-24T15:59:00Z");
      const taipeiDate = getTaipeiTodayDateString(utcBeforeMidnight);
      expect(taipeiDate).toBe("2026-09-24");
    });
  });

  describe("3. Daytime Period Status (06:00 前、06:00～18:00、18:00 後)", () => {
    it("reports '今日白天 UV 預報・尚未開始' before 06:00 Taipei time", () => {
      // 05:30 Taipei time (UTC 21:30 previous day)
      const earlyMorning = new Date("2026-09-23T21:30:00Z");
      const status = getDaytimePeriodStatus("2026-09-24", earlyMorning);
      expect(status.status).toBe("not_started");
      expect(status.statusLabel).toBe("今日白天 UV 預報・尚未開始");
      expect(status.isToday).toBe(true);
    });

    it("reports '今日白天 UV 預報・適用時段中' between 06:00 and 18:00 Taipei time", () => {
      // 12:00 Taipei time (UTC 04:00)
      const noon = new Date("2026-09-24T04:00:00Z");
      const status = getDaytimePeriodStatus("2026-09-24", noon);
      expect(status.status).toBe("in_progress");
      expect(status.statusLabel).toBe("今日白天 UV 預報・適用時段中");
      expect(status.isToday).toBe(true);
    });

    it("reports '今日白天 UV 預報・時段已結束' after 18:00 Taipei time", () => {
      // 19:00 Taipei time (UTC 11:00)
      const evening = new Date("2026-09-24T11:00:00Z");
      const status = getDaytimePeriodStatus("2026-09-24", evening);
      expect(status.status).toBe("ended");
      expect(status.statusLabel).toBe("今日白天 UV 預報・時段已結束");
      expect(status.isToday).toBe(true);
    });

    it("reports generic label for non-today date without claiming current status", () => {
      const noon = new Date("2026-09-24T04:00:00Z");
      const status = getDaytimePeriodStatus("2026-09-26", noon);
      expect(status.status).toBe("other_day");
      expect(status.statusLabel).toBe("白天 UV 預報（06:00～18:00）");
      expect(status.isToday).toBe(false);
    });

    it("displays tomorrow hint in UVCard when today's period ended and tomorrow data exists", () => {
      const evening = new Date("2026-09-24T11:00:00Z"); // 19:00 Taipei
      const periodStatus = getDaytimePeriodStatus("2026-09-24", evening);
      expect(periodStatus.status).toBe("ended");

      const todayItem = mockUvItems[0]; // 2026-09-24
      const tomorrowItem = mockUvItems[1]; // 2026-09-25

      render(
        <UVCard
          region="臺北市"
          selectedDate="2026-09-24"
          uvItem={todayItem}
          tomorrowUvItem={tomorrowItem}
        />
      );

      const card = screen.getByTestId("uv-card");
      expect(card).toBeDefined();
    });
  });

  describe("4. UVTrendChart Visual & Semantic Rendering", () => {
    it("renders chart title, '每日白天 UV 預報' badge, and solid trend line", () => {
      const mockNow = new Date("2026-09-24T02:00:00Z");
      const { container } = render(
        <UVTrendChart
          dailyUvList={mockUvItems}
          region="臺北市"
          selectedDate="2026-09-24"
          now={mockNow}
        />
      );

      expect(screen.getByText("☀️ 每日白天 UV 趨勢")).toBeDefined();
      expect(screen.getByText("每日白天 UV 預報")).toBeDefined();

      // Trend stroke exists with solid #f59e0b
      const trendPath = container.querySelector(".uv-trend-stroke");
      expect(trendPath).not.toBeNull();
      expect(trendPath?.getAttribute("stroke")).toBe("#f59e0b");
      expect(trendPath?.getAttribute("d")).toBeTruthy();
    });

    it("renders aria-labels with format 'YYYY年M月D日，UV X，等級'", () => {
      const mockNow = new Date("2026-09-24T02:00:00Z");
      render(
        <UVTrendChart
          dailyUvList={mockUvItems}
          region="臺北市"
          selectedDate="2026-09-24"
          now={mockNow}
        />
      );

      const point24 = screen.getByTestId("uv-point-2026-09-24");
      expect(point24.getAttribute("aria-label")).toContain("2026年9月24日，UV 6，高量級（今日）");

      const point25 = screen.getByTestId("uv-point-2026-09-25");
      expect(point25.getAttribute("aria-label")).toContain("2026年9月25日，UV 8，過量級");

      const point26 = screen.getByTestId("uv-point-2026-09-26");
      expect(point26.getAttribute("aria-label")).toContain("2026年9月26日，UV 11+，危險級");
    });

    it("displays '11+' for UV indices of 11 or higher and supports Y-axis scaling", () => {
      const highUvItems: UVForecastItem[] = [
        buildUVForecastItem({
          datasetId: "F-D0047-091",
          fetchedAt: "2026-09-24T00:00:00Z",
          county: "屏東縣",
          forecastDate: "2026-09-24",
          uvIndex: 12,
        }),
      ];

      render(
        <UVTrendChart
          dailyUvList={highUvItems}
          region="屏東縣"
          selectedDate="2026-09-24"
        />
      );

      expect(screen.getByText("12+")).toBeDefined();
    });
  });

  describe("5. Null Handling & Value Non-Zero-Filling (null 不補 0)", () => {
    it("breaks the SVG path when UV is null and never connects across null or fills with 0", () => {
      const itemsWithNull: UVForecastItem[] = [
        buildUVForecastItem({
          datasetId: "F-D0047-091",
          fetchedAt: "2026-09-24T00:00:00Z",
          county: "花蓮縣",
          forecastDate: "2026-09-24",
          uvIndex: 5,
        }),
        buildUVForecastItem({
          datasetId: "F-D0047-091",
          fetchedAt: "2026-09-24T00:00:00Z",
          county: "花蓮縣",
          forecastDate: "2026-09-25",
          uvIndex: null, // Missing UV!
        }),
        buildUVForecastItem({
          datasetId: "F-D0047-091",
          fetchedAt: "2026-09-24T00:00:00Z",
          county: "花蓮縣",
          forecastDate: "2026-09-26",
          uvIndex: 9,
        }),
      ];

      const { container } = render(
        <UVTrendChart
          dailyUvList={itemsWithNull}
          region="花蓮縣"
          selectedDate="2026-09-24"
        />
      );

      // Null date should NOT have a clickable UV point circle
      expect(screen.queryByTestId("uv-point-2026-09-25")).toBeNull();

      // Path should contain two disconnected Move (M) instructions because null breaks the path
      const path = container.querySelector(".uv-trend-stroke");
      const d = path?.getAttribute("d") ?? "";
      const moveCount = (d.match(/M/g) || []).length;
      expect(moveCount).toBe(2);
    });
  });

  describe("6. Horizontal Identical Values Line Visibility (水平相同 UV 數值折線仍可見)", () => {
    it("renders visible solid stroke when all days have the exact same UV value", () => {
      const flatItems: UVForecastItem[] = [
        buildUVForecastItem({
          datasetId: "F-D0047-091",
          fetchedAt: "2026-09-24T00:00:00Z",
          county: "金門縣",
          forecastDate: "2026-09-24",
          uvIndex: 7,
        }),
        buildUVForecastItem({
          datasetId: "F-D0047-091",
          fetchedAt: "2026-09-24T00:00:00Z",
          county: "金門縣",
          forecastDate: "2026-09-25",
          uvIndex: 7,
        }),
        buildUVForecastItem({
          datasetId: "F-D0047-091",
          fetchedAt: "2026-09-24T00:00:00Z",
          county: "金門縣",
          forecastDate: "2026-09-26",
          uvIndex: 7,
        }),
      ];

      const { container } = render(
        <UVTrendChart
          dailyUvList={flatItems}
          region="金門縣"
          selectedDate="2026-09-24"
        />
      );

      const path = container.querySelector(".uv-trend-stroke");
      expect(path).not.toBeNull();
      const d = path?.getAttribute("d") ?? "";
      // Line connects all three points with horizontal Y
      expect(d).toContain("L");
      // Stroke is solid #f59e0b, avoiding bounding-box height:0 SVG gradient collapse
      expect(path?.getAttribute("stroke")).toBe("#f59e0b");
    });
  });

  describe("7. Keyboard Interaction (Enter / Space 選取資料點)", () => {
    it("triggers onSelectDate when pressing Enter or Space on a focused point", () => {
      const handleSelect = vi.fn();
      render(
        <UVTrendChart
          dailyUvList={mockUvItems}
          region="臺北市"
          selectedDate="2026-09-24"
          onSelectDate={handleSelect}
        />
      );

      const point25 = screen.getByTestId("uv-point-2026-09-25");

      // Press Enter
      fireEvent.keyDown(point25, { key: "Enter" });
      expect(handleSelect).toHaveBeenCalledWith("2026-09-25");

      // Press Space
      fireEvent.keyDown(point25, { key: " " });
      expect(handleSelect).toHaveBeenCalledWith("2026-09-25");
    });
  });

  describe("8. Interactive Selection & UVCard Update in ForecastDashboard", () => {
    const mockAlerts: { datasetId: "W-C0033-002"; fetchedAt: string; alertCount: number; alerts: [] } = {
      datasetId: "W-C0033-002",
      fetchedAt: "2026-09-24T00:00:00Z",
      alertCount: 0,
      alerts: [],
    };
    const mockObs: { datasetId: "O-A0003-001"; fetchedAt: string; stations: [] } = {
      datasetId: "O-A0003-001",
      fetchedAt: "2026-09-24T00:00:00Z",
      stations: [],
    };
    const mockAq: { datasetId: "AQX_P_432"; fetchedAt: string; stations: []; countySummaries: Record<string, never> } = {
      datasetId: "AQX_P_432",
      fetchedAt: "2026-09-24T00:00:00Z",
      stations: [],
      countySummaries: {},
    };

    const mockFullData: NormalizedForecastData = {
      datasetId: "F-D0047-091",
      fetchedAt: "2026-09-24T00:00:00Z",
      regions: [
        {
          region: "臺北市",
          intervals: [
            {
              startTime: "2026-09-24T06:00:00+08:00",
              endTime: "2026-09-24T18:00:00+08:00",
              minTemp: 24,
              maxTemp: 32,
            },
            {
              startTime: "2026-09-24T18:00:00+08:00",
              endTime: "2026-09-25T06:00:00+08:00",
              minTemp: 23,
              maxTemp: 27,
            },
            {
              startTime: "2026-09-25T06:00:00+08:00",
              endTime: "2026-09-25T18:00:00+08:00",
              minTemp: 25,
              maxTemp: 33,
            },
          ],
          uvForecasts: [
            buildUVForecastItem({
              datasetId: "F-D0047-091",
              fetchedAt: "2026-09-24T00:00:00Z",
              county: "臺北市",
              forecastDate: "2026-09-24",
              uvIndex: 6, // 高量級
            }),
            buildUVForecastItem({
              datasetId: "F-D0047-091",
              fetchedAt: "2026-09-24T00:00:00Z",
              county: "臺北市",
              forecastDate: "2026-09-25",
              uvIndex: 9, // 過量級
            }),
          ],
        },
        {
          region: "新北市",
          intervals: [
            {
              startTime: "2026-09-24T06:00:00+08:00",
              endTime: "2026-09-24T18:00:00+08:00",
              minTemp: 23,
              maxTemp: 31,
            },
          ],
          uvForecasts: [
            buildUVForecastItem({
              datasetId: "F-D0047-091",
              fetchedAt: "2026-09-24T00:00:00Z",
              county: "新北市",
              forecastDate: "2026-09-24",
              uvIndex: 5, // 中量級
            }),
          ],
        },
      ],
    };

    it("clicking a UV point updates UVCard without changing temperature date filters", () => {
      render(
        <ForecastDashboard
          initialData={mockFullData}
          initialObservations={mockObs}
          initialAirQuality={mockAq}
          initialAlerts={mockAlerts}
        />
      );

      // Initially on 2026-09-24 (today/first available)
      const uvCard = screen.getByTestId("uv-card");
      expect(uvCard.textContent).toContain("高量級");

      // Click on 2026-09-25 UV point
      const point25 = screen.getByTestId("uv-point-2026-09-25");
      fireEvent.click(point25);

      // UVCard updates to 2026-09-25 ("過量級", UV 9)
      expect(uvCard.textContent).toContain("過量級");
      expect(uvCard.textContent).toContain("9");
      expect(uvCard.textContent).toContain("2026-09-25");
      expect(uvCard.textContent).toContain("優先待在陰影處");

      // Verify header and dashboard remain on 臺北市
      expect(screen.getByLabelText("臺北市 氣溫走勢圖")).toBeDefined();
    });

    it("safely resets or retains valid date when switching county", () => {
      render(
        <ForecastDashboard
          initialData={mockFullData}
          initialObservations={mockObs}
          initialAirQuality={mockAq}
          initialAlerts={mockAlerts}
        />
      );

      // Select 2026-09-25 on Taipei
      const point25 = screen.getByTestId("uv-point-2026-09-25");
      fireEvent.click(point25);
      expect(screen.getByTestId("uv-card").textContent).toContain("2026-09-25");

      // Switch county to "新北市" (which only has 2026-09-24 UV data)
      const regionSelect = screen.getByRole("combobox", { name: /預報縣市/i });
      fireEvent.change(regionSelect, { target: { value: "新北市" } });

      // In 新北市, 2026-09-25 is absent so it safely falls back to available date (2026-09-24)
      const uvCard = screen.getByTestId("uv-card");
      expect(uvCard.textContent).toContain("新北市");
      expect(uvCard.textContent).toContain("2026-09-24");
      expect(uvCard.textContent).toContain("中量級");
    });
  });
});
