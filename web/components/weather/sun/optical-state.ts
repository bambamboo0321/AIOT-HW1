/**
 * Camera-Driven Optical Choreography & Deterministic State Computation
 * Milestone M13.9 & M13.10
 *
 * Physical Model:
 *   SUN ≈ Fixed world light source based on weather-bg.webp composition (0.78, 0.16).
 *   SCROLL ≈ Camera / observer / composition movement.
 *   Camera orientation changes → relationship to sun changes → lens flare optical response changes.
 *   Sun position only exhibits subtle drift (±0.02 ~ ±0.035), NOT flying across the sky.
 *
 * Multi-Peak Choreography:
 *   0.00: CALM (clean baseline sunlight, very restrained flare)
 *   0.15–0.22: APPROACH (camera approaches direct optical axis, rays/bloom build)
 *   0.32–0.40: PRIMARY PEAK (strongest lens flare, major halo, ghosts, starburst)
 *   0.48–0.58: RELEASE (camera leaves axis, flare drops back to clean sunlight)
 *   0.68–0.76: SECOND APPROACH (approaches axis from a different angle)
 *   0.80–0.88: SECONDARY PEAK (distinct secondary peak, different halo offset and ghost spread)
 *   1.00: SETTLE (settles back to calm sunlight)
 *
 * Deterministic:
 *   computeOpticalState(progress) is a pure function. Same progress = same state, always.
 *   Stop = freeze. Reverse = exact reverse.
 */

import {
  OpticalPhaseName,
  ProductionChapterName,
  OpticalState,
  SunState,
} from "./sun-types";

export const BASE_SUN_X = 0.78;
export const BASE_SUN_Y = 0.16;

export interface Keyframe {
  t: number;
  sunDriftX: number;
  sunDriftY: number;
  viewOffsetX: number;
  viewOffsetY: number;
  intensity: number;
  bloom: number;
  haloStrength: number;
  haloScale: number;
  haloOffset: number;
  starburst: number;
  ghostStrength: number;
  ghostSpread: number;
  chromatic: number;
  haze: number;
  phaseName: OpticalPhaseName;
}

export const OPTICAL_KEYFRAMES: Keyframe[] = [
  {
    t: 0.00,
    sunDriftX: 0.000,
    sunDriftY: 0.000,
    viewOffsetX: -0.020,
    viewOffsetY: 0.015,
    intensity: 1.00,
    bloom: 0.55,
    haloStrength: 0.18,
    haloScale: 0.85,
    haloOffset: 0.00,
    starburst: 0.25,
    ghostStrength: 0.15,
    ghostSpread: 0.90,
    chromatic: 0.30,
    haze: 0.28,
    phaseName: "CALM",
  },
  {
    t: 0.18,
    sunDriftX: 0.012,
    sunDriftY: -0.008,
    viewOffsetX: -0.010,
    viewOffsetY: 0.008,
    intensity: 1.28,
    bloom: 0.88,
    haloStrength: 0.65,
    haloScale: 1.00,
    haloOffset: 0.05,
    starburst: 0.70,
    ghostStrength: 0.55,
    ghostSpread: 1.00,
    chromatic: 0.45,
    haze: 0.45,
    phaseName: "APPROACH",
  },
  {
    t: 0.36,
    sunDriftX: 0.025,
    sunDriftY: -0.020,
    viewOffsetX: 0.005,
    viewOffsetY: -0.005,
    intensity: 1.58,
    bloom: 1.25,
    haloStrength: 1.22,
    haloScale: 1.18,
    haloOffset: 0.12,
    starburst: 1.30,
    ghostStrength: 1.00,
    ghostSpread: 1.12,
    chromatic: 0.75,
    haze: 0.68,
    phaseName: "PRIMARY PEAK",
  },
  {
    t: 0.53,
    sunDriftX: 0.010,
    sunDriftY: -0.006,
    viewOffsetX: 0.015,
    viewOffsetY: -0.012,
    intensity: 1.06,
    bloom: 0.62,
    haloStrength: 0.24,
    haloScale: 0.90,
    haloOffset: 0.04,
    starburst: 0.32,
    ghostStrength: 0.22,
    ghostSpread: 0.85,
    chromatic: 0.35,
    haze: 0.32,
    phaseName: "RELEASE",
  },
  {
    t: 0.72,
    sunDriftX: -0.008,
    sunDriftY: 0.010,
    viewOffsetX: 0.020,
    viewOffsetY: -0.018,
    intensity: 1.22,
    bloom: 0.82,
    haloStrength: 0.52,
    haloScale: 1.02,
    haloOffset: -0.02,
    starburst: 0.65,
    ghostStrength: 0.48,
    ghostSpread: 1.18,
    chromatic: 0.48,
    haze: 0.46,
    phaseName: "SECOND APPROACH",
  },
  {
    t: 0.84,
    sunDriftX: -0.018,
    sunDriftY: 0.016,
    viewOffsetX: 0.028,
    viewOffsetY: -0.022,
    intensity: 1.35,
    bloom: 1.02,
    haloStrength: 0.82,
    haloScale: 1.08,
    haloOffset: -0.06,
    starburst: 0.92,
    ghostStrength: 0.72,
    ghostSpread: 1.35,
    chromatic: 0.60,
    haze: 0.55,
    phaseName: "SECONDARY PEAK",
  },
  {
    t: 1.00,
    sunDriftX: -0.005,
    sunDriftY: 0.004,
    viewOffsetX: 0.035,
    viewOffsetY: -0.025,
    intensity: 1.02,
    bloom: 0.58,
    haloStrength: 0.20,
    haloScale: 0.88,
    haloOffset: -0.01,
    starburst: 0.28,
    ghostStrength: 0.18,
    ghostSpread: 0.95,
    chromatic: 0.32,
    haze: 0.30,
    phaseName: "SETTLE",
  },
];

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Pure deterministic mapping: progress [0, 1] → OpticalState.
 * Clamps input to [0, 1]. Same input always yields identical output.
 */
