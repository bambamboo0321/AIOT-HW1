"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { NormalizedForecastData } from "@/lib/contracts/weather";
import { NormalizedObservationData } from "@/lib/contracts/observations";
import { NormalizedAirQualityData } from "@/lib/contracts/air-quality";
import { getDefaultMapDate } from "@/lib/map/marker-helpers";
import {
  MapLayerId,
  MAP_LAYERS,
  getLayerConfig,
  DEFAULT_MAP_LAYER_ID,
  DEFAULT_MAP_ZOOM,
  getMapZoomTier,
  getMapZoomTierLabel,
  MapZoomTier,
} from "@/lib/map/layer-config";
import { prepareUnifiedMapMarkers } from "@/lib/map/layer-helpers";
import { getTaipeiWeekday, getTaipeiDateString } from "@/lib/transformations/daily";
import { TAIWAN_MAP_BOUNDARY_DISCLAIMER } from "@/lib/data/taiwan-counties";
import { LayersIcon, InfoIcon, TargetIcon, MAP_LAYER_ICON_MAP, ChartSelectIcon, LayerRealtimeIcon } from "@/components/ui/Icons";

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

export interface TaiwanWeatherMapProps {
  data: NormalizedForecastData;
  observationData?: NormalizedObservationData | null;
  airQualityData?: NormalizedAirQualityData | null;
  selectedRegion: string;
  onSelectRegion?: (region: string) => void;
  availableDates?: readonly string[];
  initialLayerId?: MapLayerId;
  onLayerChange?: (layerId: MapLayerId) => void;
  initialZoom?: number;
}

