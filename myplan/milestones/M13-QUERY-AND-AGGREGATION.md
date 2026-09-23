# Milestone M13: 統一 API 合約與分級彙整 (M13-QUERY-AND-AGGREGATION.md)

本文件為 M13（Unified API Contract and Aggregation）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 建立統一之 TypeScript Response Contract 與伺服端分級彙整函式庫，支援全臺、四大地理區、22 縣市與 368 鄉鎮之階層聚合，支援 Viewport (`bbox`) 空間過濾參數；嚴格貫徹預報、地面觀測、雨量、空品 AQI 與紫外線之語意分離；實施伺服端 Schema 驗證與瀏覽器安全脫敏 (Browser-Safe Response)。**徹底移除 Supabase View、RPC 與 RLS 規劃，全數由 Next.js 伺服端無狀態邏輯處理**。
*   **Dependencies**: M7～M12（各領域 Route Handlers 與短期快取架構已建立）

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **統一 TypeScript Response Contract（型別安全介面）**：
    *   定義瀏覽器端安全、零洩密之標準資料合約（如 `TaiwanOverviewResponse`, `CountyDetailResponse`, `TownshipDetailResponse`）。
    *   所有時間戳統一標準化為 UTC+8 ISO8601。
*   **多層級空間與 Viewport 彙整 (Aggregation)**：
    *   **全臺層級 (National)**：22 縣市極值與綜合氣象/空品摘要。
    *   **四分區層級 (Regional)**：北部 7、中部 5、南部 5、東部 2 縣市分區摘要，澎湖、金門、連江 3 離島個別呈現、無分區映射（決策 D-011, D-012）。
    *   **縣市層級 (County)**：該縣市預報、轄下各測站觀測與轄屬鄉鎮概況。
    *   **鄉鎮層級 (Township)**：特定鄉鎮未來預報與鄰近測站實測。
    *   **空間邊界 (Viewport / Bounding Box)**：支援 `bbox=minLng,minLat,maxLng,maxLat` 參數，伺服端依坐標篩選可視區域內之測站與鄉鎮。
*   **資料語意分離原則嚴格落實（決策 D-021, D-023）**：
    *   **Forecast (預報)**：標記未來預估時段與降雨機率，不假裝為目前實況。
    *   **Observation (實測)**：標記特定測站經緯度與最新實測時間，不冒充全區現況。
    *   **Rain Station (雨量站)**：專注降雨累積量。
    *   **AQI (空品)**：依決策 D-013 採用轄區內「最差測站」作為區域保護指標，揭露站名與主要污染物，禁止數值平均；全缺值回傳 `null`，禁止補 0。
    *   **UV (紫外線)**：依 M12 實測語意清楚標示目前觀測或預報。
*   **伺服端彙整端點 (`/api/overview`, `/api/summary`)**：
    *   由伺服端並行讀取各領域之短期快取或端點模組，完成輕量彙整後包裝為統一 Response Envelope 回傳單一安全 JSON。
    *   避免前端發送過多元件級碎形請求。

### 非目標 (Non-Goals)：
*   **不規劃 Supabase Views / RPC / RLS**：V2 完全不使用 Supabase 或 PostgreSQL（決策 D-006, D-029 Superseded）。
*   **不一次傳送全臺所有測站完整時序至瀏覽器**：依決策 D-024 採按需階層傳輸。
*   **不在此階段開發地圖互動 UI**：留待 M14 處理。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   本 Milestone 不直接對接外網，由 M7～M12 實作之伺服端資料模組（預報、觀測、空品、UV、警特報）與 M8 靜態地理登記簿於伺服端彙整。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!IMPORTANT]
> 本架構為 Stateless V2，無任何資料庫儲存。彙整結果可按層級（如 `overview:national`）於快取介面中設置 Initial Candidate TTL 60～300 秒，不依賴 Function process 記憶體作為可靠儲存（決策 D-033, D-035, D-040, D-041）。

---

## 5. API 與介面設計 (API & Interface Design)

