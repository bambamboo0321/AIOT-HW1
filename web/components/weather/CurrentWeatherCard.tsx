"use client";

import React, { useState, useMemo } from "react";
import { NormalizedObservationData, NormalizedStationObservation } from "@/lib/contracts/observations";
import { TAIWAN_COUNTY_COORDINATES } from "@/lib/data/county-coordinates";
import { filterStationsByCounty, findClosestStation } from "@/lib/transformations/stations";
import { formatWindDirection } from "@/lib/transformations/wind";
import { formatPrecipitation, getPrecipitationDescription } from "@/lib/transformations/precipitation";
import { formatTaipeiDateTime } from "@/lib/transformations/daily";
import {
  ThermometerIcon,
  DropletIcon,
  WindIcon,
  CompassIcon,
  CloudRainIcon,
  ClockIcon,
  RadioIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
} from "@/components/ui/Icons";

interface CurrentWeatherCardProps {
  region: string;
  observationData: NormalizedObservationData | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function CurrentWeatherCard({
  region,
  observationData,
  isLoading,
  error,
  onRetry,
}: CurrentWeatherCardProps) {
  const [userSelectedStationId, setUserSelectedStationId] = useState<string>("");

  // Filter stations belonging to the active county
  const countyStations = useMemo(() => {
    if (!observationData?.stations) return [];
    return filterStationsByCounty(observationData.stations, region);
  }, [observationData, region]);

  // Compute representative station (closest to county seat via Haversine)
  const defaultStation = useMemo(() => {
    if (countyStations.length === 0) return null;
    const countyCoords = TAIWAN_COUNTY_COORDINATES[region];
    if (countyCoords) {
      return findClosestStation(countyStations, countyCoords.latitude, countyCoords.longitude);
    }
    return countyStations[0];
  }, [countyStations, region]);

  // Active station: prefer user selection if valid in current county; fallback to default
  const activeStation: NormalizedStationObservation | null = useMemo(() => {
    if (countyStations.length === 0) return null;
    if (userSelectedStationId) {
      const found = countyStations.find((s) => s.stationId === userSelectedStationId);
      if (found) return found;
    }
    return defaultStation;
  }, [countyStations, userSelectedStationId, defaultStation]);

  // Check if observation is delayed (> 30 minutes from data fetch timestamp)
  const isDelayed = useMemo(() => {
    if (!activeStation?.observedAt || !observationData?.fetchedAt) return false;
    const obsEpoch = new Date(activeStation.observedAt).getTime();
    const fetchedEpoch = new Date(observationData.fetchedAt).getTime();
    if (isNaN(obsEpoch) || isNaN(fetchedEpoch)) return false;
    return fetchedEpoch - obsEpoch > 30 * 60 * 1000;
  }, [activeStation, observationData]);

  return (
    <section className="dashboard-card current-weather-card" aria-label={`${region} 即時天氣觀測`}>
      {/* Header */}
      <div className="current-header">
        <div className="current-title-area">
          <div className="current-badge-group">
            <span className="badge badge-obs">
              <RadioIcon size={13} className="badge-icon" />
              <span>測站即時觀測</span>
            </span>
            {isDelayed && (
              <span className="badge badge-warning" title="觀測資料時間距今已超過 30 分鐘">
                <AlertTriangleIcon size={13} className="badge-icon" />
                <span>資料可能延遲</span>
              </span>
            )}
          </div>
          <h2 className="section-title">
            <span className="nowrap">{region} 即時天氣</span>
            {activeStation && (
              <span className="station-name-sub nowrap">
                （{activeStation.stationName}
                {activeStation.town ? `・${activeStation.town}` : ""}）
              </span>
            )}
          </h2>
          <span className="section-subtitle">
            中央氣象署 10 分鐘自動觀測站即時回傳資料・非全縣市平均
          </span>
        </div>

        {/* Station Selector Dropdown */}
        {countyStations.length > 0 && !isLoading && !error && (
          <div className="station-selector-group">
            <label htmlFor="station-select" className="station-select-label">
              切換測站 ({countyStations.length})：
            </label>
            <select
              id="station-select"
              className="select-input select-station"
              value={activeStation?.stationId || ""}
              onChange={(e) => setUserSelectedStationId(e.target.value)}
              aria-label={`${region} 觀測測站選單`}
            >
              {countyStations.map((s) => {
                const isDefault = defaultStation?.stationId === s.stationId;
                const townText = s.town ? `[${s.town}] ` : "";
                return (
                  <option key={s.stationId} value={s.stationId}>
                    {townText}{s.stationName} ({s.stationId}){isDefault ? " ★代表測站" : ""}
                  </option>
                );
              })}
            </select>
          </div>
        )}
      </div>

      {/* Main Body: Loading / Error / Empty / Data */}
      {isLoading && !observationData ? (
        <div className="obs-loading" aria-label="載入即時觀測中">
          <div className="spinner" style={{ margin: "24px auto 12px" }} />
          <p className="state-subtitle" style={{ textAlign: "center" }}>
            正在取得 {region} 最新測站即時氣象觀測...
          </p>
        </div>
      ) : error ? (
        <div className="obs-error-state" role="alert">
          <div className="obs-error-icon"><AlertTriangleIcon size={20} /></div>
          <div className="obs-error-content">
            <p className="obs-error-msg">{error}</p>
            <p className="obs-error-sub">七天預報功能不受影響，可點擊下方按鈕重試觀測資料。</p>
          </div>
          <button type="button" className="btn btn-secondary btn-retry" onClick={onRetry}>
            <RefreshCwIcon size={14} className="btn-icon" />
            <span>重新載入觀測</span>
          </button>
        </div>
      ) : !activeStation ? (
        <div className="obs-empty-state">
          <p className="state-subtitle" style={{ textAlign: "center", padding: "20px 0" }}>
            目前 {region} 暫無可用之綜觀氣象站即時資料。
          </p>
        </div>
      ) : (
        <div className="current-weather-body">
          <div className="current-weather-main-row">
            {/* 氣溫 Hero 焦點 (~40% on desktop): Large clean typography, frameless */}
            <div className="current-temp-hero current-metric-hero" data-testid="metric-temp">
              <span className="metric-label temp-hero-label">
                <ThermometerIcon size={14} className="metric-icon" />
                <span>即時氣溫</span>
              </span>
              <div className="temp-hero-number-wrap font-mono">
                <span className="metric-temp-hero">
                  {activeStation.temperature !== null ? `${activeStation.temperature.toFixed(1)}°` : "—"}
                </span>
                <span className="temp-hero-unit">C</span>
              </div>
              <div className="temp-hero-sub">
                <span className="metric-desc">
                  海拔 {activeStation.elevation !== null ? `${Math.round(activeStation.elevation)} m` : "—"}
                </span>
                <span className="temp-hero-dot" aria-hidden="true">•</span>
                <span className="metric-desc">
                  觀測 {activeStation.observedAt ? formatTaipeiDateTime(activeStation.observedAt).split(" ")[1] || formatTaipeiDateTime(activeStation.observedAt) : "—"}
                </span>
                {activeStation.town && (
                  <>
                    <span className="temp-hero-dot" aria-hidden="true">•</span>
                    <span className="metric-desc">{activeStation.town}</span>
                  </>
                )}
              </div>
            </div>

            {/* 次要指標 2×2 平面網格 (~60% on desktop)：相對濕度、風速、風向、當日降水量 */}
            <div className="current-secondary-metrics current-secondary-metrics-grid">
              {/* 相對濕度 (Row 1, Col 1) */}
              <div className="current-metric-card" data-testid="metric-humidity">
                <span className="metric-label">
                  <DropletIcon size={14} className="metric-icon" />
                  <span>相對濕度</span>
                </span>
                <span className="metric-value font-mono">
                  {activeStation.relativeHumidity !== null ? `${Math.round(activeStation.relativeHumidity)}%` : "—"}
                </span>
                <span className="metric-desc">大氣水氣飽和度</span>
              </div>

              {/* 風速 (Row 1, Col 2) */}
              <div className="current-metric-card" data-testid="metric-wind-speed">
                <span className="metric-label">
                  <WindIcon size={14} className="metric-icon" />
                  <span>風速</span>
                </span>
                <span className="metric-value font-mono">
                  {activeStation.windSpeed !== null ? `${activeStation.windSpeed.toFixed(1)} m/s` : "—"}
                </span>
                <span className="metric-desc">
                  {activeStation.windSpeed === 0 ? "目前無風 (0 m/s)" : "即時平均風速"}
                </span>
              </div>

              {/* 風向 (Row 2, Col 1) */}
              <div className="current-metric-card" data-testid="metric-wind-dir">
                <span className="metric-label">
                  <CompassIcon size={14} className="metric-icon" />
                  <span>風向</span>
                </span>
                <span className="metric-value font-mono">
                  {formatWindDirection(activeStation.windDirection)}
                </span>
                <span className="metric-desc">
                  {activeStation.windDirection === 990 ? "風向多變不定" : "8 方位標準羅盤"}
                </span>
              </div>

              {/* 雨量 (Row 2, Col 2) */}
              <div className="current-metric-card" data-testid="metric-rain">
                <span className="metric-label">
                  <CloudRainIcon size={14} className="metric-icon" />
                  <span>當日降水量</span>
                </span>
                <span
                  className={`metric-value font-mono ${
                    activeStation.precipitationStatus === "none_6hr" ? "font-status" : ""
                  }`}
                >
                  {formatPrecipitation(
                    activeStation.dailyPrecipitation,
                    activeStation.precipitationStatus
                  )}
                </span>
                <span className="metric-desc">
                  {getPrecipitationDescription(
                    activeStation.dailyPrecipitation,
                    activeStation.precipitationStatus
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* 底部觀測時間與測站代碼 metadata: Sleek single line, frameless */}
          <div className="current-weather-metadata-row current-weather-footer-meta" data-testid="metric-time">
            <div className="metadata-item">
              <ClockIcon size={12} className="metadata-icon" />
              <span className="metadata-label">觀測回傳時間：</span>
              <span className="metadata-value font-mono font-time">
                {formatTaipeiDateTime(activeStation.observedAt)}
              </span>
            </div>
            <span className="metadata-separator" aria-hidden="true">•</span>
            <div className="metadata-item">
              <span className="metadata-label">測站代碼：</span>
              <span className="metadata-value font-mono">{activeStation.stationId}</span>
            </div>
            {activeStation.town && (
              <>
                <span className="metadata-separator" aria-hidden="true">•</span>
                <div className="metadata-item">
                  <span className="metadata-label">行政區：</span>
                  <span className="metadata-value">{activeStation.town}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
