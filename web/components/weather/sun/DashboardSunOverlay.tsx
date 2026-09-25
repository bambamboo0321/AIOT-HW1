"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  computeOpticalState,
  computeProductionSunProgress,
  getBackgroundCoverSunUV,
  BASE_SUN_X,
  BASE_SUN_Y,
} from "./optical-state";
import {
  OpticalState,
  OpticalPhaseName,
  ProductionChapterName,
  WebGLRendererState,
} from "./sun-types";
import {
  SHADER_B_VERT,
  SHADER_B_FRAG,
  PHOTOGRAPHIC_SUN_DEFAULTS,
  linkProgram,
  createDummyTexture,
} from "./sun-shaders";

export interface DashboardSunOverlayProps {
  showDebug?: boolean;
}

/**
 * Milestone M13.10.2: Full-Page Production Sun Choreography × Layer D Optical Spill
 *
 * Architecture:
 * - Layer 0: Photographic clear-day background (HTML/CSS .weather-bg-layer, z-index: 0)
 * - Layer 1: Primary Sun Optics Canvas (WebGL2 transparent, z-index: 1)
 *            Renders Sun core, major halo, ghosts, atmospheric haze, majority bloom.
 * - Layer 2: Readability navy gradient overlay (.weather-overlay-layer, z-index: 2)
 * - Layer 3: REAL Dashboard DOM (.weather-content-layer, z-index: 3)
 * - Layer 4: Foreground Optical Spill Canvas (WebGL2 transparent, z-index: 20)
 *            Renders localized glare across top cards, selected primary rays, bloom spill.
 *            100% pointer-events: none, ensuring zero interference with Leaflet or UI buttons.
 *
 * Multi-Chapter Choreography:
 * - Actual document scroll range (maxDocScroll = scrollHeight - innerHeight).
 * - Full-page multi-chapter timeline:
 *   [0.00, 0.10) CALM
 *   [0.10, 0.24) CHAPTER 1 (Primary Peak 0.18, multiplier 1.00)
 *   [0.24, 0.38) RELEASE 1 (Return to calm reading)
 *   [0.38, 0.57) CHAPTER 2 (Secondary Peak 0.57, multiplier 0.85)
 *   [0.57, 0.74) RELEASE 2 (Return to calm reading across map/charts)
 *   [0.74, 0.95) CHAPTER 3 (Subtle Peak 0.88, multiplier 0.65)
 *   [0.95, 1.00] SETTLE (Final peaceful settle at footer)
 *
 * Guarantees:
 * - Zero dead scroll region across the entire page.
 * - Deterministic: scroll drives optics, stop = freeze, reverse = exact reverse.
 * - Same computeOpticalState(opticalProgress) reused directly from M13.9 baseline.
 * - DPR cap: 1.5 for ~60 FPS performance.
 * - Opt-in: only mounts when scenario === 'clear-day' && sunDashboard === 1.
 */
