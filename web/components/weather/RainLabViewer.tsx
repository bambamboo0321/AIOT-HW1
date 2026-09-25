"use client";

import React, { useEffect, useRef, useState } from "react";

// High contrast test pattern for unmistakable optical refraction verification
const HIGH_CONTRAST_TEST_PATTERN = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs>
    <linearGradient id="skyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="40%" stop-color="#1e3a8a"/>
      <stop offset="80%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
      <line x1="0" y1="0" x2="80" y2="80" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>
    </pattern>
  </defs>
  <!-- Background Gradient & Grid -->
  <rect width="1920" height="1080" fill="url(#skyGrad)"/>
  <rect width="1920" height="1080" fill="url(#grid)"/>
  <!-- High Contrast Horizontal Guide Lines -->
  <line x1="0" y1="360" x2="1920" y2="360" stroke="#f43f5e" stroke-width="6"/>
  <line x1="0" y1="540" x2="1920" y2="540" stroke="#f59e0b" stroke-width="8"/>
  <line x1="0" y1="720" x2="1920" y2="720" stroke="#10b981" stroke-width="6"/>
  <!-- High Contrast Diagonal Alignment Stripes -->
  <line x1="120" y1="0" x2="850" y2="1080" stroke="#38bdf8" stroke-width="6"/>
  <line x1="1050" y1="0" x2="1780" y2="1080" stroke="#c084fc" stroke-width="6"/>
  <!-- Sharp Mountain Silhouette with High-Contrast White Edge -->
  <polygon points="0,680 340,430 580,550 940,310 1280,510 1620,370 1920,590 1920,1080 0,1080" fill="#090d16"/>
  <polyline points="0,680 340,430 580,550 940,310 1280,510 1620,370 1920,590" fill="none" stroke="#ffffff" stroke-width="5"/>
  <!-- Prominent Test Label -->
  <text x="960" y="240" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="6">
    OPTICAL REFRACTION FEASIBILITY TEST
  </text>
  <text x="960" y="285" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="600" fill="#93c5fd" text-anchor="middle" letter-spacing="3">
    VERIFY BACKGROUND GRID, EDGES AND LINE CURVATURE INSIDE DROPLETS
  </text>
</svg>
`)}`;

const NORMAL_BG_PATH = "/images/weather/rain-day.webp";

export type DropletScaleMode = "auto" | "1.0x" | "1.25x" | "1.5x" | "1.75x";

/**
 * Viewport-aware normalized scaling based on ~1440px baseline.
 * 1440px -> 1.00x
 * 1920px -> ~1.14x (1.15x target)
 * 2560px -> ~1.30x
 * Clamped between [0.85, 1.45] to avoid giant water balloons on ultra-wide / 4K.
 */
function computeScaleFactor(mode: DropletScaleMode, viewportWidth: number): number {
  if (mode === "1.0x") return 1.0;
  if (mode === "1.25x") return 1.25;
  if (mode === "1.5x") return 1.5;
  if (mode === "1.75x") return 1.75;

  const ratio = Math.max(0.5, viewportWidth / 1440);
  const autoScale = Math.pow(ratio, 0.45);
  return Math.min(1.45, Math.max(0.85, autoScale));
}

