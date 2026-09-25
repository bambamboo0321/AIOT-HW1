"use client";

import React, { useEffect, useRef, useState } from "react";

const RAIN_BACKGROUND_PATH = "/images/weather/rain-day.webp";

export interface DashboardRainOverlayProps {
  showDebug?: boolean;
}

/**
 * Milestone M13.8: Dashboard WebGL Rain Overlay
 *
 * Integrates verified M13.7 raindrop-fx wet-glass rendering directly
 * behind the Forecast Dashboard UI (Layer 2 / z-index: 1).
 *
 * Optical Refraction Architecture:
 * - Live DOM Refraction: NOT SUPPORTED by browser WebGL architecture
 *   (fragment shaders cannot sample arbitrary browser compositor DOM pixels without forbidden rasterization hacks).
 * - Background Refraction: SUPPORTED on GPU. The WebGL shader directly samples
 *   and refracts the photorealistic weather background asset (/images/weather/rain-day.webp),
 *   creating realistic optical lens distortion, mist, and water trails behind glass cards.
 *
 * Visual Baseline:
 * - Droplet Scale: Fixed 1.5x desktop baseline (M13.7 verified).
 * - Density: Medium (400 drops/s, spawn interval [0.7, 1.6], spawn limit 400).
 * - Pointer Events: 100% passthrough (pointer-events: none, z-index: 1).
 * - Visibility: Automatically pauses when document.visibilityState is "hidden".
 * - Reduced Motion: Halts continuous physics, preserving calm static wet-glass texture.
 */
