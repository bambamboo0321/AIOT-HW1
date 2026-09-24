/**
 * Taiwan 22 Counties Administrative Boundary Metadata & Helpers (M13)
 *
 * Boundary Data Provenance & Precision Specification:
 * ---------------------------------------------------
 * - Source Agency: 中華民國內政部 (Ministry of the Interior, ROC)
 * - Source Platform: 政府資料開放平臺 (data.gov.tw) / 內政部國土測繪圖資服務雲
 * - Dataset Name: 直轄市、縣(市)界線(TWD97經緯度)
 * - Dataset ID: 7442
 * - Original URL: https://data.gov.tw/dataset/7442
 * - Download Endpoint: https://www.tgos.tw/tgos/VirtualDir/Product/1cd4f4c9-6b01-4cf9-bf6c-23a73aa17d24/直轄市、縣(市)界線1140318.zip
 * - License: 政府資料開放授權條款-第1版 (Open Government Data License, OGL-Taiwan v1.0)
 * - Original Version / Release Date: 民國 114 年 3 月 18 日 (1140318 / 2025-03-18 版本)
 * - Original CRS: EPSG:3824 (GCS_TWD97[2020] / GRS 1980 橢球體，經緯度度數)
 * - Web Output CRS: EPSG:4326 (WGS 84 經緯度，[longitude, latitude] 順序)
 * - Reprojection:
 *     已透過 PROJ (pyproj 3.6.1) 及 Mapshaper (-proj wgs84) 正式執行 EPSG:3824 -> EPSG:4326
 *     座標系統投影轉換，並通過 Shapely 2.0.7 全要素拓撲檢驗 (is_valid=True, is_empty=False)。
 * - Scope & Island Filtering Notice:
 *     本資料為「Web 顯示優化版行政邊界」，並非未經處理之「完整官方界線」。
 *     為避免 Web 地圖 fitBounds 視野過度縮放，顯示版未納入部分遠洋島礁（如太平島、東沙群島及釣魚臺列嶼），
 *     完整保留臺灣本島及澎湖、金門、連江（馬祖列島）、綠島、蘭嶼、小琉球、龜山島等 22 縣市主要轄區。
 * - Legal & Navigation Disclaimer:
 *     行政界線僅供視覺定位與氣象資料參照，不作土地測量、法律界址、產權證明或導航用途。
 * - File Size: ~204.5 KB uncompressed GeoJSON (< 40 KB gzipped).
 */

import taiwanCountiesData from "./taiwan-counties.json";
import type { FeatureCollection, Geometry, GeoJsonProperties } from "geojson";

export const TAIWAN_COUNTIES_GEOJSON: FeatureCollection<Geometry, GeoJsonProperties> =
  taiwanCountiesData as unknown as FeatureCollection<Geometry, GeoJsonProperties>;

export const TAIWAN_COUNTIES_METADATA = {
  sourceAgency: "中華民國內政部 (Ministry of the Interior, ROC)",
  sourcePlatform: "政府資料開放平臺 (data.gov.tw) / 內政部國土測繪圖資服務雲",
  datasetId: "7442",
  datasetName: "直轄市、縣(市)界線(TWD97經緯度)",
  originalUrl: "https://data.gov.tw/dataset/7442",
  license: "政府資料開放授權條款-第1版 (Open Government Data License, OGL-Taiwan v1.0)",
  originalVersion: "民國 114 年 3 月 18 日 (1140318 / 2025-03-18 版本)",
  originalCrs: "EPSG:3824",
  originalCrsDescription: "TWD97 經緯度 (GRS 1980 橢球體)",
  targetCrs: "EPSG:4326",
  targetCrsDescription: "WGS 84 經緯度 ([longitude, latitude])",
  isReprojected: true,
  reprojectionTool: "PROJ / pyproj 3.6.1 + Mapshaper (-proj wgs84)",
  scope: "Web 顯示優化版行政邊界（排除部分遠洋島礁）",
  excludedGeometriesNote: "為避免 Web 地圖 fitBounds 視野過度縮放，顯示版未納入部分遠洋島礁（如太平島、東沙群島及釣魚臺列嶼）",
  disclaimer: "行政界線僅供視覺定位與氣象資料參照，不作土地測量、法律界址、產權證明或導航用途。",
  fileSizeKb: 204.5,
  countyCount: 22,
} as const;

