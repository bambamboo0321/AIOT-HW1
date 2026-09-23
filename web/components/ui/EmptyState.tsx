"use client";

import React from "react";

interface EmptyStateProps {
  title?: string;
  message?: string;
  onReset?: () => void;
}

export function EmptyState({
  title = "查無預報資料",
  message = "所選的日期範圍或條件無對應的氣溫記錄，請調整篩選區間。",
  onReset,
}: EmptyStateProps) {
  return (
    <div className="state-card empty-container">
      <div className="empty-icon" aria-hidden="true">📅</div>
      <h3 className="state-title">{title}</h3>
      <p className="state-subtitle">{message}</p>
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="btn btn-secondary"
          style={{ marginTop: "16px" }}
        >
          重設篩選條件
        </button>
      )}
    </div>
  );
}
