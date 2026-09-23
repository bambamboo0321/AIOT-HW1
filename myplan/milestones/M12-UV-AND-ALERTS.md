# Milestone M12: 紫外線與氣象警特報 API (M12-UV-AND-ALERTS.md)

本文件為 M12（UV and Weather Alerts API）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 實測驗證 CWA 官方紫外線資料集與資料語意（候選 `O-A0005-001` 等），串接 CWA 有效天氣災害警特報資料集（候選 `W-C0033-001` 等），建立 Next.js Server Route Handler 端點（`/api/uv`、`/api/alerts`），提供最新官方 UV 觀測/預報與有效氣象警特報，完整呈現發布與生效時間。透過伺服端短期快取 (Short-Term Cache) 保障時效性與降低 API 請求，**不保存過期歷史資料，不寫入任何永久資料庫**。
*   **Dependencies**: M7 (Vercel Server Data Gateway Foundation), M8 (Geographic Registry & CWA Dataset Discovery)

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **紫外線資料集實測驗證（決策 D-015）**：
    *   在 M12 開始時透過官方文件與 live API 驗證：候選端點有效性、資料代表「目前觀測」、「今日最大值」或「預報值」、發布頻率與時間、測站經緯度涵蓋範圍與真實 JSON 欄位結構。
    *   API 回應與 UI 標籤依驗證結果動態標示（如 `current` / `daily_max` / `forecast`），嚴禁預先固定錯誤語意。
*   **有效氣象警特報解析**：
    *   解析 CWA 天氣災害警特報資料集（大雨、豪雨、陸上強風、低溫特報等）。
    *   過濾僅保留**目前有效中**之警特報（依 `effectiveFrom` 與 `effectiveTo` 判定），過期警報自動排除。
*   **Server Route Handler 實作（決策 D-034）**：
    *   `/api/uv`：回傳全臺各站最新紫外線指數、風險等級 (低量/中量/高量/過量/危險) 與資料語意。
    *   `/api/alerts`：回傳目前有效中之天氣警特報、影響縣市、等級、說明與有效時間。
*   **短期快取策略（決策 D-035）**：
    *   紫外線資料快取 10～30 分鐘。
    *   警特報具高即時性，快取 2～5 分鐘。
*   **上游連線失敗行為（決策 D-038）**：
    *   連線逾時或官方失敗且無快取時，安全回傳 `unavailable: true`。

### 非目標 (Non-Goals)：
*   **不寫入任何資料庫**：不建立 `uv_observations` 或 `weather_alerts` 資料表（決策 D-033）。
*   **不保存歷史警報或歷史 UV**：過期警特報隨時間自然失效丟棄，不留存歷史庫（決策 D-036）。
*   **不實作主動推播**：不發送 SMS、LINE 或 Email 通知（維持網頁主動查詢模式）。
*   **不在此階段開發地圖視覺化**：留待 M14 處理。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   CWA 紫外線候選資料集（如 `O-A0005-001` 等）：Candidate，待 M12 實測驗證資料語意。
*   CWA 氣象警特報資料集（如 `W-C0033-001` 等）：Candidate，待 M12 實測驗證有效時間欄位。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!IMPORTANT]
> 本架構為 Stateless V2，無任何永久資料庫表。紫外線與警特報僅在 M7 快取介面中短暫暫存，不依賴 Function process 記憶體作為可靠儲存（決策 D-033, D-035, D-040）。

### 伺服端短期快取結構 (Cache Entry)
*   `cacheKey`: `uv:latest` (Initial Candidate TTL: 600～1800 秒，待 M12 依官方發布週期與資料語意實測決定)
*   `cacheKey`: `alerts:active` (Initial Candidate TTL: 120～300 秒，待 M12 實測決定。**特別要求：Alert 快取不得因 TTL 過長延誤有效警報**。)

---

## 5. API 與介面設計 (API & Interface Design)

