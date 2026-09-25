import type { Metadata } from "next";
import React from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Taiwan Weather Dashboard V2",
  description: "Taiwan Weather Dashboard V2 - Web Foundation (Milestone M7)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body className="weather-app-body">
        {/* Layer 1: Immersive weather background imagery with CSS gradient fallback */}
        <div id="weather-bg-layer" className="weather-bg-layer" aria-hidden="true" />

        {/* Layer 2: Deep navy readability contrast overlay & ambient gradient */}
        <div className="weather-overlay-layer" aria-hidden="true" />

        {/* Layer 3: Foreground application content layer */}
        <div className="weather-content-layer">
          {children}
        </div>
      </body>
    </html>
  );
}
