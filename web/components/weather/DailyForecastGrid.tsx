"use client";

import React from "react";
import { DailyForecast, getTaipeiWeekday } from "@/lib/transformations/daily";
import { CalendarIcon } from "@/components/ui/Icons";

export interface DailyForecastGridProps {
  dailyList: readonly DailyForecast[];
  region: string;
  isEmbedded?: boolean;
}

export function DailyForecastGrid({
  dailyList,
  region,
  isEmbedded = false,
}: DailyForecastGridProps) {
  if (!dailyList || dailyList.length === 0) {
    return null;
  }

  const gridContent = (
    <div className="daily-grid" data-testid="daily-forecast-grid">
      {dailyList.map((day) => {
        const weekday = getTaipeiWeekday(day.forecastDate);
        const minDisplay =
          day.minTemp !== null && Number.isFinite(day.minTemp)
            ? `${day.minTemp.toFixed(1)}°C`
            : "—";
        const maxDisplay =
          day.maxTemp !== null && Number.isFinite(day.maxTemp)
            ? `${day.maxTemp.toFixed(1)}°C`
            : "—";

          return (
            <article
              key={day.forecastDate}
              className={`daily-card ${day.isPartial ? "card-partial" : ""}`}
            >
              <div className="daily-card-header">
                <span className="daily-date">{day.forecastDate}</span>
                <span className="daily-weekday">{weekday}</span>
              </div>

              <div className="daily-temp-row">
                <div className="temp-stat">
                  <span className="temp-label">最低溫</span>
                  <span className="temp-num text-blue">{minDisplay}</span>
                </div>
                <div className="temp-stat">
                  <span className="temp-label">最高溫</span>
                  <span className="temp-num text-red">{maxDisplay}</span>
                </div>
              </div>

              <div className="daily-card-footer">
                <span className="interval-tag">
                  {day.intervalCount} 個時段
                </span>
                {day.isPartial ? (
                  <span className="status-badge badge-warning" title="本日未滿 2 個時段">
                    部分資料
                  </span>
                ) : (
                  <span className="status-badge badge-success">
                    完整預報
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    );

    if (isEmbedded) {
      return gridContent;
    }

    return (
      <section className="dashboard-card" aria-label="每日預報明細">
        <div className="section-header">
          <div>
            <h3 className="section-title">
              <CalendarIcon size={16} className="title-icon" />
              <span>每日氣溫預報</span>
            </h3>
            <span className="section-subtitle">
              {region} 未來七天逐日溫度整理 ({dailyList.length} 天)
            </span>
          </div>
        </div>
        {gridContent}
      </section>
    );
  }
