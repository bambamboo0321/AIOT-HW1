"use client";

import React, { useEffect, useSyncExternalStore, useRef } from "react";
import { createPortal } from "react-dom";
import { WeatherScenarioKey } from "@/lib/theme/background-assets";
import { RefractiveRaindropPrototype } from "./RefractiveRaindropPrototype";
import { DashboardRainOverlay } from "./DashboardRainOverlay";
import { DashboardSunOverlay } from "./sun/DashboardSunOverlay";

export interface WeatherAtmosphereProps {
  scenario?: WeatherScenarioKey;
  usePortal?: boolean;
  portalTarget?: HTMLElement | null;
}

function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => {
    document.removeEventListener("visibilitychange", callback);
  };
}

function getVisibilitySnapshot(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

function getServerVisibilitySnapshot(): boolean {
  return false;
}

const emptySubscribe = () => () => {};

function getClientRoot(): HTMLElement | null {
  return typeof document !== "undefined" ? document.getElementById("weather-atmosphere-root") : null;
}

function getServerRoot(): HTMLElement | null {
  return null;
}

function checkMediaQuery(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return Boolean(window.matchMedia(query)?.matches);
  } catch {
    return false;
  }
}

function subscribeDebug(callback: () => void) {
  window.addEventListener("popstate", callback);
  return () => {
    window.removeEventListener("popstate", callback);
  };
}

function getDebugSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "production") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("weatherDebug") === "1";
  } catch {
    return false;
  }
}

function getRainPrototypeSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "production") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("rainPrototype") === "1";
  } catch {
    return false;
  }
}

function getRainDashboardSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "production") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("rainDashboard") === "1";
  } catch {
    return false;
  }
}

function getSunDashboardSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "production") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("sunDashboard") === "1";
  } catch {
    return false;
  }
}

function getServerDebugSnapshot(): boolean {
  return false;
}

/**
 * WeatherAtmosphere Component (Milestone M13.5 Scroll-Scrubbed Weather Atmosphere)
 *
 * Core Interaction Model:
 * SCROLL POSITION = ANIMATION PLAYHEAD
 *
 * The normalized weather scene progress (0.000 -> 1.000) acts directly as the
 * continuous timeline playhead for weather composition. Stopping scroll pauses
 * exactly at the current composition. Reverse scroll smoothly scrubs backward.
 *
 * Strict Architectural Guarantees:
 * - Single root portal with pointer-events: none and aria-hidden="true"
 * - Zero video, canvas, WebGL, or continuous animation loops
 * - rAF-batched passive scroll listener directly setting CSS custom properties
 * - Zero React re-renders on scroll / pointer interactions
 * - Automatic animation pausing when document.visibilityState is "hidden"
 * - Full prefers-reduced-motion deactivation (halting motion, keeping calm static composition)
 * - 100% SSR hydration safety
 */
