/**
 * Multi-layer Map Marker Generation, Semantic Zoom & Classifications (M13)
 *
 * Implements pure transformation logic for all 8 weather & air-quality map layers:
 * - 預報最高溫 (F-D0047-091, 縣市預報)
 * - 即時氣溫 (O-A0003-001, 測站觀測)
 * - 相對濕度 (O-A0003-001, 測站觀測)
 * - 風速與風向 (O-A0003-001, 測站觀測, 990 顯示風向不定)
 * - 當日降水量 (O-A0003-001, 測站觀測, 保留 T, -98, -99, X 語意)
 * - AQI (AQX_P_432, 環境部六級分類)
 * - PM2.5 (AQX_P_432, 單位 μg/m³)
 * - 紫外線 (F-D0047-091, 06:00~18:00 白天預報, CWA五級分類)
 *
 * Semantic Zoom Architecture (3 Tiers):
 * - Tier 1: Overview (zoom <= 7): 22 county summary markers.
 *   - CWA layers: representative station closest to county centroid (no averaging).
 *   - AQI layer: worst station in county (max AQI summary, no averaging).
 *   - PM2.5 layer: representative MOENV station closest to county centroid (no averaging).
 *   - Forecast/UV layers: 22 county forecast data.
 *   - Missing data: shows "—" with gray color, never 0.
 * - Tier 2: Station dots (zoom 8..9): all stations as compact colored dots, no permanent name, tooltips on hover.
 * - Tier 3: Detailed stations (zoom >= 10): all stations with short names & badges.
 */

import { NormalizedForecastData } from "../contracts/weather";
import { NormalizedObservationData, PrecipitationStatus } from "../contracts/observations";
import { NormalizedAirQualityData, NormalizedStationAirQuality } from "../contracts/air-quality";
import {
  MapLayerId,
  MapLayerCategory,
  getLayerConfig,
  MapZoomTier,
  getMapZoomTier,
} from "./layer-config";
import { TAIWAN_COUNTY_COORDINATES, EXPECTED_TAIWAN_REGIONS } from "../data/county-coordinates";
import { aggregateDailyForecasts, formatTaipeiDateTime } from "../transformations/daily";
import { formatWindDirection } from "../transformations/wind";
import { getPrecipitationDescription } from "../transformations/precipitation";
import {
  getAqiCategory,
  normalizeCountyName,
  filterAirQualityStationsByCounty,
  computeCountyAqiSummary,
} from "../transformations/air-quality";
import {
  filterStationsByCounty,
  findClosestStation,
  haversineDistanceKm,
} from "../transformations/stations";
import { classifyUV } from "../transformations/uv";
import {
  getTemperatureColorStyle,
  CountyMapMarkerData,
} from "./marker-helpers";

export interface LayerMarkerColorStyle {
  category: string;
  hex: string;
  label: string;
}

export interface UnifiedMapMarker extends Omit<CountyMapMarkerData, "colorStyle"> {
  colorStyle: LayerMarkerColorStyle;
  id: string;
  title: string;
  stationId?: string;
  layerId: MapLayerId;
  layerCategory: MapLayerCategory;
  categoryLabel: string;
  badgeName: string;
  badgeValue: string;
  colorHex: string;
  tooltipText: string;
  popupTitle: string;
  popupSubtitle: string;
  popupRows: Array<{ label: string; value: string; color?: string }>;
  isCountySummary?: boolean;
  representativeStationName?: string;
  targetLatitude?: number;
  targetLongitude?: number;
  zoomTier?: MapZoomTier;
}

/**
 * Temperature color classification (<20, 20-24, 25-29, >=30, null).
 */
export function getTemperatureColor(temp: number | null | undefined): { hex: string; label: string } {
  const style = getTemperatureColorStyle(temp);
  return { hex: style.hex, label: style.label };
}

/**
 * Relative Humidity color classification (<50%, 50-69%, 70-84%, >=85%, null).
 */
export function getHumidityColor(rh: number | null | undefined): { hex: string; label: string } {
  if (rh === null || rh === undefined || !Number.isFinite(rh)) {
    return { hex: "#6b7280", label: "無資料" };
  }
  if (rh < 50) {
    return { hex: "#eab308", label: "乾燥 (<50%)" };
  }
  if (rh < 70) {
    return { hex: "#10b981", label: "舒適 (50-69%)" };
  }
  if (rh < 85) {
    return { hex: "#06b6d4", label: "潮濕 (70-84%)" };
  }
  return { hex: "#3b82f6", label: "極潮濕 (≥85%)" };
}

/**
 * Wind speed color classification (Beaufort brackets: <1.6, 1.6-5.4, 5.5-10.7, >=10.8 m/s, null).
 */
export function getWindColor(speed: number | null | undefined): { hex: string; label: string } {
  if (speed === null || speed === undefined || !Number.isFinite(speed)) {
    return { hex: "#6b7280", label: "無資料" };
  }
  if (speed < 1.6) {
    return { hex: "#10b981", label: "微風 (<1.6 m/s)" };
  }
  if (speed < 5.5) {
    return { hex: "#06b6d4", label: "和緩 (1.6-5.4 m/s)" };
  }
  if (speed < 10.8) {
    return { hex: "#f59e0b", label: "清勁 (5.5-10.7 m/s)" };
  }
  return { hex: "#ef4444", label: "強風 (≥10.8 m/s)" };
}

/**
 * Daily precipitation color classification:
 * - 正常數值 0.0: #94a3b8 ("無雨 (0.0 mm)")
 * - -98 / none_6hr: #64748b ("6h無雨 (-98)")
 * - T / trace: #38bdf8 ("雨跡 (T)")
 * - 小雨 (0.1-9.9 mm): #38bdf8 ("小雨 (0.1-9.9 mm)")
 * - 中雨 (10.0-39.9 mm): #3b82f6 ("中雨 (10.0-39.9 mm)")
 * - 大雨以上 (≥40.0 mm): #8b5cf6 ("大雨以上 (≥40.0 mm)")
 * - 缺測 / missing: #6b7280 ("缺測")
 * - 故障 / fault / error: #6b7280 ("故障")
 */
