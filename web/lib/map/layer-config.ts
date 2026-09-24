/**
 * Map Layer Definitions & Metadata for Taiwan Interactive Weather Map (M13)
 *
 * Defines 8 switchable weather/air-quality layers:
 * 1. forecast_max_temp: 預報最高溫 (F-D0047-091, 縣市預報)
 * 2. realtime_temp: 即時氣溫 (O-A0003-001, 測站觀測)
 * 3. relative_humidity: 相對濕度 (O-A0003-001, 測站觀測)
 * 4. wind: 風速與風向 (O-A0003-001, 測站觀測)
 * 5. daily_precipitation: 當日降水量 (O-A0003-001, 測站觀測)
 * 6. aqi: AQI 空氣品質指標 (AQX_P_432, 環境部測站)
 * 7. pm25: PM2.5 細懸浮微粒 (AQX_P_432, 環境部測站)
 * 8. uv: 紫外線指數 (F-D0047-091, 縣市預報)
 */

export type MapLayerId =
  | "forecast_max_temp"
  | "realtime_temp"
  | "relative_humidity"
  | "wind"
  | "daily_precipitation"
  | "aqi"
  | "pm25"
  | "uv";

export type MapLayerCategory = "forecast" | "cwa_obs" | "moenv_aqi";

export interface MapLegendItem {
  label: string;
  hex: string;
}

export interface MapLayerConfig {
  id: MapLayerId;
  name: string;
  shortName: string;
  category: MapLayerCategory;
  categoryLabel: string;
  unit: string;
  icon: string;
  isForecast: boolean;
  description: string;
  sourceDataset: string;
  sourceAgency: string;
  legendTitle: string;
  legendItems: MapLegendItem[];
}

export const MAP_LAYERS: readonly MapLayerConfig[] = [
  {
    id: "forecast_max_temp",
    name: "預報最高溫",
    shortName: "預報高溫",
    category: "forecast",
    categoryLabel: "縣市預報",
    unit: "°C",
    icon: "🌡️",
    isForecast: true,
    description: "全臺 22 縣市未來一週預報最高溫（行政中心代表座標）",
    sourceDataset: "CWA F-D0047-091",
    sourceAgency: "交通部中央氣象署",
    legendTitle: "氣溫圖例",
    legendItems: [
      { label: "偏涼 (<20°C)", hex: "#3b82f6" },
      { label: "舒適 (20-24°C)", hex: "#10b981" },
      { label: "偏熱 (25-29°C)", hex: "#f59e0b" },
      { label: "炎熱 (≥30°C)", hex: "#ef4444" },
      { label: "無資料", hex: "#6b7280" },
    ],
  },
  {
    id: "realtime_temp",
    name: "即時氣溫",
    shortName: "即時氣溫",
    category: "cwa_obs",
    categoryLabel: "測站觀測",
    unit: "°C",
    icon: "⏱️",
    isForecast: false,
    description: "氣象觀測站最新即時氣溫（真實 WGS84 座標）",
    sourceDataset: "CWA O-A0003-001",
    sourceAgency: "交通部中央氣象署",
    legendTitle: "氣溫圖例",
    legendItems: [
      { label: "偏涼 (<20°C)", hex: "#3b82f6" },
      { label: "舒適 (20-24°C)", hex: "#10b981" },
      { label: "偏熱 (25-29°C)", hex: "#f59e0b" },
      { label: "炎熱 (≥30°C)", hex: "#ef4444" },
      { label: "無資料", hex: "#6b7280" },
    ],
  },
  {
    id: "relative_humidity",
    name: "相對濕度",
    shortName: "相對濕度",
    category: "cwa_obs",
    categoryLabel: "測站觀測",
    unit: "%",
    icon: "💧",
    isForecast: false,
    description: "氣象觀測站最新相對濕度（真實 WGS84 座標）",
    sourceDataset: "CWA O-A0003-001",
    sourceAgency: "交通部中央氣象署",
    legendTitle: "濕度圖例",
    legendItems: [
      { label: "乾燥 (<50%)", hex: "#eab308" },
      { label: "舒適 (50-69%)", hex: "#10b981" },
      { label: "潮濕 (70-84%)", hex: "#06b6d4" },
      { label: "極潮濕 (≥85%)", hex: "#3b82f6" },
      { label: "無資料", hex: "#6b7280" },
    ],
  },
  {
    id: "wind",
    name: "風速與風向",
    shortName: "風速風向",
    category: "cwa_obs",
    categoryLabel: "測站觀測",
    unit: "m/s",
    icon: "💨",
    isForecast: false,
    description: "氣象觀測站最新風速風向（真實 WGS84 座標）",
    sourceDataset: "CWA O-A0003-001",
    sourceAgency: "交通部中央氣象署",
    legendTitle: "風速圖例",
    legendItems: [
      { label: "微風 (<1.6 m/s)", hex: "#10b981" },
      { label: "和緩 (1.6-5.4 m/s)", hex: "#06b6d4" },
      { label: "清勁 (5.5-10.7 m/s)", hex: "#f59e0b" },
      { label: "強風 (≥10.8 m/s)", hex: "#ef4444" },
      { label: "無資料", hex: "#6b7280" },
    ],
  },
  {
    id: "daily_precipitation",
    name: "當日降水量",
    shortName: "當日雨量",
    category: "cwa_obs",
    categoryLabel: "測站觀測",
    unit: "mm",
    icon: "🌧️",
    isForecast: false,
    description: "氣象觀測站今日 00:00 至今累積降水（真實 WGS84 座標）",
    sourceDataset: "CWA O-A0003-001",
    sourceAgency: "交通部中央氣象署",
    legendTitle: "降水圖例",
    legendItems: [
      { label: "無雨 (0.0 mm)", hex: "#94a3b8" },
      { label: "6h無雨 (-98)", hex: "#64748b" },
      { label: "雨跡 (T)", hex: "#38bdf8" },
      { label: "中雨 (10-39.9 mm)", hex: "#3b82f6" },
      { label: "大雨以上 (≥40 mm)", hex: "#8b5cf6" },
      { label: "缺測／故障", hex: "#6b7280" },
    ],
  },
  {
    id: "aqi",
    name: "AQI 空氣品質",
    shortName: "AQI 指標",
    category: "moenv_aqi",
    categoryLabel: "環境部測站",
    unit: "AQI",
    icon: "🍃",
    isForecast: false,
    description: "環境部空氣品質即時監測站 AQI 指標（真實 WGS84 座標）",
    sourceDataset: "MOENV AQX_P_432",
    sourceAgency: "環境部",
    legendTitle: "AQI 圖例",
    legendItems: [
      { label: "良好 (0-50)", hex: "#10b981" },
      { label: "普通 (51-100)", hex: "#eab308" },
      { label: "敏感不健康 (101-150)", hex: "#f97316" },
      { label: "所有族群不健康 (151-200)", hex: "#ef4444" },
      { label: "非常不健康 (201-300)", hex: "#8b5cf6" },
      { label: "危害 (301-500)", hex: "#7f1d1d" },
      { label: "無資料", hex: "#6b7280" },
    ],
  },
  {
    id: "pm25",
    name: "PM2.5 濃度",
    shortName: "PM2.5",
    category: "moenv_aqi",
    categoryLabel: "環境部測站",
    unit: "μg/m³",
    icon: "🌫️",
    isForecast: false,
    description: "環境部空氣品質即時監測站 PM2.5 數值（真實 WGS84 座標）",
    sourceDataset: "MOENV AQX_P_432",
    sourceAgency: "環境部",
    legendTitle: "PM2.5 圖例",
    legendItems: [
      { label: "低 (≤15.4 μg/m³)", hex: "#10b981" },
      { label: "中 (15.5-35.4 μg/m³)", hex: "#eab308" },
      { label: "高 (35.5-54.4 μg/m³)", hex: "#f97316" },
      { label: "非常高 (≥54.5 μg/m³)", hex: "#ef4444" },
      { label: "無資料", hex: "#6b7280" },
    ],
  },
  {
    id: "uv",
    name: "紫外線指數",
    shortName: "紫外線",
    category: "forecast",
    categoryLabel: "縣市預報",
    unit: "UV",
    icon: "☀️",
    isForecast: true,
    description: "全臺 22 縣市每日白天（06:00～18:00）UV 預報（行政中心代表座標）",
    sourceDataset: "CWA F-D0047-091",
    sourceAgency: "交通部中央氣象署",
    legendTitle: "紫外線圖例",
    legendItems: [
      { label: "低量級 (0-2)", hex: "#10b981" },
      { label: "中量級 (3-5)", hex: "#eab308" },
      { label: "高量級 (6-7)", hex: "#f97316" },
      { label: "過量級 (8-10)", hex: "#ef4444" },
      { label: "危險級 (11+)", hex: "#9333ea" },
      { label: "無資料", hex: "#6b7280" },
    ],
  },
];

