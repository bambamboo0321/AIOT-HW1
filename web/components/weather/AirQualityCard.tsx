"use client";

import React, { useState, useMemo } from "react";
import {
  NormalizedAirQualityData,
  NormalizedStationAirQuality,
} from "@/lib/contracts/air-quality";
import {
  filterAirQualityStationsByCounty,
  computeCountyAqiSummary,
  getAqiCategory,
  normalizeCountyName,
} from "@/lib/transformations/air-quality";
import { formatTaipeiDateTime } from "@/lib/transformations/daily";

interface AirQualityCardProps {
  region: string;
  airQualityData: NormalizedAirQualityData | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function AirQualityCard({
  region,
  airQualityData,
  isLoading,
  error,
  onRetry,
}: AirQualityCardProps) {
  const [userSelectedStationId, setUserSelectedStationId] = useState<string>("");

  const normalizedRegion = useMemo(() => normalizeCountyName(region), [region]);

  // Filter stations belonging to the active county
  const countyStations = useMemo(() => {
    if (!airQualityData?.stations) return [];
    return filterAirQualityStationsByCounty(airQualityData.stations, normalizedRegion);
  }, [airQualityData, normalizedRegion]);

  // Compute county summary (maximum AQI among valid stations in this county)
  const countySummary = useMemo(() => {
    if (airQualityData?.countySummaries && airQualityData.countySummaries[normalizedRegion]) {
      return airQualityData.countySummaries[normalizedRegion];
    }
    return computeCountyAqiSummary(countyStations, normalizedRegion);
  }, [airQualityData, countyStations, normalizedRegion]);

  // Default station is the county's worst station (source of max AQI) or first station
  const defaultStation = useMemo(() => {
    if (countyStations.length === 0) return null;
    if (countySummary.sourceStationId) {
      const match = countyStations.find((s) => s.stationId === countySummary.sourceStationId);
      if (match) return match;
    }
    return countyStations[0];
  }, [countyStations, countySummary]);

  // Active station: prefer user-selected if in this county, otherwise defaultStation
  const activeStation: NormalizedStationAirQuality | null = useMemo(() => {
    if (countyStations.length === 0) return null;
    if (userSelectedStationId) {
      const found = countyStations.find((s) => s.stationId === userSelectedStationId);
      if (found) return found;
    }
    return defaultStation;
  }, [countyStations, userSelectedStationId, defaultStation]);

  // Check if data is delayed (> 90 minutes from data fetch time)
  const isDelayed = useMemo(() => {
    if (!activeStation?.publishedAt || !airQualityData?.fetchedAt) return false;
    const pubEpoch = new Date(activeStation.publishedAt).getTime();
    const fetchedEpoch = new Date(airQualityData.fetchedAt).getTime();
    if (isNaN(pubEpoch) || isNaN(fetchedEpoch)) return false;
    return fetchedEpoch - pubEpoch > 90 * 60 * 1000;
  }, [activeStation, airQualityData]);

  // Active AQI category info
  const activeAqiCategory = useMemo(() => {
    return getAqiCategory(activeStation?.aqi);
  }, [activeStation]);

  // County summary AQI category info
  const countyAqiCategory = useMemo(() => {
    return getAqiCategory(countySummary.maxAqi);
  }, [countySummary]);

  return (
    <section className="dashboard-card air-quality-card" aria-label={`${region} 空氣品質監測`}>
      {/* Header */}
      <div className="current-header">
        <div className="current-title-area">
          <div className="current-badge-group">
            <span className="badge badge-aqi">🍃 空氣品質監測 (MOENV)</span>
            <span
              className="badge"
              style={{
                backgroundColor: countyAqiCategory.bgColor,
                color: countyAqiCategory.color,
                borderColor: countyAqiCategory.borderColor,
                borderWidth: "1px",
                borderStyle: "solid",
              }}
            >
              縣市摘要：{countyAqiCategory.level} (AQI {countySummary.maxAqi ?? "—"})
            </span>
            {isDelayed && (
              <span className="badge badge-warning" title="觀測發布時間距今已超過 90 分鐘">
                ⚠️ 資料可能延遲
              </span>
            )}
          </div>
          <h2 className="section-title">
            {region} 空氣品質
            {activeStation && (
              <span className="station-name-sub">
                （{activeStation.stationName} 測站）
              </span>
            )}
          </h2>
          <span className="section-subtitle aqi-rule-note">
            ⚠️ 縣市 AQI 採區內最高值（最差空氣品質測站代表）・非全縣市平均
          </span>
        </div>

        {/* Station Selector Dropdown */}
        {countyStations.length > 0 && !isLoading && !error && (
          <div className="station-selector-group">
            <label htmlFor="aqi-station-select" className="station-select-label">
              切換測站 ({countyStations.length})：
            </label>
            <select
              id="aqi-station-select"
              className="select-input select-station"
              value={activeStation?.stationId || ""}
              onChange={(e) => setUserSelectedStationId(e.target.value)}
              aria-label={`${region} 空氣品質測站選單`}
            >
              {countyStations.map((s) => {
                const isWorst = countySummary.sourceStationId === s.stationId;
                const aqiText = s.aqi !== null ? `AQI ${s.aqi}` : "缺測";
                return (
                  <option key={s.stationId} value={s.stationId}>
                    {s.stationName} ({aqiText}){isWorst ? " 🔥區內最高" : ""}
                  </option>
                );
              })}
            </select>
          </div>
        )}
      </div>

      {/* Main Body: Loading / Error / Empty / Data */}
      {isLoading && !airQualityData ? (
        <div className="obs-loading" aria-label="載入空氣品質中">
          <div className="spinner" style={{ margin: "24px auto 12px" }} />
          <p className="state-subtitle" style={{ textAlign: "center" }}>
            正在取得 {region} 最新環境部空氣品質監測資料...
          </p>
        </div>
      ) : error ? (
        <div className="obs-error-state" role="alert">
          <div className="obs-error-icon">⚠️</div>
          <div className="obs-error-content">
            <p className="obs-error-msg">{error}</p>
            <p className="obs-error-sub">預報與即時天氣功能不受影響，可點擊重試載入空氣品質。</p>
          </div>
          <button type="button" className="btn btn-secondary btn-retry" onClick={onRetry}>
            🔄 重新載入空氣品質
          </button>
        </div>
      ) : !activeStation ? (
        <div className="obs-empty-state">
          <p className="state-subtitle" style={{ textAlign: "center", padding: "20px 0" }}>
            目前 {region} 暫無可用之環境部空氣品質測站監測資料。
          </p>
        </div>
      ) : (
        <>
          {/* County Summary Highlight Banner */}
          <div className="aqi-summary-banner">
            <div className="aqi-summary-main">
              <span className="aqi-summary-title">
                【縣市指標】{region} AQI 區內最高值：
              </span>
              <span
                className="aqi-pill"
                style={{
                  color: countyAqiCategory.color,
                  backgroundColor: countyAqiCategory.bgColor,
                  borderColor: countyAqiCategory.borderColor,
                }}
              >
                {countySummary.maxAqi !== null ? countySummary.maxAqi : "—"} ({countyAqiCategory.level})
              </span>
              {countySummary.sourceStationName && (
                <span className="aqi-summary-source">
                  （最高值來源：{countySummary.sourceStationName}測站）
                </span>
              )}
            </div>
            <div className="aqi-summary-desc">{countyAqiCategory.description}</div>
          </div>

          {/* Metric Grid for the currently inspected station */}
          <div className="current-grid aqi-grid">
            {/* 測站 AQI */}
            <div className="current-metric-card" data-testid="metric-aqi">
              <span className="metric-label">📊 測站 AQI 指標</span>
              <span
                className="metric-value font-mono"
                style={{ color: activeAqiCategory.color }}
              >
                {activeStation.aqi !== null ? activeStation.aqi : "—"}
              </span>
              <span
                className="metric-desc"
                style={{ color: activeAqiCategory.color, fontWeight: 600 }}
              >
                {activeAqiCategory.level}
              </span>
            </div>

            {/* PM2.5 */}
            <div className="current-metric-card" data-testid="metric-pm25">
              <span className="metric-label">🌫️ 細懸浮微粒 (PM2.5)</span>
              <span className="metric-value font-mono">
                {activeStation.pm25 !== null ? `${activeStation.pm25} μg/m³` : "—"}
              </span>
              <span className="metric-desc">空氣懸浮細微顆粒</span>
            </div>

            {/* PM10 */}
            <div className="current-metric-card" data-testid="metric-pm10">
              <span className="metric-label">💨 懸浮微粒 (PM10)</span>
              <span className="metric-value font-mono">
                {activeStation.pm10 !== null ? `${activeStation.pm10} μg/m³` : "—"}
              </span>
              <span className="metric-desc">顆粒懸浮物濃度</span>
            </div>

            {/* 主要污染物 */}
            <div className="current-metric-card" data-testid="metric-pollutant">
              <span className="metric-label">⚠️ 主要污染物</span>
              <span className="metric-value font-mono font-status">
                {activeStation.primaryPollutant || "無特定"}
              </span>
              <span className="metric-desc">指標影響首要項目</span>
            </div>

            {/* 臭氧 O3 */}
            <div className="current-metric-card" data-testid="metric-ozone">
              <span className="metric-label">☀️ 臭氧 (O₃)</span>
              <span className="metric-value font-mono">
                {activeStation.ozone !== null ? `${activeStation.ozone} ppb` : "—"}
              </span>
              <span className="metric-desc">光化學氧化物濃度</span>
            </div>

            {/* 發布時間 */}
            <div className="current-metric-card" data-testid="metric-aqi-time">
              <span className="metric-label">🕒 觀測發布時間</span>
              <span className="metric-value font-mono font-time">
                {formatTaipeiDateTime(activeStation.publishedAt)}
              </span>
              <span className="metric-desc">
                測站：{activeStation.stationName} ({activeStation.stationId})
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