export function getPrecipitationColor(
  precip: number | null | undefined,
  status: PrecipitationStatus | string
): { hex: string; label: string } {
  if (status === "missing") {
    return { hex: "#6b7280", label: "缺測" };
  }
  if (status === "fault" || status === "error") {
    return { hex: "#6b7280", label: "故障" };
  }
  if (status === "none_6hr" || status === "none") {
    return { hex: "#64748b", label: "6h無雨 (-98)" };
  }
  if (status === "trace") {
    return { hex: "#38bdf8", label: "雨跡 (T)" };
  }
  if ((status === "normal" || status === "measured") && precip === 0) {
    return { hex: "#94a3b8", label: "無雨 (0.0 mm)" };
  }
  if (
    (status === "normal" || status === "measured") &&
    precip !== null &&
    precip !== undefined &&
    Number.isFinite(precip)
  ) {
    if (precip < 10) {
      return { hex: "#38bdf8", label: "小雨 (0.1-9.9 mm)" };
    }
    if (precip < 40) {
      return { hex: "#3b82f6", label: "中雨 (10.0-39.9 mm)" };
    }
    return { hex: "#8b5cf6", label: "大雨以上 (≥40.0 mm)" };
  }
  if (precip !== null && precip !== undefined && Number.isFinite(precip)) {
    if (precip === 0) {
      return { hex: "#94a3b8", label: "無雨 (0.0 mm)" };
    }
    if (precip < 10) {
      return { hex: "#38bdf8", label: "小雨 (0.1-9.9 mm)" };
    }
    if (precip < 40) {
      return { hex: "#3b82f6", label: "中雨 (10.0-39.9 mm)" };
    }
    return { hex: "#8b5cf6", label: "大雨以上 (≥40.0 mm)" };
  }
  return { hex: "#6b7280", label: "缺測" };
}

/**
 * PM2.5 color classification (<=15.4, 15.5-35.4, 35.5-54.4, >=54.5 μg/m³, null).
 */
export function getPm25Color(pm25: number | null | undefined): { hex: string; label: string } {
  if (pm25 === null || pm25 === undefined || !Number.isFinite(pm25)) {
    return { hex: "#6b7280", label: "無資料" };
  }
  if (pm25 <= 15.4) {
    return { hex: "#10b981", label: "低 (≤15.4 μg/m³)" };
  }
  if (pm25 <= 35.4) {
    return { hex: "#eab308", label: "中 (15.5-35.4 μg/m³)" };
  }
  if (pm25 <= 54.4) {
    return { hex: "#f97316", label: "高 (35.5-54.4 μg/m³)" };
  }
  return { hex: "#ef4444", label: "非常高 (≥54.5 μg/m³)" };
}

/**
 * Finds the closest MOENV station to target coordinates with deterministic tie-breaking on stationId.
 */
export function findClosestAqiStation(
  stations: readonly NormalizedStationAirQuality[],
  targetLat: number,
  targetLon: number
): NormalizedStationAirQuality | null {
  if (!stations || stations.length === 0) return null;
  let closest: NormalizedStationAirQuality | null = null;
  let minDistance = Infinity;

  for (const station of stations) {
    if (
      station.latitude === null ||
      station.longitude === null ||
      !Number.isFinite(station.latitude) ||
      !Number.isFinite(station.longitude)
    ) {
      continue;
    }
    const dist = haversineDistanceKm(
      targetLat,
      targetLon,
      station.latitude,
      station.longitude
    );
    if (dist < minDistance) {
      minDistance = dist;
      closest = station;
    } else if (dist === minDistance && closest !== null) {
      if (station.stationId < closest.stationId) {
        closest = station;
      }
    }
  }
  return closest;
}

export interface PrepareLayerMarkersOptions {
  layerId: MapLayerId;
  mapDate: string;
  forecastData?: NormalizedForecastData | null;
  observationData?: NormalizedObservationData | null;
  airQualityData?: NormalizedAirQualityData | null;
  zoom?: number;
  zoomTier?: MapZoomTier;
}

/**
 * Prepares county summary markers for Tier 1 (zoom <= 7).
 * Strictly enforces:
 * - Max 1 marker per county (22 counties total)
 * - Representative stations chosen deterministically via distance to county centroid
 * - No averaging across stations
 * - Explicit data source explanation in popups
 * - Missing data represented as "—", never 0
 */
