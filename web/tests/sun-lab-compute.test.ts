/**
 * M13.9.2 — computeOpticalState() & computeSunState() unit tests
 *
 * Tests the pure deterministic camera-driven optical mapping function.
 * Does NOT test pixel-perfect shader output.
 */

import { describe, it, expect } from "vitest";
import {
  computeOpticalState,
  computeSunState,
  BASE_SUN_X,
  BASE_SUN_Y,
} from "@/components/weather/SunLabViewer";

describe("M13.9.2 computeOpticalState — camera-driven optical choreography", () => {
  // ---- 1. Clamping ----
  it("clamps progress below 0 to progress=0", () => {
    const s0 = computeOpticalState(0);
    const sMinus = computeOpticalState(-0.5);
    const sMinus2 = computeOpticalState(-99);
    expect(sMinus.sunX).toBeCloseTo(s0.sunX, 6);
    expect(sMinus.sunY).toBeCloseTo(s0.sunY, 6);
    expect(sMinus2.intensity).toBeCloseTo(s0.intensity, 6);
    expect(sMinus.phaseName).toBe("CALM");
  });

  it("clamps progress above 1 to progress=1", () => {
    const s1 = computeOpticalState(1);
    const sOver = computeOpticalState(1.5);
    const sOver2 = computeOpticalState(999);
    expect(sOver.sunX).toBeCloseTo(s1.sunX, 6);
    expect(sOver.sunY).toBeCloseTo(s1.sunY, 6);
    expect(sOver2.haze).toBeCloseTo(s1.haze, 6);
    expect(sOver.phaseName).toBe("SETTLE");
  });

  // ---- 2. Determinism: same progress = same state ----
  it("is deterministic: same progress always returns identical output", () => {
    const testValues = [0, 0.18, 0.36, 0.53, 0.72, 0.84, 1.0];
    for (const t of testValues) {
      const a = computeOpticalState(t);
      const b = computeOpticalState(t);
      expect(a.sunX).toBe(b.sunX);
      expect(a.sunY).toBe(b.sunY);
      expect(a.viewOffsetX).toBe(b.viewOffsetX);
      expect(a.viewOffsetY).toBe(b.viewOffsetY);
      expect(a.flareAxisAngle).toBe(b.flareAxisAngle);
      expect(a.intensity).toBe(b.intensity);
      expect(a.bloom).toBe(b.bloom);
      expect(a.haloStrength).toBe(b.haloStrength);
      expect(a.haloScale).toBe(b.haloScale);
      expect(a.haloOffset).toBe(b.haloOffset);
      expect(a.starburst).toBe(b.starburst);
      expect(a.ghostStrength).toBe(b.ghostStrength);
      expect(a.ghostSpread).toBe(b.ghostSpread);
      expect(a.chromatic).toBe(b.chromatic);
      expect(a.haze).toBe(b.haze);
      expect(a.phaseName).toBe(b.phaseName);
    }
  });

  // ---- 3. Physical model: Sun drift remains within intended bound (±0.05) ----
  it("sun position remains close to fixed world light source (drift within ±0.05)", () => {
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      const s = computeOpticalState(t);
      const driftX = Math.abs(s.sunX - BASE_SUN_X);
      const driftY = Math.abs(s.sunY - BASE_SUN_Y);
      expect(driftX).toBeLessThanOrEqual(0.05);
      expect(driftY).toBeLessThanOrEqual(0.05);
    }
  });

  // ---- 4. Choreography: Phase boundary names ----
  it("reports correct phase names across key progress points", () => {
    expect(computeOpticalState(0.00).phaseName).toBe("CALM");
    expect(computeOpticalState(0.18).phaseName).toBe("APPROACH");
    expect(computeOpticalState(0.36).phaseName).toBe("PRIMARY PEAK");
    expect(computeOpticalState(0.53).phaseName).toBe("RELEASE");
    expect(computeOpticalState(0.72).phaseName).toBe("SECOND APPROACH");
    expect(computeOpticalState(0.84).phaseName).toBe("SECONDARY PEAK");
    expect(computeOpticalState(1.00).phaseName).toBe("SETTLE");
  });

  // ---- 5. Multi-peak: Primary Peak > Release intensity ----
  it("primary peak intensity is substantially higher than release and calm", () => {
    const calm = computeOpticalState(0.00);
    const peak1 = computeOpticalState(0.36);
    const release = computeOpticalState(0.53);

    expect(peak1.intensity).toBeGreaterThan(release.intensity);
    expect(peak1.intensity).toBeGreaterThan(calm.intensity);
    expect(peak1.intensity).toBeGreaterThanOrEqual(1.50);

    expect(peak1.haloStrength).toBeGreaterThan(release.haloStrength);
    expect(peak1.starburst).toBeGreaterThan(release.starburst);
    expect(peak1.ghostStrength).toBeGreaterThan(release.ghostStrength);

    // Release is not zero (retains subtle sunlight atmosphere)
    expect(release.intensity).toBeGreaterThan(1.0);
    expect(release.haloStrength).toBeGreaterThan(0.15);
  });

  // ---- 6. Secondary peak differs from primary peak ----
  it("secondary peak differs from primary peak in intensity, halo offset, and ghost spread", () => {
    const peak1 = computeOpticalState(0.36);
    const peak2 = computeOpticalState(0.84);

    // Secondary peak is weaker than primary peak
    expect(peak2.intensity).toBeLessThan(peak1.intensity);
    expect(peak2.intensity).toBeGreaterThan(1.25);

    // Halo offset has different direction/value
    expect(peak1.haloOffset).toBeGreaterThan(0);
    expect(peak2.haloOffset).toBeLessThan(0);

    // Ghost spread is different
    expect(peak2.ghostSpread).toBeGreaterThan(peak1.ghostSpread);
  });

  // ---- 7. Reverse test: exact reverse ----
  it("reverse test: forward and backward to same progress produces identical state", () => {
    const forward = computeOpticalState(0.53);
    const backward = computeOpticalState(0.53);
    expect(backward.sunX).toBe(forward.sunX);
    expect(backward.sunY).toBe(forward.sunY);
    expect(backward.intensity).toBe(forward.intensity);
    expect(backward.haloStrength).toBe(forward.haloStrength);
    expect(backward.haloOffset).toBe(forward.haloOffset);
    expect(backward.starburst).toBe(forward.starburst);
    expect(backward.phaseName).toBe(forward.phaseName);
  });

  // ---- 8. Backward-compatible computeSunState ----
  it("computeSunState wrapper returns valid SunState with halo alias", () => {
    const s = computeSunState(0.36);
    expect(s.sunX).toBeDefined();
    expect(s.sunY).toBeDefined();
    expect(s.intensity).toBeDefined();
    expect(s.halo).toBe(s.haloStrength);
    expect(s.phaseName).toBe("PRIMARY PEAK");
  });

  // ---- 9. SSR safety ----
  it("does not access window or DOM (safe to execute on server)", () => {
    expect(() => computeOpticalState(0)).not.toThrow();
    expect(() => computeOpticalState(0.5)).not.toThrow();
    expect(() => computeOpticalState(1)).not.toThrow();
  });
});
