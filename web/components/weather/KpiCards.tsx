"use client";

import React from "react";
import { SummaryKpis } from "@/lib/transformations/daily";

interface KpiCardsProps {
  region: string;
  kpis: SummaryKpis;
}

export function KpiCards({ region, kpis }: KpiCardsProps) {
  const minDisplay =
    kpis.periodMin !== null && Number.isFinite(kpis.periodMin)
      ? `${kpis.periodMin.toFixed(1)}°C`
      : "—";

  const maxDisplay =
    kpis.periodMax !== null && Number.isFinite(kpis.periodMax)
      ? `${kpis.periodMax.toFixed(1)}°C`
      : "—";

  return (
    <section className="kpi-grid" aria-label="關鍵指標概覽">
      {/* 縣市卡片 */}
      <div className="kpi-card" data-testid="kpi-region">
        <span className="kpi-label">觀測縣市</span>
        <div className="kpi-value text-accent">{region || "—"}</div>
        <span className="kpi-desc">全臺灣各縣市預報</span>
      </div>

      {/* 區間最低預報 */}
      <div className="kpi-card" data-testid="kpi-min-temp">
        <span className="kpi-label">區間最低溫</span>
        <div className="kpi-value text-blue">{minDisplay}</div>
        <span className="kpi-desc">所選期間最低預測</span>
      </div>

      {/* 區間最高預報 */}
      <div className="kpi-card" data-testid="kpi-max-temp">
        <span className="kpi-label">區間最高溫</span>
        <div className="kpi-value text-red">{maxDisplay}</div>
        <span className="kpi-desc">所選期間最高預測</span>
      </div>

      {/* 顯示天數 */}
      <div className="kpi-card" data-testid="kpi-days-count">
        <span className="kpi-label">預報天數</span>
        <div className="kpi-value text-emerald">{kpis.daysCount} 天</div>
        <span className="kpi-desc">涵蓋之日曆天數</span>
      </div>
    </section>
  );
}