export function computeOpticalState(rawProgress: number): OpticalState {
  const p = Math.max(0, Math.min(1, rawProgress));

  let k0 = OPTICAL_KEYFRAMES[0];
  let k1 = OPTICAL_KEYFRAMES[1];
  for (let i = 0; i < OPTICAL_KEYFRAMES.length - 1; i++) {
    if (p <= OPTICAL_KEYFRAMES[i + 1].t) {
      k0 = OPTICAL_KEYFRAMES[i];
      k1 = OPTICAL_KEYFRAMES[i + 1];
      break;
    }
  }

  const span = k1.t - k0.t;
  const factor = span > 0 ? smoothstep(0, 1, (p - k0.t) / span) : 0;

  const sunX = BASE_SUN_X + lerp(k0.sunDriftX, k1.sunDriftX, factor);
  const sunY = BASE_SUN_Y + lerp(k0.sunDriftY, k1.sunDriftY, factor);
  const viewOffsetX = lerp(k0.viewOffsetX, k1.viewOffsetX, factor);
  const viewOffsetY = lerp(k0.viewOffsetY, k1.viewOffsetY, factor);

  const opticalCenterX = 0.5 + viewOffsetX;
  const opticalCenterY = 0.5 + viewOffsetY;
  const flareAxisAngle = Math.atan2(opticalCenterY - sunY, opticalCenterX - sunX);

  const intensity     = lerp(k0.intensity, k1.intensity, factor);
  const bloom         = lerp(k0.bloom, k1.bloom, factor);
  const haloStrength  = lerp(k0.haloStrength, k1.haloStrength, factor);
  const haloScale     = lerp(k0.haloScale, k1.haloScale, factor);
  const haloOffset    = lerp(k0.haloOffset, k1.haloOffset, factor);
  const starburst     = lerp(k0.starburst, k1.starburst, factor);
  const ghostStrength = lerp(k0.ghostStrength, k1.ghostStrength, factor);
  const ghostSpread   = lerp(k0.ghostSpread, k1.ghostSpread, factor);
  const chromatic     = lerp(k0.chromatic, k1.chromatic, factor);
  const haze          = lerp(k0.haze, k1.haze, factor);

  const phaseName: OpticalPhaseName = factor < 0.5 ? k0.phaseName : k1.phaseName;

  return {
    sunX,
    sunY,
    viewOffsetX,
    viewOffsetY,
    flareAxisAngle,
    intensity,
    bloom,
    haloStrength,
    haloScale,
    haloOffset,
    starburst,
    ghostStrength,
    ghostSpread,
    chromatic,
    haze,
    phaseName,
  };
}

