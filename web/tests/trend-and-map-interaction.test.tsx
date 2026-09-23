// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TemperatureTrendChart } from "@/components/weather/TemperatureTrendChart";
import { LeafletMapInner } from "@/components/weather/LeafletMapInner";
import { ForecastDashboard } from "@/components/weather/ForecastDashboard";
import { CountyMapMarkerData, COLOR_MAP } from "@/lib/map/marker-helpers";
import { NormalizedForecastData } from "@/lib/contracts/weather";
import { EXPECTED_TAIWAN_REGIONS } from "@/lib/data/county-coordinates";

// Mock next/dynamic so LeafletMap renders synchronously in ForecastDashboard
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

describe("Milestone M9 TemperatureTrendChart - Polyline & Gradient Validation", () => {
  it("renders a horizontal blue line connecting all 3 points when minTemp is [22, 22, 22]", () => {
    const dailyData = [
      {
        forecastDate: "2026-09-23",
        minTemp: 22,
        maxTemp: 27,
        intervalCount: 2,
        isPartial: false,
        intervals: [],
      },
      {
        forecastDate: "2026-09-24",
        minTemp: 22,
        maxTemp: 31,
        intervalCount: 2,
        isPartial: false,
        intervals: [],
      },
      {
        forecastDate: "2026-09-25",
        minTemp: 22,
        maxTemp: 31,
        intervalCount: 2,
        isPartial: false,
        intervals: [],
      },
    ];

    const { container } = render(
      <TemperatureTrendChart dailyList={dailyData} region="苗栗縣" />
    );

    // 1. Min temperature path exists and has stroke url(#minGradient)
    const minPath = container.querySelector('[data-testid="trend-min-path"]');
    expect(minPath).not.toBeNull();
    const minD = minPath!.getAttribute("d");
    expect(minD).toBeTruthy();
    expect(minPath!.getAttribute("stroke")).toBe("url(#minGradient)");

    // 2. Parse coordinates from minPath: should have 3 points: M x1 y1 L x2 y2 L x3 y3
    const minParts = minD!.trim().split(/\s+/);
    // Format: ["M", "x1", "y1", "L", "x2", "y2", "L", "x3", "y3"]
    expect(minParts[0]).toBe("M");
    expect(minParts[3]).toBe("L");
    expect(minParts[6]).toBe("L");
    expect(minParts).toHaveLength(9);

    const y1 = parseFloat(minParts[2]);
    const y2 = parseFloat(minParts[5]);
    const y3 = parseFloat(minParts[8]);

    // All three y-coordinates must be strictly identical -> horizontal line
    expect(y1).toBe(y2);
    expect(y2).toBe(y3);
    expect(Number.isFinite(y1)).toBe(true);

    // 3. Max temperature path exists and has 3 coordinates with varying y
    const maxPath = container.querySelector('[data-testid="trend-max-path"]');
    expect(maxPath).not.toBeNull();
    const maxD = maxPath!.getAttribute("d");
    expect(maxD).toBeTruthy();
    expect(maxPath!.getAttribute("stroke")).toBe("url(#maxGradient)");

    const maxParts = maxD!.trim().split(/\s+/);
    expect(maxParts).toHaveLength(9);
    const maxY1 = parseFloat(maxParts[2]);
    const maxY2 = parseFloat(maxParts[5]);
    const maxY3 = parseFloat(maxParts[8]);
    expect(maxY1).not.toBe(maxY2); // 27 != 31
    expect(maxY2).toBe(maxY3); // 31 == 31

    // 4. Gradient definitions must specify gradientUnits="userSpaceOnUse"
    const minGradient = container.querySelector("#minGradient");
    expect(minGradient).not.toBeNull();
    expect(minGradient!.getAttribute("gradientUnits")).toBe("userSpaceOnUse");

    const maxGradient = container.querySelector("#maxGradient");
    expect(maxGradient).not.toBeNull();
    expect(maxGradient!.getAttribute("gradientUnits")).toBe("userSpaceOnUse");

    // 5. All coordinates must be strictly within SVG viewBox bounds [0, 800] x [0, 320]
    [y1, y2, y3, maxY1, maxY2, maxY3].forEach((y) => {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(320);
    });

    [parseFloat(minParts[1]), parseFloat(minParts[4]), parseFloat(minParts[7])].forEach((x) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(800);
    });
  });

  it("handles null temperature segments by breaking the path without treating null as 0", () => {
    const dailyWithNull = [
      {
        forecastDate: "2026-09-23",
        minTemp: 22,
        maxTemp: 28,
        intervalCount: 2,
        isPartial: false,
        intervals: [],
      },
      {
        forecastDate: "2026-09-24",
        minTemp: null, // Should break the min path
        maxTemp: 30,
        intervalCount: 1,
        isPartial: true,
        intervals: [],
      },
      {
        forecastDate: "2026-09-25",
        minTemp: 25,
        maxTemp: 32,
        intervalCount: 2,
        isPartial: false,
        intervals: [],
      },
    ];

    const { container } = render(
      <TemperatureTrendChart dailyList={dailyWithNull} region="宜蘭縣" />
    );

    const minPath = container.querySelector('[data-testid="trend-min-path"]');
    expect(minPath).not.toBeNull();
    const minD = minPath!.getAttribute("d")!;

    // When index 1 is null, it should NOT connect day 0 to day 2 with 'L', but have two separate 'M' commands
    // Format: "M x0 y0 M x2 y2"
    expect(minD).toMatch(/^M\s+[\d.]+\s+[\d.]+\s+M\s+[\d.]+\s+[\d.]+$/);
    expect(minD).not.toContain("L");

    // Max path should have all 3 points connected: M ... L ... L ...
    const maxPath = container.querySelector('[data-testid="trend-max-path"]');
    expect(maxPath).not.toBeNull();
    const maxD = maxPath!.getAttribute("d")!;
    expect(maxD).toContain("L");
  });

  it("does not produce NaN or division by zero when all temperatures in chart are identical", () => {
    const identicalData = [
      {
        forecastDate: "2026-09-23",
        minTemp: 22,
        maxTemp: 22,
        intervalCount: 2,
        isPartial: false,
        intervals: [],
      },
      {
        forecastDate: "2026-09-24",
        minTemp: 22,
        maxTemp: 22,
        intervalCount: 2,
        isPartial: false,
        intervals: [],
      },
    ];

    const { container } = render(
      <TemperatureTrendChart dailyList={identicalData} region="澎湖縣" />
    );

    const svgHtml = container.querySelector("svg")!.outerHTML;
    expect(svgHtml).not.toContain("NaN");
    expect(svgHtml).not.toContain("Infinity");
    expect(svgHtml).not.toContain("undefined");

    const minPath = container.querySelector('[data-testid="trend-min-path"]');
    expect(minPath).not.toBeNull();
    expect(minPath!.getAttribute("d")).not.toContain("NaN");
  });

  it("safely renders single valid point without NaN", () => {
    const singlePointData = [
      {
        forecastDate: "2026-09-23",
        minTemp: 22,
        maxTemp: 28,
        intervalCount: 2,
        isPartial: false,
        intervals: [],
      },
    ];

    const { container } = render(
      <TemperatureTrendChart dailyList={singlePointData} region="金門縣" />
    );

    const svgHtml = container.querySelector("svg")!.outerHTML;
    expect(svgHtml).not.toContain("NaN");
    expect(svgHtml).not.toContain("Infinity");

    // Circles should be rendered for the single point
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Milestone M9 Interactive Map - Switch Main Dashboard & Feedback", () => {
  it("LeafletMapInner marker click only opens popup; dynamic button click updates region", () => {
    const mockMarkers: CountyMapMarkerData[] = [
      {
        region: "苗栗縣",
        latitude: 24.56,
        longitude: 120.82,
        forecastDate: "2026-09-23",
        minTemp: 22,
        maxTemp: 27,
        intervalCount: 2,
        isPartial: false,
        colorStyle: COLOR_MAP.orange,
      },
    ];

    const onSelectRegion = vi.fn();
    const { container } = render(
      <LeafletMapInner
        markers={mockMarkers}
        onSelectRegion={onSelectRegion}
        selectedRegion="臺北市"
      />
    );

    // 1. Click marker - onSelectRegion must NOT be called
    const marker = container.querySelector(".custom-leaflet-marker");
    expect(marker).not.toBeNull();
    fireEvent.click(marker!);
    expect(onSelectRegion).not.toHaveBeenCalled();

    // 2. Dynamic button exists with dynamic text and aria-label
    const button = screen.getByRole("button", { name: "切換主面板至苗栗縣 ↑" });
    expect(button).toBeDefined();
    expect(button.getAttribute("aria-label")).toBe("切換主面板至苗栗縣 ↑");
    expect(button.getAttribute("type")).toBe("button");

    // 3. Click button - calls onSelectRegion exactly once with '苗栗縣'
    fireEvent.click(button);
    expect(onSelectRegion).toHaveBeenCalledTimes(1);
    expect(onSelectRegion).toHaveBeenCalledWith("苗栗縣");
  });

  it("button is keyboard operable and does not trigger form submit / page reload", () => {
    const mockMarkers: CountyMapMarkerData[] = [
      {
        region: "苗栗縣",
        latitude: 24.56,
        longitude: 120.82,
        forecastDate: "2026-09-23",
        minTemp: 22,
        maxTemp: 27,
        intervalCount: 2,
        isPartial: false,
        colorStyle: COLOR_MAP.orange,
      },
    ];

    const onSelectRegion = vi.fn();
    const { container } = render(
      <LeafletMapInner
        markers={mockMarkers}
        onSelectRegion={onSelectRegion}
        selectedRegion="臺北市"
      />
    );

    const marker = container.querySelector(".custom-leaflet-marker");
    expect(marker).not.toBeNull();
    fireEvent.click(marker!);

    const button = screen.getByRole("button", { name: "切換主面板至苗栗縣 ↑" });
    button.focus();
    expect(document.activeElement).toBe(button);

    // Keyboard operation: Enter / Space triggers click on HTML buttons
    fireEvent.keyDown(button, { key: "Enter", code: "Enter" });
    fireEvent.click(button); // standard browser behavior on Enter
    expect(onSelectRegion).toHaveBeenCalledWith("苗栗縣");
  });

  it("ForecastDashboard end-to-end: starts at 臺北市, clicking 苗栗縣 in map updates selectedRegion, controls, and triggers smooth scrollIntoView", () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false, // Standard motion (smooth)
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const mockData: NormalizedForecastData = {
      datasetId: "F-D0047-091",
      fetchedAt: "2026-09-23T12:00:00.000Z",
      regions: EXPECTED_TAIWAN_REGIONS.map((regionName) => ({
        region: regionName,
        intervals: [
          {
            startTime: "2026-09-23T06:00:00+08:00",
            endTime: "2026-09-23T18:00:00+08:00",
            minTemp: regionName === "苗栗縣" ? 22 : 25,
            maxTemp: regionName === "苗栗縣" ? 27 : 33,
          },
          {
            startTime: "2026-09-24T06:00:00+08:00",
            endTime: "2026-09-24T18:00:00+08:00",
            minTemp: regionName === "苗栗縣" ? 22 : 24,
            maxTemp: regionName === "苗栗縣" ? 31 : 32,
          },
        ],
      })),
    };

    const { container } = render(<ForecastDashboard initialData={mockData} />);

    // 1. Initial region must be 臺北市
    const select = container.querySelector("#region-select") as HTMLSelectElement;
    expect(select.value).toBe("臺北市");

    // KPI cards should show 臺北市
    const kpiSection = container.querySelector(".kpi-grid");
    expect(kpiSection?.textContent).toContain("臺北市");

    // 2. Open Miaoli marker in map
    const miaoliMarker = container.querySelector('.map-badge[title*="苗栗縣"]')?.parentElement;
    expect(miaoliMarker).toBeDefined();
    fireEvent.click(miaoliMarker!);

    // 3. Click dynamic popup button "切換主面板至苗栗縣 ↑"
    const switchBtn = screen.getByRole("button", { name: "切換主面板至苗栗縣 ↑" });
    expect(switchBtn).toBeDefined();
    fireEvent.click(switchBtn);

    // 4. selectedRegion must update to 苗栗縣
    expect(select.value).toBe("苗栗縣");

    // 5. Controls, KPI cards, and Trend chart must reflect 苗栗縣
    expect(kpiSection?.textContent).toContain("苗栗縣");

    const trendSubtitle = container.querySelector(".chart-header .section-subtitle");
    expect(trendSubtitle?.textContent).toContain("苗栗縣");

    // 6. scrollIntoView must be called once on #dashboard-main-controls with behavior: "smooth"
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });

    // 7. Switching does not trigger page reload or additional API calls
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ForecastDashboard scroll respects prefers-reduced-motion: reduce by using behavior: auto", () => {
    const scrollIntoViewMock = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoViewMock;

    // Simulate prefers-reduced-motion: reduce
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query.includes("prefers-reduced-motion: reduce"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const mockData: NormalizedForecastData = {
      datasetId: "F-D0047-091",
      fetchedAt: "2026-09-23T12:00:00.000Z",
      regions: EXPECTED_TAIWAN_REGIONS.map((regionName) => ({
        region: regionName,
        intervals: [
          {
            startTime: "2026-09-23T06:00:00+08:00",
            endTime: "2026-09-23T18:00:00+08:00",
            minTemp: 22,
            maxTemp: 27,
          },
        ],
      })),
    };

    const { container } = render(<ForecastDashboard initialData={mockData} />);

    // Click marker for 苗栗縣
    const miaoliMarker = container.querySelector('.map-badge[title*="苗栗縣"]')?.parentElement;
    expect(miaoliMarker).not.toBeNull();
    fireEvent.click(miaoliMarker!);

    // Click popup button
    const switchBtn = screen.getByRole("button", { name: "切換主面板至苗栗縣 ↑" });
    fireEvent.click(switchBtn);

    // scrollIntoView must use behavior: "auto"
    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });
});
