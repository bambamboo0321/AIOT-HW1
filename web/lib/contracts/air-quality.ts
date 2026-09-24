/**
 * Data contracts for MOENV Air Quality Observations (Dataset AQX_P_432)
 *
 * Dataset Name: 空氣品質指標 (AQI)
 * Upstream URL: https://data.moenv.gov.tw/api/v2/aqx_p_432
 */

export interface NormalizedStationAirQuality {
  /** 測站代碼 (siteid, e.g. "2") */
  stationId: string;
  /** 測站中文名稱 (sitename, e.g. "汐止") */
  stationName: string;
  /** 所屬縣市 (標準化為「臺」，e.g. "新北市", "臺北市") */
  county: string;
  /** WGS84 緯度，無效為 null */
  latitude: number | null;
  /** WGS84 經度，無效為 null */
  longitude: number | null;
  /** 資料發布時間 (ISO 8601 或 "YYYY-MM-DDTHH:mm:ss+08:00") */
  publishedAt: string;
  /** 空氣品質指標 AQI (0-500)，缺測或無效為 null */
  aqi: number | null;
  /** 狀態說明 (e.g. "良好", "普通", "對敏感族群不健康") */
  status: string | null;
  /** 主要空氣污染物 (pollutant, e.g. "細懸浮微粒", "臭氧", 若無則為 null) */
  primaryPollutant: string | null;
  /** 細懸浮微粒 PM2.5 濃度 (μg/m³)，合法 0 保留，缺測為 null */
  pm25: number | null;
  /** 懸浮微粒 PM10 濃度 (μg/m³)，合法 0 保留，缺測為 null */
  pm10: number | null;
  /** 臭氧 O3 濃度 (ppb)，合法 0 保留，缺測為 null */
  ozone: number | null;
  /** 一氧化碳 CO 濃度 (ppm)，合法 0 保留，缺測為 null */
  carbonMonoxide: number | null;
  /** 二氧化硫 SO2 濃度 (ppb)，合法 0 保留，缺測為 null */
  sulfurDioxide: number | null;
  /** 二氧化氮 NO2 濃度 (ppb)，合法 0 保留，缺測為 null */
  nitrogenDioxide: number | null;
}

export interface CountyAirQualitySummary {
  /** 縣市名稱 (e.g. "新北市") */
  county: string;
  /** 該縣市有效測站之最高 AQI 值（代表最差空氣品質），全數缺測時為 null */
  maxAqi: number | null;
  /** 官方分級狀態 */
  status: string | null;
  /** 最高 AQI 測站之主要污染物 */
  primaryPollutant: string | null;
  /** 提供最高 AQI 值的代表測站代碼 */
  sourceStationId: string | null;
  /** 提供最高 AQI 值的代表測站名稱 */
  sourceStationName: string | null;
  /** 提供最高 AQI 值的代表測站所屬縣市 (必須與 county 一致) */
  sourceStationCounty: string | null;
  /** 該測站之 PM2.5 濃度 (μg/m³) */
  pm25: number | null;
  /** 該測站之 PM10 濃度 (μg/m³) */
  pm10: number | null;
  /** 觀測資料發布時間 */
  publishedAt: string | null;
}

export interface NormalizedAirQualityData {
  datasetId: "AQX_P_432";
  /** 伺服端抓取/同步時間 (UTC ISO-8601) */
  fetchedAt: string;
  /** 各測站即時觀測列表 (依 county, stationName, stationId 穩定排序) */
  stations: NormalizedStationAirQuality[];
  /** 各縣市最高 AQI 摘要字典 (key 為縣市名稱，如 "臺北市") */
  countySummaries: Record<string, CountyAirQualitySummary>;
}