export const DEFAULT_MAP_LAYER_ID: MapLayerId = "forecast_max_temp";

export function getLayerConfig(layerId: MapLayerId): MapLayerConfig {
  const found = MAP_LAYERS.find((l) => l.id === layerId);
  return found ?? MAP_LAYERS[0];
}

/**
 * Semantic Zoom thresholds for Taiwan Interactive Weather Map (M13)
 * Tier 1 (zoom <= 8): Overview / County summary (max 1 marker per county, representative stations)
 * Tier 2 (zoom === 9): Station dots (all stations, compact dots, no permanent name, tooltips on hover)
 * Tier 3 (zoom >= 10): Detailed stations (all stations, short name + value badge)
 */
export const MAP_ZOOM_THRESHOLDS = {
  OVERVIEW_MAX: 8,
  STATION_DOTS_MIN: 9,
  STATION_DOTS_MAX: 9,
  DETAILED_MIN: 10,
} as const;

export type MapZoomTier = "overview" | "station_dots" | "detailed";

export function getMapZoomTier(zoom: number): MapZoomTier {
  if (zoom <= MAP_ZOOM_THRESHOLDS.OVERVIEW_MAX) {
    return "overview";
  }
  if (zoom <= MAP_ZOOM_THRESHOLDS.STATION_DOTS_MAX) {
    return "station_dots";
  }
  return "detailed";
}

/**
 * Centrally managed user-friendly label for each semantic zoom tier.
 * Eliminates magic threshold numbers in JSX components.
 */
export function getMapZoomTierLabel(tier: MapZoomTier): string {
  switch (tier) {
    case "overview":
      return `全臺摘要視角 (zoom ≤ ${MAP_ZOOM_THRESHOLDS.OVERVIEW_MAX})`;
    case "station_dots":
      return `測站分佈視角 (zoom ${MAP_ZOOM_THRESHOLDS.STATION_DOTS_MIN})`;
    case "detailed":
      return `詳細測站視角 (zoom ≥ ${MAP_ZOOM_THRESHOLDS.DETAILED_MIN})`;
  }
}