export function WeatherAtmosphere({
  scenario = "default",
  usePortal = true,
  portalTarget,
}: WeatherAtmosphereProps) {
  const isPaused = useSyncExternalStore(
    subscribeVisibility,
    getVisibilitySnapshot,
    getServerVisibilitySnapshot
  );

  const clientRoot = useSyncExternalStore(
    emptySubscribe,
    getClientRoot,
    getServerRoot
  );

  const showDebug = useSyncExternalStore(
    subscribeDebug,
    getDebugSnapshot,
    getServerDebugSnapshot
  );

  const isRainPrototype = useSyncExternalStore(
    subscribeDebug,
    getRainPrototypeSnapshot,
    getServerDebugSnapshot
  );

  const isRainDashboard = useSyncExternalStore(
    subscribeDebug,
    getRainDashboardSnapshot,
    getServerDebugSnapshot
  );

  const isSunDashboard = useSyncExternalStore(
    subscribeDebug,
    getSunDashboardSnapshot,
    getServerDebugSnapshot
  );
  const hudRef = useRef<HTMLDivElement | null>(null);

  // Passive Scroll Listener: Scroll position as animation playhead
  useEffect(() => {
    if (typeof window === "undefined") return;

    const docStyle = document.documentElement.style;

    if (checkMediaQuery("(prefers-reduced-motion: reduce)")) {
      docStyle.setProperty("--weather-scroll-y", "0px");
      docStyle.setProperty("--weather-scroll-progress", "0.5");
      docStyle.setProperty("--rain-coalesce", "0.8");
      docStyle.setProperty("--rain-trails", "0.6");
      docStyle.setProperty("--sun-spread", "0.5");
      docStyle.setProperty("--sun-flare", "0.5");
      docStyle.setProperty("--sun-rays-angle", "3deg");
      return;
    }

    let rafId: number | null = null;

    const updateScrollMetrics = () => {
      rafId = null;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const maxDocScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);

      // Dedicated Weather Scene Scroll Range:
      // Computes responsive scrub distance based on viewport height (ensuring comfortable scrub across desktop/mobile)
      const sceneStart = 0;
      const scrubDistance = Math.min(
        maxDocScroll,
        Math.max(window.innerHeight * 0.85, 550)
      );
      const sceneEnd = Math.round(sceneStart + scrubDistance);
      const progress = Math.min(1, Math.max(0, (scrollY - sceneStart) / scrubDistance));

      docStyle.setProperty("--weather-scroll-y", `${Math.round(scrollY)}px`);
      docStyle.setProperty("--weather-scroll-progress", progress.toFixed(4));

      // RAIN-DAY scroll-driven metrics:
      // Phase 1: Droplets coalescence & emergence (0.00 -> 0.50)
      const rainCoalesce = Math.min(1, Math.max(0, progress / 0.50));
      // Phase 2: Vertical streaks emergence & extension (0.50 -> 0.90)
      const rainTrails = Math.min(1, Math.max(0, (progress - 0.50) / 0.40));
      docStyle.setProperty("--rain-coalesce", rainCoalesce.toFixed(3));
      docStyle.setProperty("--rain-trails", rainTrails.toFixed(3));

      // CLEAR-DAY scroll-driven metrics:
      // Phase 1: Rays fanning & lengthening (0.00 -> 0.75)
      const sunSpread = Math.min(1, Math.max(0, progress / 0.75));
      // Phase 2: Lens flare orbs emergence & optical drift
      let sunFlare = 0;
      if (progress < 0.25) {
        sunFlare = 0;
      } else if (progress < 0.60) {
        sunFlare = (progress - 0.25) / 0.35;
      } else {
        sunFlare = Math.max(0.75, 1.0 - (progress - 0.60) * 0.25);
      }
      const sunRaysAngle = (sunSpread * 6.0).toFixed(2);
      docStyle.setProperty("--sun-spread", sunSpread.toFixed(3));
      docStyle.setProperty("--sun-flare", sunFlare.toFixed(3));
      docStyle.setProperty("--sun-rays-angle", `${sunRaysAngle}deg`);

      // Update Debug HUD if present
      if (hudRef.current) {
        hudRef.current.innerHTML = `
          <div style="font-weight: 700; color: #38bdf8; margin-bottom: 5px; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;">
            🌦 Weather Timeline Debug
          </div>
          <div style="margin-bottom: 2px;">Scenario: <span style="color: #fbbf24; font-weight: 600;">${scenario}</span></div>
          <div style="margin-bottom: 2px;">Scroll Y: <span style="color: #e2e8f0;">${Math.round(scrollY)}px</span></div>
          <div style="margin-bottom: 2px;">Scene Start: <span style="color: #94a3b8;">${sceneStart}px</span></div>
          <div style="margin-bottom: 2px;">Scene End: <span style="color: #94a3b8;">${sceneEnd}px</span></div>
          <div style="font-weight: 700; color: #4ade80; margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.12); font-size: 13px;">
            Playhead Progress: ${progress.toFixed(3)}
          </div>
          ${
            scenario === "clear-day"
              ? `<div style="color: #94a3b8; font-size: 11px; margin-top: 4px; line-height: 1.4;">
                   Sun Rays: <span style="color: #fde047;">${sunSpread.toFixed(3)}</span><br/>
                   Flare Opacity: <span style="color: #fde047;">${sunFlare.toFixed(3)}</span><br/>
                   Rays Angle: <span style="color: #fde047;">${sunRaysAngle}°</span>
                 </div>`
              : scenario === "rain-day"
              ? `<div style="color: #94a3b8; font-size: 11px; margin-top: 4px; line-height: 1.4;">
                   Droplets Coalesce: <span style="color: #93c5fd;">${rainCoalesce.toFixed(3)}</span><br/>
                   Water Trails: <span style="color: #93c5fd;">${rainTrails.toFixed(3)}</span>
                 </div>`
              : ""
          }
        `;
      }
    };

    const onScroll = () => {
      if (rafId === null) {
        rafId = window.requestAnimationFrame(updateScrollMetrics);
      }
    };

    updateScrollMetrics();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener("scroll", onScroll);
    };
  }, [scenario]);

  // Passive Desktop Pointer Interaction: secondary perspective offset for clear-day, dawn, sunset
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isFinePointer = checkMediaQuery("(pointer: fine)");
    const isReducedMotion = checkMediaQuery("(prefers-reduced-motion: reduce)");
    const supportsPointer =
      isFinePointer &&
      !isReducedMotion &&
      (scenario === "clear-day" || scenario === "dawn" || scenario === "sunset");

    if (!supportsPointer) {
      document.documentElement.style.setProperty("--weather-pointer-x", "0");
      document.documentElement.style.setProperty("--weather-pointer-y", "0");
      return;
    }

    const onMouseMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1; // -1 to 1
      const ny = (e.clientY / window.innerHeight) * 2 - 1; // -1 to 1
      document.documentElement.style.setProperty("--weather-pointer-x", nx.toFixed(3));
      document.documentElement.style.setProperty("--weather-pointer-y", ny.toFixed(3));
    };

    const onMouseLeave = () => {
      document.documentElement.style.setProperty("--weather-pointer-x", "0");
      document.documentElement.style.setProperty("--weather-pointer-y", "0");
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    document.addEventListener("mouseleave", onMouseLeave, { passive: true });

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseleave", onMouseLeave);
      document.documentElement.style.setProperty("--weather-pointer-x", "0");
      document.documentElement.style.setProperty("--weather-pointer-y", "0");
    };
  }, [scenario]);

  const resolvedTarget =
    portalTarget !== undefined
      ? portalTarget
      : usePortal
      ? clientRoot
      : null;

  const isRainActive = scenario === "rain-day";
  const isSunActive = scenario === "clear-day" && isSunDashboard;
  const effectiveScenario =
    isRainActive && isRainDashboard
      ? "default"
      : isSunActive
      ? "default"
      : scenario;

  const element = (
    <>
      <div
        id="weather-atmosphere-layer"
        className={`weather-atmosphere-layer atmosphere--${effectiveScenario}${isPaused ? " animation-paused" : ""}`}
        aria-hidden="true"
        data-scenario={scenario}
        data-testid="weather-atmosphere-layer"
        data-paused={isPaused ? "true" : "false"}
      >
        {scenario === "clear-day" && !isSunActive && (
          <div className="sun-rays-layer" aria-hidden="true" />
        )}
      </div>
      <div
        id="weather-foreground-layer"
        className={`weather-foreground-layer atmosphere-fg--${effectiveScenario}${isPaused ? " animation-paused" : ""}`}
        aria-hidden="true"
        data-scenario={scenario}
        data-testid="weather-foreground-layer"
        data-paused={isPaused ? "true" : "false"}
      >
        {isRainActive && !isRainPrototype && !isRainDashboard && (
          <div className="rain-glass-trails" aria-hidden="true">
            <div className="rain-streak streak-1" />
            <div className="rain-streak streak-2" />
            <div className="rain-streak streak-3" />
          </div>
        )}
        {scenario === "clear-day" && !isSunActive && (
          <div className="sun-flare-orbs" aria-hidden="true">
            <div className="flare-orb orb-1" />
            <div className="flare-orb orb-2" />
          </div>
        )}
      </div>
      {isRainActive && isRainDashboard && (
        <DashboardRainOverlay showDebug={showDebug} />
      )}
      {isRainActive && isRainPrototype && !isRainDashboard && (
        <RefractiveRaindropPrototype showDebug={showDebug} />
      )}
      {isSunActive && (
        <DashboardSunOverlay showDebug={showDebug} />
      )}
      {showDebug &&
        !(isRainActive && (isRainPrototype || isRainDashboard)) &&
        !isSunActive && (
        <div
          ref={hudRef}
          id="weather-debug-hud"
          data-testid="weather-debug-hud"
          style={{
            position: "fixed",
            bottom: "16px",
            right: "16px",
            zIndex: 99999,
            background: "rgba(10, 15, 25, 0.90)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.22)",
            borderRadius: "10px",
            padding: "12px 16px",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "12px",
            color: "#f1f5f9",
            pointerEvents: "none",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.55)",
            lineHeight: 1.5,
            minWidth: "190px",
          }}
        >
          <div style={{ fontWeight: 700, color: "#38bdf8", marginBottom: "5px", fontSize: "11px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            🌦 Weather Timeline Debug
          </div>
          <div>Scenario: <span style={{ color: "#fbbf24" }}>{scenario}</span></div>
          <div>Scroll Y: --</div>
          <div>Scene Start: 0px</div>
          <div>Scene End: --</div>
          <div style={{ fontWeight: 700, color: "#4ade80", marginTop: "4px" }}>
            Playhead Progress: 0.000
          </div>
        </div>
      )}
    </>
  );

  if (resolvedTarget) {
    return createPortal(element, resolvedTarget);
  }

  return element;
}
