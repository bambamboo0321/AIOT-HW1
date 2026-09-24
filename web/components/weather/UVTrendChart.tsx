"use client";

import React, { useState } from "react";
import { UVForecastItem } from "@/lib/contracts/weather";
import { classifyUV, getTaipeiTodayDateString } from "@/lib/transformations/uv";
import { getTaipeiWeekday } from "@/lib/transformations/daily";

export interface UVTrendChartProps {
  dailyUvList: readonly UVForecastItem[];
  region: string;
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
  now?: Date;
}

export function UVTrendChart({
  dailyUvList,
  region,
  selectedDate,
  onSelectDate,
  now = new Date(),
}: UVTrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!dailyUvList || dailyUvList.length === 0) {
    return (
      <section className="dashboard-card chart-card" aria-label="每日 UV 趨勢圖">
        <div className="chart-header">
          <div>
            <h3 className="section-title">☀️ 每日白天 UV 趨勢</h3>
            <span className="section-subtitle">{region} 每日白天 UV 預報・跨日變化走勢</span>
          </div>
        </div>
        <p className="state-subtitle" style={{ textAlign: "center", padding: "32px 0" }}>
          目前無足夠的紫外線預報資料以繪製趨勢圖。
        </p>
      </section>
    );
  }

  const todayStr = getTaipeiTodayDateString(now);

  // Calculate Y-axis range from valid UV values (min is always 0, max at least 12)
  const validValues = dailyUvList
    .map((d) => d.uvIndex)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const maxObserved = validValues.length > 0 ? Math.max(...validValues) : 10;
  const minY = 0;
  const maxY = Math.max(12, Math.ceil((maxObserved + 1) / 2) * 2);

  // SVG layout dimensions
  const width = 800;
  const height = 320;
  const paddingLeft = 55;
  const paddingRight = 40;
  const paddingTop = 35;
  const paddingBottom = 60;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const n = dailyUvList.length;
  const getX = (index: number) => {
    if (n <= 1) return paddingLeft + chartWidth / 2;
    return paddingLeft + (index / (n - 1)) * chartWidth;
  };

  const getY = (val: number | null) => {
    if (val === null || !Number.isFinite(val)) return null;
    const clamped = Math.max(minY, Math.min(maxY, val));
    const range = maxY - minY;
    const ratio = range > 0 ? (clamped - minY) / range : 0.5;
    const calculatedY = paddingTop + chartHeight * (1 - ratio);
    return Number.isFinite(calculatedY) ? calculatedY : null;
  };

  // Generate SVG path for UV trend line (null breaks path, never connects across null or fills with 0)
  const buildPath = () => {
    let path = "";
    let inSubpath = false;

    dailyUvList.forEach((item, idx) => {
      const y = getY(item.uvIndex);
      const x = getX(idx);

      if (y !== null) {
        if (!inSubpath) {
          const prefix = path ? " M " : "M ";
          path += `${prefix}${x.toFixed(1)} ${y.toFixed(1)}`;
          inSubpath = true;
        } else {
          path += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
        }
      } else {
        inSubpath = false;
      }
    });

    return path;
  };

  const uvPath = buildPath();

  // Y-axis grid ticks representing official threshold levels
  const yTicks = [0, 2, 5, 7, 10, maxY > 12 ? maxY : 12];

  // Subtle background bands for WHO/CWA exposure levels
  const bands = [
    { from: 0, to: 2, color: "rgba(16, 185, 129, 0.06)", label: "低量級 (0-2)" },
    { from: 2, to: 5, color: "rgba(234, 179, 8, 0.05)", label: "中量級 (3-5)" },
    { from: 5, to: 7, color: "rgba(249, 115, 22, 0.05)", label: "高量級 (6-7)" },
    { from: 7, to: 10, color: "rgba(239, 68, 68, 0.05)", label: "過量級 (8-10)" },
    { from: 10, to: maxY, color: "rgba(147, 51, 234, 0.05)", label: "危險級 (11+)" },
  ];

  const activeItem = hoveredIndex !== null ? dailyUvList[hoveredIndex] : null;

  return (
    <section className="dashboard-card chart-card" aria-label="每日 UV 趨勢圖">
      <div className="chart-header">
        <div>
          <div className="chart-title-group">
            <h3 className="section-title">☀️ 每日白天 UV 趨勢</h3>
            <span className="badge badge-semantic">每日白天 UV 預報</span>
          </div>
          <span className="section-subtitle">
            {region} 每日白天時段（06:00～18:00）紫外線跨日變化走勢 ({dailyUvList.length} 天)
          </span>
        </div>

        {/* Legend */}
        <div className="chart-legend uv-legend" aria-hidden="true">
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: "#10b981" }} />
            <span>低 (0-2)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: "#eab308" }} />
            <span>中 (3-5)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: "#f97316" }} />
            <span>高 (6-7)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: "#ef4444" }} />
            <span>過量 (8-10)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: "#9333ea" }} />
            <span>危險 (11+)</span>
          </div>
        </div>
      </div>

      <div className="chart-scroll-wrapper">
        <svg
          className="trend-svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${region} 每日白天 UV 趨勢折線圖`}
        >
          {/* Subtle Level Background Bands */}
          {bands.map((band, idx) => {
            const yTop = getY(Math.min(maxY, band.to));
            const yBottom = getY(band.from);
            if (yTop === null || yBottom === null) return null;
            const bandHeight = Math.max(0, yBottom - yTop);

            return (
              <rect
                key={idx}
                x={paddingLeft}
                y={yTop}
                width={chartWidth}
                height={bandHeight}
                fill={band.color}
              />
            );
          })}

          {/* Horizontal Grid lines and Y-axis labels */}
          {yTicks.map((tick) => {
            const y = getY(tick);
            if (y === null) return null;

            return (
              <g key={tick} className="grid-line-group">
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  fill="var(--text-muted)"
                  fontSize="11"
                  className="font-mono"
                >
                  {tick >= 11 && tick === maxY ? `${tick}+` : tick}
                </text>
              </g>
            );
          })}

          {/* Solid Stable UV Trend Stroke (userSpaceOnUse equivalent solid color, immune to zero-height bounding box collapse) */}
          {uvPath && (
            <path
              d={uvPath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="uv-trend-stroke"
            />
          )}

          {/* Interactive Data Points and X-Axis Labels */}
          {dailyUvList.map((item, idx) => {
            const x = getX(idx);
            const y = getY(item.uvIndex);
            const isHovered = hoveredIndex === idx;
            const isSelected = item.forecastDate === selectedDate;
            const isToday = item.forecastDate === todayStr;
            const category = classifyUV(item.uvIndex);

            const year = item.forecastDate.slice(0, 4);
            const month = parseInt(item.forecastDate.slice(5, 7), 10);
            const day = parseInt(item.forecastDate.slice(8, 10), 10);
            const weekday = getTaipeiWeekday(item.forecastDate);

            const dateLabel = `${month}/${day}`;
            const ariaLabel = item.uvIndex !== null
              ? `${year}年${month}月${day}日，UV ${category.displayValue}，${category.level}${isToday ? "（今日）" : ""}`
              : `${year}年${month}月${day}日，無紫外線資料${isToday ? "（今日）" : ""}`;

            const handleSelect = () => {
              if (onSelectDate) {
                onSelectDate(item.forecastDate);
              }
            };

            return (
              <g
                key={item.forecastDate}
                className={`chart-day-column ${isSelected ? "is-selected-date" : ""}`}
              >
                {/* Vertical Cursor / Hover Guide */}
                {isHovered && (
                  <line
                    x1={x}
                    y1={paddingTop}
                    x2={x}
                    y2={height - paddingBottom}
                    stroke="rgba(245, 158, 11, 0.4)"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                )}

                {/* Data point circle (if valid number) */}
                {y !== null && (
                  <g
                    role="button"
                    tabIndex={0}
                    aria-label={ariaLabel}
                    aria-pressed={isSelected}
                    onClick={handleSelect}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelect();
                      }
                    }}
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onFocus={() => setHoveredIndex(idx)}
                    onBlur={() => setHoveredIndex(null)}
                    style={{ cursor: "pointer", outline: "none" }}
                    data-testid={`uv-point-${item.forecastDate}`}
                  >
                    {/* Selected Ring Highlight */}
                    {isSelected && (
                      <circle
                        cx={x}
                        cy={y}
                        r="11"
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2.5"
                        strokeDasharray="none"
                        className="uv-selected-ring"
                      />
                    )}

                    {/* Data circle */}
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected || isHovered ? "7" : "5.5"}
                      fill={category.color}
                      stroke="#0f172a"
                      strokeWidth="2"
                    />

                    {/* Value Badge above Point */}
                    <text
                      x={x}
                      y={y - 12}
                      textAnchor="middle"
                      fill={category.color}
                      fontSize={isSelected ? "13" : "11"}
                      fontWeight={isSelected ? "800" : "700"}
                      className="font-mono uv-point-value"
                    >
                      {category.displayValue}
                    </text>
                  </g>
                )}

                {/* X-Axis Date Text & Weekday */}
                <g
                  className="x-axis-group"
                  onClick={handleSelect}
                  style={{ cursor: "pointer" }}
                >
                  <text
                    x={x}
                    y={height - paddingBottom + 20}
                    textAnchor="middle"
                    fill={isSelected ? "var(--text-primary)" : "var(--text-secondary)"}
                    fontSize="12"
                    fontWeight={isSelected ? "700" : "500"}
                  >
                    {dateLabel}
                  </text>
                  <text
                    x={x}
                    y={height - paddingBottom + 35}
                    textAnchor="middle"
                    fill={isSelected ? "#f59e0b" : "var(--text-muted)"}
                    fontSize="11"
                  >
                    {weekday}
                  </text>

                  {/* "今日" pill tag for today's date */}
                  {isToday && (
                    <g transform={`translate(${x - 18}, ${height - paddingBottom + 40})`}>
                      <rect
                        width="36"
                        height="16"
                        rx="8"
                        fill="rgba(56, 189, 248, 0.2)"
                        stroke="rgba(56, 189, 248, 0.6)"
                      />
                      <text
                        x="18"
                        y="11.5"
                        textAnchor="middle"
                        fill="#38bdf8"
                        fontSize="9.5"
                        fontWeight="700"
                      >
                        今日
                      </text>
                    </g>
                  )}
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Interactive Tooltip Card at Bottom of Chart */}
      {activeItem && (
        <div className="chart-tooltip-bar" data-testid="uv-active-tooltip">
          <span className="tooltip-date">
            📅 {activeItem.forecastDate} ({getTaipeiWeekday(activeItem.forecastDate)})
            {activeItem.forecastDate === todayStr && "・今日"}
          </span>
          <span
            className="tooltip-val"
            style={{ color: classifyUV(activeItem.uvIndex).color }}
          >
            ☀️ 白天 UV：{classifyUV(activeItem.uvIndex).displayValue}（{classifyUV(activeItem.uvIndex).level}）
          </span>
          <span className="tooltip-hint">點擊資料點可同步檢視防護建議</span>
        </div>
      )}
    </section>
  );
}
