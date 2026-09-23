# Milestone M10: 即時地面氣象觀測 (M10-WEATHER-OBSERVATIONS.md)

本文件為 M10（Real-Time Weather Observations）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 驗證並串接 CWA 地面即時觀測資料集（`O-A0003-001` 綜觀氣象觀測與 `O-A0002-001` 雨量觀測），擷取全臺氣象測站之溫度、濕度、氣壓、風向、風速、陣風與雨量，建立測站座標與行政區關聯，將觀測資料寫入 Supabase PostgreSQL。
*   **Dependencies**: M7 (Cloud Data Foundation), M8 (Geographic Registry & CWA Dataset Discovery)

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **M10 實測驗證清單**：
    *   真實 top-level JSON keys
    *   station list 路徑
    *   StationId / StationName 真實欄位名稱
    *   ObsTime 真實格式與時區轉換 (UTC+8)
    *   GeoInfo 結構 (經緯度、海拔等)
    *   WeatherElement 真實欄位
    *   特殊缺值標記（例如 `-99`、`-999` 或其他官方 sentinel）
    *   各測站缺少欄位時的容錯行為
    *   同一測站同一 `observed_at` 的重複更新政策
    *   API response 體積大小與全臺總測站數量評估
    *   官方實際更新頻率與延遲
    *   TLS / `certifi` 連線與憑證行為（決策 D-009）
    *   確保 API Key 絕不出現在 URL、日誌或錯誤訊息中
*   **資料語意分離（決策 D-021, D-023）**：
    *   Forecast 是行政區預報、Observation 是測站實測、Rain station 是雨量測站實測。
    *   測站觀測數值只代表測站本身，嚴禁直接標示成整個縣市或鄉鎮的精確實況。
*   **缺值處理規範**：
    *   官方缺值或異常 sentinel 必須轉換為 SQL `NULL`。
    *   以 `quality_status` 欄位保留缺值或異常原因。
    *   嚴禁將 `-99` 當成真實氣象數值，嚴禁補成 `0`，缺值不得參與任何數值彙整。
*   **重複資料與唯一約束策略**：
    *   規劃建議唯一條件：`UNIQUE (source_dataset, station_id, observed_at)`。
    *   同步完全相同觀測時不得建立重複列。
    *   是否對同一 `observed_at` 使用 `ON CONFLICT DO UPDATE`，必須待 M10 驗證官方資料更正行為後決定，不得在規劃階段假裝已確定。
*   **資料量與查詢規劃（決策 D-020, D-024）**：
    *   每 10 分鐘更新之觀測資料會快速累積，查詢必須規劃 `(station_id, observed_at)` 索引。
    *   UI 預設只讀取最新觀測；歷史查詢必須限制時間範圍。
    *   嚴禁一次傳送所有測站完整歷史到瀏覽器。
    *   Retention（資料保留週期）與 Downsampling（降頻取樣）延後至 M16 或 M17 決策，M10 不擅自刪除資料。

### 非目標 (Non-Goals)：
*   不將預報與即時觀測混在同一張表（依決策 D-021 語意分離）。
*   不在此階段整合空氣品質（由 M11 負責）或紫外線（由 M12 負責）。
*   不在此階段開發前端地圖視覺化（由 M14 負責）。
*   不在 M10 擅自執行資料刪除或 Downsampling（留待 M16/M17 決策）。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   **`O-A0003-001`**（氣象觀測站－10分鐘綜觀氣象資料）：
    *   來源：CWA（中央氣象署）
    *   狀態：Official dataset verified；Response schema status: Must verify with live API during M10
    *   用途：即時地面測站氣象觀測
    *   預期欄位清單（待 M10 真實驗證，非保證全部具備）：station identifier、station name、observation time、latitude/longitude、elevation、temperature、relative humidity、pressure、wind speed、wind direction、gust、precipitation、weather/visibility fields、source quality/missing-value indicators。
*   **`O-A0002-001`**（雨量觀測站－雨量資料）：
    *   來源：CWA（中央氣象署）
    *   狀態：Candidate / Must verify with live API
    *   用途：提供更密集之雨量測站網擴充

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!NOTE]
> 以下欄位結構為 M10 之規劃方向（Proposed Storage），供資料模型設計參考，**非 M7 立即建表指令**。

