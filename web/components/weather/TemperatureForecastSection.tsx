"use client";

import React, { useState, useRef, useMemo } from "react";
import { DailyForecast } from "@/lib/transformations/daily";
import { TemperatureTrendChart } from "./TemperatureTrendChart";
import { DailyForecastGrid } from "./DailyForecastGrid";
import { BarChart2Icon, CalendarIcon, SunIcon } from "@/components/ui/Icons";

export interface TemperatureForecastSectionProps {
  dailyList: readonly DailyForecast[];
  region: string;
  startDate?: string;
  endDate?: string;
}

export function TemperatureForecastSection({
  dailyList,
  region,
  startDate,
  endDate,
}: TemperatureForecastSectionProps) {
  // Client-side presentation state only: "chart" | "daily"
  // Default to "chart" on both desktop and mobile to prevent hydration mismatch
  const [viewMode, setViewMode] = useState<"chart" | "daily">("chart");

  const chartTabRef = useRef<HTMLButtonElement>(null);
  const dailyTabRef = useRef<HTMLButtonElement>(null);

  // Compute subtitle: region and current date range
  const dateRangeSubtitle = useMemo(() => {
    if (startDate && endDate) {
      return startDate === endDate
        ? `${region}・${startDate}`
        : `${region}・${startDate} 至 ${endDate}`;
    }
    if (dailyList && dailyList.length > 0) {
      const first = dailyList[0].forecastDate;
      const last = dailyList[dailyList.length - 1].forecastDate;
      return first === last
        ? `${region}・${first}`
        : `${region}・${first} 至 ${last}`;
    }
    return `${region} 未來七天溫度預報`;
  }, [region, startDate, endDate, dailyList]);

  // Accessible keyboard navigation for tablist
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    currentTab: "chart" | "daily"
  ) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      if (currentTab === "chart") {
        setViewMode("daily");
        dailyTabRef.current?.focus();
      } else {
        setViewMode("chart");
        chartTabRef.current?.focus();
      }
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      if (currentTab === "daily") {
        setViewMode("chart");
        chartTabRef.current?.focus();
      } else {
        setViewMode("daily");
        dailyTabRef.current?.focus();
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      setViewMode("chart");
      chartTabRef.current?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      setViewMode("daily");
      dailyTabRef.current?.focus();
    }
  };

  return (
    <section
      className="dashboard-card temp-forecast-section"
      aria-label="未來 7 日氣溫"
      data-testid="temp-forecast-section"
    >
      {/* Unified Section Header */}
      <div className="temp-section-header">
        <div className="temp-section-title-group">
          <h3 className="section-title">
            <SunIcon size={16} className="title-icon text-accent" />
            <span>未來 7 日氣溫</span>
            <span className="sr-only">七天天氣預報</span>
          </h3>
          <span className="section-subtitle" data-testid="temp-section-subtitle">
            {dateRangeSubtitle}
          </span>
        </div>

        {/* Low-interference segmented control with semantic tabs */}
        <div
          role="tablist"
          aria-label="氣溫預報檢視模式"
          className="segmented-control temp-view-toggle"
        >
          <button
            ref={chartTabRef}
            role="tab"
            id="tab-temp-chart"
            type="button"
            aria-selected={viewMode === "chart"}
            aria-controls="panel-temp-chart"
            tabIndex={viewMode === "chart" ? 0 : -1}
            className={`segmented-btn ${viewMode === "chart" ? "active" : ""}`}
            onClick={() => setViewMode("chart")}
            onKeyDown={(e) => handleKeyDown(e, "chart")}
            data-testid="temp-view-tab-chart"
          >
            <BarChart2Icon size={14} className="btn-icon" />
            <span>趨勢圖</span>
            <span className="sr-only">氣溫趨勢圖 氣溫趨勢變化</span>
          </button>
          <button
            ref={dailyTabRef}
            role="tab"
            id="tab-temp-daily"
            type="button"
            aria-selected={viewMode === "daily"}
            aria-controls="panel-temp-daily"
            tabIndex={viewMode === "daily" ? 0 : -1}
            className={`segmented-btn ${viewMode === "daily" ? "active" : ""}`}
            onClick={() => setViewMode("daily")}
            onKeyDown={(e) => handleKeyDown(e, "daily")}
            data-testid="temp-view-tab-daily"
          >
            <CalendarIcon size={14} className="btn-icon" />
            <span>每日詳情</span>
          </button>
        </div>
      </div>

      {/* Mutually exclusive view panels: never rendered simultaneously */}
      {viewMode === "chart" ? (
        <div
          role="tabpanel"
          id="panel-temp-chart"
          aria-labelledby="tab-temp-chart"
          tabIndex={0}
          className="temp-tabpanel"
          data-testid="temp-tabpanel-chart"
        >
          <TemperatureTrendChart
            dailyList={dailyList}
            region={region}
            isEmbedded
          />
        </div>
      ) : (
        <div
          role="tabpanel"
          id="panel-temp-daily"
          aria-labelledby="tab-temp-daily"
          tabIndex={0}
          className="temp-tabpanel"
          data-testid="temp-tabpanel-daily"
        >
          <DailyForecastGrid
            dailyList={dailyList}
            region={region}
            isEmbedded
          />
        </div>
      )}
    </section>
  );
}