export function prepareCountySummaryMarkers(options: PrepareLayerMarkersOptions): UnifiedMapMarker[] {
  const { layerId, mapDate, forecastData, observationData, airQualityData } = options;
  const config = getLayerConfig(layerId);

  // 1. Forecast Max Temperature (F-D0047-091)
  if (layerId === "forecast_max_temp") {
    const regionDailyLookup = new Map<string, ReturnType<typeof aggregateDailyForecasts>[number]>();
    if (forecastData?.regions) {
      for (const reg of forecastData.regions) {
        const daily = aggregateDailyForecasts(reg.intervals);
        const matched = daily.find((d) => d.forecastDate === mapDate);
        if (matched) {
          regionDailyLookup.set(reg.region, matched);
        }
      }
    }

    return EXPECTED_TAIWAN_REGIONS.map((regionName) => {
      const coords = TAIWAN_COUNTY_COORDINATES[regionName];
      const dayData = regionDailyLookup.get(regionName);
      const maxTemp = dayData?.maxTemp ?? null;
      const minTemp = dayData?.minTemp ?? null;
      const intervalCount = dayData?.intervalCount ?? 0;
      const isPartial = dayData?.isPartial ?? true;
      const colorStyle = getTemperatureColorStyle(maxTemp);

      const maxDisplay = maxTemp !== null && Number.isFinite(maxTemp) ? `${maxTemp.toFixed(1)} °C` : "無資料";
      const minDisplay = minTemp !== null && Number.isFinite(minTemp) ? `${minTemp.toFixed(1)} °C` : "無資料";
      const badgeValue = maxTemp !== null && Number.isFinite(maxTemp) ? `${Math.round(maxTemp)}°` : "—";

      return {
        id: `summary-forecast-${regionName}`,
        region: regionName,
        title: regionName,
        latitude: coords.latitude,
        longitude: coords.longitude,
        targetLatitude: coords.latitude,
        targetLongitude: coords.longitude,
        forecastDate: mapDate,
        minTemp,
        maxTemp,
        intervalCount,
        isPartial,
        colorStyle,
        layerId,
        layerCategory: config.category,
        categoryLabel: config.categoryLabel,
        badgeName: regionName.slice(0, 2),
        badgeValue,
        colorHex: colorStyle.hex,
        tooltipText: `${regionName}: 預報最高溫 ${badgeValue}`,
        popupTitle: `📍 ${regionName}`,
        popupSubtitle: `📅 預報日期：${mapDate}（縣市預報）`,
        popupRows: [
          { label: "🔥 預報最高溫", value: maxDisplay, color: maxTemp !== null && maxTemp >= 30 ? "#ef4444" : undefined },
          { label: "❄️ 預報最低溫", value: minDisplay },
          { label: "📝 資料說明", value: "氣象署縣市預報" },
          { label: "📊 預報時段", value: `${isPartial ? "部分資料" : "完整預報"} (${intervalCount} 個時段)` },
        ],
        isCountySummary: true,
        zoomTier: "overview",
      };
    });
  }

  // 2. Real-time Temperature (O-A0003-001) - County Representative Station
  if (layerId === "realtime_temp") {
    return EXPECTED_TAIWAN_REGIONS.map((regionName) => {
      const coords = TAIWAN_COUNTY_COORDINATES[regionName];
      const countyStations = filterStationsByCounty(observationData?.stations ?? [], regionName);
      const validStations = countyStations.filter(
        (s) => s.temperature !== null && Number.isFinite(s.temperature) && Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
      );
      const repStation = findClosestStation(
        validStations.length > 0 ? validStations : countyStations,
        coords.latitude,
        coords.longitude
      );

      const hasValid = repStation !== null && repStation.temperature !== null && Number.isFinite(repStation.temperature);
      const temp = hasValid ? (repStation!.temperature as number) : null;
      const color = getTemperatureColor(temp);
      const badgeValue = temp !== null ? `${Math.round(temp)}°` : "—";
      const tempDisplay = temp !== null ? `${temp.toFixed(1)} °C` : "無資料";
      const timeDisplay = repStation?.observedAt ? formatTaipeiDateTime(repStation.observedAt) : "—";

      return {
        id: `summary-cwa-temp-${regionName}`,
        region: regionName,
        stationId: repStation?.stationId,
        representativeStationName: repStation?.stationName,
        title: regionName,
        latitude: coords.latitude,
        longitude: coords.longitude,
        targetLatitude: repStation?.latitude ?? coords.latitude,
        targetLongitude: repStation?.longitude ?? coords.longitude,
        forecastDate: mapDate,
        minTemp: temp,
        maxTemp: temp,
        intervalCount: 1,
        isPartial: false,
        colorStyle: { category: "cwa", hex: color.hex, label: color.label },
        layerId,
        layerCategory: config.category,
        categoryLabel: config.categoryLabel,
        badgeName: regionName.slice(0, 2),
        badgeValue,
        colorHex: color.hex,
        tooltipText: repStation
          ? `${regionName}: 即時氣溫 ${tempDisplay}（代表測站：${repStation.stationName}）`
          : `${regionName}: 即時氣溫 無資料`,
        popupTitle: `📍 ${regionName}（縣市摘要）`,
        popupSubtitle: `⏱️ 觀測時間：${timeDisplay}（氣象署觀測）`,
        popupRows: repStation
          ? [
              { label: "📡 代表測站", value: `${repStation.stationName}測站 (${repStation.stationId})` },
              { label: "🌡️ 即時氣溫", value: tempDisplay },
              { label: "📝 資料說明", value: "代表測站觀測（非全縣市平均）" },
              { label: "📍 所屬行政區", value: `${repStation.county}${repStation.town ? " " + repStation.town : ""}` },
            ]
          : [
              { label: "⚠️ 觀測狀態", value: "該縣市目前無有效測站資料" },
              { label: "📝 資料說明", value: "缺測不補 0" },
            ],
        isCountySummary: true,
        zoomTier: "overview",
      };
    });
  }

  // 3. Relative Humidity (O-A0003-001) - County Representative Station
  if (layerId === "relative_humidity") {
    return EXPECTED_TAIWAN_REGIONS.map((regionName) => {
      const coords = TAIWAN_COUNTY_COORDINATES[regionName];
      const countyStations = filterStationsByCounty(observationData?.stations ?? [], regionName);
      const validStations = countyStations.filter(
        (s) => s.relativeHumidity !== null && Number.isFinite(s.relativeHumidity) && Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
      );
      const repStation = findClosestStation(
        validStations.length > 0 ? validStations : countyStations,
        coords.latitude,
        coords.longitude
      );

      const hasValid = repStation !== null && repStation.relativeHumidity !== null && Number.isFinite(repStation.relativeHumidity);
      const rh = hasValid ? (repStation!.relativeHumidity as number) : null;
      const color = getHumidityColor(rh);
      const badgeValue = rh !== null ? `${Math.round(rh)}%` : "—";
      const rhDisplay = rh !== null ? `${Math.round(rh)} %` : "無資料";
      const tempDisplay = repStation?.temperature !== null && repStation?.temperature !== undefined ? `${repStation.temperature.toFixed(1)} °C` : "—";
      const timeDisplay = repStation?.observedAt ? formatTaipeiDateTime(repStation.observedAt) : "—";

      return {
        id: `summary-cwa-rh-${regionName}`,
        region: regionName,
        stationId: repStation?.stationId,
        representativeStationName: repStation?.stationName,
        title: regionName,
        latitude: coords.latitude,
        longitude: coords.longitude,
        targetLatitude: repStation?.latitude ?? coords.latitude,
        targetLongitude: repStation?.longitude ?? coords.longitude,
        forecastDate: mapDate,
        minTemp: null,
        maxTemp: null,
        intervalCount: 1,
        isPartial: false,
        colorStyle: { category: "humidity", hex: color.hex, label: color.label },
        layerId,
        layerCategory: config.category,
        categoryLabel: config.categoryLabel,
        badgeName: regionName.slice(0, 2),
        badgeValue,
        colorHex: color.hex,
        tooltipText: repStation
          ? `${regionName}: 相對濕度 ${rhDisplay}（代表測站：${repStation.stationName}）`
          : `${regionName}: 相對濕度 無資料`,
        popupTitle: `📍 ${regionName}（縣市摘要）`,
        popupSubtitle: `⏱️ 觀測時間：${timeDisplay}（氣象署觀測）`,
        popupRows: repStation
          ? [
              { label: "📡 代表測站", value: `${repStation.stationName}測站` },
              { label: "💧 相對濕度", value: rhDisplay },
              { label: "🌡️ 即時氣溫", value: tempDisplay },
              { label: "📝 資料說明", value: "代表測站觀測（非全縣市平均）" },
              { label: "📍 所屬行政區", value: `${repStation.county}${repStation.town ? " " + repStation.town : ""}` },
            ]
          : [
              { label: "⚠️ 觀測狀態", value: "該縣市目前無有效測站資料" },
              { label: "📝 資料說明", value: "缺測不補 0" },
            ],
        isCountySummary: true,
        zoomTier: "overview",
      };
    });
  }

  // 4. Wind Speed & Direction (O-A0003-001) - County Representative Station
  if (layerId === "wind") {
    return EXPECTED_TAIWAN_REGIONS.map((regionName) => {
      const coords = TAIWAN_COUNTY_COORDINATES[regionName];
      const countyStations = filterStationsByCounty(observationData?.stations ?? [], regionName);
      const validStations = countyStations.filter(
        (s) => s.windSpeed !== null && Number.isFinite(s.windSpeed) && Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
      );
      const repStation = findClosestStation(
        validStations.length > 0 ? validStations : countyStations,
        coords.latitude,
        coords.longitude
      );

      const hasValid = repStation !== null && repStation.windSpeed !== null && Number.isFinite(repStation.windSpeed);
      const speed = hasValid ? (repStation!.windSpeed as number) : null;
      const color = getWindColor(speed);
      const badgeValue = speed !== null ? speed.toFixed(1) : "—";
      const speedDisplay = speed !== null ? `${speed.toFixed(1)} m/s` : "無資料";
      const dirDisplay = repStation ? formatWindDirection(repStation.windDirection) : "—";
      const timeDisplay = repStation?.observedAt ? formatTaipeiDateTime(repStation.observedAt) : "—";

      return {
        id: `summary-cwa-wind-${regionName}`,
        region: regionName,
        stationId: repStation?.stationId,
        representativeStationName: repStation?.stationName,
        title: regionName,
        latitude: coords.latitude,
        longitude: coords.longitude,
        targetLatitude: repStation?.latitude ?? coords.latitude,
        targetLongitude: repStation?.longitude ?? coords.longitude,
        forecastDate: mapDate,
        minTemp: null,
        maxTemp: null,
        intervalCount: 1,
        isPartial: false,
        colorStyle: { category: "wind", hex: color.hex, label: color.label },
        layerId,
        layerCategory: config.category,
        categoryLabel: config.categoryLabel,
        badgeName: regionName.slice(0, 2),
        badgeValue,
        colorHex: color.hex,
        tooltipText: repStation
          ? `${regionName}: 風速 ${speedDisplay} (${dirDisplay})（代表測站：${repStation.stationName}）`
          : `${regionName}: 風速 無資料`,
        popupTitle: `📍 ${regionName}（縣市摘要）`,
        popupSubtitle: `⏱️ 觀測時間：${timeDisplay}（氣象署觀測）`,
        popupRows: repStation
          ? [
              { label: "📡 代表測站", value: `${repStation.stationName}測站` },
              { label: "💨 風速", value: speedDisplay },
              { label: "🧭 風向", value: dirDisplay },
              { label: "📝 資料說明", value: "代表測站觀測（非全縣市平均）" },
              { label: "📍 所屬行政區", value: `${repStation.county}${repStation.town ? " " + repStation.town : ""}` },
            ]
          : [
              { label: "⚠️ 觀測狀態", value: "該縣市目前無有效測站資料" },
              { label: "📝 資料說明", value: "缺測不補 0" },
            ],
        isCountySummary: true,
        zoomTier: "overview",
      };
    });
  }

  // 5. Daily Cumulative Precipitation (O-A0003-001) - County Representative Station
  if (layerId === "daily_precipitation") {
    return EXPECTED_TAIWAN_REGIONS.map((regionName) => {
      const coords = TAIWAN_COUNTY_COORDINATES[regionName];
      const countyStations = filterStationsByCounty(observationData?.stations ?? [], regionName);
      const validStations = countyStations.filter(
        (s) =>
          s.precipitationStatus !== "missing" &&
          s.precipitationStatus !== "fault" &&
          Number.isFinite(s.latitude) &&
          Number.isFinite(s.longitude)
      );
      const repStation = findClosestStation(
        validStations.length > 0 ? validStations : countyStations,
        coords.latitude,
        coords.longitude
      );

      let badgeValue = "—";
      let displayPrecip = "—";
      let displayDesc = "當日降水狀況";
      let color = { hex: "#6b7280", label: "缺測" };
      const timeDisplay = repStation?.observedAt ? formatTaipeiDateTime(repStation.observedAt) : "—";

      if (repStation) {
        const precip = repStation.dailyPrecipitation;
        const status = repStation.precipitationStatus;
        color = getPrecipitationColor(precip, status);

        if (status === "trace") {
          badgeValue = "雨跡";
          displayPrecip = "雨跡（未達 0.1 mm）";
          displayDesc = "微量降水 (未達 0.1 mm)";
        } else if (status === "none_6hr" || (status as string) === "none") {
          badgeValue = "6h無雨";
          displayPrecip = "連續 6 小時無降水";
          displayDesc = "過去連續 6 小時未有降雨記錄";
        } else if (status === "missing") {
          badgeValue = "缺測";
          displayPrecip = "缺測";
          displayDesc = "測站缺測或未設置雨量計";
        } else if (status === "fault" || (status as string) === "error") {
          badgeValue = "故障";
          displayPrecip = "故障";
          displayDesc = "測站雨量感應器故障";
        } else if (
          (status === "normal" || (status as string) === "measured") &&
          precip === 0
        ) {
          badgeValue = "0";
          displayPrecip = "0.0 mm";
          displayDesc = "今日 00:00 至今尚無降水";
        } else if (
          (status === "normal" || (status as string) === "measured") &&
          precip !== null &&
          Number.isFinite(precip)
        ) {
          badgeValue = precip.toFixed(1);
          displayPrecip = `${precip.toFixed(1)} mm`;
          displayDesc = getPrecipitationDescription(precip, status);
        } else if (precip !== null && Number.isFinite(precip)) {
          if (precip === 0) {
            badgeValue = "0";
            displayPrecip = "0.0 mm";
            displayDesc = "今日 00:00 至今尚無降水";
          } else {
            badgeValue = precip.toFixed(1);
            displayPrecip = `${precip.toFixed(1)} mm`;
            displayDesc = getPrecipitationDescription(precip, status);
          }
        }
      }

      return {
        id: `summary-cwa-precip-${regionName}`,
        region: regionName,
        stationId: repStation?.stationId,
        representativeStationName: repStation?.stationName,
        title: regionName,
        latitude: coords.latitude,
        longitude: coords.longitude,
        targetLatitude: repStation?.latitude ?? coords.latitude,
        targetLongitude: repStation?.longitude ?? coords.longitude,
        forecastDate: mapDate,
        minTemp: null,
        maxTemp: null,
        intervalCount: 1,
        isPartial: false,
        colorStyle: { category: "precip", hex: color.hex, label: color.label },
        layerId,
        layerCategory: config.category,
        categoryLabel: config.categoryLabel,
        badgeName: regionName.slice(0, 2),
        badgeValue,
        colorHex: color.hex,
        tooltipText: repStation
          ? `${regionName}: 當日降水量 ${displayPrecip}（代表測站：${repStation.stationName}）`
          : `${regionName}: 當日降水量 無資料`,
        popupTitle: `📍 ${regionName}（縣市摘要）`,
        popupSubtitle: `⏱️ 觀測時間：${timeDisplay}（氣象署觀測）`,
        popupRows: repStation
          ? [
              { label: "📡 代表測站", value: `${repStation.stationName}測站` },
              { label: "🌧️ 當日降水量", value: displayPrecip },
              { label: "📝 狀態說明", value: displayDesc },
              { label: "ℹ️ 資料說明", value: "代表測站觀測（非全縣市平均）" },
              { label: "📍 所屬行政區", value: `${repStation.county}${repStation.town ? " " + repStation.town : ""}` },
            ]
          : [
              { label: "⚠️ 觀測狀態", value: "該縣市目前無有效測站資料" },
              { label: "📝 資料說明", value: "缺測不補 0" },
            ],
        isCountySummary: true,
        zoomTier: "overview",
      };
    });
  }

  // 6. AQI (AQX_P_432) - County Maximum AQI / Worst Station Summary
  if (layerId === "aqi") {
    const stationsWithCoords = (airQualityData?.stations ?? []).filter(
      (s) => s.latitude !== null && s.longitude !== null && Number.isFinite(s.latitude) && Number.isFinite(s.longitude)
    );

    return EXPECTED_TAIWAN_REGIONS.map((regionName) => {
      const coords = TAIWAN_COUNTY_COORDINATES[regionName];
      const countyStations = filterAirQualityStationsByCounty(stationsWithCoords, regionName);
      const summary = computeCountyAqiSummary(stationsWithCoords, regionName);
      const repStation = stationsWithCoords.find((s) => s.stationId === summary.sourceStationId);
      const fallbackStation = countyStations[0];
      const effectiveStationId = summary.sourceStationId ?? fallbackStation?.stationId ?? undefined;
      const cat = getAqiCategory(summary.maxAqi);
      const hasValid = summary.maxAqi !== null && Number.isFinite(summary.maxAqi);
      const badgeValue = hasValid ? String(Math.round(summary.maxAqi!)) : "—";
      const aqiDisplay = hasValid ? `${Math.round(summary.maxAqi!)} (${summary.status || cat.level})` : "無資料";
      const timeDisplay = summary.publishedAt
        ? formatTaipeiDateTime(summary.publishedAt)
        : fallbackStation?.publishedAt
        ? formatTaipeiDateTime(fallbackStation.publishedAt)
        : "—";

      return {
        id: `summary-moenv-aqi-${regionName}`,
        region: regionName,
        stationId: effectiveStationId,
        representativeStationName: summary.sourceStationName ?? fallbackStation?.stationName ?? undefined,
        title: regionName,
        latitude: coords.latitude,
        longitude: coords.longitude,
        targetLatitude: repStation?.latitude ?? fallbackStation?.latitude ?? coords.latitude,
        targetLongitude: repStation?.longitude ?? fallbackStation?.longitude ?? coords.longitude,
        forecastDate: mapDate,
        minTemp: null,
        maxTemp: null,
        intervalCount: 1,
        isPartial: false,
        colorStyle: { category: "aqi", hex: cat.color, label: cat.level },
        layerId,
        layerCategory: config.category,
        categoryLabel: config.categoryLabel,
        badgeName: regionName.slice(0, 2),
        badgeValue,
        colorHex: cat.color,
        tooltipText: hasValid
          ? `${regionName}: AQI ${aqiDisplay}（最差測站：${summary.sourceStationName}，非縣市平均）`
          : `${regionName}: AQI 無資料`,
        popupTitle: `📍 ${regionName}（縣市摘要）`,
        popupSubtitle: `⏱️ 發布時間：${timeDisplay}（環境部空氣監測站）`,
        popupRows: hasValid
          ? [
              { label: "📡 來源測站", value: `${summary.sourceStationName}測站（全縣市最高 AQI / 最差測站）` },
              { label: "🍃 AQI 指標", value: aqiDisplay, color: cat.color },
              { label: "📝 資料說明", value: "全縣市最高 AQI 最差測站摘要（非縣市平均）" },
              { label: "⚠️ 主要污染物", value: summary.primaryPollutant || "無 / 一般" },
              { label: "🌫️ PM2.5 濃度", value: summary.pm25 !== null ? `${summary.pm25} μg/m³` : "—" },
              { label: "💨 PM10 濃度", value: summary.pm10 !== null ? `${summary.pm10} μg/m³` : "—" },
            ]
          : [
              { label: "⚠️ 監測狀態", value: "該縣市目前無有效空氣品質監測資料" },
              { label: "📝 資料說明", value: "缺測不補 0" },
            ],
        isCountySummary: true,
        zoomTier: "overview",
      };
    });
  }

  // 7. PM2.5 (AQX_P_432) - County Representative MOENV Station (Do NOT Average!)
  if (layerId === "pm25") {
    return EXPECTED_TAIWAN_REGIONS.map((regionName) => {
      const coords = TAIWAN_COUNTY_COORDINATES[regionName];
      const countyStations = filterAirQualityStationsByCounty(airQualityData?.stations ?? [], regionName);
      const validStations = countyStations.filter(
        (s) => s.pm25 !== null && Number.isFinite(s.pm25) && s.latitude !== null && s.longitude !== null
      );
      const repStation = findClosestAqiStation(
        validStations.length > 0 ? validStations : countyStations,
        coords.latitude,
        coords.longitude
      );

      const hasValid = repStation !== null && repStation.pm25 !== null && Number.isFinite(repStation.pm25);
      const pm25 = hasValid ? (repStation!.pm25 as number) : null;
      const color = getPm25Color(pm25);
      const badgeValue = pm25 !== null ? String(Math.round(pm25)) : "—";
      const pm25Display = pm25 !== null ? `${pm25.toFixed(1)} μg/m³` : "無資料";
      const timeDisplay = repStation?.publishedAt ? formatTaipeiDateTime(repStation.publishedAt) : "—";

      return {
        id: `summary-moenv-pm25-${regionName}`,
        region: regionName,
        stationId: repStation?.stationId,
        representativeStationName: repStation?.stationName,
        title: regionName,
        latitude: coords.latitude,
        longitude: coords.longitude,
        targetLatitude: repStation?.latitude ?? coords.latitude,
        targetLongitude: repStation?.longitude ?? coords.longitude,
        forecastDate: mapDate,
        minTemp: null,
        maxTemp: null,
        intervalCount: 1,
        isPartial: false,
        colorStyle: { category: "pm25", hex: color.hex, label: color.label },
        layerId,
        layerCategory: config.category,
        categoryLabel: config.categoryLabel,
        badgeName: regionName.slice(0, 2),
        badgeValue,
        colorHex: color.hex,
        tooltipText: repStation
          ? `${regionName}: PM2.5 ${pm25Display}（代表測站：${repStation.stationName}，非縣市平均）`
          : `${regionName}: PM2.5 無資料`,
        popupTitle: `📍 ${regionName}（縣市摘要）`,
        popupSubtitle: `⏱️ 發布時間：${timeDisplay}（環境部空氣監測站）`,
        popupRows: repStation
          ? [
              { label: "📡 代表測站", value: `${repStation.stationName}測站` },
              { label: "🌫️ PM2.5 濃度", value: pm25Display },
              { label: "📝 資料說明", value: "代表測站監測（非全縣市平均）" },
              { label: "🍃 AQI 指標", value: repStation.aqi !== null ? `${repStation.aqi} (${repStation.status || "—"})` : "—" },
              { label: "💨 PM10 濃度", value: repStation.pm10 !== null ? `${repStation.pm10} μg/m³` : "—" },
            ]
          : [
              { label: "⚠️ 監測狀態", value: "該縣市目前無有效空氣品質監測資料" },
              { label: "📝 資料說明", value: "缺測不補 0" },
            ],
        isCountySummary: true,
        zoomTier: "overview",
      };
    });
  }

  // 8. UV Index (F-D0047-091) - County Forecast
  if (layerId === "uv") {
    const regionUvLookup = new Map<string, ReturnType<typeof classifyUV> & { uvIndex: number | null }>();
    if (forecastData?.regions) {
      for (const reg of forecastData.regions) {
        const uvList = reg.uvForecasts ?? [];
        const matched = uvList.find((u) => u.forecastDate === mapDate);
        if (matched) {
          const cat = classifyUV(matched.uvIndex);
          regionUvLookup.set(reg.region, { ...cat, uvIndex: matched.uvIndex });
        }
      }
    }

    return EXPECTED_TAIWAN_REGIONS.map((regionName) => {
      const coords = TAIWAN_COUNTY_COORDINATES[regionName];
      const uvInfo = regionUvLookup.get(regionName);
      const cat = uvInfo ?? classifyUV(null);
      const uvIndex = uvInfo?.uvIndex ?? null;

      const badgeValue = uvIndex !== null ? `UV ${cat.displayValue}` : "UV —";
      const displayVal = uvIndex !== null ? `${cat.displayValue}（${cat.level}）` : "無資料";

      return {
        id: `summary-uv-${regionName}`,
        region: regionName,
        title: regionName,
        latitude: coords.latitude,
        longitude: coords.longitude,
        targetLatitude: coords.latitude,
        targetLongitude: coords.longitude,
        forecastDate: mapDate,
        minTemp: null,
        maxTemp: null,
        intervalCount: 1,
        isPartial: false,
        colorStyle: { category: "uv", hex: cat.color, label: cat.level },
        layerId,
        layerCategory: config.category,
        categoryLabel: config.categoryLabel,
        badgeName: regionName.slice(0, 2),
        badgeValue,
        colorHex: cat.color,
        tooltipText: `${regionName}: 白天 UV ${displayVal}`,
        popupTitle: `📍 ${regionName}`,
        popupSubtitle: `📅 預報日期：${mapDate}（白天 06:00～18:00 預報）`,
        popupRows: [
          { label: "☀️ 紫外線指數", value: displayVal, color: cat.color },
          { label: "🛡️ 防護建議", value: cat.protectionAdvice },
          { label: "📝 資料說明", value: "氣象署縣市預報" },
          { label: "⏰ 適用時段", value: "06:00 ～ 18:00（白天預報）" },
        ],
        isCountySummary: true,
        zoomTier: "overview",
      };
    });
  }

  return [];
}

