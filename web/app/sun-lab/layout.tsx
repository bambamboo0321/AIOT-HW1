import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "M13.9 Sun / Lens Flare Visual Lab | Photographic R&D",
  description:
    "Isolated WebGL2 photographic lens flare renderer comparison lab — A: Three.js Official, B: Shader Flare, C: Hybrid Photographic",
};

export default function SunLabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