### 內部端點規格 1：`GET /api/uv`
*   **Response (200 OK)**:
    ```typescript
    interface UvApiResponse {
      success: true;
      data: {
        dataSemantic: "CURRENT" | "DAILY_MAX" | "FORECAST"; // 依 M12 實測結果決定
        stations: Array<{
          stationId: string;
          stationName: string;
          county: string;
          latitude: number;
          longitude: number;
          observedAt: string;          // 官方發布時間 (UTC+8)
          uvIndex: number | null;
          uvLevel: "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH" | "EXTREME" | null;
        }>;
      };
      meta: {
        sourceTimestamp?: string;  // 官方原始資料發布時間 (ISO8601 UTC+8)
        fetchedTimestamp: string;  // 伺服端請求或快取命中時間 (ISO8601 UTC+8)
        freshness: "fresh" | "stale" | "unavailable"; // 明確新鮮度狀態
        cacheStatus?: "HIT" | "MISS" | "STALE" | "BYPASS";
      };
    }
    ```

### 內部端點規格 2：`GET /api/alerts`
*   **Response (200 OK)**:
    ```typescript
    interface AlertsApiResponse {
      success: true;
      data: {
        activeAlertsCount: number;
        alerts: Array<{
          alertId: string;
          eventName: string;         // 如 "豪雨特報", "低溫特報"
          severity: "WARNING" | "ADVISORY" | "WATCH";
          effectiveFrom: string;     // ISO8601 UTC+8
          effectiveTo: string;       // ISO8601 UTC+8
          affectedCounties: string[];
          headline: string;
          description: string;
        }>;
      };
      meta: {
        sourceTimestamp?: string;  // 官方警特報發布時間 (ISO8601 UTC+8)
        fetchedTimestamp: string;  // 伺服端請求或快取命中時間 (ISO8601 UTC+8)
        freshness: "fresh" | "stale" | "unavailable"; // 明確新鮮度狀態
        cacheStatus?: "HIT" | "MISS" | "STALE" | "BYPASS";
      };
    }
    ```

---

## 6. 驗收標準 (Acceptance Criteria)

1.  完成紫外線資料源實測報告，確認官方 Dataset ID、資料語意與欄位結構，落實決策 D-015。
2.  紫外線指數與 risk_level（低量 0-2 / 中量 3-5 / 高量 6-7 / 過量 8-10 / 危險 11+）正確計算，無效值為 `null`；回應包含 `sourceTimestamp`、`fetchedTimestamp` 與 `freshness`。
3.  警特報端點正確過濾出當前有效之警特報，過期警報自動剔除。
4.  無任何資料庫連線代碼或持久化寫入邏輯。
5.  短期快取正常運作，候選 TTL 內重複呼叫直接命中快取；警特報快取設定不得延誤有效災害警特報之即時呈現。
6.  上游連線失敗且無實際可讀取快取時，安全回傳 `freshness: "unavailable"`，絕不偽造假成功或補 0。
7.  單元與 Mock 測試 100% 通過。

---

## 7. 安全與 TLS 規範 (Security Requirements)

*   `CWA_API_KEY` 僅留存於伺服端環境變數，絕不回傳前端。
*   連線強制維持 TLS 校驗，嚴禁 `verify=False`。
*   測試嚴格使用 Mock 資料。

---

## 8. 測試策略 (Test Strategy)

*   單元測試：測試紫外線等級分類演算法、警特報文字與有效時間區間比對邏輯。
*   Mock 整合測試：模擬真實 API 回應，驗證 Route Handler 回傳結構與快取行為。
*   過期測試：模擬包含已過期與生效中警報之資料集，確認過期警報被過濾。

---

## 9. 風險與應對 (Risks)

*   **風險**：紫外線候選資料集若缺乏測站座標。
*   **應對**：透過 M8 靜態地理登記簿或 M10 測站代碼進行對照，補齊經緯度與行政區。

---

## 10. 手動驗收清單 (Manual Verification)

*   [ ] 呼叫 `/api/uv`，確認取得最新紫外線數值與正確語意標籤。
*   [ ] 呼叫 `/api/alerts`，檢核生效中之警特報資訊正確無誤。
*   [ ] 驗證連續呼叫時伺服端正常命中短期快取。

---

## 11. 最終結果 (Final Result)

*(此處待 M12 實作與驗收完成後填寫)*
