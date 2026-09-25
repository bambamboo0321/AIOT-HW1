"use client";

/**
 * M13.9.2 — Photographic Sun / Lens Flare Lab:
 * Camera-Driven Optical Choreography + Layer A/B/C Lab
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
 * Layer Comparison:
 *   Layer A — Behind UI: Background → Full Flare Shader → Mock UI.
 *   Layer B — Front Glass: Background → Mock UI → Full Flare Shader (pointer-events: none).
 *   Layer C — Hybrid: Background → Primary Optical (Behind UI) → Mock UI → Foreground Highlights (Front UI).
 *
 * Deterministic:
 *   computeOpticalState(progress) is a pure function. Same progress = same state, always.
 *   Stop = freeze. Reverse = exact reverse. No temporal breathing in scroll mode.
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";

// ============================================================
// Constants
// ============================================================

const BG_PATH = "/images/weather-bg.webp";

/** Total page height for the scroll prototype, in viewport-height units (300vh). */
const LAB_PAGE_VH = 3;
/** Number of viewport heights of scroll that maps to full 0→1 progress. */
const SCROLL_VH_RANGE = 2; // scroll 200vh → progress 1.0

export const BASE_SUN_X = 0.78;
export const BASE_SUN_Y = 0.16;

// ============================================================
// Types
// ============================================================

export type RendererType = "A" | "B" | "C";
export type LabMode = "scroll" | "manual";
export type LayerMode = "A" | "B" | "C" | "D";
export type SunModelType = "photographic" | "classic";

export type OpticalPhaseName =
  | "CALM"
  | "APPROACH"
  | "PRIMARY PEAK"
  | "RELEASE"
  | "SECOND APPROACH"
  | "SECONDARY PEAK"
  | "SETTLE";

/**
 * Deterministic optical state returned by computeOpticalState(progress).
 */
