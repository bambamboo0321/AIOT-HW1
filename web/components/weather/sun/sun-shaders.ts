/**
 * WebGL2 Shaders & GPU Utilities for Photographic Sun Lens Flare
 * Milestone M13.9 & M13.10
 */

import { PhotographicSunModelConfig } from "./sun-types";

export const PHOTOGRAPHIC_SUN_DEFAULTS: PhotographicSunModelConfig = {
  coreIntensity: 2.0,
  coreRadius: 0.026,
  bloomRadius: 0.18,
  primaryRayStr: 0.85,
  secondaryRayStr: 0.50,
  warmScatter: 0.26,
};

export const SHADER_B_VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;

void main() {
  v_uv = (a_pos + 1.0) * 0.5;
  v_uv.y = 1.0 - v_uv.y; // WebGL UV flip: match top-left origin
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const SHADER_B_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_bg;
uniform vec2 u_sunUV;
uniform vec2 u_resolution;
uniform vec2 u_viewOffset;

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
uniform int   u_layerPass;

// M13.9.4 / M13.9.5 Photographic Sun Model uniforms
uniform int   u_sunModel;       // 1 = photographic, 0 = classic
uniform float u_coreIntensity;
uniform float u_coreRadius;
uniform float u_bloomRadius;
uniform float u_primaryRayStr;
uniform float u_secondaryRayStr;
uniform float u_warmScatter;

const float PI  = 3.141592653589793;
const float TAU = 6.283185307179586;

float sunFalloff(float dist, float falloffPower) {
  return exp(-dist * falloffPower);
}

float bloom(vec2 uv, vec2 sunUV, float radius, float intensity) {
  vec2 d = uv - sunUV;
  d.x *= u_resolution.x / u_resolution.y;
  float dist = length(d);
  return exp(-dist * dist / (radius * radius)) * intensity;
}

float atmosphericHaze(vec2 uv, vec2 sunUV, float intensity) {
  vec2 d = uv - sunUV;
  d.x *= u_resolution.x / u_resolution.y;
  float dist = length(d);
  return exp(-dist * 1.8) * intensity;
}

// Classic starburst (equal-spaced rays, retained for A/B comparison)
float starburstClassic(vec2 uv, vec2 sunUV, float intensity, float lengthScale) {
  vec2 d = uv - sunUV;
  d.x *= u_resolution.x / u_resolution.y;
  float dist = length(d);
  float angle = atan(d.y, d.x);
  float rays = pow(abs(cos(angle * 6.0)), 12.0) * 0.75 +
               pow(abs(cos(angle * 12.0 + 0.4)), 18.0) * 0.35 +
               pow(abs(cos(angle * 4.0 - 0.2)), 8.0) * 0.50;
  float falloff = exp(-dist / (0.35 * lengthScale));
  return rays * falloff * intensity;
}

// M13.9.5 Photographic starburst: Asymmetric, hierarchical, non-uniform aperture diffraction
void starburstPhotographic(vec2 uv, vec2 sunUV, float starburstScale, out float primaryOut, out float secondaryTertiaryOut) {
  vec2 d = uv - sunUV;
  d.x *= u_resolution.x / u_resolution.y;
  float dist = length(d);
  float angle = atan(d.y, d.x);

  // 1. Dominant Long Primary Rays (2 asymmetric piercing beams)
  float[2] P_ANGLES = float[2](0.74, 3.86); // ~42 deg down-left, ~221 deg counter
  float[2] P_LENS   = float[2](0.48, 0.38); // Dominant ray lengths
  float[2] P_WIDTHS = float[2](0.016, 0.018);
  float[2] P_WEIGHTS= float[2](1.55, 1.20); // Massive visual dominance

  float pSpike = 0.0;
  for (int i = 0; i < 2; i++) {
    float angleDiff = abs(mod(angle - P_ANGLES[i] + PI, TAU) - PI);
    float w = P_WIDTHS[i] * (1.0 + dist * 1.5);
    float angular = exp(-angleDiff * angleDiff / (w * w));
    float len = P_LENS[i] * starburstScale;
    float radial = exp(-pow(dist / len, 1.55));
    pSpike += angular * radial * P_WEIGHTS[i];
  }

  // 2. Medium Rays (3 subtle intermediate rays)
  float[3] M_ANGLES = float[3](2.15, 5.48, 1.48); // ~123 deg, ~314 deg, ~85 deg
  float[3] M_LENS   = float[3](0.22, 0.20, 0.16);
  float[3] M_WIDTHS = float[3](0.012, 0.013, 0.011);
  float[3] M_WEIGHTS= float[3](0.60, 0.50, 0.40); // Much weaker presence

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

  float rG = rIrreg;
  float rR = rIrreg * (1.0 + 0.016 * chromatic);
  float rB = rIrreg * (1.0 - 0.016 * chromatic);

  float ringR = exp(-pow((dist - rR) / thickness, 2.0));
  float ringG = exp(-pow((dist - rG) / thickness, 2.0));
  float ringB = exp(-pow((dist - rB) / thickness, 2.0));

  float falloff = smoothstep(baseRadius * 2.8, baseRadius * 0.3, dist);

  vec3 haloColor = vec3(
    ringR * 1.00 + ringG * 0.20,
    ringG * 0.90 + ringB * 0.10,
    ringB * 1.05 + ringR * 0.15
  ) * falloff * strength * 0.55;

  return haloColor;
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
  if (u_layerPass != 2 && u_layerPass != 4 && u_layerPass != 6 && u_layerPass != 7) {
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
    float midCore = exp(-pow(modDist / max(rMid, 0.006), 2.0)) * (u_coreIntensity * 1.5 * u_intensity);

    sunCoreCol = cPureWhite * innerClip + cWarmWhite * midCore;

    // 3. Inner Bloom: High energy radiant halo wrapping the core
    float rBloom = u_bloomRadius * 0.36;
    float midBloom = exp(-pow(distSun / max(rBloom, 0.015), 1.7)) * (u_bloom * 0.75);

    // 4. Outer Bloom: Restrained falloff creating crisp intensity hierarchy
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

  // Layer Pass 5: Primary Flare Behind (Layer D Behind UI for Lab with bg texture)
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

  // Layer Pass 7: Transparent Primary Optics (Layer D Behind UI for Dashboard without duplicate bg)
  if (u_layerPass == 7) {
    vec3 flare = vec3(0.0);
    flare += bloomCol * 0.70;
    flare += haloCol;
    flare += scatterCol;
    flare += warmSun * (streakH * 0.4);
    flare += sunCoreCol;
    flare += starburstAllCol * 0.75;
    flare += primaryGhosts + secondaryGhosts;
    if (u_sunModel == 1) {
      flare = mix(flare, vec3(1.0), innerClipSaturate);
    }
    float alpha = clamp(max(flare.r, max(flare.g, flare.b)) * 1.25, 0.0, 0.95);
    fragColor = vec4(flare, alpha);
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
}
`;

// ============================================================
// WebGL2 helpers
// ============================================================

export function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
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

export function linkProgram(gl: WebGL2RenderingContext, vert: string, frag: string): WebGLProgram {
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

export function uploadTexture(gl: WebGL2RenderingContext, source: HTMLImageElement | HTMLCanvasElement): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  return tex;
}

export function createDummyTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  return tex;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
