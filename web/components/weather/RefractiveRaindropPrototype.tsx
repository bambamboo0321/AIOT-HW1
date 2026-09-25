"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";

export interface RefractiveRaindropPrototypeProps {
  progress?: number;
  scrollY?: number;
  sceneStart?: number;
  sceneEnd?: number;
  bgAssetPath?: string;
  showDebug?: boolean;
}

function subscribeDummy() {
  return () => {};
}

function getWindowWidth(): number {
  return typeof window !== "undefined" ? window.innerWidth : 1280;
}

function getWindowHeight(): number {
  return typeof window !== "undefined" ? window.innerHeight : 800;
}

function getServerDimension(): number {
  return 1280;
}

/**
 * Generate a 2D normal map SVG data URI for feDisplacementMap.
 * Encodes horizontal slope in Red (36..220) and vertical slope in Green (36..220),
 * with neutral gray (128, 128, 128) representing 0 displacement.
 */
function createDisplacementMapUri(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  anchorX: number,
  anchorY: number,
  trailLen: number,
  tw: number,
  w: number,
  h: number
): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="100%" height="100%" fill="rgb(128,128,128)"/>
    <defs>
      <!-- Horizontal linear gradient for X slope (Red channel) -->
      <linearGradient id="beadXGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="rgb(36,128,128)"/>
        <stop offset="45%" stop-color="rgb(128,128,128)"/>
        <stop offset="100%" stop-color="rgb(220,128,128)"/>
      </linearGradient>
      <!-- Vertical linear gradient for Y slope (Green channel) -->
      <linearGradient id="beadYGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="rgb(128,36,128)"/>
        <stop offset="45%" stop-color="rgb(128,128,128)"/>
        <stop offset="100%" stop-color="rgb(128,220,128)"/>
      </linearGradient>
      <!-- Trail horizontal gradient for X slope -->
      <linearGradient id="trailXGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="rgb(45,128,128)"/>
        <stop offset="50%" stop-color="rgb(128,128,128)"/>
        <stop offset="100%" stop-color="rgb(210,128,128)"/>
      </linearGradient>
    </defs>
    <!-- Trail Displacement -->
    ${
      trailLen > 4
        ? `<rect x="${anchorX - tw / 2}" y="${anchorY}" width="${tw}" height="${trailLen}" fill="url(#trailXGrad)"/>`
        : ""
    }
    <!-- Bead Displacement Layer 1 (X slope) -->
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#beadXGrad)"/>
    <!-- Bead Displacement Layer 2 (Y slope) -->
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#beadYGrad)" style="mix-blend-mode: screen"/>
    <!-- Secondary Droplet 1 -->
    <circle cx="${anchorX - 52}" cy="${anchorY + 36}" r="5" fill="url(#beadXGrad)"/>
    <!-- Secondary Droplet 2 -->
    <circle cx="${anchorX + 42}" cy="${anchorY + 76}" r="4" fill="url(#beadXGrad)"/>
    <!-- Secondary Droplet 3 -->
    <circle cx="${anchorX - 38}" cy="${anchorY + 160}" r="6" fill="url(#beadXGrad)"/>
    <!-- Secondary Droplet 4 -->
    <circle cx="${anchorX + 32}" cy="${anchorY + 220}" r="3.5" fill="url(#beadXGrad)"/>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Generates the organic SVG path string for the primary droplet and streak
 */