export interface OpticalState {
  sunX: number;
  sunY: number;
  viewOffsetX: number;
  viewOffsetY: number;
  flareAxisAngle: number;
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

/**
 * Backward-compatible SunState interface for earlier consumers.
 */
export interface SunState extends OpticalState {
  halo: number; // alias to haloStrength
}

interface SunLabParams extends OpticalState {
  renderer: RendererType;
  layerMode: LayerMode;
  sunModel: SunModelType;
  coreIntensity: number;
  coreRadius: number;
  bloomRadius: number;
  primaryRayStr: number;
  secondaryRayStr: number;
  warmScatter: number;
  ghostCount: "low" | "medium" | "high";
  halo: number;
}

// ============================================================
// Multi-Peak Optical Choreography Keyframes
// ============================================================

interface Keyframe {
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

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
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

// ============================================================
// Default params
// ============================================================

const initialOptical = computeOpticalState(0);

const DEFAULT_PARAMS: SunLabParams = {
  renderer: "B",
  layerMode: "D",
  sunModel: "photographic",
  coreIntensity: 2.0,
  coreRadius: 0.026,
  bloomRadius: 0.18,
  primaryRayStr: 1.10,
  secondaryRayStr: 0.50,
  warmScatter: 0.26,
  ...initialOptical,
  halo: initialOptical.haloStrength,
  ghostCount: "medium",
};

// ============================================================
// Renderer B Shader: Screen-Space Lens Flare with Layer Passes
// ============================================================

const SHADER_B_VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, -a_pos.y * 0.5 + 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const SHADER_B_FRAG = `#version 300 es
precision highp float;

uniform sampler2D u_bg;
uniform vec2 u_sunUV;       // sun position in UV [0,1], Y=0=top
uniform vec2 u_resolution;  // canvas pixel dimensions
uniform vec2 u_viewOffset;  // camera view offset [-0.05, 0.05]

uniform float u_intensity;
uniform float u_bloom;
uniform float u_haloStrength;
uniform float u_haloScale;
uniform float u_haloOffset;
uniform float u_starburst;
uniform float u_ghostStrength;
uniform float u_ghostSpread;
uniform float u_ghostCount;
uniform float u_chromatic;
uniform float u_haze;
uniform float u_time;
uniform float u_progress;

// M13.9.4 Photographic Sun Model uniforms
uniform int u_sunModel;         // 1 = Photographic (default), 0 = Classic / Old Sun
uniform float u_coreIntensity;  // Core overexposure multiplier
uniform float u_coreRadius;     // Core physical size
uniform float u_bloomRadius;    // Bloom falloff extent
uniform float u_primaryRayStr;  // Primary spikes intensity
uniform float u_secondaryRayStr;// Secondary & tertiary spikes intensity
uniform float u_warmScatter;    // Localized warm scattering extent

// Layer passes:
// 0 = Full (bg + all flare)
// 1 = Background Pass (bg + sun core + major halo + primary ghosts + haze + 0.75 bloom)
// 2 = Foreground Highlights (starburst + 0.25 bloom + streak + secondary ghost on transparent alpha)
// 3 = Background Only (for Layer B back pass: only bg with 0 flare)
// 4 = Full Flare Transparent (for Layer B front pass: all flare components on transparent alpha)
// 5 = Primary Flare Behind (for Layer D back pass: primary optical components)
// 6 = Foreground Optical Spill (for Layer D front pass: restrained spill across UI)
uniform int u_layerPass;

in vec2 v_uv;
out vec4 fragColor;

#define PI 3.14159265359
#define TAU 6.28318530718

float sunFalloff(float dist, float power) {
  return 1.0 / (1.0 + pow(dist * power, 2.0));
}

// Classic M13.9.3 Starburst (retained for live A/B comparison)
float starburstClassic(vec2 uv, vec2 sunUV, float intensity, float size) {
  vec2 d = uv - sunUV;
  d.x *= u_resolution.x / u_resolution.y;
  float angle = atan(d.y, d.x);
  float dist = length(d);
  float[12] rayAngles = float[12](
    0.00, 0.49, 1.01, 1.61, 2.13, 2.93,
    3.32, 4.19, 4.68, 5.20, 5.79, 6.21
  );
  float[12] rayWeights = float[12](
    1.0, 0.62, 0.85, 0.55, 0.90, 0.45,
    0.78, 0.50, 0.95, 0.60, 0.70, 0.40
  );
  float spike = 0.0;
  for (int i = 0; i < 12; i++) {
    float ang = rayAngles[i];
    float w = rayWeights[i];
    float angleDiff = abs(mod(angle - ang + PI, TAU) - PI);
    float rayWidth = 0.015 + w * 0.008;
    float rayLen = size * w * 1.6;
    float angular = exp(-angleDiff * angleDiff / (rayWidth * rayWidth));
    float radial = exp(-dist * dist / (rayLen * rayLen));
    spike += angular * radial * w;
  }
  return spike * intensity;
}

// M13.9.5 Photographic Starburst:
// 2 Dominant Long Primary Rays + 3 Medium Rays + 8 Extremely Subtle Diffraction Streaks
void starburstPhotographic(
  vec2 uv,
  vec2 sunUV,
  float starburstScale,
  out float primaryOut,
  out float secondaryTertiaryOut
) {
  vec2 d = uv - sunUV;
  d.x *= u_resolution.x / u_resolution.y;
  float angle = atan(d.y, d.x);
  float dist = length(d);

  // 1. Dominant Long Primary Rays (Only 2 dominant asymmetric beams)
  // Ray 0: ~42° (down-left major flare beam), Ray 1: ~221° (asymmetrical counter-beam)
  float[2] P_ANGLES = float[2](0.74, 3.86);
  float[2] P_LENS   = float[2](0.48, 0.38);
  float[2] P_WIDTHS = float[2](0.016, 0.014);
  float[2] P_WEIGHTS= float[2](1.55, 1.20);

  float pSpike = 0.0;
  for (int i = 0; i < 2; i++) {
    float angleDiff = abs(mod(angle - P_ANGLES[i] + PI, TAU) - PI);
    float w = P_WIDTHS[i] * (1.0 + dist * 1.5);
    float angular = exp(-angleDiff * angleDiff / (w * w));
    float len = P_LENS[i] * starburstScale;
    float radial = exp(-pow(dist / len, 1.55));
    pSpike += angular * radial * P_WEIGHTS[i];
  }

  // 2. Medium Rays (3 noticeably shorter, lower weight rays)
  float[3] M_ANGLES = float[3](2.15, 5.48, 1.48);
  float[3] M_LENS   = float[3](0.22, 0.20, 0.16);
  float[3] M_WIDTHS = float[3](0.013, 0.012, 0.011);
  float[3] M_WEIGHTS= float[3](0.60, 0.50, 0.40);

  float mSpike = 0.0;
  for (int i = 0; i < 3; i++) {
    float angleDiff = abs(mod(angle - M_ANGLES[i] + PI, TAU) - PI);
    float w = M_WIDTHS[i] * (1.0 + dist * 1.2);
    float angular = exp(-angleDiff * angleDiff / (w * w));
    float len = M_LENS[i] * starburstScale;
    float radial = exp(-pow(dist / len, 1.70));
    mSpike += angular * radial * M_WEIGHTS[i];
  }

  // 3. Extremely Subtle Diffraction Streaks (8 faint micro-streaks for photographic lens texture)
  float[8] T_ANGLES = float[8](0.35, 1.05, 1.85, 2.65, 3.35, 4.35, 4.95, 5.95);
  float[8] T_LENS   = float[8](0.10, 0.11, 0.09, 0.12, 0.10, 0.11, 0.09, 0.10);
  float[8] T_WIDTHS = float[8](0.008, 0.009, 0.007, 0.009, 0.008, 0.009, 0.007, 0.008);
  float[8] T_WEIGHTS= float[8](0.14, 0.16, 0.11, 0.15, 0.12, 0.16, 0.10, 0.13);

  float tSpike = 0.0;
  for (int i = 0; i < 8; i++) {
    float angleDiff = abs(mod(angle - T_ANGLES[i] + PI, TAU) - PI);
    float w = T_WIDTHS[i];
    float angular = exp(-angleDiff * angleDiff / (w * w));
    float len = T_LENS[i] * starburstScale;
    float radial = exp(-pow(dist / len, 1.85));
    tSpike += angular * radial * T_WEIGHTS[i];
  }

  primaryOut = pSpike;
  secondaryTertiaryOut = mSpike + tSpike;
}

float ghost(vec2 uv, vec2 sunUV, vec2 axis, float fraction, float spread, float radius, float softness) {
  vec2 ghostCenter = sunUV + axis * (fraction * spread);
  vec2 d = uv - ghostCenter;
  d.x *= u_resolution.x / u_resolution.y;
  float dist = length(d);
  float core = smoothstep(radius, radius * softness, dist);
  float ring = smoothstep(radius * (1.0 + (1.0 - softness)), radius, dist) *
               smoothstep(radius * softness * 0.5, radius * softness * 0.8, dist) * 0.4;
  return core + ring;
}

// Major Halo with optical axis offset, scale, edge irregularity & subtle chromatic dispersion
vec3 majorHaloColor(vec2 uv, vec2 sunUV, vec2 axis, float offset, float scale, float strength, float chromatic) {
  if (strength < 0.01) return vec3(0.0);
  vec2 haloCenter = sunUV + axis * offset;
  vec2 d = uv - haloCenter;
  d.x *= u_resolution.x / u_resolution.y;

  // Subtle elliptical deformation aligned with optical axis
  float axisAng = atan(axis.y, axis.x);
  float cosA = cos(-axisAng);
  float sinA = sin(-axisAng);
  vec2 rotD = vec2(d.x * cosA - d.y * sinA, d.x * sinA + d.y * cosA);
  rotD.y *= 1.06;

  float dist = length(rotD);
  float angle = atan(rotD.y, rotD.x);

  // Subtle edge irregularity
  float baseRadius = 0.15 * scale;
  float rIrreg = baseRadius * (1.0 + 0.035 * sin(angle * 3.0 + 0.5) + 0.020 * cos(angle * 5.0 - 0.3));
  float thickness = 0.024 * (1.0 + 0.08 * strength);

  // Chromatic dispersion across radius
  float rDist = abs(dist - rIrreg * (1.0 + 0.018 * chromatic)) / thickness;
  float gDist = abs(dist - rIrreg) / thickness;
  float bDist = abs(dist - rIrreg * (1.0 - 0.018 * chromatic)) / thickness;

  float rRing = exp(-rDist * rDist * 3.5) * strength;
  float gRing = exp(-gDist * gDist * 3.5) * strength;
  float bRing = exp(-bDist * bDist * 3.5) * strength;

  vec3 coolBlue = vec3(0.72, 0.88, 1.0);
  vec3 warmSun  = vec3(1.0, 0.92, 0.72);
  vec3 baseColor = mix(coolBlue, warmSun, 0.35);

  return vec3(rRing * baseColor.r * 1.08, gRing * baseColor.g, bRing * baseColor.b * 1.15);
}

float bloom(vec2 uv, vec2 sunUV, float size, float intensity) {
  vec2 d = uv - sunUV;
  d.x *= u_resolution.x / u_resolution.y;
  float dist = length(d);
  return exp(-dist * dist / (size * size)) * intensity;
}

float atmosphericHaze(vec2 uv, vec2 sunUV, float intensity) {
  float dy = abs(uv.y - sunUV.y);
  float dx = abs(uv.x - sunUV.x);
  float dist = sqrt(dx * dx * 0.5 + dy * dy);
  return exp(-dist * dist * 4.0) * intensity;
}

void main() {
  vec2 uv = v_uv;
  vec2 opticalCenter = vec2(0.5, 0.5) + u_viewOffset;
  vec2 opticalAxis = opticalCenter - u_sunUV;

  // Background sampling (with subtle chromatic aberration along sunDir)
  vec2 sunDir = normalize(v_uv - u_sunUV);
  float distToSun = length(v_uv - u_sunUV);
  float aberrationStrength = u_chromatic * 0.004 * smoothstep(0.3, 0.0, distToSun);

  vec3 bg = vec3(0.0);
  if (u_layerPass != 2 && u_layerPass != 4 && u_layerPass != 6) {
    bg.r = texture(u_bg, uv - sunDir * aberrationStrength * 1.5).r;
    bg.g = texture(u_bg, uv).g;
    bg.b = texture(u_bg, uv + sunDir * aberrationStrength).b;
  }

  // Pass 3: Background only (for Layer B behind UI)
  if (u_layerPass == 3) {
    fragColor = vec4(bg, 1.0);
    return;
  }

  vec2 dSun = v_uv - u_sunUV;
  dSun.x *= u_resolution.x / u_resolution.y;
  float distSun = length(dSun);

  // Optical color definitions
  vec3 cPureWhite  = vec3(1.0, 1.0, 1.0);
  vec3 cWarmWhite  = vec3(1.0, 0.985, 0.95);
  vec3 cPaleAmber  = vec3(1.0, 0.93, 0.82);
  vec3 cSubtleGold = vec3(1.0, 0.88, 0.68);
  vec3 warmSun     = vec3(1.0, 0.92, 0.72);

  // Temporal breathing ONLY on subtle haze, controlled by u_time (frozen in scroll mode)
  float breathe = sin(u_time * 0.4) * 0.04 + 1.0;

  vec3 sunCoreCol;
  vec3 bloomCol;
  vec3 scatterCol;
  vec3 starburstAllCol;
  vec3 starburstPrimaryCol;
  float innerClipSaturate = 0.0;

  if (u_sunModel == 1) {
    // --------------------------------------------------------
    // M13.9.5 PHOTOGRAPHIC SUN MODEL
    // --------------------------------------------------------

    // Subtle shape irregularity to break up artificial circular edge
    float sunAngle = atan(dSun.y, dSun.x);
    float shapeMod = 1.0 + 0.040 * sin(sunAngle * 5.0 + 0.8) + 0.022 * cos(sunAngle * 7.0 - 0.4);
    float modDist = distSun * shapeMod;

    // 1. Inner Core: Concentrated overexposed pure white clipping (tighter radius, steeper power)
    float rInner = u_coreRadius * 0.32;
    float innerClip = exp(-pow(modDist / max(rInner, 0.003), 3.8)) * (u_coreIntensity * 3.2 * u_intensity);
    innerClipSaturate = clamp(innerClip * 0.90, 0.0, 1.0);

    // 2. Mid Core Body: High-energy transition closely hugging core
    float rMid = u_coreRadius * 0.85;
    float midCore = exp(-pow(modDist / max(rMid, 0.008), 2.0)) * (u_coreIntensity * 1.5 * u_intensity);
    sunCoreCol = cPureWhite * innerClip + mix(cPureWhite, cWarmWhite, smoothstep(0.0, rMid, distSun)) * midCore;

    // 3. Middle Bloom: Warm white to pale amber, tighter radius
    float rBloom = u_bloomRadius * 0.36;
    float midBloom = exp(-pow(distSun / max(rBloom, 0.015), 1.7)) * (u_bloom * 0.80);

    // 4. Outer Bloom: Steep non-linear falloff (converged, distinct intensity hierarchy)
    float rOuter = u_bloomRadius * 0.90;
    float outerBloom = exp(-pow(distSun / max(rOuter, 0.035), 2.4)) * (u_bloom * 0.25);
    bloomCol = mix(cWarmWhite, cPaleAmber, smoothstep(0.0, rBloom, distSun)) * midBloom + cPaleAmber * outerBloom;

    // 5. Local Atmospheric Warm Scattering: Non-linear steep falloff, strictly localized
    float rScatter = u_warmScatter * 0.38;
    float localScatter = exp(-pow(distSun / max(rScatter, 0.04), 2.0)) * (u_haze * 0.40);
    scatterCol = cSubtleGold * localScatter * breathe;

    // 6. Hierarchical Starburst
    float pRays = 0.0;
    float stRays = 0.0;
    starburstPhotographic(v_uv, u_sunUV, 0.18 * (u_starburst * 0.5 + 0.5), pRays, stRays);

    starburstPrimaryCol = mix(cPureWhite, cWarmWhite, 0.4) * (pRays * u_primaryRayStr * u_starburst * 0.35);
    vec3 starburstSecTertCol = cPaleAmber * (stRays * u_secondaryRayStr * u_starburst * 0.35);
    starburstAllCol = starburstPrimaryCol + starburstSecTertCol;
  } else {
    // --------------------------------------------------------
    // M13.9.3 CLASSIC (OLD) SUN MODEL (Retained for live A/B)
    // --------------------------------------------------------
    float sunCore = sunFalloff(distSun, 18.0 / (u_intensity * 0.8 + 0.2)) * u_intensity;
    float sunCoreNarrow = sunFalloff(distSun, 45.0) * u_intensity * 1.5;
    vec3 sunColor = mix(
      vec3(1.0, 0.98, 0.92),
      vec3(1.0, 0.85, 0.55),
      smoothstep(0.0, 0.06, distSun)
    );
    sunCoreCol = sunColor * sunCore * 1.2 + vec3(1.0, 0.98, 0.95) * sunCoreNarrow * 0.8;

    float bloomVal  = bloom(v_uv, u_sunUV, 0.22 * u_bloom, u_bloom * 0.45);
    float bloomWide = bloom(v_uv, u_sunUV, 0.40 * u_bloom, u_bloom * 0.18);
    bloomCol = warmSun * (bloomVal + bloomWide);

    float hazeVal = atmosphericHaze(v_uv, u_sunUV, u_haze * 0.25);
    scatterCol = warmSun * hazeVal * breathe * 0.4;

    float starVal = starburstClassic(v_uv, u_sunUV, u_starburst * 0.35, 0.18);
    starburstPrimaryCol = warmSun * starVal;
    starburstAllCol = warmSun * starVal;
  }

  // Major Halo
  vec3 haloCol = majorHaloColor(v_uv, u_sunUV, opticalAxis, u_haloOffset, u_haloScale, u_haloStrength, u_chromatic);

  // Ghosts
  int numGhosts = int(u_ghostCount);
  float[9] gFraction = float[9](1.4, 1.85, 2.2, 2.7, 3.1, 3.6, 4.2, 4.8, 5.5);
  float[9] gRadius   = float[9](0.032, 0.055, 0.022, 0.070, 0.028, 0.045, 0.018, 0.038, 0.025);
  float[9] gSoft     = float[9](0.4,   0.55,  0.35,  0.60,  0.45,  0.55,  0.30,  0.50,  0.40);
  float[9] gOpacity  = float[9](0.50,  0.38,  0.28,  0.45,  0.22,  0.32,  0.18,  0.25,  0.15);
  vec3[9]  gColors   = vec3[9](
    vec3(0.70, 0.85, 1.00), vec3(0.90, 0.70, 1.00), vec3(0.60, 1.00, 0.70),
    vec3(1.00, 0.88, 0.65), vec3(0.65, 0.85, 1.00), vec3(1.00, 0.70, 0.80),
    vec3(0.75, 1.00, 0.85), vec3(1.00, 0.95, 0.70), vec3(0.80, 0.75, 1.00)
  );

  vec3 primaryGhosts = vec3(0.0);
  vec3 secondaryGhosts = vec3(0.0);
  for (int i = 0; i < numGhosts; i++) {
    float g = ghost(v_uv, u_sunUV, opticalAxis, gFraction[i], u_ghostSpread, gRadius[i], gSoft[i]);
    float opacity = gOpacity[i] * u_ghostStrength;
    if (i < 5) {
      primaryGhosts += gColors[i] * g * opacity;
    } else {
      secondaryGhosts += gColors[i] * g * opacity;
    }
  }

  vec2 dStreak = v_uv - u_sunUV;
  float streakH = exp(-abs(dStreak.y / 0.008) * 80.0) *
                  exp(-abs(dStreak.x) * 3.5) * u_bloom * 0.12;

  // Layer Pass 1: Background Pass (Layer C Behind UI)
  if (u_layerPass == 1) {
    vec3 color = bg;
    color += bloomCol * 0.75;
    color += haloCol;
    color += scatterCol;
    color += warmSun * (streakH * 0.4);
    color += sunCoreCol;
    color += primaryGhosts;
    color = color / (color + vec3(0.85));
    color = pow(color, vec3(0.90));
    if (u_sunModel == 1) {
      color = mix(color, vec3(1.0), innerClipSaturate);
    }
    fragColor = vec4(color, 1.0);
    return;
  }

  // Layer Pass 2: Foreground Highlights (Layer C In Front of UI, transparent background)
  if (u_layerPass == 2) {
    vec3 fg = vec3(0.0);
    fg += starburstPrimaryCol * 0.5 + starburstAllCol * 0.5;
    fg += bloomCol * 0.25;
    fg += warmSun * (streakH * 0.6);
    fg += secondaryGhosts * 0.5;
    float alpha = clamp(max(fg.r, max(fg.g, fg.b)) * 1.35, 0.0, 0.90);
    fragColor = vec4(fg, alpha);
    return;
  }

  // Layer Pass 4: Full Flare on Transparent Canvas (Layer B In Front of UI)
  if (u_layerPass == 4) {
    vec3 flare = vec3(0.0);
    flare += bloomCol;
    flare += haloCol;
    flare += scatterCol;
    flare += warmSun * streakH;
    flare += sunCoreCol;
    flare += starburstAllCol;
    flare += primaryGhosts + secondaryGhosts;
    if (u_sunModel == 1) {
      flare = mix(flare, vec3(1.0), innerClipSaturate);
    }
    float alpha = clamp(max(flare.r, max(flare.g, flare.b)) * 1.25, 0.0, 0.92);
    fragColor = vec4(flare, alpha);
    return;
  }

  // Layer Pass 5: Primary Flare Behind (Layer D Behind UI)
  if (u_layerPass == 5) {
    vec3 color = bg;
    color += bloomCol * 0.70;
    color += haloCol;
    color += scatterCol;
    color += warmSun * (streakH * 0.4);
    color += sunCoreCol;
    color += starburstAllCol * 0.75;
    color += primaryGhosts + secondaryGhosts;
    color = color / (color + vec3(0.85));
    color = pow(color, vec3(0.90));
    if (u_sunModel == 1) {
      color = mix(color, vec3(1.0), innerClipSaturate);
    }
    fragColor = vec4(color, 1.0);
    return;
  }

  // Layer Pass 6: Foreground Optical Spill (Layer D In Front of UI, transparent background)
  if (u_layerPass == 6) {
    float distToSunNorm = length(dSun);
    float sunProximity = exp(-distToSunNorm * distToSunNorm / 0.16);

    vec2 normAxis = normalize(opticalAxis);
    float proj = dot(v_uv - u_sunUV, normAxis);
    vec2 perp = (v_uv - u_sunUV) - normAxis * proj;
    perp.x *= u_resolution.x / u_resolution.y;
    float axisDist = length(perp);
    float axisMask = exp(-axisDist * axisDist / 0.06) * smoothstep(-0.08, 0.35, proj);

    vec2 haloCenter = u_sunUV + opticalAxis * u_haloOffset;
    vec2 dHaloSpill = v_uv - haloCenter;
    dHaloSpill.x *= u_resolution.x / u_resolution.y;
    float distHaloCenter = length(dHaloSpill);
    float haloSpill = exp(-pow(distHaloCenter - 0.15 * u_haloScale, 2.0) / 0.012) * u_haloStrength * 0.40;

    // Peak factor: Glare strongly active only near optical peak, dropping sharply in RELEASE / SETTLE
    float peakFactor = smoothstep(1.10, 1.55, u_intensity);
    float glareMag = (sunProximity * 0.60 + axisMask * 0.22 + haloSpill * 0.38) *
                     (u_intensity * 0.38 + u_bloom * 0.25) *
                     (0.02 + 0.98 * pow(peakFactor, 1.8));

    vec3 glareColor = mix(warmSun, vec3(1.0, 0.96, 0.88), 0.45) * glareMag;

    // Only primary rays cross over UI in Layer D, gated by peak
    vec3 starColor = starburstPrimaryCol * (0.04 + 0.26 * peakFactor);

    float fgBloom = bloom(v_uv, u_sunUV, 0.16 * u_bloom, u_bloom * 0.20) * pow(peakFactor, 1.5);
    vec3 bloomColor = mix(cWarmWhite, cPaleAmber, 0.5) * fgBloom;

    vec3 faintGhost = gColors[5] * ghost(v_uv, u_sunUV, opticalAxis, gFraction[5], u_ghostSpread, gRadius[5], gSoft[5]) * (u_ghostStrength * 0.12 * peakFactor);

    vec3 fgSpill = glareColor + starColor + bloomColor + faintGhost;
    float alpha = clamp(max(fgSpill.r, max(fgSpill.g, fgSpill.b)) * 1.15, 0.0, 0.75);

    fragColor = vec4(fgSpill, alpha);
    return;
  }

  // Layer Pass 0: Full Pass (Layer A Behind UI)
  vec3 color = bg;
  color += bloomCol;
  color += haloCol;
  color += scatterCol;
  color += warmSun * streakH;
  color += sunCoreCol;
  color += starburstAllCol;
  color += primaryGhosts + secondaryGhosts;

  float edgeFresnel = pow(1.0 - abs(dot(normalize(dSun), vec2(1.0, 0.0))), 3.0) * 0.03 * u_chromatic;
  color += vec3(0.4, 0.7, 1.0) * edgeFresnel;

  color = color / (color + vec3(0.85));
  color = pow(color, vec3(0.90));
  if (u_sunModel == 1) {
    color = mix(color, vec3(1.0), innerClipSaturate);
  }

  fragColor = vec4(color, 1.0);
}`;

// ============================================================
// WebGL2 utilities
// ============================================================

interface WebGLRendererState {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  bgTex?: WebGLTexture;
  vao: WebGLVertexArrayObject;
  vbo: WebGLBuffer;
}

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`Shader compile error: ${info}`);
  }
  return s;
}

function linkProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vert);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, frag);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link error: ${info}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function uploadTexture(gl: WebGL2RenderingContext, source: HTMLImageElement | HTMLCanvasElement): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  return tex;
}

function createDummyTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  return tex;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function initWebGLRenderer(
  canvas: HTMLCanvasElement,
  options: { alpha?: boolean; loadBg?: boolean },
  onReady: (state: WebGLRendererState) => void
): Promise<() => void> {
  const gl = canvas.getContext("webgl2", {
    alpha: options.alpha ?? false,
    antialias: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  }) as WebGL2RenderingContext | null;

  if (!gl) throw new Error("WebGL2 not available");

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  gl.viewport(0, 0, canvas.width, canvas.height);

  const program = linkProgram(gl, SHADER_B_VERT, SHADER_B_FRAG);
  const quadVerts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
  const aPosLoc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(aPosLoc);
  gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  let bgTex: WebGLTexture;
  if (options.loadBg) {
    try {
      const bgImg = await loadImage(BG_PATH);
      bgTex = uploadTexture(gl, bgImg);
    } catch {
      bgTex = createDummyTexture(gl);
    }
  } else {
    bgTex = createDummyTexture(gl);
  }

  const state: WebGLRendererState = { gl, program, bgTex, vao, vbo };
  onReady(state);

  return () => {
    gl.deleteProgram(program);
    gl.deleteTexture(bgTex);
    gl.deleteVertexArray(vao);
    gl.deleteBuffer(vbo);
  };
}