/**
 * Prepares detailed station markers for Tier 2 (Station dots, zoom 8..9) and Tier 3 (Detailed, zoom >= 10).
 */
export function prepareDetailedStationMarkers(
  options: PrepareLayerMarkersOptions,
  tier: MapZoomTier
): UnifiedMapMarker[] {
  const { layerId, mapDate, observationData, airQualityData } = options;
  const config = getLayerConfig(layerId);

  // 1. Real-time Temperature (O-A0003-001)
  if (layerId === "realtime_temp") {
    if (!observationData || !observationData.stations || observationData.stations.length === 0) {
      return [];
    }

    return observationData.stations
      .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .map((station) => {
        const temp = station.temperature;
        const color = getTemperatureColor(temp);
        const badgeValue = temp !== null && Number.isFinite(temp) ? `${Math.round(temp)}°` : "—";
        const tempDisplay = temp !== null && Number.isFinite(temp) ? `${temp.toFixed(1)} °C` : "無資料";
        const timeDisplay = station.observedAt ? formatTaipeiDateTime(station.observedAt) : "—";
        const locationDesc = `${station.county}${station.town ? " " + station.town : ""}`;

        return {
          id: `cwa-${station.stationId}`,
          region: station.county,
          stationId: station.stationId,
          title: `${station.stationName}測站`,
          latitude: station.latitude,
          longitude: station.longitude,
          forecastDate: mapDate,
          minTemp: temp,
          maxTemp: temp,
          intervalCount: 1,
          isPartial: false,
          colorStyle: { category: "cwa", hex: color.hex, label: color.label },
          layerId,
          layerCategory: config.category,
          categoryLabel: config.categoryLabel,
          badgeName: station.stationName.slice(0, 2),
          badgeValue,
          colorHex: color.hex,
          tooltipText: `${station.stationName}測站: 即時氣溫 ${tempDisplay}`,
          popupTitle: `📍 ${station.stationName}測站`,
          popupSubtitle: `⏱️ 觀測時間：${timeDisplay}（氣象署觀測）`,
          popupRows: [
            { label: "🌡️ 即時氣溫", value: tempDisplay },
            { label: "📍 所屬行政區", value: locationDesc },
            { label: "🏷️ 測站代碼", value: station.stationId },
            { label: "⛰️ 測站海拔", value: station.elevation !== null ? `${station.elevation} m` : "—" },
          ],
          isCountySummary: false,
          zoomTier: tier,
        };
      });
  }

  // 2. Relative Humidity (O-A0003-001)
  if (layerId === "relative_humidity") {
    if (!observationData || !observationData.stations || observationData.stations.length === 0) {
      return [];
    }

    return observationData.stations
      .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .map((station) => {
        const rh = station.relativeHumidity;
        const color = getHumidityColor(rh);
        const badgeValue = rh !== null && Number.isFinite(rh) ? `${Math.round(rh)}%` : "—";
        const rhDisplay = rh !== null && Number.isFinite(rh) ? `${Math.round(rh)} %` : "無資料";
        const tempDisplay = station.temperature !== null && Number.isFinite(station.temperature) ? `${station.temperature.toFixed(1)} °C` : "—";
        const timeDisplay = station.observedAt ? formatTaipeiDateTime(station.observedAt) : "—";

        return {
          id: `cwa-rh-${station.stationId}`,
          region: station.county,
          stationId: station.stationId,
          title: `${station.stationName}測站`,
          latitude: station.latitude,
          longitude: station.longitude,
          forecastDate: mapDate,
          minTemp: null,
          maxTemp: null,
          intervalCount: 1,
          isPartial: false,
          colorStyle: { category: "humidity", hex: color.hex, label: color.label },
          layerId,
          layerCategory: config.category,
          categoryLabel: config.categoryLabel,
          badgeName: station.stationName.slice(0, 2),
          badgeValue,
          colorHex: color.hex,
          tooltipText: `${station.stationName}測站: 相對濕度 ${rhDisplay}`,
          popupTitle: `📍 ${station.stationName}測站`,
          popupSubtitle: `⏱️ 觀測時間：${timeDisplay}（氣象署觀測）`,
          popupRows: [
            { label: "💧 相對濕度", value: rhDisplay },
            { label: "🌡️ 即時氣溫", value: tempDisplay },
            { label: "📍 所屬行政區", value: `${station.county}${station.town ? " " + station.town : ""}` },
            { label: "🏷️ 測站代碼", value: station.stationId },
          ],
          isCountySummary: false,
          zoomTier: tier,
        };
      });
  }

  // 3. Wind Speed & Direction (O-A0003-001)
  if (layerId === "wind") {
    if (!observationData || !observationData.stations || observationData.stations.length === 0) {
      return [];
    }

    return observationData.stations
      .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .map((station) => {
        const speed = station.windSpeed;
        const color = getWindColor(speed);
        const badgeValue = speed !== null && Number.isFinite(speed) ? `${speed.toFixed(1)}` : "—";
        const speedDisplay = speed !== null && Number.isFinite(speed) ? `${speed.toFixed(1)} m/s` : "無資料";
        const dirDisplay = formatWindDirection(station.windDirection);
        const timeDisplay = station.observedAt ? formatTaipeiDateTime(station.observedAt) : "—";

        return {
          id: `cwa-wind-${station.stationId}`,
          region: station.county,
          stationId: station.stationId,
          title: `${station.stationName}測站`,
          latitude: station.latitude,
          longitude: station.longitude,
          forecastDate: mapDate,
          minTemp: null,
          maxTemp: null,
          intervalCount: 1,
          isPartial: false,
          colorStyle: { category: "wind", hex: color.hex, label: color.label },
          layerId,
          layerCategory: config.category,
          categoryLabel: config.categoryLabel,
          badgeName: station.stationName.slice(0, 2),
          badgeValue,
          colorHex: color.hex,
          tooltipText: `${station.stationName}測站: 風速 ${speedDisplay} (${dirDisplay})`,
          popupTitle: `📍 ${station.stationName}測站`,
          popupSubtitle: `⏱️ 觀測時間：${timeDisplay}（氣象署觀測）`,
          popupRows: [
            { label: "💨 風速", value: speedDisplay },
            { label: "🧭 風向", value: dirDisplay },
            { label: "📍 所屬行政區", value: `${station.county}${station.town ? " " + station.town : ""}` },
            { label: "🏷️ 測站代碼", value: station.stationId },
          ],
          isCountySummary: false,
          zoomTier: tier,
        };
      });
  }

  // 4. Daily Cumulative Precipitation (O-A0003-001)
  if (layerId === "daily_precipitation") {
    if (!observationData || !observationData.stations || observationData.stations.length === 0) {
      return [];
    }

    return observationData.stations
      .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .map((station) => {
        const precip = station.dailyPrecipitation;
        const status = station.precipitationStatus;
        const color = getPrecipitationColor(precip, status);
        const timeDisplay = station.observedAt ? formatTaipeiDateTime(station.observedAt) : "—";

        let badgeValue = "—";
        let displayPrecip = "—";
        let displayDesc = "當日降水狀況";

        if (status === "trace") {
          badgeValue = "雨跡";
          displayPrecip = "雨跡（未達 0.1 mm）";
          displayDesc = "微量降水 (未達 0.1 mm)";
        } else if (status === "none_6hr" || (status as string) === "none") {
          badgeValue = "6h無雨";
          displayPrecip = "連續 6 小時無降水";
          displayDesc = "過去連續 6 小時未有降雨記錄";
        } else if (status === "missing") {
          badgeValue = "缺測";
          displayPrecip = "缺測";
          displayDesc = "測站缺測或未設置雨量計";
        } else if (status === "fault" || (status as string) === "error") {
          badgeValue = "故障";
          displayPrecip = "故障";
          displayDesc = "測站雨量感應器故障";
        } else if (
          (status === "normal" || (status as string) === "measured") &&
          precip === 0
        ) {
          badgeValue = "0";
          displayPrecip = "0.0 mm";
          displayDesc = "今日 00:00 至今尚無降水";
        } else if (
          (status === "normal" || (status as string) === "measured") &&
          precip !== null &&
          Number.isFinite(precip)
        ) {
          badgeValue = precip.toFixed(1);
          displayPrecip = `${precip.toFixed(1)} mm`;
          displayDesc = getPrecipitationDescription(precip, status);
        } else if (precip !== null && Number.isFinite(precip)) {
          if (precip === 0) {
            badgeValue = "0";
            displayPrecip = "0.0 mm";
            displayDesc = "今日 00:00 至今尚無降水";
          } else {
            badgeValue = precip.toFixed(1);
            displayPrecip = `${precip.toFixed(1)} mm`;
            displayDesc = getPrecipitationDescription(precip, status);
          }
        }

        return {
          id: `cwa-precip-${station.stationId}`,
          region: station.county,
          stationId: station.stationId,
          title: `${station.stationName}測站`,
          latitude: station.latitude,
          longitude: station.longitude,
          forecastDate: mapDate,
          minTemp: null,
          maxTemp: null,
          intervalCount: 1,
          isPartial: false,
          colorStyle: { category: "precip", hex: color.hex, label: color.label },
          layerId,
          layerCategory: config.category,
          categoryLabel: config.categoryLabel,
          badgeName: station.stationName.slice(0, 2),
          badgeValue,
          colorHex: color.hex,
          tooltipText: `${station.stationName}測站: 當日降水量 ${displayPrecip}`,
          popupTitle: `📍 ${station.stationName}測站`,
          popupSubtitle: `⏱️ 觀測時間：${timeDisplay}（氣象署觀測）`,
          popupRows: [
            { label: "🌧️ 當日降水量", value: displayPrecip },
            { label: "📝 狀態說明", value: displayDesc },
            { label: "📍 所屬行政區", value: `${station.county}${station.town ? " " + station.town : ""}` },
            { label: "🏷️ 測站代碼", value: station.stationId },
          ],
          isCountySummary: false,
          zoomTier: tier,
        };
      });
  }

  // 5. AQI (AQX_P_432)
  if (layerId === "aqi") {
    if (!airQualityData || !airQualityData.stations || airQualityData.stations.length === 0) {
      return [];
    }

    return airQualityData.stations
      .filter((s) => s.latitude !== null && s.longitude !== null && Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .map((station) => {
        const lat = station.latitude as number;
        const lon = station.longitude as number;
        const stationName = station.stationName || (station as { siteName?: string }).siteName || "測站";
        const stationId = station.stationId || (station as { siteId?: string }).siteId || "";
        const publishedAt = station.publishedAt || (station as { publishTime?: string }).publishTime;
        const aqi = station.aqi;
        const cat = getAqiCategory(aqi);
        const badgeValue = aqi !== null && Number.isFinite(aqi) ? String(Math.round(aqi)) : "—";
        const aqiDisplay = aqi !== null && Number.isFinite(aqi) ? `${Math.round(aqi)} (${station.status || cat.level})` : "無資料";
        const timeDisplay = publishedAt ? formatTaipeiDateTime(publishedAt) : "—";
        const countyName = normalizeCountyName(station.county);

        return {
          id: `moenv-aqi-${stationId}`,
          region: countyName,
          stationId,
          title: `${stationName}測站`,
          latitude: lat,
          longitude: lon,
          forecastDate: mapDate,
          minTemp: null,
          maxTemp: null,
          intervalCount: 1,
          isPartial: false,
          colorStyle: { category: "aqi", hex: cat.color, label: cat.level },
          layerId,
          layerCategory: config.category,
          categoryLabel: config.categoryLabel,
          badgeName: stationName.slice(0, 2),
          badgeValue,
          colorHex: cat.color,
          tooltipText: `${stationName}測站: AQI ${aqiDisplay}`,
          popupTitle: `📍 ${stationName}測站`,
          popupSubtitle: `⏱️ 發布時間：${timeDisplay}（環境部空氣監測站）`,
          popupRows: [
            { label: "🍃 AQI 指標", value: aqiDisplay, color: cat.color },
            { label: "⚠️ 主要污染物", value: station.primaryPollutant || "無 / 一般" },
            { label: "🌫️ PM2.5 濃度", value: station.pm25 !== null ? `${station.pm25} μg/m³` : "—" },
            { label: "💨 PM10 濃度", value: station.pm10 !== null ? `${station.pm10} μg/m³` : "—" },
            { label: "📍 所屬縣市", value: countyName },
            { label: "🏷️ 測站代碼", value: stationId },
          ],
          isCountySummary: false,
          zoomTier: tier,
        };
      });
  }

  // 6. PM2.5 (AQX_P_432)
  if (layerId === "pm25") {
    if (!airQualityData || !airQualityData.stations || airQualityData.stations.length === 0) {
      return [];
    }

    return airQualityData.stations
      .filter((s) => s.latitude !== null && s.longitude !== null && Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
      .map((station) => {
        const lat = station.latitude as number;
        const lon = station.longitude as number;
        const stationName = station.stationName || (station as { siteName?: string }).siteName || "測站";
        const stationId = station.stationId || (station as { siteId?: string }).siteId || "";
        const publishedAt = station.publishedAt || (station as { publishTime?: string }).publishTime;
        const pm25 = station.pm25;
        const color = getPm25Color(pm25);
        const badgeValue = pm25 !== null && Number.isFinite(pm25) ? String(Math.round(pm25)) : "—";
        const pm25Display = pm25 !== null && Number.isFinite(pm25) ? `${pm25.toFixed(1)} μg/m³` : "無資料";
        const timeDisplay = publishedAt ? formatTaipeiDateTime(publishedAt) : "—";
        const countyName = normalizeCountyName(station.county);

        return {
          id: `moenv-pm25-${stationId}`,
          region: countyName,
          stationId,
          title: `${stationName}測站`,
          latitude: lat,
          longitude: lon,
          forecastDate: mapDate,
          minTemp: null,
          maxTemp: null,
          intervalCount: 1,
          isPartial: false,
          colorStyle: { category: "pm25", hex: color.hex, label: color.label },
          layerId,
          layerCategory: config.category,
          categoryLabel: config.categoryLabel,
          badgeName: stationName.slice(0, 2),
          badgeValue,
          colorHex: color.hex,
          tooltipText: `${stationName}測站: PM2.5 ${pm25Display}`,
          popupTitle: `📍 ${stationName}測站`,
          popupSubtitle: `⏱️ 發布時間：${timeDisplay}（環境部空氣監測站）`,
          popupRows: [
            { label: "🌫️ PM2.5 濃度", value: pm25Display },
            { label: "💨 PM10 濃度", value: station.pm10 !== null ? `${station.pm10} μg/m³` : "—" },
            { label: "🍃 AQI 指標", value: station.aqi !== null ? `${station.aqi} (${station.status || "—"})` : "—" },
            { label: "📍 所屬縣市", value: countyName },
            { label: "🏷️ 測站代碼", value: stationId },
          ],
          isCountySummary: false,
          zoomTier: tier,
        };
      });
  }

  return [];
}

/**
 * Prepares unified map markers for any selected layer based on zoom tier (Semantic Zoom).
 */
export function prepareUnifiedMapMarkers(options: PrepareLayerMarkersOptions): UnifiedMapMarker[] {
  const { layerId, zoom, zoomTier: explicitTier } = options;
  const config = getLayerConfig(layerId);

  // Forecast layers (forecast_max_temp, uv) always produce county-level markers
  if (config.category === "forecast") {
    return prepareCountySummaryMarkers(options);
  }

  // Determine active zoom tier: prefer explicitTier, then zoom, default to overview (zoom 7)
  const tier: MapZoomTier =
    explicitTier ?? (zoom !== undefined ? getMapZoomTier(zoom) : "overview");

  // Tier 1 (Overview, zoom <= 7): collapse to county representative summaries (max 1 per county)
  if (tier === "overview") {
    return prepareCountySummaryMarkers(options);
  }

  // Tier 2 (Station dots, zoom 8..9) or Tier 3 (Detailed, zoom >= 10): show all real station locations
  return prepareDetailedStationMarkers(options, tier);
}
