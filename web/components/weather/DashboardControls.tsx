"use client";

import React from "react";

interface DashboardControlsProps {
  regions: readonly string[];
  selectedRegion: string;
  onSelectRegion: (region: string) => void;
  availableDates: readonly string[];
  startDate: string;
  endDate: string;
  onSelectStartDate: (date: string) => void;
  onSelectEndDate: (date: string) => void;
  onResetDates: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function DashboardControls({
  regions,
  selectedRegion,
  onSelectRegion,
  availableDates,
  startDate,
  endDate,
  onSelectStartDate,
  onSelectEndDate,
  onResetDates,
  onRefresh,
  isLoading = false,
}: DashboardControlsProps) {
  return (
    <section
      id="dashboard-main-controls"
      className="dashboard-card controls-card"
      aria-label="篩選控制項"
    >
      <div className="controls-grid">
        {/* 縣市選擇 */}
        <div className="control-group">
          <label htmlFor="region-select" className="control-label">
            📍 預報縣市
          </label>
          <select
            id="region-select"
            value={selectedRegion}
            onChange={(e) => onSelectRegion(e.target.value)}
            className="select-input"
            disabled={isLoading}
          >
            {regions.map((reg) => (
              <option key={reg} value={reg}>
                {reg}
              </option>
            ))}
          </select>
        </div>

        {/* 開始日期 */}
        <div className="control-group">
          <label htmlFor="start-date-select" className="control-label">
            🗓️ 開始日期
          </label>
          <select
            id="start-date-select"
            value={startDate}
            onChange={(e) => onSelectStartDate(e.target.value)}
            className="select-input"
            disabled={isLoading || availableDates.length === 0}
          >
            {availableDates.map((dateStr) => (
              <option key={dateStr} value={dateStr}>
                {dateStr}
              </option>
            ))}
          </select>
        </div>

        {/* 結束日期 */}
        <div className="control-group">
          <label htmlFor="end-date-select" className="control-label">
            🗓️ 結束日期
          </label>
          <select
            id="end-date-select"
            value={endDate}
            onChange={(e) => onSelectEndDate(e.target.value)}
            className="select-input"
            disabled={isLoading || availableDates.length === 0}
          >
            {availableDates.map((dateStr) => (
              <option key={dateStr} value={dateStr}>
                {dateStr}
              </option>
            ))}
          </select>
        </div>

        {/* 操作按鈕 */}
        <div className="control-actions">
          <button
            type="button"
            onClick={onResetDates}
            className="btn btn-secondary"
            title="重設為完整 7 天預報範圍"
            disabled={isLoading}
          >
            全部日期
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="btn btn-primary"
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? "更新中..." : "🔄 重新載入"}
          </button>
        </div>
      </div>
    </section>
  );
}