export function RainLabViewer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raindropFxRef = useRef<any>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [refractionOn, setRefractionOn] = useState(true);
  const [density, setDensity] = useState<"low" | "medium" | "high">("medium");
  const [trailsOn, setTrailsOn] = useState(true);
  const [bgMode, setBgMode] = useState<"normal" | "test">("normal");
  const [scaleMode, setScaleMode] = useState<DropletScaleMode>("auto");
  const [scaleFactor, setScaleFactor] = useState(1.0);

  // Metrics
  const [fps, setFps] = useState(60);
  const [activeDrops, setActiveDrops] = useState(0);
  const [rendererInfo, setRendererInfo] = useState<string>("Initializing WebGL2...");
  const [canvasResolution, setCanvasResolution] = useState<string>("--");

  useEffect(() => {
    if (!canvasRef.current) return;

    let isDisposed = false;
    const canvas = canvasRef.current;

    // Use DPR capped at 1.5 for optimal balance of razor-sharp rendering and smooth 60fps performance
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    canvas.width = w;
    canvas.height = h;
    setCanvasResolution(`${w} x ${h} (${dpr.toFixed(1)}x DPR)`);

    const currentScale = computeScaleFactor(scaleMode, window.innerWidth);
    setScaleFactor(currentScale);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fxInstance: any = null;

    async function initRenderer() {
      try {
        // Dynamically import raindrop-fx in browser context to avoid Node.js SSR evaluation
        const fxModule = await import("raindrop-fx");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const RaindropFXClass = (fxModule as any).default || fxModule;

        if (isDisposed || !canvas) return;

        // Query WebGL2 context information
        const gl = canvas.getContext("webgl2");
        if (gl) {
          const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
          const gpu = debugInfo
            ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER);
          setRendererInfo(gpu || "WebGL2 Standard");
        } else {
          setRendererInfo("WebGL2 Context Failed");
        }

        // M13.7.1 Size Distribution Tuning:
        // 1. Micro droplets: kept at baseline [4, 16] for fine condensation texture
        // 2. Medium droplets: ~1.45x baseline (32px * scale)
        // 3. Major moving droplets: ~1.80x baseline (98px * scale), merging up to 130px+
        // 4. Water trails: widened trailDropSize [0.28, 0.48] with proportional spacing
        const minSpawn = Math.round(32 * currentScale);
        const maxSpawn = Math.round(98 * currentScale);
        const minTrailDist = Math.round(20 * Math.sqrt(currentScale));
        const maxTrailDist = Math.round(34 * Math.sqrt(currentScale));

        fxInstance = new RaindropFXClass({
          canvas: canvas,
          background: bgMode === "normal" ? NORMAL_BG_PATH : HIGH_CONTRAST_TEST_PATTERN,
          spawnSize: [minSpawn, maxSpawn],
          spawnInterval: [0.7, 1.6],
          spawnLimit: 400,
          gravity: 2200,
          slipRate: 0.05, // Calm slipping rate ensuring 3~6 drops sliding at a time
          motionInterval: [0.15, 0.45],
          colliderSize: 1.0,
          trailDropDensity: 0.22,
          trailDropSize: [0.28, 0.48], // Natural organic trail drops matching major droplets
          trailDistance: [minTrailDist, maxTrailDist],
          trailSpread: 0.55,
          initialSpread: 0.4,
          shrinkRate: 0.015,
          velocitySpread: 0.35,
          evaporate: 12,
          xShifting: [0, 0.08],
          backgroundBlurSteps: 3,
          mist: true,
          mistColor: [0.01, 0.01, 0.01, 0.85],
          mistBlurStep: 4,
          mistTime: 12,
          dropletsPerSeconds: 400,
          dropletSize: [4, 16], // Micro droplets: unchanged, preserves realistic fine scale
          smoothRaindrop: [0.96, 0.99],
          refractBase: 0.35, // Base refraction displacement
          refractScale: 0.65, // Displacement proportional to drop curvature
          raindropCompose: "smoother",
          raindropLightPos: [-1, 1, 2, 0],
          raindropDiffuseLight: [0.25, 0.25, 0.25],
          raindropShadowOffset: 0.75,
          raindropEraserSize: [0.93, 1.0],
          raindropSpecularLight: [0.65, 0.65, 0.65],
          raindropSpecularShininess: 128,
          raindropLightBump: 0.85,
        });

        raindropFxRef.current = fxInstance;
        await fxInstance.start();
      } catch (err) {
        console.error("Failed to initialize WebGL RaindropFX:", err);
        setRendererInfo("Init Error: " + String(err));
      }
    }

    initRenderer();

    // Handle responsive window resize
    const handleResize = () => {
      if (!canvas || !fxInstance) return;
      const r = canvas.getBoundingClientRect();
      const rw = Math.round(r.width * dpr);
      const rh = Math.round(r.height * dpr);
      canvas.width = rw;
      canvas.height = rh;
      fxInstance.resize(rw, rh);
      setCanvasResolution(`${rw} x ${rh} (${dpr.toFixed(1)}x DPR)`);

      // Update viewport-aware auto scale if active
      if (scaleMode === "auto") {
        const newScale = computeScaleFactor("auto", window.innerWidth);
        setScaleFactor(newScale);
        fxInstance.options.spawnSize = [
          Math.round(32 * newScale),
          Math.round(98 * newScale),
        ];
        fxInstance.options.trailDistance = [
          Math.round(20 * Math.sqrt(newScale)),
          Math.round(34 * Math.sqrt(newScale)),
        ];
      }
    };

    window.addEventListener("resize", handleResize);

    // Live FPS and active droplet tracker loop
    let lastTime = performance.now();
    let frameCount = 0;
    let animId = 0;

    const measurePerf = (time: number) => {
      frameCount++;
      if (time - lastTime >= 500) {
        setFps(Math.round((frameCount * 1000) / (time - lastTime)));
        frameCount = 0;
        lastTime = time;

        if (fxInstance?.simulator?.raindrops) {
          setActiveDrops(fxInstance.simulator.raindrops.length);
        }
      }
      animId = requestAnimationFrame(measurePerf);
    };

    animId = requestAnimationFrame(measurePerf);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      if (fxInstance) {
        try {
          fxInstance.stop();
        } catch {
          // ignore
        }
      }
      raindropFxRef.current = null;
    };
  }, [bgMode, scaleMode]);

  // Handler: Simulation Play / Pause
  const handleToggleSimulation = () => {
    const fx = raindropFxRef.current;
    if (!fx) return;
    if (isPlaying) {
      fx.stop();
      setIsPlaying(false);
    } else {
      fx.start();
      setIsPlaying(true);
    }
  };

  // Handler: Refraction ON / OFF (Crucial visual test)
  const handleToggleRefraction = () => {
    const fx = raindropFxRef.current;
    if (!fx) return;
    if (refractionOn) {
      // Disable displacement: UV distortion parameters set to zero
      fx.options.refractBase = 0.0;
      fx.options.refractScale = 0.0;
      setRefractionOn(false);
    } else {
      // Re-enable optical refraction
      fx.options.refractBase = 0.35;
      fx.options.refractScale = 0.65;
      setRefractionOn(true);
    }
  };

  // Handler: Droplet Scale Selection (Auto, 1.0x, 1.25x, 1.5x, 1.75x)
  const handleSetScaleMode = (mode: DropletScaleMode) => {
    setScaleMode(mode);
    const newFactor = computeScaleFactor(mode, typeof window !== "undefined" ? window.innerWidth : 1440);
    setScaleFactor(newFactor);

    const fx = raindropFxRef.current;
    if (!fx) return;

    fx.options.spawnSize = [
      Math.round(32 * newFactor),
      Math.round(98 * newFactor),
    ];
    fx.options.trailDistance = [
      Math.round(20 * Math.sqrt(newFactor)),
      Math.round(34 * Math.sqrt(newFactor)),
    ];
  };

  // Handler: Droplet Density
  const handleSetDensity = (newDensity: "low" | "medium" | "high") => {
    const fx = raindropFxRef.current;
    setDensity(newDensity);
    if (!fx) return;

    if (newDensity === "low") {
      fx.options.dropletsPerSeconds = 150;
      fx.options.spawnInterval = [1.5, 3.0];
      fx.options.spawnLimit = 200;
    } else if (newDensity === "medium") {
      fx.options.dropletsPerSeconds = 400;
      fx.options.spawnInterval = [0.7, 1.6];
      fx.options.spawnLimit = 400;
    } else {
      fx.options.dropletsPerSeconds = 850;
      fx.options.spawnInterval = [0.3, 0.8];
      fx.options.spawnLimit = 700;
    }
  };

  // Handler: Trails ON / OFF
  const handleToggleTrails = () => {
    const fx = raindropFxRef.current;
    if (!fx) return;
    if (trailsOn) {
      fx.options.trailDropDensity = 0.0;
      fx.options.trailSpread = 0.0;
      setTrailsOn(false);
    } else {
      fx.options.trailDropDensity = 0.22;
      fx.options.trailSpread = 0.55;
      setTrailsOn(true);
    }
  };

  // Handler: Background Switch (Normal vs High Contrast Grid)
  const handleToggleBackground = async (mode: "normal" | "test") => {
    const fx = raindropFxRef.current;
    setBgMode(mode);
    if (!fx) return;
    const targetBg = mode === "normal" ? NORMAL_BG_PATH : HIGH_CONTRAST_TEST_PATTERN;
    try {
      await fx.setBackground(targetBg);
    } catch (e) {
      console.error("Failed to switch background:", e);
    }
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        backgroundColor: "#0b121e",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Fullscreen WebGL Rain Canvas */}
      <canvas
        ref={canvasRef}
        id="rain-lab-canvas"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
        }}
      />

      {/* Floating Control HUD */}
      <div
        id="rain-lab-hud"
        style={{
          position: "fixed",
          top: "20px",
          left: "20px",
          zIndex: 1000,
          background: "rgba(10, 15, 26, 0.90)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          borderRadius: "12px",
          padding: "16px 20px",
          color: "#f8fafc",
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.7)",
          width: "330px",
          lineHeight: 1.45,
          fontSize: "12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <div style={{ fontWeight: 800, fontSize: "14px", color: "#38bdf8", letterSpacing: "0.04em" }}>
            🌧️ M13.7.1 WebGL Rain Lab
          </div>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "4px",
              background: "rgba(56, 189, 248, 0.2)",
              color: "#38bdf8",
              fontSize: "10px",
              fontWeight: 700,
            }}
          >
            LAB ONLY
          </span>
        </div>

        {/* Live Metrics */}
        <div
          style={{
            background: "rgba(0, 0, 0, 0.4)",
            padding: "8px 12px",
            borderRadius: "6px",
            marginBottom: "14px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            fontSize: "11px",
            color: "#94a3b8",
          }}
        >
          <div>
            FPS:{" "}
            <span style={{ color: fps >= 50 ? "#4ade80" : "#facc15", fontWeight: 700 }}>
              {fps}
            </span>
          </div>
          <div>
            Active Droplets: <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{activeDrops}</span>
          </div>
          <div>
            Droplet Scale:{" "}
            <span style={{ color: "#38bdf8", fontWeight: 700 }}>
              {scaleMode.toUpperCase()} ({scaleFactor.toFixed(2)}x)
            </span>
          </div>
          <div>
            Medium / Major:{" "}
            <span style={{ color: "#e2e8f0" }}>
              {Math.round(32 * scaleFactor)}px ~ {Math.round(98 * scaleFactor)}px
            </span>
          </div>
          <div>
            Micro Droplets: <span style={{ color: "#94a3b8" }}>4px ~ 16px (fine scale)</span>
          </div>
          <div>
            Resolution: <span style={{ color: "#e2e8f0" }}>{canvasResolution}</span>
          </div>
          <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            Renderer: {rendererInfo}
          </div>
        </div>

        {/* Control Groups */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {/* Row 1: Simulation & Refraction Toggle */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleToggleSimulation}
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: "6px",
                border: isPlaying ? "1px solid #0ea5e9" : "1px solid #64748b",
                background: isPlaying ? "rgba(14, 165, 233, 0.22)" : "rgba(100, 116, 139, 0.22)",
                color: isPlaying ? "#38bdf8" : "#94a3b8",
                fontWeight: 700,
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              {isPlaying ? "⏸️ Pause" : "▶️ Play"}
            </button>

            <button
              id="toggle-refraction-btn"
              onClick={handleToggleRefraction}
              style={{
                flex: 1.4,
                padding: "8px 10px",
                borderRadius: "6px",
                border: refractionOn ? "1px solid #10b981" : "1px solid #ef4444",
                background: refractionOn ? "rgba(16, 185, 129, 0.25)" : "rgba(239, 68, 68, 0.25)",
                color: refractionOn ? "#4ade80" : "#f87171",
                fontWeight: 800,
                fontSize: "11px",
                cursor: "pointer",
                letterSpacing: "0.02em",
              }}
            >
              {refractionOn ? "Refraction: ON" : "Refraction: OFF"}
            </button>
          </div>

          {/* Row 2: Droplet Scale (M13.7.1 Viewport-Aware Scale Control) */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <span style={{ fontSize: "11px", color: "#94a3b8" }}>Droplet Scale:</span>
              <span style={{ fontSize: "10px", color: "#38bdf8", fontWeight: 700 }}>
                {scaleFactor.toFixed(2)}x
              </span>
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              {(["auto", "1.0x", "1.25x", "1.5x", "1.75x"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => handleSetScaleMode(m)}
                  style={{
                    flex: 1,
                    padding: "5px 4px",
                    borderRadius: "5px",
                    border: scaleMode === m ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.12)",
                    background: scaleMode === m ? "rgba(56, 189, 248, 0.25)" : "rgba(255, 255, 255, 0.05)",
                    color: scaleMode === m ? "#ffffff" : "#94a3b8",
                    fontSize: "10px",
                    fontWeight: scaleMode === m ? 700 : 500,
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {m === "auto" ? "Auto" : m}
                </button>
              ))}
            </div>
          </div>

          {/* Row 3: Droplet Density Preset */}
          <div>
            <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>Droplet Density:</div>
            <div style={{ display: "flex", gap: "6px" }}>
              {(["low", "medium", "high"] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => handleSetDensity(d)}
                  style={{
                    flex: 1,
                    padding: "6px 8px",
                    borderRadius: "5px",
                    border: density === d ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.12)",
                    background: density === d ? "rgba(56, 189, 248, 0.25)" : "rgba(255, 255, 255, 0.05)",
                    color: density === d ? "#ffffff" : "#94a3b8",
                    fontSize: "11px",
                    fontWeight: density === d ? 700 : 500,
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Row 4: Water Trails Toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "11px", color: "#94a3b8" }}>Droplet Water Trails:</span>
            <button
              onClick={handleToggleTrails}
              style={{
                padding: "4px 12px",
                borderRadius: "5px",
                border: trailsOn ? "1px solid #0ea5e9" : "1px solid #64748b",
                background: trailsOn ? "rgba(14, 165, 233, 0.2)" : "rgba(255, 255, 255, 0.05)",
                color: trailsOn ? "#38bdf8" : "#64748b",
                fontWeight: 600,
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              {trailsOn ? "Trails: ON" : "Trails: OFF"}
            </button>
          </div>

          {/* Row 5: Background Selection */}
          <div>
            <div style={{ fontSize: "11px", color: "#94a3b8", marginBottom: "4px" }}>Test Scene:</div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => handleToggleBackground("normal")}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: "5px",
                  border: bgMode === "normal" ? "1px solid #38bdf8" : "1px solid rgba(255, 255, 255, 0.12)",
                  background: bgMode === "normal" ? "rgba(56, 189, 248, 0.25)" : "rgba(255, 255, 255, 0.05)",
                  color: bgMode === "normal" ? "#ffffff" : "#94a3b8",
                  fontSize: "11px",
                  fontWeight: bgMode === "normal" ? 700 : 500,
                  cursor: "pointer",
                }}
              >
                Rain Day Scene
              </button>
              <button
                onClick={() => handleToggleBackground("test")}
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: "5px",
                  border: bgMode === "test" ? "1px solid #f59e0b" : "1px solid rgba(255, 255, 255, 0.12)",
                  background: bgMode === "test" ? "rgba(245, 158, 11, 0.25)" : "rgba(255, 255, 255, 0.05)",
                  color: bgMode === "test" ? "#fef08a" : "#94a3b8",
                  fontSize: "11px",
                  fontWeight: bgMode === "test" ? 700 : 500,
                  cursor: "pointer",
                }}
              >
                Grid & Stripes
              </button>
            </div>
          </div>
        </div>

        {/* Instructions Footer */}
        <div style={{ marginTop: "14px", paddingTop: "10px", borderTop: "1px solid rgba(255, 255, 255, 0.1)", fontSize: "10px", color: "#64748b", lineHeight: 1.4 }}>
          Toggle <b style={{ color: "#e2e8f0" }}>Refraction ON / OFF</b> to compare optical distortion. Switch <b style={{ color: "#e2e8f0" }}>Droplet Scale</b> to compare Auto (~1.0x-1.3x) vs fixed multipliers.
        </div>
      </div>
    </div>
  );
}
