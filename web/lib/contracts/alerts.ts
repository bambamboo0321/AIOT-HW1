/**
 * Weather Alerts & Warnings Contracts for Taiwan Weather Dashboard V2
 *
 * Defines standardized schema for Central Weather Administration (CWA)
 * canonical weather warnings and alerts (Dataset W-C0033-002).
 */

export type AlertSeverity = "Extreme" | "Severe" | "Moderate" | "Minor" | "Unknown";

export interface WeatherAlert {
  /** 警報唯一識別碼 (官方 identifier 或現象+時間+區域之穩定唯一碼) */
  identifier: string;
  /** 資料集代碼 (固定為 canonical "W-C0033-002") */
  datasetId: "W-C0033-002";
  /** 警報事件/種類名稱 (e.g. "豪雨", "大雨", "低溫", "高溫", "陸上強風", "颱風") */
  event: string;
  /** 警報標題 (e.g. "豪雨特報", "低溫特報", "陸上強風特報") */
  headline: string;
  /** 詳細內容描述文字 (contentText) */
  description: string;
  /** 警報重要性或分類 (significance，如 "特報", "警報")，若無則為 null */
  significance?: string | null;
  /** CAP 嚴重程度 (W-C0033-002 無此欄位，設為 null，UI 不自行捏造) */
  severity?: AlertSeverity | null;
  /** 嚴重程度中文名稱 (若無則為 null) */
  severityNameZh?: string | null;
  /** 急迫性 (W-C0033-002 無此欄位，設為 null) */
  urgency?: string | null;
  /** 確定性 (W-C0033-002 無此欄位，設為 null) */
  certainty?: string | null;
  /** 生效/開始時間 (ISO-8601 string) */
  effective: string;
  /** 截止/失效時間 (ISO-8601 string) */
  expires: string;
  /** 發布時間 (issueTime) */
  issueTime?: string | null;
  /** 受影響縣市清單 (已標準化為正體「臺」之縣市名，如 ["新北市", "臺北市"]) */
  affectedAreas: string[];
  /** 防護措施或應變指示 (W-C0033-002 無獨立欄位，設為 null) */
  instruction?: string | null;
  /** 是否為影響全臺灣之全國性警報 */
  isNationwide: boolean;
  /** 官方詳細資訊網址 (若無為 null) */
  web?: string | null;
}

export interface NormalizedAlertsData {
  datasetId: "W-C0033-002";
  fetchedAt: string; // ISO-8601 UTC timestamp
  alertCount: number;
  alerts: WeatherAlert[];
}

