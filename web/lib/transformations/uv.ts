/**
 * UV Index (紫外線指數) Pure Transformation & Classification Utilities
 *
 * Implements Central Weather Administration (CWA) and WHO standards:
 * - 0～2: 低量級 (綠色)
 * - 3～5: 中量級 (黃色)
 * - 6～7: 高量級 (橘色)
 * - 8～10: 過量級 (紅色) (注意：官方名稱為「過量級」，不得稱為危險級)
 * - 11+: 危險級 (紫色) (支援大於等於 11 之「11+」呈現，不設上限)
 * - null/非法值: 無資料 (灰色)
 *
 * 註：各 Hex 色碼（如 #10b981、#eab308、#f97316、#ef4444、#9333ea）
 * 均為本專案 UI 視覺呈現對應色，非中央氣象署官方公布之絕對色碼規範。
 */

import { UVExposureLevel, UVForecastItem } from "../contracts/weather";

export interface UVCategoryInfo {
  level: UVExposureLevel;
  displayValue: string;
  officialColorName: string;
  color: string;
  bgColor: string;
  borderColor: string;
  protectionAdvice: string;
}

/**
 * Safely parses a raw UV index value into a number or null.
 * Legal 0 is preserved. Blank strings, "N/A", negative values and non-numeric values convert to null.
 */
export function parseUVIndex(valRaw: unknown): number | null {
  if (valRaw === null || valRaw === undefined) {
    return null;
  }
  const str = String(valRaw).trim();
  if (str === "" || str.toUpperCase() === "N/A" || str.toUpperCase() === "NAN") {
    return null;
  }
  const num = Number(str);
  if (!Number.isFinite(num) || num < 0) {
    return null;
  }
  return Math.round(num * 10) / 10; // Keep 1 decimal if present or integer
}

/**
 * Classifies a UV index number into official CWA/WHO exposure levels and general protection advice.
 */
export function classifyUV(uvIndex: number | null | undefined): UVCategoryInfo {
  if (uvIndex === null || uvIndex === undefined || !Number.isFinite(uvIndex) || uvIndex < 0) {
    return {
      level: "無資料",
      displayValue: "N/A",
      officialColorName: "灰色",
      color: "#94a3b8",
      bgColor: "rgba(148, 163, 184, 0.1)",
      borderColor: "rgba(148, 163, 184, 0.3)",
      protectionAdvice: "目前無紫外線資料與防護建議。",
    };
  }

  // 11+ 危險級
  if (uvIndex >= 11) {
    return {
      level: "危險級",
      displayValue: uvIndex > 11 ? `${Math.floor(uvIndex)}+` : "11+",
      officialColorName: "紫色",
      color: "#9333ea",
      bgColor: "rgba(147, 51, 234, 0.12)",
      borderColor: "rgba(147, 51, 234, 0.3)",
      protectionAdvice: "儘量避免戶外曝曬；必要外出時完整遮蔽並縮短曝曬時間。",
    };
  }

  // 8～10 過量級
  if (uvIndex >= 8) {
    return {
      level: "過量級",
      displayValue: String(uvIndex),
      officialColorName: "紅色",
      color: "#ef4444",
      bgColor: "rgba(239, 68, 68, 0.12)",
      borderColor: "rgba(239, 68, 68, 0.3)",
      protectionAdvice: "優先待在陰影處，完整防曬，避免長時間戶外活動。",
    };
  }

  // 6～7 高量級
  if (uvIndex >= 6) {
    return {
      level: "高量級",
      displayValue: String(uvIndex),
      officialColorName: "橘色",
      color: "#f97316",
      bgColor: "rgba(249, 115, 22, 0.12)",
      borderColor: "rgba(249, 115, 22, 0.3)",
      protectionAdvice: "加強防曬、遮蔽皮膚，減少中午時段長時間曝曬。",
    };
  }

  // 3～5 中量級
  if (uvIndex >= 3) {
    return {
      level: "中量級",
      displayValue: String(uvIndex),
      officialColorName: "黃色",
      color: "#eab308",
      bgColor: "rgba(234, 179, 8, 0.12)",
      borderColor: "rgba(234, 179, 8, 0.3)",
      protectionAdvice: "建議防曬乳、帽子、太陽眼鏡及輕薄長袖。",
    };
  }

  // 0～2 低量級 (支援 0，非從 1 開始)
  return {
    level: "低量級",
    displayValue: String(uvIndex),
    officialColorName: "綠色",
    color: "#10b981",
    bgColor: "rgba(16, 185, 129, 0.12)",
    borderColor: "rgba(16, 185, 129, 0.3)",
    protectionAdvice: "一般戶外活動；長時間曝曬仍可使用太陽眼鏡或基本防曬。",
  };
}

