"use client";

import React from "react";

export function LoadingState({ message = "正在載入全臺天氣預報資料..." }: { message?: string }) {
  return (
    <div className="state-card loading-container" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p className="state-title">{message}</p>
      <p className="state-subtitle">正在向氣象署資料端點同步最新預報...</p>
      <div className="skeleton-grid" aria-hidden="true">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
    </div>
  );
}
