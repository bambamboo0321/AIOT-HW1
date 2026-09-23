"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { NormalizedForecastData } from "@/lib/contracts/weather";
import { loadWeatherForecast } from "@/lib/client/weather-loader";
import {
  aggregateDailyForecasts,
  filterDailyForecasts,
  computeSummaryKpis,
  formatTaipeiDateTime,
} from "@/lib/transformations/daily";
import { DashboardControls } from "./DashboardControls";
import { KpiCards } from "./KpiCards";
import { TemperatureTrendChart } from "./TemperatureTrendChart";
import { DailyForecastGrid } from "./DailyForecastGrid";
import { TaiwanWeatherMap } from "./TaiwanWeatherMap";
import { RawIntervalDetails } from "./RawIntervalDetails";
import { LoadingState } from "../ui/LoadingState";
import { ErrorState } from "../ui/ErrorState";
import { EmptyState } from "../ui/EmptyState";

interface ForecastDashboardProps {
  initialData?: NormalizedForecastData | null;
}

export function ForecastDashboard({ initialData = null }: ForecastDashboardProps) {
  const [data, setData] = useState<NormalizedForecastData | null>(initialData);
  const [isLoading, setIsLoading] = useState<boolean>(!initialData);
  const [error, setError] = useState<string | null>(null);

  const [selectedRegionRaw, setSelectedRegion] = useState<string>("臺北市");
  const [startDateRaw, setStartDate] = useState<string>("");
  const [endDateRaw, setEndDate] = useState<string>("");

  // Fetch forecast data from /api/weather/forecast
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await loadWeatherForecast();
      setData(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "載入天氣預報時發生未知錯誤。";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialData) return;
    let isCancelled = false;

    async function initialLoad() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await loadWeatherForecast();
        if (!isCancelled) {
          setData(result);
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const message = err instanceof Error ? err.message : "載入天氣預報時發生未知錯誤。";
          setError(message);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    initialLoad();

    return () => {
      isCancelled = true;
    };
  }, [initialData]);

  // Extract region list
  const regions = useMemo(() => {
    if (!data?.regions) return [];
    return data.regions.map((r) => r.region);
  }, [data]);

  // Derive active selectedRegion
  const selectedRegion = useMemo(() => {
    if (regions.length === 0) return "臺北市";
    if (regions.includes(selectedRegionRaw)) return selectedRegionRaw;
    return regions.includes("臺北市") ? "臺北市" : regions[0];
  }, [regions, selectedRegionRaw]);

  // Find intervals for selected region
  const activeRegionIntervals = useMemo(() => {
    if (!data || !selectedRegion) return [];
    const found = data.regions.find((r) => r.region === selectedRegion);
    return found?.intervals ?? [];
  }, [data, selectedRegion]);

  // Daily aggregated forecasts for active region
  const allDailyList = useMemo(() => {
    return aggregateDailyForecasts(activeRegionIntervals);
  }, [activeRegionIntervals]);

  // Available unique dates
  const availableDates = useMemo(() => {
    return allDailyList.map((d) => d.forecastDate);
  }, [allDailyList]);

  // Derive start and end dates
  const startDate = useMemo(() => {
    if (availableDates.length === 0) return "";
    if (startDateRaw && availableDates.includes(startDateRaw)) return startDateRaw;
    return availableDates[0];
  }, [availableDates, startDateRaw]);

  const endDate = useMemo(() => {
    if (availableDates.length === 0) return "";
    if (endDateRaw && availableDates.includes(endDateRaw)) return endDateRaw;
    return availableDates[availableDates.length - 1];
  }, [availableDates, endDateRaw]);

  // Filtered daily forecasts based on chosen date range
  const filteredDailyList = useMemo(() => {
    return filterDailyForecasts(allDailyList, startDate, endDate);
  }, [allDailyList, startDate, endDate]);

  // Summary KPIs for filtered range
  const summaryKpis = useMemo(() => {
    return computeSummaryKpis(filteredDailyList);
  }, [filteredDailyList]);

  const handleResetDates = () => {
    if (availableDates.length > 0) {
      setStartDate(availableDates[0]);
      setEndDate(availableDates[availableDates.length - 1]);
    }
  };

  const formattedFetchedAt = data?.fetchedAt ? formatTaipeiDateTime(data.fetchedAt) : "—";

  const handleSelectRegionFromMap = React.useCallback((regionName: string) => {
    setSelectedRegion(regionName);
    if (typeof window !== "undefined") {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const elem = document.getElementById("dashboard-main-controls");
      if (elem) {
        elem.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });
      }
    }
  }, []);

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-brand">
          <div className="brand-badge">CWA OPEN DATA</div>
          <h1 className="header-title">Taiwan Weather Dashboard</h1>
          <p className="header-subtitle">
            中央氣象署七天縣市天氣預報・互動式現代氣象儀表板
          </p>
        </div>

        <div className="header-metadata">
          <div className="meta-item">
            <span className="meta-label">資料集代碼</span>
            <span className="meta-value font-mono">{data?.datasetId || "F-D0047-091"}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">最後同步時間 (Taipei)</span>
            <span className="meta-value font-mono">{formattedFetchedAt}</span>
          </div>
          <div className="meta-item">
            <span className="meta-label">資料來源</span>
            <span className="meta-value">交通部中央氣象署</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      {isLoading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchData} />
      ) : !data || regions.length === 0 ? (
        <EmptyState onReset={fetchData} />
      ) : (
        <main className="dashboard-main-content">
          {/* Controls: Region + Date Filter + Refresh */}
          <DashboardControls
            regions={regions}
            selectedRegion={selectedRegion}
            onSelectRegion={setSelectedRegion}
            availableDates={availableDates}
            startDate={startDate}
            endDate={endDate}
            onSelectStartDate={setStartDate}
            onSelectEndDate={setEndDate}
            onResetDates={handleResetDates}
            onRefresh={fetchData}
            isLoading={isLoading}
          />

          {/* KPI Summary Cards */}
          <KpiCards region={selectedRegion} kpis={summaryKpis} />

          {/* Temperature Trend Chart */}
          <TemperatureTrendChart
            dailyList={filteredDailyList}
            region={selectedRegion}
          />

          {/* Daily Forecast Grid */}
          <DailyForecastGrid
            dailyList={filteredDailyList}
            region={selectedRegion}
          />

          {/* Interactive Taiwan Map */}
          <TaiwanWeatherMap
            data={data}
            selectedRegion={selectedRegion}
            onSelectRegion={handleSelectRegionFromMap}
            availableDates={availableDates}
          />

          {/* Collapsible Raw 12h Intervals Details */}
          <RawIntervalDetails
            intervals={activeRegionIntervals}
            region={selectedRegion}
          />
        </main>
      )}

      {/* Footer */}
      <footer className="dashboard-footer">
        <p>
          AIOT Course Homework 1 — V2 Stateless Architecture・Next.js 16 + React 19 + TypeScript
        </p>
        <p className="footer-sub">
          氣象資料由交通部中央氣象署提供・地圖底圖由 OpenStreetMap 維護者授權
        </p>
      </footer>
    </div>
  );
}