/**
 * Standard disclaimer required on interactive weather map
 */
export const TAIWAN_MAP_BOUNDARY_DISCLAIMER =
  "原始資料：內政部 2025-03-18 TWD97 經緯度縣市界線 (EPSG:3824)；Web 顯示資料：轉換為 WGS84 (EPSG:4326) 並經拓撲保留簡化。為避免 Web 地圖 fitBounds 視野過度縮放，顯示版未納入部分遠洋島礁。行政界線僅供視覺定位與氣象參照，不作土地測量、法律界址或導航用途。";

/**
 * Normalizes colloquial Taiwanese county names (e.g. "台北市" -> "臺北市")
 * to the official standard 22 county names.
 */
export function normalizeCountyName(name: string): string {
  if (!name) return "";
  const trimmed = name.trim();
  // Standardize "台" prefix to "臺"
  return trimmed.replace(/^台/, "臺");
}

/**
 * Pre-computed bounding boxes [[southLat, westLon], [northLat, eastLon]] for all 22 counties
 * for instant, fail-safe fitBounds and offline calculations.
 * All coordinates are verified within WGS84 bounds (longitude 118~123, latitude 21~27).
 */
export const TAIWAN_COUNTY_BOUNDS: Record<string, [[number, number], [number, number]]> = {
  "連江縣": [[25.9487, 119.9089], [26.383, 120.5113]],
  "宜蘭縣": [[24.3107, 121.3177], [24.9884, 121.966]],
  "彰化縣": [[23.7857, 120.2204], [24.2072, 120.6839]],
  "南投縣": [[23.4354, 120.6189], [24.2457, 121.3497]],
  "雲林縣": [[23.4363, 119.9969], [23.8662, 120.736]],
  "屏東縣": [[21.8956, 120.3532], [22.8852, 120.9042]],
  "基隆市": [[25.0528, 121.6268], [25.6332, 122.1078]],
  "臺北市": [[24.9605, 121.4573], [25.2102, 121.6659]],
  "新北市": [[24.6732, 121.2827], [25.3, 122.0069]],
  "臺南市": [[22.8891, 120.0269], [23.4134, 120.6562]],
  "桃園市": [[24.5865, 120.982], [25.1236, 121.48]],
  "嘉義市": [[23.4396, 120.3893], [23.5182, 120.5092]],
  "嘉義縣": [[23.2152, 120.1181], [23.6359, 120.9575]],
  "金門縣": [[24.3783, 118.1514], [24.9996, 119.4792]],
  "高雄市": [[22.4685, 120.1747], [23.4717, 121.0488]],
  "臺東縣": [[21.9428, 120.739], [23.4435, 121.6162]],
  "花蓮縣": [[23.0979, 120.9866], [24.3705, 121.7741]],
  "澎湖縣": [[23.187, 119.3143], [23.7757, 119.6943]],
  "新竹市": [[24.7126, 120.8745], [24.8548, 121.033]],
  "臺中市": [[23.9986, 120.4566], [24.4415, 121.452]],
  "苗栗縣": [[24.2885, 120.6219], [24.7407, 121.2626]],
  "新竹縣": [[24.4274, 120.9252], [24.946, 121.4122]],
};

/**
 * Returns bounds for a given county name (supporting both "台" and "臺").
 */
export function getCountyBounds(county: string): [[number, number], [number, number]] | null {
  const normalized = normalizeCountyName(county);
  return TAIWAN_COUNTY_BOUNDS[normalized] ?? null;
}
