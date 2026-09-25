// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, Root } from "react-dom/client";
import fs from "fs";
import path from "path";
import { WeatherAtmosphere } from "@/components/weather/WeatherAtmosphere";
import { ForecastDashboard } from "@/components/weather/ForecastDashboard";
import {
  WeatherScenarioKey,
} from "@/lib/theme/background-assets";
import { NormalizedForecastData } from "@/lib/contracts/weather";
import { NormalizedObservationData } from "@/lib/contracts/observations";
import { EXPECTED_TAIWAN_REGIONS } from "@/lib/data/county-coordinates";

// Mock child components that rely on Leaflet/window
vi.mock("@/components/weather/TaiwanWeatherMap", () => ({
  TaiwanWeatherMap: () => <div data-testid="mock-taiwan-weather-map">Map</div>,
}));

function createMockForecast(): NormalizedForecastData {
  return {
    datasetId: "F-D0047-091",
    fetchedAt: "2026-09-24T06:00:00.000Z",
    regions: EXPECTED_TAIWAN_REGIONS.map((region) => ({
      region,
      intervals: [
        {
          startTime: "2026-09-24T06:00:00+08:00",
          endTime: "2026-09-24T18:00:00+08:00",
          minTemp: 24.0,
          maxTemp: 32.0,
        },
      ],
    })),
  };
}

function createMockObservations(): NormalizedObservationData {
  return {
    datasetId: "O-A0003-001",
    fetchedAt: "2026-09-24T06:00:00.000Z",
    stations: [
      {
        stationId: "466920",
        stationName: "臺北",
        county: "臺北市",
        town: "中正區",
        latitude: 25.03746,
        longitude: 121.51488,
        elevation: 5.3,
        temperature: 28.5,
        relativeHumidity: 70,
        windSpeed: 2.5,
        windDirection: 90,
        dailyPrecipitation: 0,
        precipitationStatus: "normal",
        observedAt: "2026-09-24T14:00:00+08:00", // Taipei 14:00 = daytime (07:00 ~ 16:59)
      },
    ],
  };
}

