"use client";

import React, { useState } from "react";
import { ForecastInterval } from "@/lib/contracts/weather";
import { formatTaipeiDateTime } from "@/lib/transformations/daily";
import { ClockIcon, ChevronDownIcon } from "@/components/ui/Icons";

interface RawIntervalDetailsProps {
  intervals: readonly ForecastInterval[];
  region: string;
}

export function RawIntervalDetails({ intervals, region }: RawIntervalDetailsProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!intervals || intervals.length === 0) {
    return null;
  }

  return (
    <section className="dashboard-card raw-details-card" aria-label="原始時段明細">
      <button
        type="button"
        className="accordion-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="accordion-title-group">
          <span className={`accordion-icon ${isOpen ? "is-open" : ""}`} aria-hidden="true">
            <ChevronDownIcon size={16} />
          </span>
          <ClockIcon size={18} className="text-secondary" />
          <h3 className="section-title">原始 12 小時預報區間檢視</h3>
          <span className="badge-pill">{intervals.length} 個區間</span>
        </div>
        <span className="accordion-action-hint">
          {isOpen ? "點擊收合" : "點擊展開"}
        </span>
      </button>

      {isOpen && (
        <div className="accordion-content">
          <p className="state-subtitle" style={{ marginBottom: "16px" }}>
            中央氣象署 F-D0047-091 提供之 {region} 原始 12 小時高低溫區間（時區已轉換為 Asia/Taipei）：
          </p>

          <div className="table-responsive">
            <table className="raw-intervals-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">開始時間 (Taipei)</th>
                  <th scope="col">結束時間 (Taipei)</th>
                  <th scope="col">最低溫</th>
                  <th scope="col">最高溫</th>
                </tr>
              </thead>
              <tbody>
                {intervals.map((interval, index) => {
                  const minDisplay =
                    interval.minTemp !== null && Number.isFinite(interval.minTemp)
                      ? `${interval.minTemp.toFixed(1)} °C`
                      : "—";
                  const maxDisplay =
                    interval.maxTemp !== null && Number.isFinite(interval.maxTemp)
                      ? `${interval.maxTemp.toFixed(1)} °C`
                      : "—";

                  return (
                    <tr key={`${interval.startTime}__${interval.endTime}__${index}`}>
                      <td className="text-muted">{index + 1}</td>
                      <td>{formatTaipeiDateTime(interval.startTime)}</td>
                      <td>{formatTaipeiDateTime(interval.endTime)}</td>
                      <td className="text-blue font-mono">{minDisplay}</td>
                      <td className="text-red font-mono">{maxDisplay}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
