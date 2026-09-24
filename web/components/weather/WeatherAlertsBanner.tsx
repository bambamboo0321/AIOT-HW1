"use client";

import React, { useState } from "react";
import { WeatherAlert, AlertSeverity } from "@/lib/contracts/alerts";
import { filterAlertsByCounty } from "@/lib/transformations/alerts";
import { formatTaipeiDateTime } from "@/lib/transformations/daily";

export interface WeatherAlertsBannerProps {
  selectedRegion: string;
  alerts: WeatherAlert[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

function getSeverityBadgeStyle(severity?: AlertSeverity | null): {
  color: string;
  backgroundColor: string;
  borderColor: string;
} {
  switch (severity) {
    case "Extreme":
      return {
        color: "#f87171",
        backgroundColor: "rgba(239, 68, 68, 0.2)",
        borderColor: "rgba(239, 68, 68, 0.6)",
      };
    case "Severe":
      return {
        color: "#fb923c",
        backgroundColor: "rgba(249, 115, 22, 0.15)",
        borderColor: "rgba(249, 115, 22, 0.5)",
      };
    case "Moderate":
      return {
        color: "#facc15",
        backgroundColor: "rgba(234, 179, 8, 0.15)",
        borderColor: "rgba(234, 179, 8, 0.5)",
      };
    case "Minor":
      return {
        color: "#38bdf8",
        backgroundColor: "rgba(56, 189, 248, 0.15)",
        borderColor: "rgba(56, 189, 248, 0.4)",
      };
    default:
      return {
        color: "#94a3b8",
        backgroundColor: "rgba(148, 163, 184, 0.15)",
        borderColor: "rgba(148, 163, 184, 0.3)",
      };
  }
}

export function WeatherAlertsBanner({
  selectedRegion,
  alerts,
  isLoading = false,
  error = null,
  onRetry,
}: WeatherAlertsBannerProps) {
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  // If loading
  if (isLoading) {
    return (
      <div className="alerts-container alerts-loading" data-testid="weather-alerts-loading">
        <span className="alerts-loading-text">正在查詢中央氣象署最新天氣警特報...</span>
      </div>
    );
  }

  // If error occurred
  if (error) {
    return (
      <div className="alerts-container alerts-error-box" data-testid="weather-alerts-error">
        <div className="alerts-error-content">
          <span className="alerts-error-icon">⚠️</span>
          <span className="alerts-error-text">警特報載入異常：{error}</span>
        </div>
        {onRetry && (
          <button
            type="button"
            className="btn btn-outline-sm"
            onClick={onRetry}
            data-testid="retry-alerts-button"
          >
            重試
          </button>
        )}
      </div>
    );
  }

  // Filter alerts applicable to the selected region
  const regionalAlerts = filterAlertsByCounty(alerts, selectedRegion);
  const otherAlertsCount = alerts.length - regionalAlerts.length;

  // Case 1: No alerts in all of Taiwan
  if (alerts.length === 0) {
    return (
      <div className="alerts-container alerts-calm" data-testid="weather-alerts-none">
        <div className="alerts-calm-content">
          <span className="alerts-calm-icon">🛡️</span>
          <span className="alerts-calm-title">目前無有效天氣警特報</span>
          <span className="alerts-calm-subtitle">中央氣象署目前無針對全臺發布生效中之災害性天氣警特報</span>
        </div>
      </div>
    );
  }

  // Determine which alerts to display
  const displayedAlerts = showAllAlerts ? alerts : regionalAlerts;

  return (
    <div
      className="alerts-container alerts-active-section"
      role="region"
      aria-label="天氣警特報"
      data-testid="weather-alerts-banner"
    >
      <div className="alerts-banner-header">
        <div className="alerts-banner-title-group">
          <span className="alerts-warning-icon">⚠️</span>
          <h2 className="alerts-banner-title">天氣警特報</h2>
          <span className="alerts-count-badge">
            {regionalAlerts.length > 0
              ? `${selectedRegion} 有 ${regionalAlerts.length} 則警報`
              : `${selectedRegion} 無警報`}
          </span>
        </div>

        {otherAlertsCount > 0 && (
          <button
            type="button"
            className="alerts-toggle-scope-btn"
            onClick={() => setShowAllAlerts((prev) => !prev)}
            data-testid="toggle-alerts-scope-btn"
          >
            {showAllAlerts
              ? `只看 ${selectedRegion} (${regionalAlerts.length})`
              : `查看全臺其他警報 (+${otherAlertsCount})`}
          </button>
        )}
      </div>

      {displayedAlerts.length === 0 ? (
        <div className="alerts-regional-empty" data-testid="regional-alerts-empty">
          <p>
            目前【{selectedRegion}】無生效中之警特報
            {otherAlertsCount > 0 && `（全臺其他地區有 ${otherAlertsCount} 則警報）`}。
          </p>
        </div>
      ) : (
        <div className="alerts-list">
          {displayedAlerts.map((alert) => {
            const badgeStyle = getSeverityBadgeStyle(alert.severity);
            const isLocal = alert.isNationwide || alert.affectedAreas.includes(selectedRegion);

            return (
              <div
                key={alert.identifier}
                className={`alert-card ${isLocal ? "alert-card-local" : "alert-card-other"}`}
                data-testid={`alert-item-${alert.identifier}`}
              >
                <div className="alert-card-top">
                  <div className="alert-card-main-title">
                    <span className="alert-event-tag">{alert.event}</span>
                    <h3 className="alert-headline">{alert.headline}</h3>
                    {alert.isNationwide && (
                      <span className="badge badge-nationwide">全國性</span>
                    )}
                  </div>
                  {alert.severity ? (
                    <span
                      className="badge badge-severity"
                      style={{
                        color: badgeStyle.color,
                        backgroundColor: badgeStyle.backgroundColor,
                        borderColor: badgeStyle.borderColor,
                      }}
                    >
                      {alert.severityNameZh ? `${alert.severityNameZh} (${alert.severity})` : alert.severity}
                    </span>
                  ) : alert.significance ? (
                    <span className="badge badge-significance">
                      {alert.significance}
                    </span>
                  ) : null}
                </div>

                <div className="alert-times">
                  <span>生效時間：{formatTaipeiDateTime(alert.effective)}</span>
                  <span>・</span>
                  <span>截止時間：{formatTaipeiDateTime(alert.expires)}</span>
                </div>

                <div className="alert-affected-areas">
                  <span className="areas-label">受影響地區：</span>
                  <span className="areas-list">
                    {alert.isNationwide
                      ? "全臺灣地區"
                      : alert.affectedAreas.join("、") || "詳見說明"}
                  </span>
                </div>

                <details className="alert-expandable-details" data-testid={`alert-details-${alert.identifier}`}>
                  <summary className="alert-details-summary">
                    <span>詳細說明與防護指引</span>
                  </summary>
                  <div className="alert-details-body">
                    <p className="alert-description">{alert.description}</p>
                    {alert.instruction && (
                      <div className="alert-instruction-box">
                        <span className="instruction-label">處置建議：</span>
                        <span className="instruction-text">{alert.instruction}</span>
                      </div>
                    )}
                    {alert.web && (
                      <a
                        href={alert.web}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="alert-cwa-link"
                      >
                        中央氣象署官方詳細公告 ↗
                      </a>
                    )}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