function renderWebGLFrame(
  state: WebGLRendererState,
  canvas: HTMLCanvasElement,
  p: SunLabParams,
  time: number,
  progress: number,
  layerPass: number
) {
  const { gl, program, bgTex, vao } = state;
  gl.viewport(0, 0, canvas.width, canvas.height);

  if (layerPass === 2 || layerPass === 4) {
    gl.clearColor(0, 0, 0, 0);
  } else {
    gl.clearColor(0, 0, 0, 1);
  }
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);
  gl.bindVertexArray(vao);

  if (bgTex) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.uniform1i(gl.getUniformLocation(program, "u_bg"), 0);
  }

  gl.uniform2f(gl.getUniformLocation(program, "u_sunUV"), p.sunX, p.sunY);
  gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), canvas.width, canvas.height);
  gl.uniform2f(gl.getUniformLocation(program, "u_viewOffset"), p.viewOffsetX, p.viewOffsetY);

  gl.uniform1f(gl.getUniformLocation(program, "u_intensity"), p.intensity);
  gl.uniform1f(gl.getUniformLocation(program, "u_bloom"), p.bloom);
  gl.uniform1f(gl.getUniformLocation(program, "u_haloStrength"), p.haloStrength);
  gl.uniform1f(gl.getUniformLocation(program, "u_haloScale"), p.haloScale);
  gl.uniform1f(gl.getUniformLocation(program, "u_haloOffset"), p.haloOffset);
  gl.uniform1f(gl.getUniformLocation(program, "u_starburst"), p.starburst);
  gl.uniform1f(gl.getUniformLocation(program, "u_ghostStrength"), p.ghostStrength);
  gl.uniform1f(gl.getUniformLocation(program, "u_ghostSpread"), p.ghostSpread);
  gl.uniform1f(gl.getUniformLocation(program, "u_ghostCount"),
    p.ghostCount === "low" ? 3.0 : p.ghostCount === "medium" ? 6.0 : 9.0);
  gl.uniform1f(gl.getUniformLocation(program, "u_chromatic"), p.chromatic);
  gl.uniform1f(gl.getUniformLocation(program, "u_haze"), p.haze);
  gl.uniform1f(gl.getUniformLocation(program, "u_time"), time);
  gl.uniform1f(gl.getUniformLocation(program, "u_progress"), progress);
  gl.uniform1i(gl.getUniformLocation(program, "u_layerPass"), layerPass);

  // M13.9.4 Photographic Sun Model uniforms
  gl.uniform1i(gl.getUniformLocation(program, "u_sunModel"), p.sunModel === "photographic" ? 1 : 0);
  gl.uniform1f(gl.getUniformLocation(program, "u_coreIntensity"), p.coreIntensity);
  gl.uniform1f(gl.getUniformLocation(program, "u_coreRadius"), p.coreRadius);
  gl.uniform1f(gl.getUniformLocation(program, "u_bloomRadius"), p.bloomRadius);
  gl.uniform1f(gl.getUniformLocation(program, "u_primaryRayStr"), p.primaryRayStr);
  gl.uniform1f(gl.getUniformLocation(program, "u_secondaryRayStr"), p.secondaryRayStr);
  gl.uniform1f(gl.getUniformLocation(program, "u_warmScatter"), p.warmScatter);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
}

// ============================================================
// Trajectory debug
// ============================================================