/**
 * Creates a normalized UVForecastItem from parsed values.
 */
export function buildUVForecastItem(params: {
  datasetId: string;
  fetchedAt: string;
  county: string;
  forecastDate: string;
  startTime?: string;
  endTime?: string;
  uvIndex: number | null;
}): UVForecastItem {
  const category = classifyUV(params.uvIndex);
  return {
    datasetId: params.datasetId,
    fetchedAt: params.fetchedAt,
    county: params.county,
    forecastDate: params.forecastDate,
    startTime: params.startTime,
    endTime: params.endTime,
    uvIndex: params.uvIndex,
    level: category.level,
    displayValue: category.displayValue,
    protectionAdvice: category.protectionAdvice,
    dataMeaning: "forecast_daytime",
  };
}

/**
 * Returns today's date formatted as YYYY-MM-DD in Asia/Taipei timezone.
 */
export function getTaipeiTodayDateString(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(now);
}

/**
 * Returns tomorrow's date formatted as YYYY-MM-DD in Asia/Taipei timezone.
 */
export function getTaipeiTomorrowDateString(now: Date = new Date()): string {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return getTaipeiTodayDateString(tomorrow);
}

/**
 * Determines the default selected UV date.
 * Rules:
 * 1. If today exists in availableDates, select today.
 * 2. If today does not exist, select the closest future date.
 * 3. If no future date exists, select the closest past date.
 */
export function findDefaultUvDate(availableDates: readonly string[], now: Date = new Date()): string {
  if (!availableDates || availableDates.length === 0) return "";
  const today = getTaipeiTodayDateString(now);

  if (availableDates.includes(today)) {
    return today;
  }

  // Closest future date
  const futureDates = availableDates.filter((d) => d > today).slice().sort();
  if (futureDates.length > 0) {
    return futureDates[0];
  }

  // Closest past date
  const pastDates = availableDates.filter((d) => d < today).slice().sort().reverse();
  if (pastDates.length > 0) {
    return pastDates[0];
  }

  return availableDates[0];
}

export type DaytimePeriodStatus = "not_started" | "in_progress" | "ended" | "other_day";

export interface DaytimePeriodInfo {
  status: DaytimePeriodStatus;
  statusLabel: string;
  isToday: boolean;
}

/**
 * Computes daytime period status for UV forecasts according to Taipei time.
 * - Today before 06:00: 「今日白天 UV 預報・尚未開始」
 * - Today 06:00～18:00: 「今日白天 UV 預報・適用時段中」
 * - Today after 18:00: 「今日白天 UV 預報・時段已結束」
 * - Non-today: 「白天 UV 預報（06:00～18:00）」
 */
export function getDaytimePeriodStatus(
  forecastDate: string,
  now: Date = new Date()
): DaytimePeriodInfo {
  const taipeiToday = getTaipeiTodayDateString(now);
  const isToday = forecastDate === taipeiToday;

  if (!isToday) {
    return {
      status: "other_day",
      statusLabel: "白天 UV 預報（06:00～18:00）",
      isToday: false,
    };
  }

  const hourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    hour: "numeric",
    hour12: false,
  });
  const minuteFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    minute: "numeric",
  });

  const currentHour = parseInt(hourFormatter.format(now), 10);
  const currentMinute = parseInt(minuteFormatter.format(now), 10);
  const currentMinutes = currentHour * 60 + currentMinute;

  // 06:00 = 360 min, 18:00 = 1080 min
  if (currentMinutes < 360) {
    return {
      status: "not_started",
      statusLabel: "今日白天 UV 預報・尚未開始",
      isToday: true,
    };
  } else if (currentMinutes <= 1080) {
    return {
      status: "in_progress",
      statusLabel: "今日白天 UV 預報・適用時段中",
      isToday: true,
    };
  } else {
    return {
      status: "ended",
      statusLabel: "今日白天 UV 預報・時段已結束",
      isToday: true,
    };
  }
}