function computeDropletGeometry(p: number, anchorX: number, anchorY: number) {
  const progress = Math.max(0, Math.min(1, p));
  let beadY = anchorY;
  let trailLen = 0;
  let beadW = 34;
  let beadH = 38;

  if (progress <= 0.2) {
    // 0.00 -> 0.20: Clinging to glass, bottom sag
    const t = progress / 0.2;
    beadY = anchorY + t * 4;
    beadW = 34 + t * 4; // 34 -> 38
    beadH = 38 + t * 4; // 38 -> 42
    trailLen = 0;
  } else if (progress <= 0.4) {
    // 0.20 -> 0.40: Neck starts forming, bottom heavy
    const t = (progress - 0.2) / 0.2;
    beadY = anchorY + 4 + t * 12; // 164 -> 176
    beadW = 38 - t * 4; // 38 -> 34
    beadH = 42 + t * 6; // 42 -> 48
    trailLen = beadY - anchorY;
  } else {
    // 0.40 -> 1.00: Sliding down, leaving gravity streak
    const t = (progress - 0.4) / 0.6;
    beadY = anchorY + 16 + t * 240; // 176 -> 416
    beadW = 34 - t * 5; // 34 -> 29
    beadH = 48 - t * 10; // 48 -> 38
    trailLen = beadY - anchorY;
  }

  const cx = anchorX;
  const cy = beadY;
  const rx = beadW / 2;
  const ry = beadH / 2;
  const tw = Math.max(2.5, 5 - progress * 1.5);

  let pathD = "";
  if (trailLen < 4) {
    // Pure bead shape (sagging bottom)
    pathD = `M ${cx} ${cy - ry}
      C ${cx + rx * 0.9} ${cy - ry * 0.5}, ${cx + rx * 1.05} ${cy + ry * 0.25}, ${cx + rx * 0.85} ${cy + ry * 0.85}
      C ${cx + rx * 0.5} ${cy + ry * 1.05}, ${cx - rx * 0.5} ${cy + ry * 1.05}, ${cx - rx * 0.85} ${cy + ry * 0.85}
      C ${cx - rx * 1.05} ${cy + ry * 0.25}, ${cx - rx * 0.9} ${cy - ry * 0.5}, ${cx} ${cy - ry} Z`;
  } else {
    // Bead with elongated water trail (gravity streak)
    const topY = anchorY;
    const neckY = cy - ry * 0.4;
    pathD = `M ${cx} ${topY}
      C ${cx + tw * 0.6} ${topY}, ${cx + tw * 0.7 + 1} ${topY + trailLen * 0.3}, ${cx + tw * 0.5 - 0.5} ${topY + trailLen * 0.65}
      C ${cx + tw * 0.4} ${neckY - 10}, ${cx + rx * 0.7} ${neckY}, ${cx + rx} ${cy + ry * 0.2}
      C ${cx + rx * 1.05} ${cy + ry * 0.65}, ${cx + rx * 0.6} ${cy + ry * 1.02}, ${cx} ${cy + ry}
      C ${cx - rx * 0.6} ${cy + ry * 1.02}, ${cx - rx * 1.05} ${cy + ry * 0.65}, ${cx - rx} ${cy + ry * 0.2}
      C ${cx - rx * 0.7} ${neckY}, ${cx - tw * 0.4} ${neckY - 10}, ${cx - tw * 0.5 - 0.5} ${topY + trailLen * 0.65}
      C ${cx - tw * 0.7 + 1} ${topY + trailLen * 0.3}, ${cx - tw * 0.6} ${topY}, ${cx} ${topY} Z`;
  }

  // Primary Specular Highlight on the upper-left crest of the bead
  const hlCx = cx - rx * 0.32;
  const hlCy = cy - ry * 0.38;
  const hlRx = Math.max(3, rx * 0.35);
  const hlRy = Math.max(2, ry * 0.22);

  // Secondary Caustic Bounce on bottom-right rim
  const causticD = `M ${cx + rx * 0.2} ${cy + ry * 0.92}
    C ${cx + rx * 0.7} ${cy + ry * 0.8}, ${cx + rx * 0.95} ${cy + ry * 0.45}, ${cx + rx * 0.9} ${cy + ry * 0.1}`;

  return {
    progress,
    beadX: cx,
    beadY: Math.round(beadY),
    beadW: Math.round(beadW),
    beadH: Math.round(beadH),
    trailLen: Math.round(trailLen),
    pathD,
    hlCx,
    hlCy,
    hlRx,
    hlRy,
    causticD,
    tw,
  };
}

