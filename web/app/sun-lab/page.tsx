"use client";

import React from "react";
import dynamic from "next/dynamic";

// Client-only dynamic import — avoids SSR evaluation of Three.js / WebGL APIs
const SunLabViewer = dynamic(
  () => import("@/components/weather/SunLabViewer").then((m) => m.SunLabViewer),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0d1928",
          color: "#fbbf24",
          fontFamily: "system-ui, sans-serif",
          fontSize: "14px",
          fontWeight: 600,
          letterSpacing: "0.05em",
        }}
      >
        ☀ Initializing Sun / Lens Flare Lab...
      </div>
    ),
  }
);

export default function SunLabPage() {
  return (
    <main style={{ minHeight: "100vh", margin: 0, padding: 0 }}>
      <SunLabViewer />
    </main>
  );
}
