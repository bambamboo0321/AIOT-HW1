/**
 * Precipitation Display and Semantic Transformation Utilities
 *
 * Official CWA O-A0003-001 Semantics:
 * - WeatherElement.Now.Precipitation represents "當日降水量" (Daily Cumulative Precipitation)
 * - T: 雨跡 (Trace of precipitation, < 0.1 mm)
 * - -98: 連續 6 小時無降水
 * - -99 / -990.0: 缺測或異常
 * - X: 儀器故障
 * - Normal non-negative number: Actual daily precipitation in mm (including legitimate 0.0 mm)
 */

import { PrecipitationStatus } from "../contracts/observations";

/**
 * Formats daily precipitation for the primary metric display.
 */
export function formatPrecipitation(
  dailyPrecipitation: number | null,
  status: PrecipitationStatus
): string {
  switch (status) {
    case "trace":
      return "雨跡";
    case "none_6hr":
      return "連續6小時無降水";
    case "fault":
      return "儀器故障";
    case "missing":
      return "—";
    case "normal":
      if (dailyPrecipitation !== null && Number.isFinite(dailyPrecipitation)) {
        return `${dailyPrecipitation.toFixed(1)} mm`;
      }
      return "—";
    default:
      return "—";
  }
}

/**
 * Generates an explanatory secondary caption for precipitation.
 */
export function getPrecipitationDescription(
  dailyPrecipitation: number | null,
  status: PrecipitationStatus
): string {
  switch (status) {
    case "trace":
      return "微量降水 (未達 0.1 mm)";
    case "none_6hr":
      return "過去連續 6 小時未有降雨記錄";
    case "fault":
      return "測站雨量感應器故障";
    case "missing":
      return "測站缺測或未設置雨量計";
    case "normal":
      if (dailyPrecipitation === 0) {
        return "今日 00:00 至今尚無降雨";
      }
      return "今日 00:00 至今累積降水量";
    default:
      return "當日降水狀況";
  }
}