export function TaiwanWeatherMap({
  data,
  observationData,
  airQualityData,
  selectedRegion,
  onSelectRegion,
  availableDates,
  initialLayerId,
  onLayerChange,
  initialZoom = DEFAULT_MAP_ZOOM,
}: TaiwanWeatherMapProps) {
  const [activeLayerId, setActiveLayerId] = useState<MapLayerId>(
    initialLayerId ?? DEFAULT_MAP_LAYER_ID
  );
  const [userMapDate, setUserMapDate] = useState<string>("");
  const [currentZoom, setCurrentZoom] = useState<number>(initialZoom);
  const [focusRequest, setFocusRequest] = useState<{ region: string; timestamp: number } | null>(null);

  const activeLayer = useMemo(() => getLayerConfig(activeLayerId), [activeLayerId]);
  const zoomTier: MapZoomTier = useMemo(() => getMapZoomTier(currentZoom), [currentZoom]);

  const handleFocusSelectedRegion = () => {
    if (selectedRegion) {
      setFocusRequest({ region: selectedRegion, timestamp: Date.now() });
    }
  };

  // Safely resolve available forecast dates
  const resolvedAvailableDates = useMemo(() => {
    if (availableDates && availableDates.length > 0) {
      return availableDates;
    }
    if (!data?.regions) return [];
    const dateSet = new Set<string>();
    for (const r of data.regions) {
      for (const interval of r.intervals) {
        if (interval.startTime) {
          dateSet.add(getTaipeiDateString(interval.startTime));
        }
      }
    }
    return Array.from(dateSet).sort();
  }, [availableDates, data]);

  // Determine initial default map date
  const defaultDate = useMemo(() => {
    return getDefaultMapDate(data) ?? (resolvedAvailableDates[0] || "");
  }, [data, resolvedAvailableDates]);

  // Derive active mapDate: prefer user choice if valid, otherwise fallback to defaultDate
  const mapDate = userMapDate && resolvedAvailableDates.includes(userMapDate)
    ? userMapDate
    : defaultDate;

  // Compute unified markers for currently selected layer and zoom tier
  const markers = useMemo(() => {
    return prepareUnifiedMapMarkers({
      layerId: activeLayerId,
      mapDate,
      forecastData: data,
      observationData,
      airQualityData,
      zoom: currentZoom,
      zoomTier,
    });
  }, [activeLayerId, mapDate, data, observationData, airQualityData, currentZoom, zoomTier]);

  const handleLayerSelect = (newLayerId: MapLayerId) => {
    setActiveLayerId(newLayerId);
    if (onLayerChange) {
      onLayerChange(newLayerId);
    }
  };

  const tierDescription =
    zoomTier === "overview"
      ? "全臺縣市摘要視角"
      : zoomTier === "station_dots"
      ? "中度測站分佈視角"
      : "詳細測站視角";

  return (
    <section className="dashboard-card map-card" aria-label="臺灣多圖層氣象與空氣品質互動地圖">
      {/* Map Header */}
      <div className="map-header">
        <div>
          <div className="map-title-row">
            <h3 className="section-title">
              <LayersIcon size={18} className="title-icon" />
              <span>臺灣氣象與空氣品質互動地圖</span>
            </h3>
            <span className="badge badge-semantic">{activeLayer.categoryLabel}</span>
          </div>
          <span className="section-subtitle">
            {activeLayer.description}（{tierDescription}，共 {markers.length} 個標記點）
          </span>
        </div>

        {/* Date Selector for Map (Active for forecast layers, disabled note for realtime layers) */}
        <div className="map-date-control">
          {activeLayer.isForecast ? (
            <div className="map-date-picker-group">
              <label htmlFor="map-date-select" className="control-label" style={{ marginRight: "8px" }}>
                預報日期：
              </label>
              <select
                id="map-date-select"
                value={mapDate}
                onChange={(e) => setUserMapDate(e.target.value)}
                className="select-input select-compact"
                aria-label="選擇預報日期"
              >
                {resolvedAvailableDates.map((dateStr) => (
                  <option key={dateStr} value={dateStr}>
                    {dateStr} ({getTaipeiWeekday(dateStr)})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div
              className="map-realtime-date-note"
              title="即時觀測資料為當前最新快照，不適用預報日期切換"
              data-testid="map-realtime-note"
            >
              <span className="realtime-pulse-dot" />
              <span className="realtime-note-text">
                <LayerRealtimeIcon size={13} className="realtime-note-icon" aria-hidden="true" />
                當前即時觀測
              </span>
              <span className="realtime-note-sub">（日期僅套用於預報圖層）</span>
            </div>
          )}
        </div>
      </div>

      {/* Layer Switcher Control */}
      <div className="map-layer-control-panel" role="region" aria-label="地圖圖層切換器">
        <div className="map-layer-header">
          <span className="layer-control-label">
            <ChartSelectIcon size={15} className="control-icon" />
            <span>選擇圖層指標：</span>
          </span>
          <span className="map-layer-current-badge">
            目前圖層：<b>{activeLayer.name}</b>（單位：{activeLayer.unit}）
          </span>
        </div>

        <div className="map-layer-buttons" role="tablist" aria-label="氣象與空氣品質圖層選擇">
          {MAP_LAYERS.map((layer) => {
            const isActive = layer.id === activeLayerId;
            return (
              <button
                key={layer.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={`切換至${layer.name}圖層`}
                className={`layer-btn ${isActive ? "is-active" : ""}`}
                onClick={() => handleLayerSelect(layer.id)}
                data-testid={`layer-btn-${layer.id}`}
              >
                {/* SVG icon from MAP_LAYER_ICON_MAP; graceful fallback to nothing */}
                {(() => {
                  const IconComp = MAP_LAYER_ICON_MAP[layer.id];
                  return IconComp ? <IconComp size={13} className="layer-btn-icon" aria-hidden="true" /> : null;
                })()}
                <span className="layer-btn-text">{layer.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Dynamic Map Legend Bar */}
      <div
        className="map-legend-bar"
        aria-label={`${activeLayer.legendTitle}圖例`}
        data-testid="map-legend-bar"
      >
        <div className="map-legend-meta">
          <span className="legend-title">{activeLayer.legendTitle}：</span>
          <span className="legend-unit">（單位：{activeLayer.unit}）</span>
        </div>
        <div className="legend-items">
          {activeLayer.legendItems.map((item, idx) => (
            <span key={idx} className="legend-pill" style={{ borderColor: item.hex }}>
              <span className="legend-dot" style={{ backgroundColor: item.hex }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      {/* Semantic Zoom User Interaction Hint & Focus County Control */}
      <div className="map-zoom-hint" data-testid="map-zoom-hint" role="status">
        <div className="hint-main">
          <InfoIcon size={14} className="hint-icon" />
          <span className="hint-text">滾輪／雙指縮放以查看測站詳情</span>
        </div>
        <div className="hint-actions">
          {selectedRegion && (
            <button
              type="button"
              className="map-focus-btn"
              data-testid="map-focus-btn"
              onClick={handleFocusSelectedRegion}
              title={`以地圖完整顯示${selectedRegion}行政邊界`}
              aria-label={`聚焦所選縣市 (${selectedRegion})`}
            >
              <TargetIcon size={13} className="btn-icon" aria-hidden="true" />
              <span>聚焦{selectedRegion}</span>
            </button>
          )}
          <span className="hint-badge" data-testid="map-zoom-tier-badge">
            {getMapZoomTierLabel(zoomTier)}
          </span>
        </div>
      </div>

      {/* Leaflet Map Display */}
      <div className="map-wrapper">
        <LeafletMap
          markers={markers}
          onSelectRegion={onSelectRegion}
          selectedRegion={selectedRegion}
          currentZoom={currentZoom}
          zoomTier={zoomTier}
          onZoomChange={setCurrentZoom}
          focusRequest={focusRequest}
        />
      </div>

      {/* Map Boundary Disclaimer Notice */}
      <div className="map-boundary-notice" data-testid="map-boundary-notice">
        <InfoIcon size={14} className="notice-icon" />
        <span className="notice-text">{TAIWAN_MAP_BOUNDARY_DISCLAIMER}</span>
      </div>

      {/* Contextual Footer Note */}
      <div className="map-footer-note" data-testid="map-footer-note">
        {activeLayer.category === "forecast" && (
          <span>
            * 標記代表全臺 22 縣市政府所在地（UI 代表行政座標，非單一測站精確點）。點擊標記可檢視預報並切換主面板選取縣市。
          </span>
        )}
        {activeLayer.category === "cwa_obs" && (
          <span>
            * 標記代表交通部中央氣象署綜觀氣象觀測站（全臺視角顯示各縣市代表測站摘要，非全縣市平均；中度視角顯示測站分佈圓點，深度視角顯示完整測站與數值）。點擊標記可檢視觀測並切換主面板縣市。
          </span>
        )}
        {activeLayer.category === "moenv_aqi" && (
          <span>
            * 標記代表環境部空氣品質即時監測站（全臺視角顯示各縣市摘要，AQI 為全縣市最差測站摘要，PM2.5 為代表測站，非全縣市平均；中度視角顯示測站分佈圓點，深度視角顯示完整測站與數值）。點擊標記可檢視空氣品質並切換主面板縣市。
          </span>
        )}
      </div>
    </section>
  );
}

export default TaiwanWeatherMap;
