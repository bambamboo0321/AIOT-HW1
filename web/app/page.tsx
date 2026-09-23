import React from "react";
import { ForecastDashboard } from "@/components/weather/ForecastDashboard";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return <ForecastDashboard />;
}
