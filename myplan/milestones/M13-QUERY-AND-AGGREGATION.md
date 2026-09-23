# Milestone M13: Supabase 查詢合約與分級彙整 (M13-QUERY-AND-AGGREGATION.md)

本文件為 M13（Supabase Query Contract and Aggregation）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 建立 Supabase PostgreSQL 查詢合約與階層彙整引擎，包含資料庫檢視表 (Views)、RPC 函數（僅在必要時）、地理與 Viewport 空間查詢、快照隔離、公開唯讀模型 (Public Read Model)、TypeScript 資料合約規劃以及嚴密的 Row Level Security (RLS) 策略，為 Next.js 前端提供安全、型別安全且高效的查詢介面。
*   **Dependencies**: M7～M12（各類預報、觀測、空品、UV 資料庫皆已建立）

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **Supabase PostgreSQL Views (公開唯讀視圖)**：
    *   `v_latest_weather_observations`：最新測站觀測數值（氣溫、相對濕度、氣壓、風速、風向、陣風、雨量）。
    *   `v_latest_aqi_observations`：最新空品測站讀數（AQI、PM2.5、PM10、主要污染物）。
    *   `v_county_summary`：全臺 22 縣市最新預報與統計極值摘要。
*   **PostgreSQL Functions / RPC (僅在確實需要時)**：
    *   針對 Viewport Bounding Box 空間查詢或多圖層交叉計算，評估封裝為參數化 RPC 函數，避免客戶端組裝過度複雜之 SQL。
*   **空間與快照查詢 (Geographic & Viewport Queries)**：
    *   支援全臺宏觀查詢（22 縣市摘要）。
    *   支援依 Viewport 空間邊界 `(min_lat, min_lon, max_lat, max_lon)` 或行政區代碼過濾鄉鎮與測站（決策 D-020）。
    *   快照隔離：確保查詢鎖定單一最新快照時間戳，絕不跨快照混合（決策 D-003）。
*   **TypeScript Data Contract 規劃**：
    *   為未來 Next.js 前端定義嚴格的 TypeScript 型別介面（如 `CountyWeatherSummary`, `StationObservation`, `AqiStationReading`, `ViewportBounds`）。
*   **Row Level Security (RLS) 規劃（決策 D-029）**：
    *   所有底層資料表與公開檢視表啟用 RLS。
    *   針對公開訪客（`anon` role）僅開放白名單 View 或 RPC 唯讀 SELECT 權限，禁止任何 INSERT/UPDATE/DELETE。
    *   `SUPABASE_SERVICE_ROLE_KEY` 嚴格僅留存在伺服端與同步 Worker，絕不進入瀏覽器。
*   **分級彙整規則落實（決策 D-011～D-014, D-023）**：
    *   四分區彙整（北部 7、中部 5、南部 5、東部 2 縣市），離島 3 縣市個別呈現。
    *   AQI 彙整：採用區內最高 AQI（最差測站），揭露站名、主要污染物與有效測站數，禁止計算數值平均；全缺回傳 NaN 不補 0。
    *   雨量彙整：採用最大雨量測站數值，禁止相加。
    *   測站客觀性：統計摘要明確標示為統計值並列出代表測站，不冒充全區實況。

### 非目標 (Non-Goals)：
*   不在此階段撰寫 Next.js 前端 UI 元件（由 M14 負責）。
*   不執行一次性全量時序載入至瀏覽器（依決策 D-024 採按需查詢）。
*   不讓瀏覽器持有高權限金鑰。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   本 Milestone 不直接對接外部 API，全數查詢儲存於 Supabase PostgreSQL 之標準化資料表（M7～M12 產出）。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!NOTE]
> 本階段建立高效能檢視表 (Views)、RPC 函數與 RLS 政策，不新增基礎實體資料表：

### 檢視表 1：`v_latest_weather_observations`
*   各測站最新一筆有效觀測快照
*   包含氣溫、濕度、氣壓、風速、風向、陣風、雨量與測站座標

### 檢視表 2：`v_latest_aqi_observations`
*   各空品測站最新一筆 AQI、PM2.5、PM10 與主要污染物

### 檢視表 3：`v_county_summary`
*   22 縣市最新預報極值、即時氣溫與主要天氣現象

### RPC 函數 (選配，視效能實測)：`get_stations_in_viewport`
*   參數：`min_lat NUMERIC, min_lon NUMERIC, max_lat NUMERIC, max_lon NUMERIC, layer_type TEXT`
*   回傳：指定 Bounding Box 內之測站與數值

### RLS 政策規劃：
*   `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
*   `CREATE POLICY "Allow public read on views" ON ... FOR SELECT TO anon USING (true);`

---

## 5. 驗收標準 (Acceptance Criteria)

1.  Views 與 RPC 能以匿名金鑰（`anon key`）成功查詢，且具備最少權限保護。
2.  RLS 策略驗證通過：使用匿名金鑰嘗試寫入或存取未授權表時皆被安全拒絕。
3.  AQI 分區取最大值（最差測站），雨量取最大值，全缺值情況下回傳 `NULL`/`NaN`，絕無補 `0`。
4.  Viewport 空間邊界查詢回傳符合邊界範圍之測站資料，查詢延遲符合目標。
5.  產出完整且型別安全的 TypeScript 介面定義檔。

---

## 6. 安全與存取規範 (Security Requirements)

*   公開查詢遵循最小授權原則（Least Privilege），僅賦予 `anon` role 唯讀權限。
*   `SUPABASE_SERVICE_ROLE_KEY` 絕不得進入前端 bundle 或透過公開端點暴露（決策 D-029）。
*   所有 RPC 與查詢防範 SQL Injection。

---

## 7. 測試策略 (Test Strategy)

*   單元測試：測試各彙整邏輯與 TypeScript 合約結構。
*   安全與權限測試：測試以 `anon` key 存取時的 RLS 邊界，確認寫入被安全攔截。
*   空間查詢測試：測試邊界點與跨經緯度 Bounding Box 正確性。

---

## 8. 風險與應對 (Risks)

*   **風險**：複雜 View 或 RPC 跨多表關聯時查詢效能不佳。
*   **應對**：善用 M16 規劃之複合索引，僅在 View 中投影必要欄位，必要時評估 Materialized View。

---

## 9. 手動驗收清單 (Manual Verification)

*   [ ] 使用 Supabase Client 搭配 `anon` key 測試查詢各 View，確認正常回傳。
*   [ ] 嘗試以 `anon` key 執行 INSERT，確認被 RLS 安全拒絕。
*   [ ] 檢核 Viewport 查詢僅回傳視角內測站。
*   [ ] 驗證四分區極值與最差測站計算準確。

---

## 10. 最終結果 (Final Result)

*(此處待 M13 實作與驗收完成後填寫)*
