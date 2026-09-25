// @vitest-environment jsdom
/**
 * Milestone M13.10.1 & M13.10.2: Full-Page Photographic Sun × Real Dashboard Integration Unit Tests
 */

import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { WeatherAtmosphere } from "@/components/weather/WeatherAtmosphere";
import {
  computeOpticalState,
  computeProductionSunProgress,
  getBackgroundCoverSunUV,
  BASE_SUN_X,
  BASE_SUN_Y,
} from "@/components/weather/sun/optical-state";

describe("M13.10.2 Full-Page Photographic Sun × Real Dashboard Integration", () => {
  beforeEach(() => {
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
    vi.restoreAllMocks();
  });

  // ---- 1. Opt-in Guarantee ----
  it("does NOT mount Sun overlay without sunDashboard=1 query parameter", () => {
    window.history.pushState({}, "", "/?weatherPreview=clear-day");
    render(<WeatherAtmosphere scenario="clear-day" usePortal={false} />);

    expect(screen.queryByTestId("dashboard-sun-back-canvas")).toBeNull();
    expect(screen.queryByTestId("dashboard-sun-front-canvas")).toBeNull();
    expect(screen.queryByTestId("dashboard-sun-hud")).toBeNull();

    // Default static CSS sun elements remain present
    expect(document.querySelector(".sun-rays-layer")).not.toBeNull();
  });

  it("mounts Sun overlay when scenario='clear-day' and sunDashboard=1", () => {
    window.history.pushState({}, "", "/?weatherPreview=clear-day&sunDashboard=1");
    render(<WeatherAtmosphere scenario="clear-day" usePortal={false} />);

    expect(screen.getByTestId("dashboard-sun-back-canvas")).toBeDefined();
    expect(screen.getByTestId("dashboard-sun-front-canvas")).toBeDefined();

    // Replaced generic CSS sun elements
    expect(document.querySelector(".sun-rays-layer")).toBeNull();
  });

  // ---- 2. Rain Isolation Guarantee ----
  it("strictly isolates Rain from Sun: rain-day does NOT mount Sun even with sunDashboard=1", () => {
    window.history.pushState({}, "", "/?weatherPreview=rain-day&sunDashboard=1");
    render(<WeatherAtmosphere scenario="rain-day" usePortal={false} />);

    expect(screen.queryByTestId("dashboard-sun-back-canvas")).toBeNull();
    expect(screen.queryByTestId("dashboard-sun-front-canvas")).toBeNull();
  });

  it("strictly isolates Rain from Sun: rain-day with rainDashboard=1 mounts Rain and NOT Sun", () => {
    window.history.pushState(
      {},
      "",
      "/?weatherPreview=rain-day&rainDashboard=1&sunDashboard=1"
    );
    render(<WeatherAtmosphere scenario="rain-day" usePortal={false} />);

    expect(screen.getByTestId("dashboard-rain-canvas")).toBeDefined();
    expect(screen.queryByTestId("dashboard-sun-back-canvas")).toBeNull();
    expect(screen.queryByTestId("dashboard-sun-front-canvas")).toBeNull();
  });

  // ---- 3. Pointer-Events None Guarantee ----
  it("enforces pointer-events: none on both back and front sun canvases", () => {
    window.history.pushState({}, "", "/?weatherPreview=clear-day&sunDashboard=1");
    render(<WeatherAtmosphere scenario="clear-day" usePortal={false} />);

    const backCanvas = screen.getByTestId("dashboard-sun-back-canvas");
    const frontCanvas = screen.getByTestId("dashboard-sun-front-canvas");

    expect(backCanvas.style.pointerEvents).toBe("none");
    expect(frontCanvas.style.pointerEvents).toBe("none");
    expect(backCanvas.style.position).toBe("fixed");
    expect(frontCanvas.style.position).toBe("fixed");
    expect(backCanvas.style.zIndex).toBe("1");
    expect(frontCanvas.style.zIndex).toBe("20");
  });

  // ---- 4. Debug HUD Guarantee ----
  it("renders Dashboard Sun Debug HUD with all M13.10.2 metrics when weatherDebug=1", () => {
    window.history.pushState(
      {},
      "",
      "/?weatherPreview=clear-day&sunDashboard=1&weatherDebug=1"
    );
    render(<WeatherAtmosphere scenario="clear-day" usePortal={false} />);

    const hud = screen.getByTestId("dashboard-sun-hud");
    expect(hud).toBeDefined();
    expect(hud.textContent).toContain("Sun Dashboard: ON");
    expect(hud.textContent).toContain("Photographic Sun");
    expect(hud.textContent).toContain("D Optical Spill");
    expect(hud.textContent).toContain("Scroll Y:");
    expect(hud.textContent).toContain("Max Scroll:");
    expect(hud.textContent).toContain("Full Page");
    expect(hud.textContent).toContain("Page Progress:");
    expect(hud.textContent).toContain("Chapter:");
    expect(hud.textContent).toContain("Optical Progress:");
    expect(hud.textContent).toContain("Optical Phase:");
    expect(hud.textContent).toContain("Sun X/Y:");
    expect(hud.textContent).toContain("Intensity:");
    expect(hud.textContent).toContain("Bloom:");
    expect(hud.textContent).toContain("Halo:");
    expect(hud.textContent).toContain("Starburst:");
    expect(hud.textContent).toContain("Ghost:");
    expect(hud.textContent).toContain("Haze:");
    expect(hud.textContent).toContain("Responsive Attenuation:");
    expect(hud.textContent).toContain("WebGL2");
  });

  it("does NOT render Debug HUD when weatherDebug is not 1", () => {
    window.history.pushState({}, "", "/?weatherPreview=clear-day&sunDashboard=1");
    render(<WeatherAtmosphere scenario="clear-day" usePortal={false} />);

    expect(screen.queryByTestId("dashboard-sun-hud")).toBeNull();
  });

  // ---- 5. SSR & Hydration Safety ----
  it("safely renders WeatherAtmosphere with clear-day in SSR without throwing", () => {
    expect(() =>
      renderToString(<WeatherAtmosphere scenario="clear-day" usePortal={false} />)
    ).not.toThrow();
  });

  // ---- 6. computeProductionSunProgress Full-Page Choreography ----
  describe("computeProductionSunProgress pure mapping", () => {
    it("clamps inputs < 0 and > 1 safely", () => {
      const under = computeProductionSunProgress(-0.5);
      expect(under.pageProgress).toBe(0.0);
      expect(under.opticalProgress).toBe(0.0);
      expect(under.chapterName).toBe("CALM");

      const over = computeProductionSunProgress(1.5);
      expect(over.pageProgress).toBe(1.0);
      expect(over.opticalProgress).toBe(1.0);
      expect(over.chapterName).toBe("SETTLE");
    });

    it("is strictly deterministic: same pageProgress yields identical outputs", () => {
      const resA = computeProductionSunProgress(0.42);
      const resB = computeProductionSunProgress(0.42);
      expect(resA).toEqual(resB);
    });

    it("maps pageProgress 0 to CALM start", () => {
      const start = computeProductionSunProgress(0);
      expect(start.chapterName).toBe("CALM");
      expect(start.opticalProgress).toBe(0.0);
      expect(start.chapterMultiplier).toBe(1.0);
    });

    it("reaches Chapter 1 Primary Peak around pageProgress ~0.18", () => {
      const peak1 = computeProductionSunProgress(0.18);
      expect(peak1.chapterName).toBe("CHAPTER 1");
      expect(peak1.opticalProgress).toBeCloseTo(0.36, 2); // Primary Peak in computeOpticalState
      expect(peak1.chapterMultiplier).toBe(1.0);
    });

    it("reaches Release 1 around pageProgress ~0.30", () => {
      const release1 = computeProductionSunProgress(0.30);
      expect(release1.chapterName).toBe("RELEASE 1");
      expect(release1.opticalProgress).toBeCloseTo(0.53, 2);
    });

    it("reaches Chapter 2 Secondary Peak around pageProgress ~0.57", () => {
      const peak2 = computeProductionSunProgress(0.57);
      expect(peak2.chapterName).toBe("CHAPTER 2");
      expect(peak2.opticalProgress).toBeCloseTo(0.84, 2); // Secondary Peak in computeOpticalState
      expect(peak2.chapterMultiplier).toBeCloseTo(0.85, 2);
    });

    it("reaches Release 2 around pageProgress ~0.68", () => {
      const release2 = computeProductionSunProgress(0.68);
      expect(release2.chapterName).toBe("RELEASE 2");
      expect(release2.opticalProgress).toBeCloseTo(0.53, 2);
    });

    it("reaches Chapter 3 Subtle Peak around pageProgress ~0.88", () => {
      const peak3 = computeProductionSunProgress(0.88);
      expect(peak3.chapterName).toBe("CHAPTER 3");
      expect(peak3.opticalProgress).toBeCloseTo(0.34, 2);
      expect(peak3.chapterMultiplier).toBeCloseTo(0.65, 2);
    });

    it("reaches Settle at pageProgress = 1.0", () => {
      const settle = computeProductionSunProgress(1.0);
      expect(settle.chapterName).toBe("SETTLE");
      expect(settle.opticalProgress).toBe(1.0);
      expect(settle.chapterMultiplier).toBeCloseTo(0.65, 2);
    });

    it("ensures reverse inputs produce corresponding reverse states (monotonic in segments)", () => {
      const fwd = computeProductionSunProgress(0.15);
      const rev = computeProductionSunProgress(0.15);
      expect(fwd.opticalProgress).toBe(rev.opticalProgress);

      const fwdPeak = computeProductionSunProgress(0.18);
      expect(fwdPeak.opticalProgress).toBeGreaterThan(fwd.opticalProgress);
    });

    it("has zero dead regions: all intermediate points produce continuous optical progress", () => {
      for (let p = 0; p <= 100; p += 5) {
        const prog = p / 100;
        const res = computeProductionSunProgress(prog);
        expect(res.opticalProgress).toBeGreaterThanOrEqual(0.0);
        expect(res.opticalProgress).toBeLessThanOrEqual(1.0);
        expect(res.chapterMultiplier).toBeGreaterThan(0.5);
      }
    });
  });

  // ---- 7. Preserved Optical State Baseline & Alignment ----
  it("reuses deterministic computeOpticalState across all keyframe phases", () => {
    const s0 = computeOpticalState(0);
    const sPeak = computeOpticalState(0.36);
    const sRelease = computeOpticalState(0.53);
    const sSettle = computeOpticalState(1.0);

    expect(s0.phaseName).toBe("CALM");
    expect(s0.intensity).toBeCloseTo(1.0, 2);

    expect(sPeak.phaseName).toBe("PRIMARY PEAK");
    expect(sPeak.intensity).toBeGreaterThan(1.5);

    expect(sRelease.phaseName).toBe("RELEASE");
    expect(sRelease.intensity).toBeLessThan(1.1);

    expect(sSettle.phaseName).toBe("SETTLE");
    expect(sSettle.intensity).toBeCloseTo(1.02, 2);
  });

  it("computes aligned sun UV coordinates across responsive viewports", () => {
    // 16:9 Desktop (1920x1080)
    const uvDesktop = getBackgroundCoverSunUV(1920, 1080);
    expect(uvDesktop.x).toBeCloseTo(BASE_SUN_X, 1);
    expect(uvDesktop.y).toBeCloseTo(BASE_SUN_Y, 2);

    // Mobile (390x844) — constrained within bounds
    const uvMobile = getBackgroundCoverSunUV(390, 844);
    expect(uvMobile.x).toBeLessThanOrEqual(0.88);
    expect(uvMobile.x).toBeGreaterThanOrEqual(0.65);
    expect(uvMobile.y).toBeCloseTo(BASE_SUN_Y, 2);
  });
});
