"use client";

import React from "react";
import { UVForecastItem } from "@/lib/contracts/weather";
import { classifyUV, getDaytimePeriodStatus } from "@/lib/transformations/uv";

export interface UVCardProps {
  region: string;
  selectedDate?: string;
  uvItem?: UVForecastItem | null;
  tomorrowUvItem?: UVForecastItem | null;
  isLoading?: boolean;
  error?: string | null;
}

export function UVCard({
  region,
  selectedDate,
  uvItem,
  tomorrowUvItem,
  isLoading = false,
  error = null,
}: UVCardProps) {
  const targetDate = selectedDate || uvItem?.forecastDate || "";
  const periodInfo = getDaytimePeriodStatus(targetDate);

  // If explicitly loading
  if (isLoading) {
    return (
      <div className="card uv-card" data-testid="uv-card-loading">
        <div className="card-header">
          <h3 className="card-title">☀️ 紫外線指數預報</h3>
          <span className="badge badge-neutral">載入中...</span>
        </div>
        <div className="card-body">
          <p className="loading-placeholder">正在讀取 {region} 紫外線預報...</p>
        </div>
      </div>
    );
  }

  // If error occurred
  if (error) {
    return (
      <div className="card uv-card" data-testid="uv-card-error">
        <div className="card-header">
          <h3 className="card-title">☀️ 紫外線指數預報</h3>
          <span className="badge badge-error">資料異常</span>
        </div>
        <div className="card-body">
          <p className="error-message">{error}</p>
        </div>
      </div>
    );
  }

  // If no UV data available for selected date
  if (!uvItem || uvItem.uvIndex === null) {
    return (
      <div className="card uv-card" data-testid="uv-card-empty">
        <div className="card-header">
          <div className="card-title-group">
            <h3 className="card-title">☀️ 紫外線指數預報</h3>
            <span className="card-subtitle">{region} {selectedDate ? `・ ${selectedDate}` : ""}</span>
          </div>
          <span className="badge badge-semantic">{periodInfo.statusLabel}</span>
        </div>
        <div className="card-body">
          <div className="uv-no-data-box">
            <p className="no-data-title">該日期無紫外線資料</p>
            <p className="no-data-desc">
              中央氣象署僅提供 7 天內白天時段（06:00～18:00）之紫外線預報值。
            </p>
          </div>
        </div>
      </div>
    );
  }

  const category = classifyUV(uvItem.uvIndex);

  return (
    <div className="card uv-card" data-testid="uv-card">
      <div className="card-header">
        <div className="card-title-group">
          <h3 className="card-title">☀️ 紫外線指數預報</h3>
          <span className="card-subtitle">
            {region} {selectedDate ? `・ ${selectedDate}` : ""}
          </span>
        </div>
        <div className="header-badges">
          <span className="badge badge-semantic" title="資料時間語意：06:00 至 18:00 白天預報">
            {periodInfo.statusLabel}
          </span>
          <span
            className="badge badge-uv-level"
            style={{
              color: category.color,
              backgroundColor: category.bgColor,
              borderColor: category.borderColor,
            }}
          >
            {category.level}
          </span>
        </div>
      </div>

      <div className="card-body">
        <div className="uv-primary-metric">
          <div className="uv-metric-col">
            <div className="uv-metric-number-group">
              <span className="uv-index-value" style={{ color: category.color }}>
                {category.displayValue}
              </span>
              <span className="uv-index-label">UV Index</span>
            </div>
            <div className="uv-period-badge">
              <span>適用時段：06:00 ～ 18:00（臺北時間）</span>
            </div>
            {periodInfo.status === "ended" && tomorrowUvItem && tomorrowUvItem.uvIndex !== null && (
              <div className="uv-tomorrow-hint" data-testid="uv-tomorrow-hint">
                <span className="tomorrow-hint-icon">💡</span>
                <span className="tomorrow-hint-text">
                  明日白天預報：UV {tomorrowUvItem.displayValue}（{tomorrowUvItem.level}）
                </span>
              </div>
            )}
          </div>

          <div
            className="uv-advice-box"
            style={{
              backgroundColor: category.bgColor,
              borderColor: category.borderColor,
            }}
          >
            <div className="uv-advice-header">
              <span className="uv-advice-title" style={{ color: category.color }}>
                🛡️ 一般防護建議（{category.level}）
              </span>
            </div>
            <p className="uv-advice-text">{category.protectionAdvice}</p>
          </div>
        </div>

        <div className="card-footer-meta">
          <span>資料集：CWA F-D0047-091（七天天氣預報）</span>
          <span>色碼說明：本專案 UI 視覺呈現對應色</span>
        </div>
      </div>
    </div>
  );
}
