import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "M13.7 WebGL Rain Lab | Visual Feasibility Check",
  description: "Isolated WebGL2 wet-glass raindrop refraction and physical sliding simulation visual lab",
};

export default function RainLabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
