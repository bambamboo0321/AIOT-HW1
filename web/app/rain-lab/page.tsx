"use client";

import React from "react";
import dynamic from "next/dynamic";

// Client-only dynamic import to ensure zero SSR evaluation of WebGL2 APIs
const RainLabViewer = dynamic(
  () => import("@/components/weather/RainLabViewer").then((m) => m.RainLabViewer),
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
          backgroundColor: "#0b121e",
          color: "#38bdf8",
          fontFamily: "system-ui, sans-serif",
          fontSize: "14px",
          fontWeight: 600,
        }}
      >
        Initializing WebGL2 Rain Lab...
      </div>
    ),
  }
);

export default function RainLabPage() {
  return (
    <main style={{ width: "100vw", height: "100vh", margin: 0, padding: 0, overflow: "hidden" }}>
      <RainLabViewer />
    </main>
  );
}