### 內部端點規格：`GET /api/overview`
*   **Query Parameters**:
    *   `level`: `"national"` | `"region"` | `"county"`
    *   `region`: `"north"` | `"central"` | `"south"` | `"east"` | `"islands"` (選填)
    *   `county`: 縣市名稱或代碼 (選填)
    *   `bbox`: `minLng,minLat,maxLng,maxLat` (選填)
*   **TypeScript Response 合約範例**:
    ```typescript
    export interface CountySummaryItem {
      countyCode: string;
      countyName: string;
      regionGroup: "北部" | "中部" | "南部" | "東部" | null;
      isIsland: boolean;
      forecast: {
        tempMin: number | null;
        tempMax: number | null;
        weatherDescription: string;
        weatherCode: string;
        popPercentage: number | null;
      };
      observation: {
        latestTemp: number | null;
        latestHumid: number | null;
        representativeStation: string | null;
        observedAt: string | null; // 實際觀測時間，UI 必須標記
      };
      aqi: {
        worstAqi: number | null;
        worstStatus: string | null;
        mainPollutant: string | null;
        stationName: string | null;
      };
      alertsCount: number;
    }

    export interface TaiwanOverviewResponse {
      success: true;
      data: {
        counties: CountySummaryItem[];
        activeAlertsCount: number;
      };
      meta: {
        fetchedTimestamp: string;
        freshness: "fresh" | "stale" | "unavailable"; // 明確定義：fresh 為有效資料，stale 為部分上游過期但仍有合法存續快取
        cacheStatus?: "HIT" | "MISS" | "STALE" | "BYPASS";
      };
    }
    ```

---

## 6. 驗收標準 (Acceptance Criteria)

1.  全臺 22 縣市與四分區彙整邏輯正確無誤，離島 3 縣市正確獨立呈現（`regionGroup: null`, `isIsland: true`）。
2.  AQI 區域彙整採用區內最差測站讀數，揭露代表站名與主要污染物，絕無數值平均與補 0 行為。
3.  預報、觀測、雨量、空品與 UV 語意嚴格分離，各欄位名稱與說明清晰無歧義。
4.  Viewport 空間過濾（`bbox`）能正確篩選視角內之地理實體與測站。
5.  所有型別介面通過 TypeScript strict typecheck。
6.  無任何資料庫 View、RPC 或 SQL 語法依賴。
7.  單元測試 100% 通過。

---

## 7. 安全與存取規範 (Security Requirements)

*   瀏覽器端僅呼叫內部彙整端點，不接觸外部金鑰。
*   端點參數經過強型別校驗（Zod），防止非法參數注入。
*   對錯誤回應進行脫敏保護，不洩漏伺服端檔案路徑或內部堆疊。

---

## 8. 測試策略 (Test Strategy)

*   單元測試：測試四分區分類映射、離島獨立規則、最差測站 AQI 演算法。
*   邊界測試：測試特定縣市全數測站故障或缺值時，回傳 `null` 而非崩潰或補 0。
*   空間邊界測試：驗證經緯度 Bounding Box 內外交界點篩選正確性。
*   型別校驗：執行 `tsc --noEmit` 驗證 TypeScript 合約無型別錯誤。

---

## 9. 風險與應對 (Risks)

*   **風險**：並行彙整各領域快取時若有部分來源逾時。
*   **應對**：採用 `Promise.allSettled`，個別資料來源若逾時標示為 `null` 並附帶局部狀態，不導致整個總覽頁面崩潰。

---

## 10. 手動驗收清單 (Manual Verification)

*   [ ] 呼叫 `/api/overview`，確認 22 縣市資料完整。
*   [ ] 檢核四分區與離島分組完全符合決策 D-011、D-012。
*   [ ] 驗證 AQI 數值為該縣市最差測站值，且附帶代表測站名稱。
*   [ ] 驗證帶入 `bbox` 參數時僅回傳邊界內測站。

---

## 11. 最終結果 (Final Result)

*(此處待 M13 實作與驗收完成後填寫)*