/**
 * Backward-compatible computeSunState wrapper.
 */
export function computeSunState(rawProgress: number): SunState {
  const opt = computeOpticalState(rawProgress);
  return {
    ...opt,
    halo: opt.haloStrength,
  };
}

/**
 * Projects the image sun position according to CSS `background-size: cover; background-position: center top`
 * used on .weather-bg-layer.
 *
 * Ensures the WebGL sun aligns with the underlying photographic background across viewports.
 */
export function getBackgroundCoverSunUV(
  viewportWidth: number,
  viewportHeight: number,
  baseSunDriftX: number = 0,
  baseSunDriftY: number = 0
): { x: number; y: number } {
  const imgW = 1376;
  const imgH = 768;
  const imgAspect = imgW / imgH; // ~1.79167
  const vpAspect = Math.max(0.1, viewportWidth / Math.max(1, viewportHeight));

  const imgSunX = BASE_SUN_X + baseSunDriftX;
  const imgSunY = BASE_SUN_Y + baseSunDriftY;

  let screenX = imgSunX;
  let screenY = imgSunY;

  if (vpAspect < imgAspect) {
    // Viewport is taller/narrower than image (e.g. mobile or 16:10 desktop)
    // CSS cover fits height, horizontal overflow is centered
    const scale = imgAspect / vpAspect;
    screenX = 0.5 + (imgSunX - 0.5) * scale;
    screenY = imgSunY;
  } else {
    // Viewport is wider than image (e.g. ultrawide)
    // CSS cover fits width, vertical overflow is clipped at bottom
    const scale = vpAspect / imgAspect;
    screenX = imgSunX;
    screenY = imgSunY * scale;
  }

  // Graceful mobile boundary constraint: keep sun attractively in top-right sky
  if (screenX > 0.88) {
    screenX = 0.88;
  } else if (screenX < 0.65 && imgSunX > 0.65) {
    screenX = 0.65;
  }

  return { x: screenX, y: screenY };
}

export interface ProductionSunProgressResult {
  pageProgress: number;
  opticalProgress: number;
  chapterName: ProductionChapterName;
  chapterMultiplier: number;
}

/**
 * Milestone M13.10.2: Full-Page Multi-Chapter Production Sun Choreography.
 *
 * Maps continuous document pageProgress [0, 1] across the entire Dashboard
 * to localized opticalProgress [0, 1] consumed by computeOpticalState(opticalProgress).
 *
 * Timeline Architecture:
 *   [0.00, 0.10): CALM → quiet natural light at page top
 *   [0.10, 0.24): CHAPTER 1 → primary peak (0.18) cinematic lens flare encounter
 *   [0.24, 0.38): RELEASE 1 → light leaves, graceful return to readable calm
 *   [0.38, 0.57): CHAPTER 2 → second optical encounter reaching secondary peak (0.57)
 *   [0.57, 0.74): RELEASE 2 → release and calm reading through charts / map
 *   [0.74, 0.95): CHAPTER 3 → third subtle encounter (0.88 subtle peak)
 *   [0.95, 1.00]: SETTLE → final restful settle at footer
 *
 * Guarantees:
 *   - Clamps < 0 to 0.0, > 1 to 1.0
 *   - Continuous (C0) across all boundaries: zero jumps
 *   - Deterministic: same pageProgress → identical output
 *   - Stop = exact freeze, reverse scroll = exact reverse
 *   - Zero dead scroll region across the entire page
 */