describe("Milestone M13.5: Weather Atmosphere Ambient Overlay", () => {
  const cssPath = path.resolve(__dirname, "../app/globals.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    window.history.pushState({}, "", "/");
    document.body.innerHTML = "";

    // Mock matchMedia for jsdom
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    window.history.pushState({}, "", "/");
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("Requirement 1: Scenario Key Mapping to Atmosphere Classes", () => {
    const scenarios: WeatherScenarioKey[] = [
      "dawn",
      "clear-day",
      "cloudy-day",
      "sunset",
      "clear-night",
      "cloudy-night",
      "rain-day",
      "rain-night",
      "default",
    ];

    it.each(scenarios)("renders correct class atmosphere--%s for scenario", (scenario) => {
      const { unmount } = render(<WeatherAtmosphere scenario={scenario} usePortal={false} />);
      const el = screen.getByTestId("weather-atmosphere-layer");
      expect(el.classList.contains(`atmosphere--${scenario}`)).toBe(true);
      expect(el.getAttribute("data-scenario")).toBe(scenario);
      unmount();
    });
  });

  describe("Requirement 2: Default Scenario Has No Continuous Animation", () => {
    it("CSS explicitly turns off animation and pseudo-elements for atmosphere--default", () => {
      expect(cssContent).toContain(".atmosphere--default::before");
      expect(cssContent).toContain(".atmosphere--default::after");

      const defaultBlockMatch = cssContent.match(
        /\.atmosphere--default::before[\s\S]*?\{([\s\S]*?)\}/
      );
      expect(defaultBlockMatch).not.toBeNull();
      const rules = defaultBlockMatch![1];
      expect(rules).toContain("display: none !important");
      expect(rules).toContain("animation: none !important");
    });
  });

  describe("Requirement 3: Accessibility Attributes (aria-hidden)", () => {
    it("atmosphere layer has aria-hidden='true'", () => {
      render(<WeatherAtmosphere scenario="clear-day" usePortal={false} />);
      const el = screen.getByTestId("weather-atmosphere-layer");
      expect(el.getAttribute("aria-hidden")).toBe("true");
    });

    it("weather-atmosphere-root in layout.tsx has aria-hidden='true'", () => {
      const layoutPath = path.resolve(__dirname, "../app/layout.tsx");
      const layoutContent = fs.readFileSync(layoutPath, "utf-8");
      expect(layoutContent).toContain('id="weather-atmosphere-root"');
      expect(layoutContent).toContain('aria-hidden="true"');
    });
  });

  describe("Requirement 4: Pointer Events & Non-blocking Interactions", () => {
    it("CSS defines pointer-events: none on .weather-atmosphere-layer and pseudo elements", () => {
      const layerMatch = cssContent.match(/\.weather-atmosphere-layer\s*\{([\s\S]*?)\}/);
      expect(layerMatch).not.toBeNull();
      const layerRules = layerMatch![1];
      expect(layerRules).toContain("pointer-events: none");
      expect(layerRules).toContain("position: fixed");
      expect(layerRules).toContain("inset: 0");
      expect(layerRules).toContain("z-index: 1");

      const pseudoMatch = cssContent.match(/\.weather-atmosphere-layer::before[\s\S]*?\{([\s\S]*?)\}/);
      expect(pseudoMatch).not.toBeNull();
      expect(pseudoMatch![1]).toContain("pointer-events: none");
    });
  });

  describe("Requirement 5: Prefers-reduced-motion Handling", () => {
    it("disables all animations and transitions when prefers-reduced-motion is active", () => {
      const reducedMotionBlock = cssContent.match(
        /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*?)\n\}/
      );
      expect(reducedMotionBlock).not.toBeNull();
      const content = reducedMotionBlock![1];

      expect(content).toContain(".weather-atmosphere-layer");
      expect(content).toContain("animation: none !important");
      expect(content).toContain("transition: none !important");
      expect(content).toContain(".atmosphere--rain-day::before");
      expect(content).toContain("display: none !important");
    });
  });

  describe("Requirement 6: VisibilityState Hidden Pausing", () => {
    it("adds animation-paused class when document.visibilityState is hidden and removes it when visible", () => {
      let mockVisibility: DocumentVisibilityState = "visible";
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => mockVisibility,
      });

      render(<WeatherAtmosphere scenario="rain-day" usePortal={false} />);
      const el = screen.getByTestId("weather-atmosphere-layer");
      expect(el.classList.contains("animation-paused")).toBe(false);
      expect(el.getAttribute("data-paused")).toBe("false");

      // Switch tab to hidden
      act(() => {
        mockVisibility = "hidden";
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(el.classList.contains("animation-paused")).toBe(true);
      expect(el.getAttribute("data-paused")).toBe("true");

      // Switch tab back to visible
      act(() => {
        mockVisibility = "visible";
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(el.classList.contains("animation-paused")).toBe(false);
      expect(el.getAttribute("data-paused")).toBe("false");
    });

    it("CSS applies animation-play-state: paused to pseudo elements when animation-paused is set", () => {
      expect(cssContent).toContain(".weather-atmosphere-layer.animation-paused::before");
      expect(cssContent).toContain("animation-play-state: paused !important");
    });
  });

  describe("Requirement 7: Event Listener Cleanup on Unmount", () => {
    it("removes visibilitychange listener when component unmounts", () => {
      const removeListenerSpy = vi.spyOn(document, "removeEventListener");

      const { unmount } = render(<WeatherAtmosphere scenario="sunset" usePortal={false} />);
      expect(removeListenerSpy).not.toHaveBeenCalledWith("visibilitychange", expect.any(Function));

      unmount();
      expect(removeListenerSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    });
  });

  describe("Requirement 8: Preview Key Synchronizes Background & Atmosphere", () => {
    it("synchronizes scenario when ?weatherPreview query parameter is present", () => {
      window.history.pushState({}, "", "/?weatherPreview=sunset");

      const bgLayer = document.createElement("div");
      bgLayer.id = "weather-bg-layer";
      document.body.appendChild(bgLayer);

      const rootLayer = document.createElement("div");
      rootLayer.id = "weather-atmosphere-root";
      document.body.appendChild(rootLayer);

      render(
        <ForecastDashboard
          initialData={createMockForecast()}
          initialObservations={createMockObservations()}
        />
      );

      // Fast forward crossfade timer
      act(() => {
        vi.advanceTimersByTime(250);
      });

      const atmosphere = screen.getByTestId("weather-atmosphere-layer");
      expect(atmosphere.classList.contains("atmosphere--sunset")).toBe(true);
      expect(bgLayer.getAttribute("data-weather-scenario")).toBe("sunset");
    });

    it("synchronizes scenario when legacy ?bg query parameter is present", () => {
      window.history.pushState({}, "", "/?bg=dawn");

      const bgLayer = document.createElement("div");
      bgLayer.id = "weather-bg-layer";
      document.body.appendChild(bgLayer);

      const rootLayer = document.createElement("div");
      rootLayer.id = "weather-atmosphere-root";
      document.body.appendChild(rootLayer);

      render(
        <ForecastDashboard
          initialData={createMockForecast()}
          initialObservations={createMockObservations()}
        />
      );

      act(() => {
        vi.advanceTimersByTime(250);
      });

      const atmosphere = screen.getByTestId("weather-atmosphere-layer");
      expect(atmosphere.classList.contains("atmosphere--dawn")).toBe(true);
      expect(bgLayer.getAttribute("data-weather-scenario")).toBe("dawn");
    });
  });

  describe("Requirement 9: Production Mode Rejects Preview Override", () => {
    it("ignores weatherPreview query parameter when NODE_ENV is production", () => {
      vi.stubEnv("NODE_ENV", "production");
      window.history.pushState({}, "", "/?weatherPreview=sunset");

      const bgLayer = document.createElement("div");
      bgLayer.id = "weather-bg-layer";
      document.body.appendChild(bgLayer);

      const rootLayer = document.createElement("div");
      rootLayer.id = "weather-atmosphere-root";
      document.body.appendChild(rootLayer);

      render(
        <ForecastDashboard
          initialData={createMockForecast()}
          initialObservations={createMockObservations()}
        />
      );

      act(() => {
        vi.advanceTimersByTime(250);
      });

      const atmosphere = screen.getByTestId("weather-atmosphere-layer");
      // Daytime observations at 14:00 resolve to clear-day, NOT overridden sunset
      expect(atmosphere.classList.contains("atmosphere--clear-day")).toBe(true);
      expect(atmosphere.classList.contains("atmosphere--sunset")).toBe(false);
    });
  });

  describe("Requirement 8b: SSR Hydration Regression Tests (M13.5 Fix)", () => {
    it("server render produces default atmosphere scenario without window access", () => {
      // Server render with no window / URLSearchParams
      const serverHtml = renderToString(<ForecastDashboard />);
      expect(serverHtml).toContain("atmosphere--default");
      expect(serverHtml).toContain('data-scenario="default"');
      expect(serverHtml).not.toContain("atmosphere--dawn");
    });

    it("client first hydration matches server HTML without mismatch warnings", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => { });

      // Simulate URL param existing in browser
      window.history.pushState({}, "", "/?weatherPreview=dawn");

      // Server HTML
      const serverHtml = renderToString(<ForecastDashboard />);

      // Hydration container
      const container = document.createElement("div");
      container.innerHTML = serverHtml;
      document.body.appendChild(container);

      // Hydrate
      let root: Root | null = null;
      act(() => {
        root = hydrateRoot(container, <ForecastDashboard />);
      });

      // No hydration warning / mismatch logged during hydration
      const errorCalls = consoleErrorSpy.mock.calls
        .flat()
        .join(" ");
      expect(errorCalls).not.toContain("did not match");
      expect(errorCalls).not.toContain("Hydration failed");
      expect(errorCalls).not.toContain("A tree hydrated but some attributes");

      // Post-hydration effect synchronizes ?weatherPreview=dawn
      act(() => {
        vi.advanceTimersByTime(250);
      });

      const atmosphere = screen.getByTestId("weather-atmosphere-layer");
      expect(atmosphere.classList.contains("atmosphere--dawn")).toBe(true);
      expect(atmosphere.getAttribute("data-scenario")).toBe("dawn");

      act(() => {
        root?.unmount();
      });
      consoleErrorSpy.mockRestore();
    });

    it("?weatherPreview=rain-day correctly transitions after hydration", () => {
      window.history.pushState({}, "", "/?weatherPreview=rain-day");

      const serverHtml = renderToString(<ForecastDashboard />);

      const container = document.createElement("div");
      container.innerHTML = serverHtml;
      document.body.appendChild(container);

      let root: Root | null = null;
      act(() => {
        root = hydrateRoot(container, <ForecastDashboard />);
      });

      act(() => {
        vi.advanceTimersByTime(250);
      });

      const atmosphere = screen.getByTestId("weather-atmosphere-layer");
      expect(atmosphere.classList.contains("atmosphere--rain-day")).toBe(true);
      expect(atmosphere.getAttribute("data-scenario")).toBe("rain-day");

      act(() => {
        root?.unmount();
      });
    });
  });

  describe("Requirement 10: Technical Integrity & Zero Heavy Animation Primitives", () => {
    it("does NOT contain video, canvas, WebGL, or animation frame loops in WeatherAtmosphere", () => {
      const componentPath = path.resolve(__dirname, "../components/weather/WeatherAtmosphere.tsx");
      const componentContent = fs.readFileSync(componentPath, "utf-8");

      expect(componentContent).not.toContain("<video");
      expect(componentContent).not.toContain("<canvas");
      expect(componentContent).not.toContain("webgl");
      expect(componentContent).not.toContain("setInterval");
      // Allow frame-batched scroll listener, but strictly forbid continuous recursive rAF loops
      expect(componentContent).not.toMatch(/function\s+\w+\s*\([^)]*\)\s*\{[^}]*requestAnimationFrame\s*\(\s*\w+\s*\)/);
    });

    it("atmosphere CSS uses only CSS gradients, pseudo-elements, transform, opacity, and background-position", () => {
      expect(cssContent).toContain("@keyframes dawn-breath");
      expect(cssContent).toContain("@keyframes clear-day-drift");
      expect(cssContent).toContain("@keyframes cloudy-day-drift");
      expect(cssContent).toContain("@keyframes sunset-breath");
      expect(cssContent).toContain("@keyframes starlight-a");
      expect(cssContent).toContain("@keyframes starlight-b");
      expect(cssContent).toContain("@keyframes cloudy-night-drift");
      expect(cssContent).toContain("@keyframes rain-fall-layer-a");
      expect(cssContent).toContain("@keyframes rain-fall-layer-b");
      expect(cssContent).toContain("@keyframes rain-night-moisture");

      // Verify mobile degradation rule exists
      expect(cssContent).toContain("@media (max-width: 768px), (pointer: coarse)");
    });
  });

  describe("Milestone M13.6: Single Refractive Raindrop Technical Prototype", () => {
    it("RefractiveRaindropPrototype strictly contains NO canvas, WebGL, or video, using pure SVG displacement", () => {
      const protoPath = path.resolve(__dirname, "../components/weather/RefractiveRaindropPrototype.tsx");
      const protoContent = fs.readFileSync(protoPath, "utf-8");

      expect(protoContent).not.toContain("<video");
      expect(protoContent).not.toContain("<canvas");
      expect(protoContent).not.toContain("webgl");
      expect(protoContent).not.toContain("setInterval");
      expect(protoContent).toContain("feDisplacementMap");
      expect(protoContent).toContain("feGaussianBlur");
      expect(protoContent).toContain("clipPath");
    });

    it("renders RefractiveRaindropPrototype only when scenario is rain-day and rainPrototype=1 is enabled", () => {
      window.history.pushState({}, "", "/?weatherPreview=rain-day&rainPrototype=1&weatherDebug=1");
      const { container, unmount } = render(
        <WeatherAtmosphere scenario="rain-day" usePortal={false} />
      );

      const svg = container.querySelector("#refractive-rain-svg");
      expect(svg).toBeTruthy();

      const toggleBtn = container.querySelector("#refraction-toggle-btn");
      expect(toggleBtn).toBeTruthy();
      expect(toggleBtn?.textContent).toContain("Refraction: ON");

      unmount();
    });

    it("preserves standard rain-day when rainPrototype=1 is absent", () => {
      window.history.pushState({}, "", "/?weatherPreview=rain-day&weatherDebug=1");
      const { container, unmount } = render(
        <WeatherAtmosphere scenario="rain-day" usePortal={false} />
      );

      const svg = container.querySelector("#refractive-rain-svg");
      expect(svg).toBeNull();

      const standardTrails = container.querySelector(".rain-glass-trails");
      expect(standardTrails).toBeTruthy();

      unmount();
    });

    it("toggles refraction scale between ON (38) and OFF (0) via HUD button", () => {
      window.history.pushState({}, "", "/?weatherPreview=rain-day&rainPrototype=1&weatherDebug=1");
      const { container, unmount } = render(
        <WeatherAtmosphere scenario="rain-day" usePortal={false} />
      );

      const toggleBtn = container.querySelector("#refraction-toggle-btn") as HTMLButtonElement;
      expect(toggleBtn).toBeTruthy();
      expect(toggleBtn.textContent).toContain("Refraction: ON");

      // Click to toggle OFF
      fireEvent.click(toggleBtn);
      expect(toggleBtn.textContent).toContain("Refraction: OFF");

      const hud = container.querySelector("#weather-debug-hud");
      expect(hud?.textContent).toContain("Displacement Scale: 0");

      // Click to toggle back ON
      fireEvent.click(toggleBtn);
      expect(toggleBtn.textContent).toContain("Refraction: ON");
      expect(hud?.textContent).toContain("Displacement Scale: 38");

      unmount();
    });
  });

  describe("Milestone M13.8 WebGL Rain Dashboard Integration Tests", () => {
    it("does not mount WebGL rain canvas when rainDashboard=1 is absent", () => {
      window.history.pushState({}, "", "/?weatherPreview=rain-day");
      const { container, unmount } = render(
        <WeatherAtmosphere scenario="rain-day" usePortal={false} />
      );

      const canvas = container.querySelector("#dashboard-rain-canvas");
      expect(canvas).toBeNull();

      const trails = container.querySelector(".rain-glass-trails");
      expect(trails).toBeTruthy();

      unmount();
    });

    it("mounts WebGL rain canvas with pointer-events: none when rainDashboard=1 is present", () => {
      window.history.pushState({}, "", "/?weatherPreview=rain-day&rainDashboard=1");
      const { container, unmount } = render(
        <WeatherAtmosphere scenario="rain-day" usePortal={false} />
      );

      const canvas = container.querySelector("#dashboard-rain-canvas") as HTMLCanvasElement;
      expect(canvas).toBeTruthy();
      expect(canvas.style.pointerEvents).toBe("none");
      expect(canvas.style.position).toBe("fixed");
      expect(canvas.style.zIndex).toBe("1");

      // Suppresses fallback CSS trails when live WebGL rain is active
      const fallbackTrails = container.querySelector(".rain-glass-trails");
      expect(fallbackTrails).toBeNull();

      unmount();
    });

    it("displays M13.8 dedicated HUD with 1.5x baseline and refraction status when weatherDebug=1", () => {
      window.history.pushState({}, "", "/?weatherPreview=rain-day&rainDashboard=1&weatherDebug=1");
      const { container, unmount } = render(
        <WeatherAtmosphere scenario="rain-day" usePortal={false} />
      );

      const hud = container.querySelector("#dashboard-rain-hud");
      expect(hud).toBeTruthy();
      expect(hud?.textContent).toContain("Rain Dashboard: ON");
      expect(hud?.textContent).toContain("Renderer: WebGL2 / raindrop-fx");
      expect(hud?.textContent).toContain("Droplet Scale: 1.5x");
      expect(hud?.textContent).toContain("Density: Medium");
      expect(hud?.textContent).toContain("DOM Refraction: NOT SUPPORTED");
      expect(hud?.textContent).toContain("Background Refraction: ON");

      unmount();
    });

    it("guarantees 100% SSR hydration safety without mismatch when rainDashboard=1", () => {
      window.history.pushState({}, "", "/?weatherPreview=rain-day&rainDashboard=1&weatherDebug=1");

      // Server render pass
      const ssrHtml = renderToString(
        <WeatherAtmosphere scenario="rain-day" usePortal={false} />
      );

      // Hydration in DOM
      const host = document.createElement("div");
      host.innerHTML = ssrHtml;
      document.body.appendChild(host);

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      let root: Root | null = null;
      act(() => {
        root = hydrateRoot(
          host,
          <WeatherAtmosphere scenario="rain-day" usePortal={false} />
        );
      });

      const mismatchErrors = consoleErrorSpy.mock.calls.filter((call) =>
        call.some(
          (arg) =>
            typeof arg === "string" &&
            (arg.includes("Hydration failed") ||
              arg.includes("did not match") ||
              arg.includes("Text content does not match"))
        )
      );

      expect(mismatchErrors.length).toBe(0);

      act(() => {
        root?.unmount();
      });
      consoleErrorSpy.mockRestore();
      host.remove();
    });
  });
});