export function DashboardSunOverlay({ showDebug = false }: DashboardSunOverlayProps) {
  const canvasBackRef = useRef<HTMLCanvasElement | null>(null);
  const canvasFrontRef = useRef<HTMLCanvasElement | null>(null);

  const backStateRef = useRef<WebGLRendererState | null>(null);
  const frontStateRef = useRef<WebGLRendererState | null>(null);

  const [fps, setFps] = useState<number>(60);
  const [dprVal, setDprVal] = useState<number>(1);
  const [resolutionStr, setResolutionStr] = useState<string>("--");

  // Metrics for Debug HUD
  const [debugMetrics, setDebugMetrics] = useState<{
    scrollY: number;
    maxScroll: number;
    pageProgress: number;
    chapter: ProductionChapterName;
    chapterMultiplier: number;
    opticalProgress: number;
    opticalPhase: OpticalPhaseName;
    opticalState: OpticalState;
    sunUV: { x: number; y: number };
    responsiveAttenuation: number;
  }>({
    scrollY: 0,
    maxScroll: 1000,
    pageProgress: 0,
    chapter: "CALM",
    chapterMultiplier: 1.0,
    opticalProgress: 0,
    opticalPhase: "CALM",
    opticalState: computeOpticalState(0),
    sunUV: { x: BASE_SUN_X, y: BASE_SUN_Y },
    responsiveAttenuation: 1.0,
  });

  const fpsFramesRef = useRef<number>(0);
  const fpsLastTimeRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  // Helper to initialize WebGL2 on a canvas
  const initGL = useCallback((canvas: HTMLCanvasElement): WebGLRendererState | null => {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
    }) as WebGL2RenderingContext | null;

    if (!gl) return null;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);

    const program = linkProgram(gl, SHADER_B_VERT, SHADER_B_FRAG);
    const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    const aPosLoc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPosLoc);
    gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    const bgTex = createDummyTexture(gl);

    return { gl, program, bgTex, vao, vbo };
  }, []);

  // Helper to render a frame on a given WebGL state
  const renderPass = useCallback(
    (
      state: WebGLRendererState,
      canvas: HTMLCanvasElement,
      opt: OpticalState,
      sunUV: { x: number; y: number },
      layerPass: number,
      progress: number,
      intensityScale: number = 1.0,
      chapterMultiplier: number = 1.0
    ) => {
      const { gl, program, bgTex, vao } = state;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);
      gl.bindVertexArray(vao);

      if (bgTex) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, bgTex);
        gl.uniform1i(gl.getUniformLocation(program, "u_bg"), 0);
      }

      gl.uniform2f(gl.getUniformLocation(program, "u_sunUV"), sunUV.x, sunUV.y);
      gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), canvas.width, canvas.height);
      gl.uniform2f(gl.getUniformLocation(program, "u_viewOffset"), opt.viewOffsetX, opt.viewOffsetY);

      gl.uniform1f(gl.getUniformLocation(program, "u_intensity"), opt.intensity * intensityScale * chapterMultiplier);
      gl.uniform1f(gl.getUniformLocation(program, "u_bloom"), opt.bloom * chapterMultiplier);
      gl.uniform1f(gl.getUniformLocation(program, "u_haloStrength"), opt.haloStrength * chapterMultiplier);
      gl.uniform1f(gl.getUniformLocation(program, "u_haloScale"), opt.haloScale);
      gl.uniform1f(gl.getUniformLocation(program, "u_haloOffset"), opt.haloOffset);
      gl.uniform1f(gl.getUniformLocation(program, "u_starburst"), opt.starburst * chapterMultiplier);
      gl.uniform1f(gl.getUniformLocation(program, "u_ghostStrength"), opt.ghostStrength * chapterMultiplier);
      gl.uniform1f(gl.getUniformLocation(program, "u_ghostSpread"), opt.ghostSpread);
      gl.uniform1f(gl.getUniformLocation(program, "u_ghostCount"), 6.0); // Medium count
      gl.uniform1f(gl.getUniformLocation(program, "u_chromatic"), opt.chromatic);
      gl.uniform1f(gl.getUniformLocation(program, "u_haze"), opt.haze * chapterMultiplier);
      gl.uniform1f(gl.getUniformLocation(program, "u_time"), 0.0); // Frozen deterministic time in scroll mode
      gl.uniform1f(gl.getUniformLocation(program, "u_progress"), progress);
      gl.uniform1i(gl.getUniformLocation(program, "u_layerPass"), layerPass);

      // Photographic Sun Model uniforms
      gl.uniform1i(gl.getUniformLocation(program, "u_sunModel"), 1); // Photographic
      gl.uniform1f(gl.getUniformLocation(program, "u_coreIntensity"), PHOTOGRAPHIC_SUN_DEFAULTS.coreIntensity);
      gl.uniform1f(gl.getUniformLocation(program, "u_coreRadius"), PHOTOGRAPHIC_SUN_DEFAULTS.coreRadius);
      gl.uniform1f(gl.getUniformLocation(program, "u_bloomRadius"), PHOTOGRAPHIC_SUN_DEFAULTS.bloomRadius);
      gl.uniform1f(gl.getUniformLocation(program, "u_primaryRayStr"), PHOTOGRAPHIC_SUN_DEFAULTS.primaryRayStr);
      gl.uniform1f(gl.getUniformLocation(program, "u_secondaryRayStr"), PHOTOGRAPHIC_SUN_DEFAULTS.secondaryRayStr);
      gl.uniform1f(gl.getUniformLocation(program, "u_warmScatter"), PHOTOGRAPHIC_SUN_DEFAULTS.warmScatter);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    },
    []
  );

  // Main scroll and render synchronization
  useEffect(() => {
    if (typeof window === "undefined") return;

    const canvasBack = canvasBackRef.current;
    const canvasFront = canvasFrontRef.current;
    if (!canvasBack || !canvasFront) return;

    let disposed = false;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    setDprVal(dpr);

    const backState = initGL(canvasBack);
    const frontState = initGL(canvasFront);
    backStateRef.current = backState;
    frontStateRef.current = frontState;

    if (!backState || !frontState) {
      console.warn("DashboardSunOverlay: WebGL2 initialization failed");
      return;
    }

    setResolutionStr(`${canvasBack.width} × ${canvasBack.height}`);

    const renderCurrentFrame = () => {
      if (disposed || document.visibilityState === "hidden") return;

      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const scrollY = window.scrollY || window.pageYOffset || 0;
      const maxDocScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const rawPageProgress = prefersReducedMotion ? 0.0 : scrollY / maxDocScroll;
      const pageProgress = Math.min(1, Math.max(0, rawPageProgress));

      const choreo = computeProductionSunProgress(pageProgress);
      const opt = computeOpticalState(choreo.opticalProgress);
      const sunUV = getBackgroundCoverSunUV(
        window.innerWidth,
        window.innerHeight,
        opt.sunX - BASE_SUN_X,
        opt.sunY - BASE_SUN_Y
      );

      // Responsive Attenuation on mobile/tablet to protect text contrast
      const responsiveAttenuation =
        window.innerWidth < 768 ? 0.70 : window.innerWidth < 1024 ? 0.85 : 1.0;

      // Layer 1: Pass 7 = Primary Flare Transparent (behind cards)
      if (backStateRef.current && canvasBackRef.current) {
        renderPass(
          backStateRef.current,
          canvasBackRef.current,
          opt,
          sunUV,
          7,
          choreo.opticalProgress,
          1.0,
          choreo.chapterMultiplier
        );
      }

      // Layer 4: Pass 6 = Foreground Optical Spill (in front of cards)
      if (frontStateRef.current && canvasFrontRef.current) {
        renderPass(
          frontStateRef.current,
          canvasFrontRef.current,
          opt,
          sunUV,
          6,
          choreo.opticalProgress,
          responsiveAttenuation,
          choreo.chapterMultiplier
        );
      }

      // FPS tracking
      fpsFramesRef.current++;
      const now = performance.now();
      if (fpsLastTimeRef.current === 0) {
        fpsLastTimeRef.current = now;
      } else if (now - fpsLastTimeRef.current >= 500) {
        const measuredFps = Math.round(
          (fpsFramesRef.current * 1000) / (now - fpsLastTimeRef.current)
        );
        setFps(measuredFps);
        fpsFramesRef.current = 0;
        fpsLastTimeRef.current = now;
      }

      if (showDebug) {
        setDebugMetrics({
          scrollY: Math.round(scrollY),
          maxScroll: Math.round(maxDocScroll),
          pageProgress,
          chapter: choreo.chapterName,
          chapterMultiplier: choreo.chapterMultiplier,
          opticalProgress: choreo.opticalProgress,
          opticalPhase: opt.phaseName,
          opticalState: opt,
          sunUV,
          responsiveAttenuation,
        });
      }
    };

    const onScroll = () => {
      if (rafIdRef.current === null) {
        rafIdRef.current = window.requestAnimationFrame(() => {
          rafIdRef.current = null;
          renderCurrentFrame();
        });
      }
    };

    const handleResize = () => {
      if (!canvasBackRef.current || !canvasFrontRef.current) return;
      const currentDpr = Math.min(window.devicePixelRatio || 1, 1.5);
      setDprVal(currentDpr);

      const rect = canvasBackRef.current.getBoundingClientRect();
      const w = Math.round(rect.width * currentDpr);
      const h = Math.round(rect.height * currentDpr);

      canvasBackRef.current.width = w;
      canvasBackRef.current.height = h;
      canvasFrontRef.current.width = w;
      canvasFrontRef.current.height = h;

      setResolutionStr(`${w} × ${h}`);
      renderCurrentFrame();
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        renderCurrentFrame();
      }
    };

    // Initial render
    renderCurrentFrame();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", handleResize, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
      }
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibility);

      if (backState) {
        backState.gl.deleteProgram(backState.program);
        if (backState.bgTex) backState.gl.deleteTexture(backState.bgTex);
        backState.gl.deleteVertexArray(backState.vao);
        backState.gl.deleteBuffer(backState.vbo);
      }
      if (frontState) {
        frontState.gl.deleteProgram(frontState.program);
        if (frontState.bgTex) frontState.gl.deleteTexture(frontState.bgTex);
        frontState.gl.deleteVertexArray(frontState.vao);
        frontState.gl.deleteBuffer(frontState.vbo);
      }
    };
  }, [initGL, renderPass, showDebug]);

  return (
    <>
      {/* Layer 1: Primary Sun Optics (Behind Readability Overlay & UI Cards) */}
      <canvas
        ref={canvasBackRef}
        id="dashboard-sun-back-canvas"
        data-testid="dashboard-sun-back-canvas"
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 1, // Behind .weather-overlay-layer (z-index: 2) & .weather-content-layer (z-index: 3)
          pointerEvents: "none",
          display: "block",
        }}
      />

      {/* Layer 4: Foreground Optical Spill (In Front of Cards, Non-blocking Glare) */}
      <canvas
        ref={canvasFrontRef}
        id="dashboard-sun-front-canvas"
        data-testid="dashboard-sun-front-canvas"
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 20, // In front of .weather-content-layer (z-index: 3)
          pointerEvents: "none",
          display: "block",
        }}
      />

      {/* M13.10.2 Debug HUD (only when weatherDebug=1) */}
      {showDebug && (
        <aside
          id="dashboard-sun-hud"
          data-testid="dashboard-sun-hud"
          aria-label="Dashboard Sun Debug HUD"
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            zIndex: 99999,
            background: "rgba(10, 15, 26, 0.92)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(255, 255, 255, 0.22)",
            borderRadius: "10px",
            padding: "12px 16px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "11px",
            color: "#f1f5f9",
            lineHeight: 1.55,
            minWidth: "240px",
            pointerEvents: "none",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.65)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontWeight: 800, color: "#fbbf24", fontSize: "12px", letterSpacing: "0.05em" }}>
              ☀ Sun Dashboard: <span style={{ color: "#4ade80" }}>ON</span>
            </span>
          </div>

          <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.1)", paddingTop: "6px", display: "flex", flexDirection: "column", gap: "2px" }}>
            <div>Scenario: <span style={{ color: "#fbbf24", fontWeight: 700 }}>clear-day</span></div>
            <div>Renderer: <span style={{ color: "#38bdf8" }}>Photographic Sun (Renderer B)</span></div>
            <div>Layer: <span style={{ color: "#a78bfa" }}>D Optical Spill</span></div>

            <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", marginTop: "4px", paddingTop: "4px" }}>
              <div>Scroll Y: <span style={{ color: "#e2e8f0" }}>{debugMetrics.scrollY}px</span></div>
              <div>Max Scroll: <span style={{ color: "#94a3b8" }}>{debugMetrics.maxScroll}px (Full Page)</span></div>
              <div style={{ fontWeight: 700, color: "#38bdf8", marginTop: "2px" }}>
                Page Progress: {debugMetrics.pageProgress.toFixed(3)}
              </div>
              <div>
                Chapter:{" "}
                <span style={{ color: "#fbbf24", fontWeight: 800 }}>
                  {debugMetrics.chapter}
                </span>{" "}
                <span style={{ color: "#94a3b8", fontSize: "10px" }}>
                  ({debugMetrics.chapterMultiplier.toFixed(2)}x)
                </span>
              </div>
              <div style={{ fontWeight: 700, color: "#4ade80", marginTop: "2px" }}>
                Optical Progress: {debugMetrics.opticalProgress.toFixed(3)}
              </div>
              <div>Optical Phase: <span style={{ color: "#fde047", fontWeight: 700 }}>{debugMetrics.opticalPhase}</span></div>
            </div>

            <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", marginTop: "4px", paddingTop: "4px" }}>
              <div>
                Sun X/Y:{" "}
                <span style={{ color: "#fde047" }}>
                  {debugMetrics.sunUV.x.toFixed(3)}, {debugMetrics.sunUV.y.toFixed(3)}
                </span>
              </div>
              <div>Intensity: <span style={{ color: "#fde047" }}>{debugMetrics.opticalState.intensity.toFixed(2)}</span></div>
              <div>Bloom: <span style={{ color: "#fde047" }}>{debugMetrics.opticalState.bloom.toFixed(2)}</span></div>
              <div>
                Halo:{" "}
                <span style={{ color: "#fde047" }}>
                  {debugMetrics.opticalState.haloStrength.toFixed(2)} (s:{debugMetrics.opticalState.haloScale.toFixed(2)}, o:{debugMetrics.opticalState.haloOffset.toFixed(2)})
                </span>
              </div>
              <div>Starburst: <span style={{ color: "#fde047" }}>{debugMetrics.opticalState.starburst.toFixed(2)}</span></div>
              <div>
                Ghost:{" "}
                <span style={{ color: "#fde047" }}>
                  {debugMetrics.opticalState.ghostStrength.toFixed(2)} (x{debugMetrics.opticalState.ghostSpread.toFixed(2)})
                </span>
              </div>
              <div>Haze: <span style={{ color: "#fde047" }}>{debugMetrics.opticalState.haze.toFixed(2)}</span></div>
            </div>

            <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", marginTop: "4px", paddingTop: "4px" }}>
              <div>
                Foreground Spill:{" "}
                <span style={{ color: debugMetrics.opticalState.intensity >= 1.28 ? "#f87171" : "#4ade80", fontWeight: 700 }}>
                  {debugMetrics.opticalState.intensity >= 1.28 ? "Peak Glare" : "Calm (Restrained)"}
                </span>
              </div>
              <div>
                Responsive Attenuation:{" "}
                <span style={{ color: "#93c5fd" }}>
                  {(debugMetrics.responsiveAttenuation * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", marginTop: "4px", paddingTop: "4px" }}>
              <div>
                FPS:{" "}
                <span style={{ color: fps >= 50 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                  {fps}
                </span>
              </div>
              <div>DPR: <span style={{ color: "#e2e8f0" }}>{dprVal.toFixed(1)}x</span></div>
              <div>Canvas: <span style={{ color: "#e2e8f0" }}>{resolutionStr}</span></div>
              <div>WebGL: <span style={{ color: "#38bdf8" }}>WebGL2</span></div>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
