"use client";

import React from "react";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = "載入預報資料時發生錯誤，請稍後再試。",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="state-card error-container" role="alert">
      <div className="error-icon" aria-hidden="true">⚠️</div>
      <h3 className="state-title">無法取得天氣資料</h3>
      <p className="state-subtitle">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="btn btn-primary"
          style={{ marginTop: "16px" }}
        >
          🔄 重新嘗試
        </button>
      )}
    </div>
  );
}