function drawTrajectory(canvas: HTMLCanvasElement, currentProgress: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const STEPS = 40;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const s = computeOpticalState(t);
    const px = s.sunX * canvas.width;
    const py = s.sunY * canvas.height;
    const isCurrent = Math.abs(t - currentProgress) < 1.0 / (STEPS * 1.5);

    ctx.beginPath();
    if (isCurrent) {
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(251,191,36,0.95)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(251,191,36,0.25)";
      ctx.fill();
    }
  }
}

// ============================================================
// HUD display state
// ============================================================

interface HudDisplay extends OpticalState {
  scrollY: number;
  progress: number;
  layerMode: LayerMode;
  sunModel: SunModelType;
}

const DEFAULT_HUD: HudDisplay = {
  scrollY: 0,
  progress: 0.0,
  layerMode: "D",
  sunModel: "photographic",
  ...initialOptical,
};

// ============================================================
// SunLabViewer Component
// ============================================================

export function SunLabViewer() {
  const canvasBackRef = useRef<HTMLCanvasElement | null>(null);
  const canvasFrontRef = useRef<HTMLCanvasElement | null>(null);
  const trajectoryCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [params, setParams] = useState<SunLabParams>(DEFAULT_PARAMS);
  const paramsRef = useRef<SunLabParams>(params);
  useEffect(() => { paramsRef.current = params; }, [params]);

  const [mode, setMode] = useState<LabMode>("scroll");
  const modeRef = useRef<LabMode>("scroll");
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const [layerMode, setLayerMode] = useState<LayerMode>("D");
  const layerModeRef = useRef<LayerMode>("D");
  useEffect(() => {
    layerModeRef.current = layerMode;
  }, [layerMode]);

  const [hudDisplay, setHudDisplay] = useState<HudDisplay>(DEFAULT_HUD);
  const lastHudUpdateRef = useRef(0);

  const handleLayerModeChange = useCallback((mode: LayerMode) => {
    setLayerMode(mode);
    layerModeRef.current = mode;
    setParams((p) => ({ ...p, layerMode: mode }));
  }, []);

  const handleSunModelChange = useCallback((model: SunModelType) => {
    setParams((prev) => {
      const next = { ...prev, sunModel: model };
      paramsRef.current = next;
      return next;
    });
    setHudDisplay((prev) => ({ ...prev, sunModel: model }));
  }, [setHudDisplay]);

  const [fps, setFps] = useState(60);
  const [resolution, setResolution] = useState("--");
  const [dpr, setDpr] = useState(1);
  const [webglVersion, setWebglVersion] = useState("WebGL2");

  const isPlayingRef = useRef(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
    return !window.matchMedia("(prefers-reduced-motion: reduce)")?.matches;
  });
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  const [showTrajectory, setShowTrajectory] = useState(false);
  const showTrajectoryRef = useRef(false);
  useEffect(() => { showTrajectoryRef.current = showTrajectory; }, [showTrajectory]);

  const progressRef = useRef(0.0);
  const rawScrollYRef = useRef(0);
  const scrollRafPendingRef = useRef(false);
  const timeRef = useRef(0.0);

  const sceneStartRef = useRef(0);
  const sceneEndRef = useRef(0);
  const [sceneDisplayEnd, setSceneDisplayEnd] = useState(0);

  const glBackStateRef = useRef<WebGLRendererState | null>(null);
  const glFrontStateRef = useRef<WebGLRendererState | null>(null);

  const fpsTrackerRef = useRef({ lastTime: 0, frameCount: 0 });

  const trackFps = useCallback(() => {
    const tracker = fpsTrackerRef.current;
    const now = performance.now();
    tracker.frameCount++;
    if (now - tracker.lastTime >= 500) {
      setFps(
        Math.round(
          tracker.lastTime === 0
            ? 60
            : (tracker.frameCount * 1000) / (now - tracker.lastTime)
        )
      );
      tracker.frameCount = 0;
      tracker.lastTime = now;
    }
  }, []);

  // Compute scene extents
  useEffect(() => {
    const update = () => {
      const end = window.innerHeight * SCROLL_VH_RANGE;
      sceneStartRef.current = 0;
      sceneEndRef.current = end;
      setSceneDisplayEnd(end);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Passive scroll listener with rAF batching
  useEffect(() => {
    const handleScroll = () => {
      rawScrollYRef.current = window.scrollY;
      if (scrollRafPendingRef.current) return;
      scrollRafPendingRef.current = true;
      requestAnimationFrame(() => {
        scrollRafPendingRef.current = false;
        const sy = rawScrollYRef.current;
        const end = sceneEndRef.current;
        const p = end > 0 ? Math.max(0, Math.min(1, (sy - sceneStartRef.current) / (end - sceneStartRef.current))) : 0;
        progressRef.current = p;

        const now = performance.now();
        if (now - lastHudUpdateRef.current > 80) {
          lastHudUpdateRef.current = now;
          const s = computeOpticalState(p);
          setHudDisplay({
            scrollY: sy,
            progress: p,
            layerMode: layerModeRef.current,
            sunModel: paramsRef.current.sunModel,
            ...s,
          });
        }
      });
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Pause on hidden tab
  useEffect(() => {
    const handleVis = () => {
      isPlayingRef.current = document.visibilityState === "visible" && isPlaying;
    };
    document.addEventListener("visibilitychange", handleVis);
    return () => document.removeEventListener("visibilitychange", handleVis);
  }, [isPlaying]);

  // Phase Jump Helper
  const jumpToPhase = useCallback((targetProgress: number) => {
    progressRef.current = targetProgress;
    const s = computeOpticalState(targetProgress);
    const sy = targetProgress * sceneEndRef.current;
    rawScrollYRef.current = sy;
    if (typeof window !== "undefined") {
      window.scrollTo({ top: sy, behavior: "instant" });
    }
    setHudDisplay({
      scrollY: sy,
      progress: targetProgress,
      layerMode: layerModeRef.current,
      sunModel: paramsRef.current.sunModel,
      ...s,
    });
  }, [setHudDisplay]);

  // WebGL Render Loop for Back and Front Canvases
  useEffect(() => {
    const canvasBack = canvasBackRef.current;
    const canvasFront = canvasFrontRef.current;
    if (!canvasBack || !canvasFront) return;

    let disposed = false;
    let localBackState: WebGLRendererState | null = null;
    let localFrontState: WebGLRendererState | null = null;
    let animId = 0;
    const startTime = performance.now();

    const devRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvasBack.getBoundingClientRect();
    canvasBack.width  = Math.round(rect.width  * devRatio);
    canvasBack.height = Math.round(rect.height * devRatio);
    canvasFront.width  = canvasBack.width;
    canvasFront.height = canvasBack.height;
    setResolution(`${canvasBack.width} × ${canvasBack.height}`);
    setDpr(devRatio);

    const testCtx = canvasBack.getContext("webgl2");
    if (testCtx) {
      const dbg = testCtx.getExtension("WEBGL_debug_renderer_info");
      if (dbg) {
        const gpu = testCtx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string;
        setWebglVersion(`WebGL2 — ${gpu.slice(0, 36)}`);
      }
    }

    async function init() {
      try {
        const disposeBack = await initWebGLRenderer(
          canvasBack!,
          { alpha: false, loadBg: true },
          (s) => { localBackState = s; glBackStateRef.current = s; }
        );
        const disposeFront = await initWebGLRenderer(
          canvasFront!,
          { alpha: true, loadBg: false },
          (s) => { localFrontState = s; glFrontStateRef.current = s; }
        );

        if (disposed) {
          disposeBack();
          disposeFront();
          return;
        }

        const loop = () => {
          if (disposed) return;

          const isScroll = modeRef.current === "scroll";
          const progress = progressRef.current;
          const currentLayer = layerModeRef.current;

          if (!isScroll && isPlayingRef.current) {
            timeRef.current = (performance.now() - startTime) / 1000;
          }

          const effectiveTime = isScroll ? 0.0 : timeRef.current;
          const effectiveOptical = isScroll
            ? computeOpticalState(progress)
            : {
                ...computeOpticalState(progress),
                sunX: paramsRef.current.sunX,
                sunY: paramsRef.current.sunY,
                intensity: paramsRef.current.intensity,
                bloom: paramsRef.current.bloom,
                haloStrength: paramsRef.current.haloStrength,
                starburst: paramsRef.current.starburst,
                ghostStrength: paramsRef.current.ghostStrength,
                chromatic: paramsRef.current.chromatic,
                haze: paramsRef.current.haze,
              };

          const effectiveParams: SunLabParams = {
            ...paramsRef.current,
            ...effectiveOptical,
            halo: effectiveOptical.haloStrength,
          };

          // Back pass
          if (localBackState && canvasBack) {
            const backPass =
              currentLayer === "A"
                ? 0
                : currentLayer === "B"
                ? 3
                : currentLayer === "C"
                ? 1
                : 5; // Layer D: Primary Flare Behind
            renderWebGLFrame(
              localBackState,
              canvasBack,
              effectiveParams,
              effectiveTime,
              progress,
              backPass
            );
          }

          // Front pass
          if (localFrontState && canvasFront) {
            if (currentLayer === "B") {
              renderWebGLFrame(
                localFrontState,
                canvasFront,
                effectiveParams,
                effectiveTime,
                progress,
                4
              );
            } else if (currentLayer === "C") {
              renderWebGLFrame(
                localFrontState,
                canvasFront,
                effectiveParams,
                effectiveTime,
                progress,
                2
              );
            } else if (currentLayer === "D") {
              renderWebGLFrame(
                localFrontState,
                canvasFront,
                effectiveParams,
                effectiveTime,
                progress,
                6
              );
            } else {
              localFrontState.gl.viewport(0, 0, canvasFront.width, canvasFront.height);
              localFrontState.gl.clearColor(0, 0, 0, 0);
              localFrontState.gl.clear(localFrontState.gl.COLOR_BUFFER_BIT);
            }
          }

          // Trajectory debug overlay
          const trajCanvas = trajectoryCanvasRef.current;
          if (showTrajectoryRef.current && trajCanvas) {
            drawTrajectory(trajCanvas, progress);
          } else if (trajCanvas) {
            const ctx = trajCanvas.getContext("2d");
            if (ctx) ctx.clearRect(0, 0, trajCanvas.width, trajCanvas.height);
          }

          // HUD update for manual mode
          if (!isScroll) {
            const now = performance.now();
            if (now - lastHudUpdateRef.current > 80) {
              lastHudUpdateRef.current = now;
              setHudDisplay({
                scrollY: rawScrollYRef.current,
                progress,
                layerMode: currentLayer,
                sunModel: paramsRef.current.sunModel,
                ...effectiveOptical,
              });
            }
          }

          trackFps();
          animId = requestAnimationFrame(loop);
        };

        animId = requestAnimationFrame(loop);
      } catch (e) {
        console.error("[SunLab] WebGL init error:", e);
      }
    }

    init();

    return () => {
      disposed = true;
      cancelAnimationFrame(animId);
    };
  }, [trackFps]);

  const isScrollMode = mode === "scroll";
  const isManualMode = mode === "manual";

  function btnStyle(active: boolean, color = "#fbbf24"): React.CSSProperties {
    return {
      padding: "4px 8px",
      borderRadius: "4px",
      border: active ? `1px solid ${color}` : "1px solid rgba(255,255,255,0.12)",
      background: active ? `${color}28` : "rgba(255,255,255,0.04)",
      color: active ? color : "#94a3b8",
      fontWeight: active ? 700 : 500,
      fontSize: "10px",
      cursor: "pointer",
      transition: "all 0.12s ease",
    };
  }

  function slider(
    label: string,
    key: keyof SunLabParams,
    min: number,
    max: number,
    step: number,
    disabled = false
  ) {
    const val = params[key] as number;
    const displayVal = mode === "scroll"
      ? (hudDisplay[key as keyof HudDisplay] as number | undefined) ?? val
      : val;
    return (
      <div style={{ marginBottom: "6px", opacity: disabled ? 0.45 : 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#94a3b8", marginBottom: "2px" }}>
          <span>{label}</span>
          <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{displayVal.toFixed(3)}</span>
        </div>
        <input
          type="range" aria-label={label} min={min} max={max} step={step}
          value={val}
          disabled={disabled}
          style={{ width: "100%", accentColor: "#fbbf24", cursor: disabled ? "not-allowed" : "pointer" }}
          onChange={(e) => {
            if (disabled) return;
            const v = parseFloat(e.target.value);
            setParams((prev) => {
              const next = { ...prev, [key]: v };
              paramsRef.current = next;
              return next;
            });
          }}
        />
      </div>
    );
  }

  return (
    <>
      {/* Scroll space (invisible spacer producing document scrollY) */}
      <div
        id="sun-lab-scroll-space"
        aria-hidden="true"
        style={{ height: `${LAB_PAGE_VH * 100}vh`, width: "100vw" }}
      />

      {/* Canvas Back (Background & Primary Optical) — z-index 1 */}
      <canvas
        ref={canvasBackRef}
        id="sun-lab-canvas-back"
        data-testid="sun-lab-canvas-back"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
          display: "block",
        }}
      />

      {/* Representative Dashboard Mock UI — z-index 10 */}
      <div
        id="sun-lab-mock-dashboard"
        data-testid="sun-lab-mock-dashboard"
        style={{
          position: "fixed",
          top: "20px",
          right: "24px",
          zIndex: 10,
          pointerEvents: "none",
          width: "360px",
          maxWidth: "calc(100vw - 340px)",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        {/* Card 1: Current Weather */}
        <div
          data-testid="mock-card-weather"
          style={{
            pointerEvents: "auto",
            background: "linear-gradient(135deg, rgba(15,23,42,0.72) 0%, rgba(30,41,59,0.52) 100%)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: "16px",
            padding: "16px 18px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
            color: "#f8fafc",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
            <div>
              <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600 }}>臺北市 (Taipei)</div>
              <div style={{ fontSize: "36px", fontWeight: 800, color: "#f8fafc", lineHeight: 1.1 }}>
                28°<span style={{ fontSize: "18px", fontWeight: 500, color: "#94a3b8" }}>C</span>
              </div>
            </div>
            <span style={{ fontSize: "11px", padding: "3px 8px", borderRadius: "999px", background: "rgba(251,191,36,0.18)", color: "#fbbf24", fontWeight: 700 }}>
              多雲時晴
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "11px", color: "#cbd5e1", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "8px" }}>
            <div>體感: <strong style={{ color: "#f8fafc" }}>29°C</strong></div>
            <div>降雨機率: <strong style={{ color: "#38bdf8" }}>15%</strong></div>
            <div>相對濕度: <strong style={{ color: "#f8fafc" }}>68%</strong></div>
            <div>偏東風: <strong style={{ color: "#f8fafc" }}>2.5 m/s</strong></div>
          </div>
        </div>

        {/* Card 2: Air Quality & UV */}
        <div
          data-testid="mock-card-aqi"
          style={{
            pointerEvents: "auto",
            background: "linear-gradient(135deg, rgba(15,23,42,0.72) 0%, rgba(30,41,59,0.52) 100%)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: "16px",
            padding: "14px 18px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
            color: "#f8fafc",
          }}
        >
          <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
            環境指標 (AQI & UV)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div style={{ background: "rgba(0,0,0,0.25)", padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: "10px", color: "#94a3b8" }}>AQI 空氣品質</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "2px" }}>
                <span style={{ fontSize: "20px", fontWeight: 800, color: "#4ade80" }}>35</span>
                <span style={{ fontSize: "10px", color: "#4ade80", fontWeight: 700 }}>良好</span>
              </div>
            </div>
            <div style={{ background: "rgba(0,0,0,0.25)", padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: "10px", color: "#94a3b8" }}>紫外線指數</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "2px" }}>
                <span style={{ fontSize: "20px", fontWeight: 800, color: "#fbbf24" }}>6.2</span>
                <span style={{ fontSize: "10px", color: "#fbbf24", fontWeight: 700 }}>高量級</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: 3-Day Forecast */}
        <div
          data-testid="mock-card-forecast"
          style={{
            pointerEvents: "auto",
            background: "linear-gradient(135deg, rgba(15,23,42,0.72) 0%, rgba(30,41,59,0.52) 100%)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: "16px",
            padding: "14px 18px",
            boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
            color: "#f8fafc",
          }}
        >
          <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
            3日天氣預報
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "4px" }}>
              <span>今天 09/25</span>
              <span style={{ color: "#fbbf24" }}>🌤 晴時多雲</span>
              <strong>24° ~ 32°</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "4px" }}>
              <span>明天 09/26</span>
              <span style={{ color: "#94a3b8" }}>⛅ 多雲</span>
              <strong>23° ~ 31°</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>後天 09/27</span>
              <span style={{ color: "#38bdf8" }}>🌦 短暫雨</span>
              <strong>22° ~ 29°</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas Front (Foreground Highlights / Overlay) — z-index 20 */}
      <canvas
        ref={canvasFrontRef}
        id="sun-lab-canvas-front"
        data-testid="sun-lab-canvas-front"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 20,
          pointerEvents: "none",
          display: layerMode === "A" ? "none" : "block",
        }}
      />

      {/* Trajectory Debug Overlay — z-index 25 */}
      <canvas
        ref={trajectoryCanvasRef}
        id="sun-lab-trajectory"
        data-testid="sun-lab-trajectory"
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
          zIndex: 25,
          display: showTrajectory ? "block" : "none",
        }}
      />

      {/* HUD Control Panel — z-index 1000 */}
      <div
        id="sun-lab-hud"
        data-testid="sun-lab-hud"
        style={{
          position: "fixed",
          top: "20px",
          left: "20px",
          zIndex: 1000,
          background: "rgba(8, 12, 24, 0.94)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: "12px",
          padding: "14px 16px",
          color: "#f8fafc",
          boxShadow: "0 12px 40px rgba(0,0,0,0.75)",
          width: "290px",
          lineHeight: 1.45,
          fontSize: "12px",
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Title */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "9px" }}>
          <div style={{ fontWeight: 800, fontSize: "12px", color: "#fbbf24", letterSpacing: "0.04em" }}>
            ☀ M13.9.4 Photographic Sun Lab
          </div>
          <span style={{ padding: "2px 6px", borderRadius: "4px", background: "rgba(251,191,36,0.2)", color: "#fbbf24", fontSize: "9px", fontWeight: 700 }}>R&D</span>
        </div>

        {/* Live Metrics */}
        <div style={{ background: "rgba(0,0,0,0.45)", padding: "7px 9px", borderRadius: "6px", marginBottom: "10px", border: "1px solid rgba(255,255,255,0.07)", fontSize: "10px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px 8px" }}>
            <span style={{ color: "#64748b" }}>Renderer:</span>
            <span style={{ color: "#fde68a", fontWeight: 700 }}>B Shader</span>
            <span style={{ color: "#64748b" }}>Sun Model:</span>
            <span style={{ color: params.sunModel === "photographic" ? "#fbbf24" : "#94a3b8", fontWeight: 700 }}>
              {params.sunModel === "photographic" ? "Photographic" : "Old (Classic)"}
            </span>
            <span style={{ color: "#64748b" }}>Layer:</span>
            <span style={{ color: "#38bdf8", fontWeight: 700 }}>
              {layerMode === "A"
                ? "A Behind UI"
                : layerMode === "B"
                ? "B Front Glass"
                : layerMode === "C"
                ? "C Hybrid"
                : "D Optical Spill"}
            </span>
            <span style={{ color: "#64748b" }}>Mode:</span>
            <span style={{ color: isScrollMode ? "#4ade80" : "#93c5fd", fontWeight: 700 }}>{isScrollMode ? "Scroll" : "Manual"}</span>
            <span style={{ color: "#64748b" }}>Scroll Scrub:</span>
            <span style={{ color: isScrollMode ? "#4ade80" : "#f87171", fontWeight: 700 }}>{isScrollMode ? "ON" : "OFF"}</span>
            <span style={{ color: "#64748b" }}>FPS:</span>
            <span style={{ color: fps >= 50 ? "#4ade80" : "#f87171", fontWeight: 700 }}>{fps}</span>
            <span style={{ color: "#64748b" }}>DPR:</span>
            <span style={{ color: "#e2e8f0" }}>{dpr.toFixed(1)}x</span>
            <span style={{ color: "#64748b" }}>Res:</span>
            <span style={{ color: "#e2e8f0", fontSize: "9px" }}>{resolution}</span>
            <span style={{ color: "#64748b" }}>WebGL:</span>
            <span style={{ color: "#93c5fd", fontSize: "9px" }}>{webglVersion.slice(0, 18)}</span>
          </div>
        </div>

        {/* Sun Realism Model (M13.9.4) */}
        <div style={{ marginBottom: "10px" }}>
          <div style={{ fontSize: "9px", color: "#94a3b8", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Sun Realism Model (M13.9.4)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px" }}>
            <button
              onClick={() => handleSunModelChange("photographic")}
              style={btnStyle(params.sunModel === "photographic", "#fbbf24")}
              data-testid="sun-model-photographic"
            >
              ★ Photographic Sun
            </button>
            <button
              onClick={() => handleSunModelChange("classic")}
              style={btnStyle(params.sunModel === "classic", "#94a3b8")}
              data-testid="sun-model-classic"
            >
              Old Sun (Classic)
            </button>
          </div>
          <div style={{ fontSize: "9px", color: "#64748b", marginTop: "3px" }}>
            {params.sunModel === "photographic"
              ? "Overexposed clipped core, irregular hierarchical rays, localized bloom falloff"
              : "Previous M13.9.3 baseline with geometric radial spokes and uniform haze"}
          </div>
        </div>

        {/* Layer Mode Selector (A / B / C / D) */}
        <div style={{ marginBottom: "10px" }}>
          <div style={{ fontSize: "9px", color: "#94a3b8", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Layer Architecture
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "3px" }}>
            <button
              onClick={() => handleLayerModeChange("A")}
              style={btnStyle(layerMode === "A", "#38bdf8")}
              data-testid="layer-btn-a"
            >
              [A] Behind
            </button>
            <button
              onClick={() => handleLayerModeChange("B")}
              style={btnStyle(layerMode === "B", "#f43f5e")}
              data-testid="layer-btn-b"
            >
              [B] Front
            </button>
            <button
              onClick={() => handleLayerModeChange("C")}
              style={btnStyle(layerMode === "C", "#a855f7")}
              data-testid="layer-btn-c"
            >
              [C] Hybrid
            </button>
            <button
              onClick={() => handleLayerModeChange("D")}
              style={btnStyle(layerMode === "D", "#fbbf24")}
              data-testid="layer-btn-d"
            >
              [D] Spill
            </button>
          </div>
          <div style={{ fontSize: "9px", color: "#64748b", marginTop: "3px" }}>
            {layerMode === "A" && "All flare behind cards; cards blur light"}
            {layerMode === "B" && "Full flare in front of cards (pointer-events: none)"}
            {layerMode === "C" && "Sun/halo behind cards; starburst/highlights cross over"}
            {layerMode === "D" && "Primary flare behind; localized optical spill & glare across near cards"}
          </div>
        </div>

        {/* Scroll Debug & Choreography Phase */}
        <div style={{ background: "rgba(74,222,128,0.08)", padding: "7px 9px", borderRadius: "6px", marginBottom: "10px", border: "1px solid rgba(74,222,128,0.2)", fontSize: "10px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px 8px" }}>
            <span style={{ color: "#64748b" }}>Progress:</span>
            <span style={{ color: "#fbbf24", fontWeight: 700, fontSize: "12px" }}>{hudDisplay.progress.toFixed(4)}</span>
            <span style={{ color: "#64748b" }}>Phase:</span>
            <span style={{ color: "#facc15", fontWeight: 800, fontSize: "11px" }}>{hudDisplay.phaseName}</span>
            <span style={{ color: "#64748b" }}>Scroll Y:</span>
            <span style={{ color: "#e2e8f0" }}>{Math.round(hudDisplay.scrollY)}px</span>
            <span style={{ color: "#64748b" }}>Scene End:</span>
            <span style={{ color: "#e2e8f0" }}>{Math.round(sceneDisplayEnd)}px</span>
          </div>
        </div>

        {/* Manual Phase Jump Shortcuts */}
        <div style={{ marginBottom: "10px" }}>
          <div style={{ fontSize: "9px", color: "#94a3b8", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Phase Jump (Debug)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "3px" }}>
            <button onClick={() => jumpToPhase(0.00)} style={btnStyle(hudDisplay.phaseName === "CALM", "#38bdf8")}>
              CALM
            </button>
            <button onClick={() => jumpToPhase(0.18)} style={btnStyle(hudDisplay.phaseName === "APPROACH", "#facc15")}>
              APPROACH
            </button>
            <button onClick={() => jumpToPhase(0.36)} style={btnStyle(hudDisplay.phaseName === "PRIMARY PEAK", "#f43f5e")}>
              PEAK 1
            </button>
            <button onClick={() => jumpToPhase(0.53)} style={btnStyle(hudDisplay.phaseName === "RELEASE", "#4ade80")}>
              RELEASE
            </button>
            <button onClick={() => jumpToPhase(0.72)} style={btnStyle(hudDisplay.phaseName === "SECOND APPROACH", "#facc15")}>
              APPROACH 2
            </button>
            <button onClick={() => jumpToPhase(0.84)} style={btnStyle(hudDisplay.phaseName === "SECONDARY PEAK", "#a855f7")}>
              PEAK 2
            </button>
            <button onClick={() => jumpToPhase(1.00)} style={{ ...btnStyle(hudDisplay.phaseName === "SETTLE", "#38bdf8"), gridColumn: "span 3" }}>
              SETTLE (1.0)
            </button>
          </div>
        </div>

        {/* Optical State Details */}
        <div style={{ background: "rgba(0,0,0,0.3)", padding: "7px 9px", borderRadius: "6px", marginBottom: "10px", border: "1px solid rgba(255,255,255,0.07)", fontSize: "10px" }}>
          <div style={{ color: "#94a3b8", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
            Camera & Optical State
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px 8px" }}>
            <span style={{ color: "#64748b" }}>Sun X/Y:</span>
            <span style={{ color: "#fde68a" }}>{hudDisplay.sunX.toFixed(3)}, {hudDisplay.sunY.toFixed(3)}</span>
            <span style={{ color: "#64748b" }}>View Offset:</span>
            <span style={{ color: "#93c5fd" }}>{hudDisplay.viewOffsetX.toFixed(3)}, {hudDisplay.viewOffsetY.toFixed(3)}</span>
            <span style={{ color: "#64748b" }}>Axis Angle:</span>
            <span style={{ color: "#e2e8f0" }}>{((hudDisplay.flareAxisAngle * 180) / Math.PI).toFixed(1)}°</span>
            <span style={{ color: "#64748b" }}>Intensity:</span>
            <span style={{ color: "#e2e8f0" }}>{hudDisplay.intensity.toFixed(2)}</span>
            <span style={{ color: "#64748b" }}>Bloom:</span>
            <span style={{ color: "#e2e8f0" }}>{hudDisplay.bloom.toFixed(2)}</span>
            <span style={{ color: "#64748b" }}>Halo Str/Scale:</span>
            <span style={{ color: "#e2e8f0" }}>{hudDisplay.haloStrength.toFixed(2)} / {hudDisplay.haloScale.toFixed(2)}</span>
            <span style={{ color: "#64748b" }}>Halo Offset:</span>
            <span style={{ color: "#e2e8f0" }}>{hudDisplay.haloOffset.toFixed(2)}</span>
            <span style={{ color: "#64748b" }}>Starburst:</span>
            <span style={{ color: "#e2e8f0" }}>{hudDisplay.starburst.toFixed(2)}</span>
            <span style={{ color: "#64748b" }}>Ghost Str/Spd:</span>
            <span style={{ color: "#e2e8f0" }}>{hudDisplay.ghostStrength.toFixed(2)} / {hudDisplay.ghostSpread.toFixed(2)}</span>
            <span style={{ color: "#64748b" }}>Haze / Chrom:</span>
            <span style={{ color: "#e2e8f0" }}>{hudDisplay.haze.toFixed(2)} / {hudDisplay.chromatic.toFixed(2)}</span>
          </div>
        </div>

        {/* Mode Selector */}
        <div style={{ marginBottom: "10px" }}>
          <div style={{ fontSize: "9px", color: "#94a3b8", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Scrub Mode</div>
          <div style={{ display: "flex", gap: "3px" }}>
            <button onClick={() => setMode("scroll")} style={{ ...btnStyle(isScrollMode, "#4ade80"), flex: 1 }}>
              📜 Scroll
            </button>
            <button onClick={() => setMode("manual")} style={{ ...btnStyle(isManualMode, "#93c5fd"), flex: 1 }}>
              🎚 Manual
            </button>
          </div>
        </div>

        {/* Photographic Sun Tuning */}
        <div style={{ marginBottom: "10px", padding: "8px 9px", background: "rgba(251,191,36,0.06)", borderRadius: "6px", border: "1px solid rgba(251,191,36,0.18)" }}>
          <div style={{ fontSize: "9px", color: "#fbbf24", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
            Photographic Sun Tuning (M13.9.4)
          </div>
          {slider("Core Intensity", "coreIntensity", 0.5, 3.5, 0.05)}
          {slider("Core Radius", "coreRadius", 0.01, 0.10, 0.002)}
          {slider("Bloom Radius", "bloomRadius", 0.08, 0.50, 0.01)}
          {slider("Primary Rays", "primaryRayStr", 0.0, 2.5, 0.05)}
          {slider("Secondary Rays", "secondaryRayStr", 0.0, 1.5, 0.05)}
          {slider("Warm Scatter", "warmScatter", 0.05, 0.80, 0.02)}
        </div>

        {/* Core Flare Sliders */}
        <div style={{ marginBottom: "10px" }}>
          <div style={{ fontSize: "9px", color: "#94a3b8", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Core Optical Sliders
          </div>
          {slider("Sun X", "sunX", 0.70, 0.85, 0.005, isScrollMode)}
          {slider("Sun Y", "sunY", 0.10, 0.25, 0.005, isScrollMode)}
          {slider("Intensity", "intensity", 0, 2.5, 0.05, isScrollMode)}
          {slider("Bloom", "bloom", 0, 2, 0.05, isScrollMode)}
          {slider("Halo Strength", "haloStrength", 0, 2, 0.05, isScrollMode)}
          {slider("Starburst", "starburst", 0, 2, 0.05, isScrollMode)}
          {slider("Ghost Strength", "ghostStrength", 0, 2, 0.05, isScrollMode)}
          {slider("Chromatic", "chromatic", 0, 1, 0.05)}
          {slider("Haze", "haze", 0, 1, 0.05, isScrollMode)}
        </div>

        {/* Trajectory toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px", marginTop: "4px" }}>
          <button
            onClick={() => setShowTrajectory((v) => !v)}
            style={{
              flex: 1,
              padding: "6px 8px",
              borderRadius: "5px",
              border: showTrajectory ? "1px solid rgba(251,191,36,0.6)" : "1px solid rgba(255,255,255,0.12)",
              background: showTrajectory ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.05)",
              color: showTrajectory ? "#fbbf24" : "#94a3b8",
              fontWeight: 600,
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            {showTrajectory ? "● Trajectory ON" : "○ Trajectory OFF"}
          </button>
        </div>

        {/* Playback & Reset */}
        <div style={{ display: "flex", gap: "5px" }}>
          <button
            onClick={() => { const next = !isPlaying; setIsPlaying(next); isPlayingRef.current = next; }}
            style={{
              flex: 1,
              padding: "6px 8px",
              borderRadius: "5px",
              border: isPlaying ? "1px solid #4ade80" : "1px solid #64748b",
              background: isPlaying ? "rgba(74,222,128,0.18)" : "rgba(100,116,139,0.18)",
              color: isPlaying ? "#4ade80" : "#94a3b8",
              fontWeight: 700,
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>
          <button
            onClick={() => {
              setParams(DEFAULT_PARAMS);
              paramsRef.current = DEFAULT_PARAMS;
              jumpToPhase(0);
            }}
            style={{
              flex: 1,
              padding: "6px 8px",
              borderRadius: "5px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.05)",
              color: "#94a3b8",
              fontWeight: 600,
              fontSize: "11px",
              cursor: "pointer",
            }}
          >
            Reset
          </button>
        </div>

        {/* Footer info */}
        <div style={{ marginTop: "10px", paddingTop: "7px", borderTop: "1px solid rgba(255,255,255,0.07)", fontSize: "9px", color: "#475569", lineHeight: 1.4 }}>
          M13.9.4 Photographic Sun: overexposed clipped core, hierarchical asymmetric rays, localized bloom falloff, Layer D optical spill.
        </div>
      </div>
    </>
  );
}
