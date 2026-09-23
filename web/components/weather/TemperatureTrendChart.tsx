"use client";

import React, { useState } from "react";
import { DailyForecast, getTaipeiWeekday } from "@/lib/transformations/daily";

interface TemperatureTrendChartProps {
  dailyList: readonly DailyForecast[];
  region: string;
}

export function TemperatureTrendChart({ dailyList, region }: TemperatureTrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!dailyList || dailyList.length === 0) {
    return (
      <section className="dashboard-card" aria-label="氣溫趨勢圖">
        <h3 className="section-title">📈 氣溫趨勢圖</h3>
        <p className="state-subtitle" style={{ textAlign: "center", padding: "32px 0" }}>
          目前無足夠的預報資料以繪製趨勢圖。
        </p>
      </section>
    );
  }

  // Calculate Y-axis bounds from valid numbers
  const allValues = dailyList
    .flatMap((d) => [d.minTemp, d.maxTemp])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  let minY = allValues.length > 0 ? Math.min(...allValues) : 15;
  let maxY = allValues.length > 0 ? Math.max(...allValues) : 35;

  // Round bounds to nice increments and give margin
  minY = Math.floor((minY - 2) / 5) * 5;
  maxY = Math.ceil((maxY + 2) / 5) * 5;
  if (maxY - minY < 10) {
    minY -= 5;
    maxY += 5;
  }

  // SVG layout dimensions
  const width = 800;
  const height = 320;
  const paddingLeft = 55;
  const paddingRight = 40;
  const paddingTop = 35;
  const paddingBottom = 55;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const n = dailyList.length;
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

  // Generate Y-axis grid ticks (every 5 degrees)
  const ticks: number[] = [];
  for (let t = minY; t <= maxY; t += 5) {
    ticks.push(t);
  }

  // Helper to generate SVG path string for array of points with null handling
  const buildPath = (values: (number | null)[]) => {
    let path = "";
    let inSubpath = false;

    values.forEach((val, idx) => {
      const y = getY(val);
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
        inSubpath = false; // Break path when temperature is null
      }
    });

    return path;
  };

  const maxValues = dailyList.map((d) => d.maxTemp);
  const minValues = dailyList.map((d) => d.minTemp);

  const maxPath = buildPath(maxValues);
  const minPath = buildPath(minValues);

  const activeDay = hoveredIndex !== null ? dailyList[hoveredIndex] : null;

  return (
    <section className="dashboard-card chart-card" aria-label="氣溫趨勢圖">
      <div className="chart-header">
        <div>
          <h3 className="section-title">📈 氣溫趨勢變化</h3>
          <span className="section-subtitle">
            {region} 每日最高溫與最低溫走勢 ({dailyList.length} 天)
          </span>
        </div>
        <div className="chart-legend" aria-hidden="true">
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: "#ef4444" }} />
            <span>最高溫 (°C)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot" style={{ backgroundColor: "#06b6d4" }} />
            <span>最低溫 (°C)</span>
          </div>
        </div>
      </div>

      <div className="chart-svg-container">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="trend-svg"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${region} 氣溫走勢圖`}
        >
          <defs>
            {/* Gradients with userSpaceOnUse to ensure horizontal lines (height=0 bounding box) render properly */}
            <linearGradient id="maxGradient" x1="0" y1="0" x2="800" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
            <linearGradient id="minGradient" x1="0" y1="0" x2="800" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>

          {/* Grid lines and Y axis labels */}
          {ticks.map((tick) => {
            const y = getY(tick)!;
            return (
              <g key={tick} className="grid-line-group">
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#334155"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="#94a3b8"
                  fontSize="11"
                  fontFamily="sans-serif"
                >
                  {tick}°C
                </text>
              </g>
            );
          })}

          {/* Max Temperature Line */}
          {maxPath && (
            <path
              data-testid="trend-max-path"
              d={maxPath}
              fill="none"
              stroke="url(#maxGradient)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Min Temperature Line */}
          {minPath && (
            <path
              data-testid="trend-min-path"
              d={minPath}
              fill="none"
              stroke="url(#minGradient)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive column hover targets and points */}
          {dailyList.map((day, idx) => {
            const x = getX(idx);
            const maxYVal = getY(day.maxTemp);
            const minYVal = getY(day.minTemp);
            const isHovered = hoveredIndex === idx;

            // Extract MM/DD for compact axis
            const shortDate = day.forecastDate.slice(5);
            const weekday = getTaipeiWeekday(day.forecastDate);

            return (
              <g
                key={day.forecastDate}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{ cursor: "pointer" }}
              >
                {/* Invisible hover slice covering the full column */}
                <rect
                  x={x - (chartWidth / n) / 2}
                  y={paddingTop}
                  width={chartWidth / n}
                  height={chartHeight}
                  fill={isHovered ? "rgba(255, 255, 255, 0.05)" : "transparent"}
                />

                {/* Vertical hover guideline */}
                {isHovered && (
                  <line
                    x1={x}
                    y1={paddingTop}
                    x2={x}
                    y2={paddingTop + chartHeight}
                    stroke="#64748b"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                )}

                {/* Max Temp Point */}
                {maxYVal !== null && (
                  <circle
                    cx={x}
                    cy={maxYVal}
                    r={isHovered ? 6 : 4}
                    fill="#ef4444"
                    stroke="#0f172a"
                    strokeWidth="2"
                  />
                )}

                {/* Min Temp Point */}
                {minYVal !== null && (
                  <circle
                    cx={x}
                    cy={minYVal}
                    r={isHovered ? 6 : 4}
                    fill="#06b6d4"
                    stroke="#0f172a"
                    strokeWidth="2"
                  />
                )}

                {/* X Axis Date Label */}
                <text
                  x={x}
                  y={height - paddingBottom + 18}
                  textAnchor="middle"
                  fill={isHovered ? "#38bdf8" : "#94a3b8"}
                  fontSize="12"
                  fontWeight={isHovered ? "600" : "400"}
                  fontFamily="sans-serif"
                >
                  {shortDate}
                </text>
                <text
                  x={x}
                  y={height - paddingBottom + 32}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="11"
                  fontFamily="sans-serif"
                >
                  {weekday}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip */}
        {activeDay && hoveredIndex !== null && (
          <div
            className="chart-tooltip"
            style={{
              left: `${((getX(hoveredIndex) / width) * 100).toFixed(1)}%`,
            }}
          >
            <div className="tooltip-date">
              📅 {activeDay.forecastDate} ({getTaipeiWeekday(activeDay.forecastDate)})
            </div>
            <div className="tooltip-row">
              <span className="text-red">🔥 最高溫：</span>
              <b>
                {activeDay.maxTemp !== null ? `${activeDay.maxTemp.toFixed(1)} °C` : "無資料"}
              </b>
            </div>
            <div className="tooltip-row">
              <span className="text-blue">❄️ 最低溫：</span>
              <b>
                {activeDay.minTemp !== null ? `${activeDay.minTemp.toFixed(1)} °C` : "無資料"}
              </b>
            </div>
            {activeDay.isPartial && (
              <div className="tooltip-badge">⚠️ 部分預報區間</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
