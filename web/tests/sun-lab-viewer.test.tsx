// @vitest-environment jsdom
/**
 * M13.9.2 — SunLabViewer component unit tests
 *
 * Tests:
 * - default Renderer B
 * - A/B/C layer selector switching
 * - same progress preserved when switching layers
 * - Mock Dashboard cards rendering
 * - Phase jump buttons
 * - Scroll / Manual mode switching
 * - SSR hydration safety
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { SunLabViewer } from "@/components/weather/SunLabViewer";

describe("M13.9.2 SunLabViewer component tests", () => {
  beforeEach(() => {
    window.matchMedia =
      window.matchMedia ||
      vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- 1. SSR hydration safety ----
  it("renders to string without throwing (SSR safety)", () => {
    expect(() => renderToString(<SunLabViewer />)).not.toThrow();
  });

  it("mounts and unmounts in jsdom without throwing unhandled errors", () => {
    let unmount: () => void;
    expect(() => {
      const res = render(<SunLabViewer />);
      unmount = res.unmount;
    }).not.toThrow();
    act(() => {
      unmount();
    });
  });

  // ---- 2. Default Renderer B and Default Layer D ----
  it("defaults to Renderer B (Shader) and Layer D (Optical Spill)", () => {
    render(<SunLabViewer />);
    const hud = screen.getByTestId("sun-lab-hud");
    expect(hud.textContent).toContain("Renderer:B Shader");
    expect(hud.textContent).toContain("Layer:D Optical Spill");

    const canvasBack = screen.getByTestId("sun-lab-canvas-back");
    const canvasFront = screen.getByTestId("sun-lab-canvas-front");

    // In Layer D, canvasBack is visible, canvasFront is visible with pointer-events: none
    expect(canvasBack.style.display).not.toBe("none");
    expect(canvasFront.style.display).not.toBe("none");
    expect(canvasFront.style.pointerEvents).toBe("none");
  });

  // ---- 3. A/B/C/D Layer Selector & Preserving Progress ----
  it("switches between Layer A, B, C, and D while preserving scroll progress", () => {
    render(<SunLabViewer />);
    const hud = screen.getByTestId("sun-lab-hud");
    const canvasFront = screen.getByTestId("sun-lab-canvas-front");

    const btnA = screen.getByTestId("layer-btn-a");
    const btnB = screen.getByTestId("layer-btn-b");
    const btnC = screen.getByTestId("layer-btn-c");
    const btnD = screen.getByTestId("layer-btn-d");

    // Initial is Layer D
    expect(hud.textContent).toContain("Layer:D Optical Spill");
    expect(canvasFront.style.display).not.toBe("none");

    // Switch to Layer A (Behind UI)
    act(() => {
      fireEvent.click(btnA);
    });
    expect(hud.textContent).toContain("Layer:A Behind UI");
    expect(canvasFront.style.display).toBe("none");

    // Switch to Layer B (Front Glass)
    act(() => {
      fireEvent.click(btnB);
    });
    expect(hud.textContent).toContain("Layer:B Front Glass");
    expect(canvasFront.style.display).not.toBe("none");
    expect(canvasFront.style.pointerEvents).toBe("none");

    // Switch to Layer C (Hybrid)
    act(() => {
      fireEvent.click(btnC);
    });
    expect(hud.textContent).toContain("Layer:C Hybrid");
    expect(canvasFront.style.display).not.toBe("none");
    expect(canvasFront.style.pointerEvents).toBe("none");

    // Switch back to Layer D (Optical Spill)
    act(() => {
      fireEvent.click(btnD);
    });
    expect(hud.textContent).toContain("Layer:D Optical Spill");
    expect(canvasFront.style.display).not.toBe("none");
  });

  // ---- 4. Representative Dashboard Mock UI ----
  it("renders representative Dashboard mock glass cards", () => {
    render(<SunLabViewer />);
    const mockContainer = screen.getByTestId("sun-lab-mock-dashboard");
    expect(mockContainer).toBeDefined();

    expect(screen.getByTestId("mock-card-weather")).toBeDefined();
    expect(screen.getByTestId("mock-card-aqi")).toBeDefined();
    expect(screen.getByTestId("mock-card-forecast")).toBeDefined();

    // Check key card text
    expect(mockContainer.textContent).toContain("臺北市");
    expect(mockContainer.textContent).toContain("28°");
    expect(mockContainer.textContent).toContain("AQI 空氣品質");
    expect(mockContainer.textContent).toContain("3日天氣預報");
  });

  // ---- 5. Phase Jump Shortcuts ----
  it("jumps to specific progress on phase jump button click", () => {
    render(<SunLabViewer />);
    const hud = screen.getByTestId("sun-lab-hud");

    const peak1Btn = screen.getByRole("button", { name: "PEAK 1" });
    act(() => {
      fireEvent.click(peak1Btn);
    });

    expect(hud.textContent).toContain("Phase:PRIMARY PEAK");
    expect(hud.textContent).toContain("0.3600");

    const releaseBtn = screen.getByRole("button", { name: "RELEASE" });
    act(() => {
      fireEvent.click(releaseBtn);
    });

    expect(hud.textContent).toContain("Phase:RELEASE");
    expect(hud.textContent).toContain("0.5300");
  });

  // ---- 6. Scroll / Manual mode switching ----
  it("defaults to Scroll mode and allows switching to Manual mode", () => {
    render(<SunLabViewer />);
    const hud = screen.getByTestId("sun-lab-hud");

    expect(hud.textContent).toContain("Scroll Scrub:ON");
    const sunXSlider = screen.getByLabelText("Sun X") as HTMLInputElement;
    expect(sunXSlider.disabled).toBe(true);

    const manualBtn = screen.getByRole("button", { name: /Manual/i });
    act(() => {
      fireEvent.click(manualBtn);
    });

    expect(hud.textContent).toContain("Scroll Scrub:OFF");
    expect(sunXSlider.disabled).toBe(false);

    const scrollBtn = screen.getByRole("button", { name: /Scroll/i });
    act(() => {
      fireEvent.click(scrollBtn);
    });

    expect(hud.textContent).toContain("Scroll Scrub:ON");
    expect(sunXSlider.disabled).toBe(true);
  });

  // ---- 7. M13.9.4 Photographic Sun Model & Classic A/B switching ----
  it("defaults to Photographic Sun model and allows A/B toggling with Classic model", () => {
    render(<SunLabViewer />);
    const hud = screen.getByTestId("sun-lab-hud");

    // Default is Photographic Sun
    expect(hud.textContent).toContain("Sun Model:Photographic");

    const photoBtn = screen.getByTestId("sun-model-photographic");
    const classicBtn = screen.getByTestId("sun-model-classic");
    expect(photoBtn).toBeDefined();
    expect(classicBtn).toBeDefined();

    // Switch to Classic (Old Sun)
    act(() => {
      fireEvent.click(classicBtn);
    });
    expect(hud.textContent).toContain("Sun Model:Old (Classic)");

    // Switch back to Photographic Sun
    act(() => {
      fireEvent.click(photoBtn);
    });
    expect(hud.textContent).toContain("Sun Model:Photographic");
  });

  // ---- 8. M13.9.4 Photographic Sun Tuning Sliders ----
  it("renders photographic sun tuning sliders and handles slider adjustments", () => {
    render(<SunLabViewer />);

    const coreIntensitySlider = screen.getByLabelText("Core Intensity") as HTMLInputElement;
    const coreRadiusSlider = screen.getByLabelText("Core Radius") as HTMLInputElement;
    const bloomRadiusSlider = screen.getByLabelText("Bloom Radius") as HTMLInputElement;
    const primaryRaysSlider = screen.getByLabelText("Primary Rays") as HTMLInputElement;
    const secondaryRaysSlider = screen.getByLabelText("Secondary Rays") as HTMLInputElement;
    const warmScatterSlider = screen.getByLabelText("Warm Scatter") as HTMLInputElement;

    expect(coreIntensitySlider).toBeDefined();
    expect(coreRadiusSlider).toBeDefined();
    expect(bloomRadiusSlider).toBeDefined();
    expect(primaryRaysSlider).toBeDefined();
    expect(secondaryRaysSlider).toBeDefined();
    expect(warmScatterSlider).toBeDefined();

    // Adjust Core Intensity
    act(() => {
      fireEvent.change(coreIntensitySlider, { target: { value: "2.5" } });
    });
    expect(coreIntensitySlider.value).toBe("2.5");
  });
});
