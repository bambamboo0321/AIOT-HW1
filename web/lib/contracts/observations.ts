/**
 * Data contracts for CWA Weather Observations (Dataset O-A0003-001)
 *
 * Dataset Name: 氣象觀測站－10分鐘綜觀氣象資料
 * Upstream URL: https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001
 */

export type PrecipitationStatus =
  | "normal"
  | "trace"
  | "none_6hr"
  | "missing"
  | "fault";

export interface NormalizedStationObservation {
  /** 測站代碼 (e.g. "466940") */
  stationId: string;
  /** 測站中文名稱 (e.g. "基隆") */
  stationName: string;
  /** 所屬縣市 (e.g. "基隆市") */
  county: string;
  /** 所屬鄉鎮市區 (e.g. "仁愛區")，若無則為 null */
  town: string | null;
  /** WGS84 緯度 */
  latitude: number;
  /** WGS84 經度 */
  longitude: number;
  /** 測站海拔高度 (公尺)，無效或缺值為 null */
  elevation: number | null;
  /** 觀測時間 (ISO 8601 with timezone offset, e.g. "2026-09-23T22:30:00+08:00") */
  observedAt: string;
  /** 即時氣溫 (°C)，無效或缺值為 null */
  temperature: number | null;
  /** 相對濕度 (0-100 %)，無效或缺值為 null */
  relativeHumidity: number | null;
  /** 風速 (m/s)，合法 0 保留，無效或缺值為 null */
  windSpeed: number | null;
  /** 風向角度 (0-360°，990 代表風向不定)，合法 0 保留，無效或缺值為 null */
  windDirection: number | null;
  /**
   * 官方語意：當日降水量 (毫米 mm)
   * 正常數值 (含 0.0 mm) 為 number；特殊狀態 (T, -98, -99, X) 時為 null
   */
  dailyPrecipitation: number | null;
  /**
   * 降水量特殊狀態標記：
   * - "normal": 正常數值降水 (含 0.0 mm)
   * - "trace": 雨跡 (代碼 'T')
   * - "none_6hr": 連續 6 小時無降水 (代碼 -98)
   * - "missing": 缺測或異常 (代碼 -99)
   * - "fault": 儀器故障 (代碼 'X')
   */
  precipitationStatus: PrecipitationStatus;
}

export interface NormalizedObservationData {
  datasetId: "O-A0003-001";
  /** 伺服端抓取/同步時間 (UTC ISO-8601) */
  fetchedAt: string;
  /** 依縣市、測站名稱、代碼穩定排序之標準化測站觀測列表 */
  stations: NormalizedStationObservation[];
}