### 表 1：`weather_stations` (測站主檔表)
*   `station_id` (VARCHAR, PK 部分)
*   `source_dataset` (VARCHAR, PK 部分 - 如 'O-A0003-001', 'O-A0002-001')
*   `station_name` (VARCHAR)
*   `latitude` (NUMERIC)
*   `longitude` (NUMERIC)
*   `elevation` (NUMERIC)
*   `county` (VARCHAR)
*   `township` (VARCHAR)
*   `station_type` (VARCHAR)
*   `is_active` (BOOLEAN)
*   `metadata_updated_at` (TIMESTAMPTZ)

### 表 2：`weather_observations` (觀測時序表)
*   `station_id` (VARCHAR)
*   `source_dataset` (VARCHAR)
*   `observed_at` (TIMESTAMPTZ)
*   `temperature` (NUMERIC, 攝氏度)
*   `relative_humidity` (NUMERIC, 百分比 0~100)
*   `pressure` (NUMERIC, 百帕 hPa)
*   `wind_speed` (NUMERIC, 公尺/秒)
*   `wind_direction` (NUMERIC, 角度 0~360)
*   `gust_speed` (NUMERIC, 最大瞬間風公尺/秒)
*   `precipitation` (NUMERIC, 累積降水量 mm)
*   `weather` (VARCHAR, 天氣現象描述)
*   `visibility` (NUMERIC, 能見度公里)
*   `sunshine_duration` (NUMERIC, 日照時數)
*   `quality_status` (VARCHAR, 缺值或異常代碼保留)
*   `ingested_at` (TIMESTAMPTZ, 入庫時間)
*   **約束與索引規劃**：
    *   `UNIQUE (source_dataset, station_id, observed_at)`
    *   索引：`(station_id, observed_at DESC)`, `(observed_at DESC)`

---

## 5. 驗收標準 (Acceptance Criteria)

1.  成功完成即時觀測 API 之真實連線與資料驗證，落實 M10 驗證清單。
2.  氣象測站基本資料（代碼、名稱、經緯度、行政區）與時序觀測值完整入庫。
3.  溫度、濕度、氣壓、風速、陣風與雨量欄位正確解析，`-99` 等異常值正確轉換為 SQL `NULL`，絕無補 `0`。
4.  重複寫入策略符合規範，不建立重複資料列。
5.  解析與寫入測試 100% 通過。

---

## 6. 安全與 TLS 規範 (Security Requirements)

*   API client 必須獨立執行 TLS 憑證與連線測試，禁止使用 `verify=False`（決策 D-009）。
*   金鑰讀取嚴格限於 Secrets / 環境變數，禁止寫入原始碼、日誌或錯誤訊息，測試一律使用假金鑰。

---

## 7. 測試策略 (Test Strategy)

*   單元測試：測試各類型測站之欄位多樣性與缺失值轉換（含 `-99` 轉 NULL）。
*   整合測試：測試時序觀測寫入，驗證複合唯一約束 `UNIQUE (source_dataset, station_id, observed_at)`。
*   邊界測試：測試特定測站缺少部分氣象要素（如無能見度或無日照）時的寬容處理。

---

## 8. 風險與應對 (Risks)

*   **風險 1**：部分高山或無人測站通訊不穩，可能回傳異常字串或頻繁缺值。
    *   **應對**：強型別防禦解析，任何無法轉型的數值一律記錄於 `quality_status` 並將數值欄位置為 `NULL`。
*   **風險 2**：高頻觀測數據累積迅速，查詢過慢。
    *   **應對**：預設僅查詢最新觀測，建立複合索引，留待 M16/M17 評估保留政策。

---

## 9. 手動驗收清單 (Manual Verification)

*   [ ] 執行同步作業，確認地面測站與觀測數據成功寫入 PostgreSQL。
*   [ ] 檢核氣溫、濕度、氣壓、風向、風速、陣風與雨量欄位齊全。
*   [ ] 驗證故障測站之數值為 NULL，未被錯誤轉為 0。
*   [ ] 驗證重複同步同一觀測時不產生重複列。

---

## 10. 最終結果 (Final Result)

*(此處待 M10 實作與驗收完成後填寫)*