export function computeProductionSunProgress(
  rawPageProgress: number
): ProductionSunProgressResult {
  const p = Math.max(0, Math.min(1, rawPageProgress));

  // Chapter 1 & Pre-Calm: [0.00, 0.38]
  if (p < 0.10) {
    // 0.00 -> 0.10: CALM to APPROACH 1
    const frac = p / 0.10;
    return {
      pageProgress: p,
      opticalProgress: lerp(0.00, 0.18, frac),
      chapterName: "CALM",
      chapterMultiplier: 1.00,
    };
  }
  if (p < 0.18) {
    // 0.10 -> 0.18: APPROACH 1 to PRIMARY PEAK
    const frac = (p - 0.10) / (0.18 - 0.10);
    return {
      pageProgress: p,
      opticalProgress: lerp(0.18, 0.36, frac),
      chapterName: "CHAPTER 1",
      chapterMultiplier: 1.00,
    };
  }
  if (p < 0.24) {
    // 0.18 -> 0.24: PRIMARY PEAK crest
    const frac = (p - 0.18) / (0.24 - 0.18);
    return {
      pageProgress: p,
      opticalProgress: lerp(0.36, 0.44, frac),
      chapterName: "CHAPTER 1",
      chapterMultiplier: 1.00,
    };
  }
  if (p < 0.30) {
    // 0.24 -> 0.30: RELEASE 1
    const frac = (p - 0.24) / (0.30 - 0.24);
    return {
      pageProgress: p,
      opticalProgress: lerp(0.44, 0.53, frac),
      chapterName: "RELEASE 1",
      chapterMultiplier: 1.00,
    };
  }
  if (p < 0.38) {
    // 0.30 -> 0.38: Return to Calm
    const frac = (p - 0.30) / (0.38 - 0.30);
    return {
      pageProgress: p,
      opticalProgress: lerp(0.53, 0.00, frac),
      chapterName: "RELEASE 1",
      chapterMultiplier: 1.00,
    };
  }

  // Chapter 2: [0.38, 0.74]
  if (p < 0.48) {
    // 0.38 -> 0.48: APPROACH 2
    const frac = (p - 0.38) / (0.48 - 0.38);
    return {
      pageProgress: p,
      opticalProgress: lerp(0.00, 0.72, frac),
      chapterName: "CHAPTER 2",
      chapterMultiplier: 0.85,
    };
  }
  if (p <= 0.57) {
    // 0.48 -> 0.57: SECONDARY PEAK
    const frac = (p - 0.48) / (0.57 - 0.48);
    return {
      pageProgress: p,
      opticalProgress: lerp(0.72, 0.84, frac),
      chapterName: "CHAPTER 2",
      chapterMultiplier: 0.85,
    };
  }
  if (p < 0.68) {
    // 0.57 -> 0.68: RELEASE 2
    const frac = (p - 0.57) / (0.68 - 0.57);
    return {
      pageProgress: p,
      opticalProgress: lerp(0.84, 0.53, frac),
      chapterName: "RELEASE 2",
      chapterMultiplier: 0.85,
    };
  }
  if (p < 0.74) {
    // 0.68 -> 0.74: Return to Calm
    const frac = (p - 0.68) / (0.74 - 0.68);
    return {
      pageProgress: p,
      opticalProgress: lerp(0.53, 0.00, frac),
      chapterName: "RELEASE 2",
      chapterMultiplier: 0.85,
    };
  }

  // Chapter 3: [0.74, 0.95]
  if (p < 0.82) {
    // 0.74 -> 0.82: APPROACH 3
    const frac = (p - 0.74) / (0.82 - 0.74);
    return {
      pageProgress: p,
      opticalProgress: lerp(0.00, 0.18, frac),
      chapterName: "CHAPTER 3",
      chapterMultiplier: 0.65,
    };
  }
  if (p <= 0.88) {
    // 0.82 -> 0.88: SUBTLE PEAK
    const frac = (p - 0.82) / (0.88 - 0.82);
    return {
      pageProgress: p,
      opticalProgress: lerp(0.18, 0.34, frac),
      chapterName: "CHAPTER 3",
      chapterMultiplier: 0.65,
    };
  }
  if (p < 0.95) {
    // 0.88 -> 0.95: RELEASE 3
    const frac = (p - 0.88) / (0.95 - 0.88);
    return {
      pageProgress: p,
      opticalProgress: lerp(0.34, 0.53, frac),
      chapterName: "CHAPTER 3",
      chapterMultiplier: 0.65,
    };
  }

  // Settle: [0.95, 1.00]
  const frac = (p - 0.95) / (1.00 - 0.95);
  return {
    pageProgress: p,
    opticalProgress: lerp(0.53, 1.00, frac),
    chapterName: "SETTLE",
    chapterMultiplier: 0.65,
  };
}