export function DashboardRainOverlay({ showDebug = false }: DashboardRainOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fxRef = useRef<any>(null);

  const [fps, setFps] = useState(60);
  const [activeDrops, setActiveDrops] = useState(0);
  const [resolutionStr, setResolutionStr] = useState<string>("--");
  const [dprVal, setDprVal] = useState<number>(1);
  const [isSimPaused, setIsSimPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (!canvasRef.current) return;

    let isDisposed = false;
    const canvas = canvasRef.current;

    // Use DPR capped at 1.5 for optimal performance and crisp rendering
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    setDprVal(dpr);

    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    canvas.width = w;
    canvas.height = h;
    setResolutionStr(`${w} × ${h}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fxInstance: any = null;

    // Baseline 1.5x scale parameters from M13.7
    const scaleFactor = 1.5;
    const minSpawn = Math.round(32 * scaleFactor); // 48
    const maxSpawn = Math.round(98 * scaleFactor); // 147
    const minTrailDist = Math.round(20 * Math.sqrt(scaleFactor)); // 24
    const maxTrailDist = Math.round(34 * Math.sqrt(scaleFactor)); // 42

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    async function initRain() {
      try {
        const fxModule = await import("raindrop-fx");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const RaindropFXClass = (fxModule as any).default || fxModule;

        if (isDisposed || !canvas) return;

        fxInstance = new RaindropFXClass({
          canvas: canvas,
          background: RAIN_BACKGROUND_PATH,
          spawnSize: [minSpawn, maxSpawn],
          spawnInterval: [0.7, 1.6],
          spawnLimit: 400,
          gravity: 2200,
          slipRate: 0.05,
          motionInterval: [0.15, 0.45],
          colliderSize: 1.0,
          trailDropDensity: 0.22,
          trailDropSize: [0.28, 0.48],
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
          dropletSize: [4, 16], // Micro droplets: unchanged fine-scale condensation
          smoothRaindrop: [0.96, 0.99],
          refractBase: 0.35,
          refractScale: 0.65,
          raindropCompose: "smoother",
          raindropLightPos: [-1, 1, 2, 0],
          raindropDiffuseLight: [0.25, 0.25, 0.25],
          raindropShadowOffset: 0.75,
          raindropEraserSize: [0.93, 1.0],
          raindropSpecularLight: [0.65, 0.65, 0.65],
          raindropSpecularShininess: 128,
          raindropLightBump: 0.85,
        });

        fxRef.current = fxInstance;
        await fxInstance.start();

        if (prefersReducedMotion && fxInstance) {
          // Pause motion after rendering initial static composition
          setTimeout(() => {
            if (!isDisposed && fxInstance) {
              fxInstance.stop();
              setIsSimPaused(true);
            }
          }, 400);
        }
      } catch (err) {
        console.error("Failed to initialize Dashboard WebGL Rain Overlay:", err);
      }
    }

    initRain();

    // Handle responsive window resize
    const handleResize = () => {
      if (!canvas || !fxInstance) return;
      const r = canvas.getBoundingClientRect();
      const rw = Math.round(r.width * dpr);
      const rh = Math.round(r.height * dpr);
      canvas.width = rw;
      canvas.height = rh;
      fxInstance.resize(rw, rh);
      setResolutionStr(`${rw} × ${rh}`);
    };

    window.addEventListener("resize", handleResize);

    // Handle tab visibility (battery saving)
    const handleVisibility = () => {
      if (!fxInstance) return;
      const visible = document.visibilityState === "visible";
      setIsVisible(visible);
      if (!visible) {
        fxInstance.stop();
        setIsSimPaused(true);
      } else {
        if (!prefersReducedMotion) {
          fxInstance.start();
          setIsSimPaused(false);
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    // Live FPS and droplet monitor for debug HUD
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
      document.removeEventListener("visibilitychange", handleVisibility);
      if (fxInstance) {
        try {
          fxInstance.stop();
        } catch {
          // ignore
        }
      }
      fxRef.current = null;
    };
  }, []);

  return (
    <>
      {/* WebGL Wet-Glass Rain Atmosphere Canvas */}
      <canvas
        ref={canvasRef}
        id="dashboard-rain-canvas"
        data-testid="dashboard-rain-canvas"
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 1, // Directly behind .weather-overlay-layer (z-index: 2) and .weather-content-layer (z-index: 3)
          pointerEvents: "none",
          display: "block",
        }}
      />

      {/* M13.8 Debug HUD */}
      {showDebug && (
        <aside
          id="dashboard-rain-hud"
          data-testid="dashboard-rain-hud"
          aria-label="Dashboard Rain Debug HUD"
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            zIndex: 99999,
            background: "rgba(10, 15, 26, 0.92)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            borderRadius: "10px",
            padding: "12px 16px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "11px",
            color: "#f1f5f9",
            lineHeight: 1.55,
            minWidth: "220px",
            pointerEvents: "none",
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.65)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontWeight: 800, color: "#38bdf8", fontSize: "12px", letterSpacing: "0.05em" }}>
              🌧️ Rain Dashboard: <span style={{ color: "#4ade80" }}>ON</span>
            </span>
          </div>
          <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.1)", paddingTop: "6px", display: "flex", flexDirection: "column", gap: "2px" }}>
            <div>Renderer: <span style={{ color: "#93c5fd" }}>WebGL2 / raindrop-fx</span></div>
            <div>Droplet Scale: <span style={{ color: "#fbbf24", fontWeight: 700 }}>1.5x</span></div>
            <div>Density: <span style={{ color: "#a78bfa" }}>Medium</span></div>
            <div>
              FPS:{" "}
              <span style={{ color: fps >= 50 ? "#4ade80" : "#f87171", fontWeight: 700 }}>
                {fps}
              </span>
              {" "}<span style={{ color: "#64748b" }}>({activeDrops} drops)</span>
            </div>
            <div>Canvas: <span style={{ color: "#e2e8f0" }}>{resolutionStr}</span></div>
            <div>DPR: <span style={{ color: "#e2e8f0" }}>{dprVal.toFixed(1)}x</span></div>
            <div>
              DOM Refraction:{" "}
              <span style={{ color: "#f87171", fontWeight: 700 }}>NOT SUPPORTED</span>
            </div>
            <div>
              Background Refraction:{" "}
              <span style={{ color: "#4ade80", fontWeight: 700 }}>ON</span>
            </div>
            <div>
              Simulation:{" "}
              <span style={{ color: isSimPaused ? "#facc15" : "#4ade80", fontWeight: 700 }}>
                {isSimPaused ? "PAUSED" : "RUNNING"}
              </span>
            </div>
            <div>
              Visibility:{" "}
              <span style={{ color: isVisible ? "#4ade80" : "#94a3b8", fontWeight: 700 }}>
                {isVisible ? "VISIBLE" : "HIDDEN"}
              </span>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}