/**
 * Milestone M13.6 — Single Refractive Raindrop Technical Prototype
 *
 * Implements a single, high-fidelity liquid droplet with real optical background displacement
 * using SVG feDisplacementMap + feGaussianBlur.
 *
 * Controlled 100% reversibly by --weather-scroll-progress playhead.
 */
export function RefractiveRaindropPrototype({
  bgAssetPath = "/images/weather/rain-day.webp",
  showDebug = false,
}: RefractiveRaindropPrototypeProps) {
  const winWidth = useSyncExternalStore(subscribeDummy, getWindowWidth, getServerDimension);
  const winHeight = useSyncExternalStore(subscribeDummy, getWindowHeight, getServerDimension);

  const [refractionOn, setRefractionOn] = useState(true);
  const [hudData, setHudData] = useState({
    progress: 0,
    scrollY: 0,
    sceneStart: 0,
    sceneEnd: 600,
    beadX: 0,
    beadY: 0,
    beadW: 34,
    beadH: 38,
    trailLen: 0,
  });

  // Calculate anchor coordinates in bare background region (upper right quadrant)
  const anchorX = Math.round(
    winWidth >= 1200
      ? Math.max(winWidth - 140, winWidth * 0.85)
      : Math.max(winWidth - 70, winWidth * 0.82)
  );
  const anchorY = Math.round(Math.min(180, winHeight * 0.22));

  // Refs for direct DOM updates in rAF (eliminates React re-renders during active scrolling)
  const clipPathRef = useRef<SVGPathElement | null>(null);
  const rimPathRef = useRef<SVGPathElement | null>(null);
  const innerRimPathRef = useRef<SVGPathElement | null>(null);
  const hlRef = useRef<SVGEllipseElement | null>(null);
  const causticRef = useRef<SVGPathElement | null>(null);
  const streakSpineRef = useRef<SVGLineElement | null>(null);
  const displacementMapImgRef = useRef<SVGFEImageElement | null>(null);
  const displacementPrimitiveRef = useRef<SVGFEDisplacementMapElement | null>(null);

  // Sync scroll playhead to geometry in rAF
  useEffect(() => {
    if (typeof window === "undefined") return;

    let rafId: number | null = null;

    const onScrollUpdate = () => {
      rafId = null;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const maxDocScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const sceneStart = 0;
      const scrubDistance = Math.min(maxDocScroll, Math.max(window.innerHeight * 0.85, 550));
      const sceneEnd = Math.round(sceneStart + scrubDistance);
      const progress = Math.min(1, Math.max(0, (scrollY - sceneStart) / scrubDistance));

      const geo = computeDropletGeometry(progress, anchorX, anchorY);

      // 1. Direct DOM updates for zero lag
      if (clipPathRef.current) clipPathRef.current.setAttribute("d", geo.pathD);
      if (rimPathRef.current) rimPathRef.current.setAttribute("d", geo.pathD);
      if (innerRimPathRef.current) innerRimPathRef.current.setAttribute("d", geo.pathD);
      if (hlRef.current) {
        hlRef.current.setAttribute("cx", geo.hlCx.toFixed(1));
        hlRef.current.setAttribute("cy", geo.hlCy.toFixed(1));
        hlRef.current.setAttribute("rx", geo.hlRx.toFixed(1));
        hlRef.current.setAttribute("ry", geo.hlRy.toFixed(1));
      }
      if (causticRef.current) causticRef.current.setAttribute("d", geo.causticD);
      if (streakSpineRef.current) {
        if (geo.trailLen > 4) {
          streakSpineRef.current.setAttribute("x1", `${anchorX}`);
          streakSpineRef.current.setAttribute("y1", `${anchorY}`);
          streakSpineRef.current.setAttribute("x2", `${anchorX}`);
          streakSpineRef.current.setAttribute("y2", `${geo.beadY - geo.beadH * 0.2}`);
          streakSpineRef.current.style.opacity = "0.45";
        } else {
          streakSpineRef.current.style.opacity = "0";
        }
      }

      // Update normal map data URI for displacement map
      if (displacementMapImgRef.current) {
        const mapUri = createDisplacementMapUri(
          geo.beadX,
          geo.beadY,
          geo.beadW / 2,
          geo.beadH / 2,
          anchorX,
          anchorY,
          geo.trailLen,
          geo.tw,
          winWidth,
          winHeight
        );
        displacementMapImgRef.current.setAttribute("href", mapUri);
      }

      // 2. Update HUD state
      setHudData({
        progress,
        scrollY: Math.round(scrollY),
        sceneStart,
        sceneEnd,
        beadX: geo.beadX,
        beadY: geo.beadY,
        beadW: geo.beadW,
        beadH: geo.beadH,
        trailLen: geo.trailLen,
      });
    };

    const handleScroll = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(onScrollUpdate);
      }
    };

    onScrollUpdate();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [anchorX, anchorY, winWidth, winHeight]);

  // Initial geometry calculation for first render
  const initialGeo = computeDropletGeometry(0, anchorX, anchorY);
  const initialMapUri = createDisplacementMapUri(
    initialGeo.beadX,
    initialGeo.beadY,
    initialGeo.beadW / 2,
    initialGeo.beadH / 2,
    anchorX,
    anchorY,
    initialGeo.trailLen,
    initialGeo.tw,
    winWidth,
    winHeight
  );

  const displacementScale = refractionOn ? 38 : 0;

  return (
    <>
      <svg
        id="refractive-rain-svg"
        data-testid="refractive-rain-svg"
        width="100%"
        height="100%"
        style={{
          position: "fixed",
          inset: "-14px",
          width: "calc(100% + 28px)",
          height: "calc(100% + 28px)",
          pointerEvents: "none",
          zIndex: 1, // Directly above .weather-bg-layer (0) and below dashboard content (10)
        }}
        aria-hidden="true"
      >
        <defs>
          {/* Clip path for the primary droplet and streak */}
          <clipPath id="primary-droplet-clip">
            <path ref={clipPathRef} d={initialGeo.pathD} />
            {/* Secondary micro-droplet clips */}
            <circle cx={anchorX - 52} cy={anchorY + 36} r={5} />
            <circle cx={anchorX + 42} cy={anchorY + 76} r={4} />
            <circle cx={anchorX - 38} cy={anchorY + 160} r={6} />
            <circle cx={anchorX + 32} cy={anchorY + 220} r={3.5} />
          </clipPath>

          {/* SVG Displacement Filter for background refraction */}
          <filter
            id="raindrop-refraction-filter"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
            filterUnits="userSpaceOnUse"
          >
            <feImage
              ref={displacementMapImgRef}
              id="fe-displacement-map-img"
              href={initialMapUri}
              result="displacementSource"
              preserveAspectRatio="none"
            />
            <feDisplacementMap
              ref={displacementPrimitiveRef}
              id="fe-displacement-primitive"
              in="SourceGraphic"
              in2="displacementSource"
              scale={displacementScale}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displacedBg"
            />
          </filter>

          {/* Soft blur for specular highlight */}
          <filter id="soft-highlight-blur" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
        </defs>

        {/* ============================================================ */}
        {/* Layer 1: Refracted Background Duplicate Layer (Clipped to droplet) */}
        {/* ============================================================ */}
        <g clipPath="url(#primary-droplet-clip)">
          <image
            id="droplet-refracted-bg"
            data-testid="droplet-refracted-bg"
            href={bgAssetPath}
            x="0"
            y="0"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMin slice"
            filter={refractionOn ? "url(#raindrop-refraction-filter)" : undefined}
            style={{
              transform: "translateY(calc(var(--weather-scroll-progress, 0) * -6px))",
              transition: "filter 150ms ease-out",
            }}
          />
        </g>

        {/* ============================================================ */}
        {/* Layer 2: Droplet Optical Surface (Rim, Shadows, Specular Glints) */}
        {/* ============================================================ */}
        <g id="droplet-surface-layer" data-testid="droplet-surface-layer">
          {/* Contact Angle / Fresnel Dark Rim (thin, high-definition 1.2px) */}
          <path
            ref={rimPathRef}
            d={initialGeo.pathD}
            fill="none"
            stroke="rgba(15, 23, 42, 0.65)"
            strokeWidth="1.2"
          />

          {/* Soft inner ambient shadow */}
          <path
            ref={innerRimPathRef}
            d={initialGeo.pathD}
            fill="none"
            stroke="rgba(30, 41, 59, 0.28)"
            strokeWidth="2.2"
            opacity="0.75"
          />

          {/* Water streak centerline spine glint */}
          <line
            ref={streakSpineRef}
            x1={anchorX}
            y1={anchorY}
            x2={anchorX}
            y2={initialGeo.beadY}
            stroke="rgba(255, 255, 255, 0.42)"
            strokeWidth="1.0"
            strokeLinecap="round"
            opacity="0"
          />

          {/* Primary Specular Highlight (The Glint on upper-left crest) */}
          <ellipse
            ref={hlRef}
            cx={initialGeo.hlCx}
            cy={initialGeo.hlCy}
            rx={initialGeo.hlRx}
            ry={initialGeo.hlRy}
            transform={`rotate(-28 ${initialGeo.hlCx} ${initialGeo.hlCy})`}
            fill="rgba(255, 255, 255, 0.95)"
            filter="url(#soft-highlight-blur)"
          />
          {/* Secondary pinpoint glint core */}
          <circle
            cx={initialGeo.hlCx - 1}
            cy={initialGeo.hlCy - 0.5}
            r="1.2"
            fill="#ffffff"
          />

          {/* Secondary Caustic Bounce (Subtle reflection on lower-right rim) */}
          <path
            ref={causticRef}
            d={initialGeo.causticD}
            fill="none"
            stroke="rgba(255, 255, 255, 0.32)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />

          {/* ========================================================== */}
          {/* Layer 3: 4 Stationary Secondary Micro-Droplets              */}
          {/* ========================================================== */}
          {/* Micro-Droplet 1: (anchorX - 52, anchorY + 36, r = 5) */}
          <g>
            <circle cx={anchorX - 52} cy={anchorY + 36} r={5} fill="none" stroke="rgba(15, 23, 42, 0.6)" strokeWidth="0.9" />
            <ellipse cx={anchorX - 53.5} cy={anchorY + 34.5} rx="1.6" ry="1.0" fill="rgba(255, 255, 255, 0.92)" transform={`rotate(-30 ${anchorX - 53.5} ${anchorY + 34.5})`} />
          </g>

          {/* Micro-Droplet 2: (anchorX + 42, anchorY + 76, r = 4) */}
          <g>
            <circle cx={anchorX + 42} cy={anchorY + 76} r={4} fill="none" stroke="rgba(15, 23, 42, 0.55)" strokeWidth="0.8" />
            <ellipse cx={anchorX + 40.8} cy={anchorY + 74.8} rx="1.4" ry="0.9" fill="rgba(255, 255, 255, 0.90)" transform={`rotate(-25 ${anchorX + 40.8} ${anchorY + 74.8})`} />
          </g>

          {/* Micro-Droplet 3: (anchorX - 38, anchorY + 160, r = 6) */}
          <g>
            <circle cx={anchorX - 38} cy={anchorY + 160} r={6} fill="none" stroke="rgba(15, 23, 42, 0.6)" strokeWidth="1.0" />
            <ellipse cx={anchorX - 40} cy={anchorY + 158} rx="2.0" ry="1.2" fill="rgba(255, 255, 255, 0.92)" transform={`rotate(-30 ${anchorX - 40} ${anchorY + 158})`} />
            <path d={`M ${anchorX - 35} ${anchorY + 164} C ${anchorX - 34} ${anchorY + 165}, ${anchorX - 33} ${anchorY + 163}, ${anchorX - 33} ${anchorY + 161}`} fill="none" stroke="rgba(255, 255, 255, 0.28)" strokeWidth="1.2" />
          </g>

          {/* Micro-Droplet 4: (anchorX + 32, anchorY + 220, r = 3.5) */}
          <g>
            <circle cx={anchorX + 32} cy={anchorY + 220} r={3.5} fill="none" stroke="rgba(15, 23, 42, 0.55)" strokeWidth="0.8" />
            <circle cx={anchorX + 31} cy={anchorY + 219} r="1.0" fill="rgba(255, 255, 255, 0.88)" />
          </g>
        </g>
      </svg>

      {/* ============================================================ */}
      {/* Enhanced Debug HUD for Rain Refraction Prototype             */}
      {/* ============================================================ */}
      {showDebug && (
        <div
          id="weather-debug-hud"
          data-testid="weather-debug-hud"
          style={{
            position: "fixed",
            bottom: "16px",
            right: "16px",
            zIndex: 99999,
            background: "rgba(10, 15, 25, 0.94)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(255, 255, 255, 0.25)",
            borderRadius: "10px",
            padding: "14px 18px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "12px",
            color: "#f1f5f9",
            pointerEvents: "auto",
            boxShadow: "0 10px 36px rgba(0, 0, 0, 0.65)",
            lineHeight: 1.5,
            minWidth: "240px",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              color: "#38bdf8",
              marginBottom: "6px",
              fontSize: "11px",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            🌦 Weather Timeline Debug
          </div>
          <div>Scenario: <span style={{ color: "#fbbf24", fontWeight: 600 }}>rain-day</span></div>
          <div style={{ color: "#38bdf8", fontWeight: 600, marginTop: "2px" }}>
            Rain Prototype: SVG Refraction (M13.6)
          </div>
          <div>Scroll Y: <span style={{ color: "#e2e8f0" }}>{hudData.scrollY}px</span></div>
          <div>Scene Start: <span style={{ color: "#94a3b8" }}>{hudData.sceneStart}px</span></div>
          <div>Scene End: <span style={{ color: "#94a3b8" }}>{hudData.sceneEnd}px</span></div>
          <div
            style={{
              fontWeight: 700,
              color: "#4ade80",
              marginTop: "4px",
              paddingTop: "4px",
              borderTop: "1px solid rgba(255,255,255,0.12)",
              fontSize: "13px",
            }}
          >
            Playhead Progress: {hudData.progress.toFixed(3)}
          </div>

          {/* Raindrop Physical State Metrics */}
          <div style={{ marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.12)", fontSize: "11px", color: "#cbd5e1" }}>
            <div>Drop X: <span style={{ color: "#93c5fd" }}>{hudData.beadX}px</span></div>
            <div>Drop Y: <span style={{ color: "#93c5fd" }}>{hudData.beadY}px</span></div>
            <div>Drop Width: <span style={{ color: "#93c5fd" }}>{hudData.beadW}px</span></div>
            <div>Drop Height: <span style={{ color: "#93c5fd" }}>{hudData.beadH}px</span></div>
            <div>Trail Length: <span style={{ color: "#93c5fd" }}>{hudData.trailLen}px</span></div>
            <div>Displacement Scale: <span style={{ color: refractionOn ? "#4ade80" : "#f87171", fontWeight: 700 }}>{displacementScale}</span></div>
          </div>

          {/* Interactive Refraction ON/OFF Toggle Button */}
          <div style={{ marginTop: "10px", textAlign: "center" }}>
            <button
              id="refraction-toggle-btn"
              data-testid="refraction-toggle-btn"
              onClick={() => setRefractionOn((prev) => !prev)}
              style={{
                width: "100%",
                padding: "6px 12px",
                borderRadius: "6px",
                border: refractionOn ? "1px solid #10b981" : "1px solid #ef4444",
                background: refractionOn ? "rgba(16, 185, 129, 0.20)" : "rgba(239, 68, 68, 0.20)",
                color: refractionOn ? "#34d399" : "#f87171",
                fontFamily: "inherit",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 150ms ease",
                letterSpacing: "0.04em",
              }}
            >
              {refractionOn ? "Refraction: ON (Click to Disable)" : "Refraction: OFF (Click to Enable)"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
