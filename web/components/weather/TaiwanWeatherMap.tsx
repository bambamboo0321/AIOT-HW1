"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { NormalizedForecastData } from "@/lib/contracts/weather";
import {
  prepareCountyMapMarkers,
  getDefaultMapDate,
  COLOR_MAP,
} from "@/lib/map/marker-helpers";
import { getTaipeiWeekday } from "@/lib/transformations/daily";

// Dynamic import with ssr: false to prevent window is not defined errors
const LeafletMap = dynamic(() => import("./LeafletMapInner"), {
  ssr: false,
  loading: () => (
    <div className="map-skeleton" aria-label="地圖載入中">
      <div className="spinner" style={{ marginBottom: "12px" }} />
      <span className="state-subtitle">正在載入臺灣氣象互動地圖...</span>
    </div>
  ),
});

interface TaiwanWeatherMapProps {
  data: NormalizedForecastData;
  selectedRegion: string;
  onSelectRegion: (region: string) => void;
  availableDates: readonly string[];
}

export function TaiwanWeatherMap({
  data,
  selectedRegion,
  onSelectRegion,
  availableDates,
}: TaiwanWeatherMapProps) {
  const [userMapDate, setUserMapDate] = useState<string>("");

  // Determine initial default map date
  const defaultDate = useMemo(() => {
    return getDefaultMapDate(data) ?? (availableDates[0] || "");
  }, [data, availableDates]);

  // Derive active mapDate: prefer user choice if valid, otherwise fallback to defaultDate
  const mapDate = (userMapDate && availableDates.includes(userMapDate))
    ? userMapDate
    : defaultDate;

  // Compute 22 markers for currently selected map date
  const markers = useMemo(() => {
    if (!mapDate) return [];
    return prepareCountyMapMarkers(data, mapDate);
  }, [data, mapDate]);

  return (
    <section className="dashboard-card map-card" aria-label="臺灣 22 縣市互動地圖">
      <div className="map-header">
        <div>
          <h3 className="section-title">🗺️ 臺灣縣市互動天氣地圖</h3>
          <span className="section-subtitle">
            全臺 22 縣市代表行政中心高低溫分布（OpenStreetMap 圖資）
          </span>
        </div>

        {/* Date Selector for Map */}
        <div className="map-date-control">
          <label htmlFor="map-date-select" className="control-label" style={{ marginRight: "8px" }}>
            預報日期：
          </label>
          <select
            id="map-date-select"
            value={mapDate}
            onChange={(e) => setUserMapDate(e.target.value)}
            className="select-input select-compact"
          >
            {availableDates.map((dateStr) => (
              <option key={dateStr} value={dateStr}>
                {dateStr} ({getTaipeiWeekday(dateStr)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Map Legend */}
      <div className="map-legend-bar" aria-label="溫度顏色圖例">
        <span className="legend-title">溫度圖例：</span>
        <div className="legend-items">
          <span className="legend-pill" style={{ borderColor: COLOR_MAP.blue.hex }}>
            <span className="legend-dot" style={{ backgroundColor: COLOR_MAP.blue.hex }} />
            {COLOR_MAP.blue.label}
          </span>
          <span className="legend-pill" style={{ borderColor: COLOR_MAP.green.hex }}>
            <span className="legend-dot" style={{ backgroundColor: COLOR_MAP.green.hex }} />
            {COLOR_MAP.green.label}
          </span>
          <span className="legend-pill" style={{ borderColor: COLOR_MAP.orange.hex }}>
            <span className="legend-dot" style={{ backgroundColor: COLOR_MAP.orange.hex }} />
            {COLOR_MAP.orange.label}
          </span>
          <span className="legend-pill" style={{ borderColor: COLOR_MAP.red.hex }}>
            <span className="legend-dot" style={{ backgroundColor: COLOR_MAP.red.hex }} />
            {COLOR_MAP.red.label}
          </span>
          <span className="legend-pill" style={{ borderColor: COLOR_MAP.gray.hex }}>
            <span className="legend-dot" style={{ backgroundColor: COLOR_MAP.gray.hex }} />
            {COLOR_MAP.gray.label}
          </span>
        </div>
      </div>

      {/* Leaflet Map */}
      <div className="map-wrapper">
        <LeafletMap
          markers={markers}
          onSelectRegion={onSelectRegion}
          selectedRegion={selectedRegion}
        />
      </div>

      <div className="map-footer-note">
        * 地圖標記代表各縣市政府所在地（UI 代表座標，非測站精確座標）。點擊標記可切換儀表板之選取縣市。
      </div>
    </section>
  );
}
