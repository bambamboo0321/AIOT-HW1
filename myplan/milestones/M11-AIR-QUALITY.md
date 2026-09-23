# Milestone M11: 環境部空氣品質 API (M11-AIR-QUALITY.md)

本文件為 M11（MOENV Air Quality API）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 實測驗證並安全串接環境部空氣品質開放資料集（候選 `aqx_p_432`），建立 Next.js Server Route Handler 端點（`/api/air-quality`），提供全臺最新空氣品質測站之 AQI 指標、PM2.5、PM10、主要污染物及監測濃度。落實伺服端專用 `MOENV_API_KEY` 金鑰隔離、空值防護與短期快取 (Short-Term Cache)，**不保存歷史時序，不建立任何永久資料庫**。
*   **Dependencies**: M7 (Vercel Server Data Gateway Foundation), M8 (Geographic Registry & CWA Dataset Discovery)

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **MOENV API 連線與安全驗證**：
    *   在 Next.js 伺服端實作環境部 API 請求模組，使用伺服端環境變數 `MOENV_API_KEY`。
    *   獨立驗證 MOENV TLS/SSL 憑證鏈，嚴禁 `rejectUnauthorized: false` 或 `verify=False`（決策 D-009）。
    *   缺少金鑰時拋出安全脫敏例外，絕不在錯誤或 URL 中暴露金鑰。
*   **空品資料解析與防護**：
    *   空字串 `""` 或無效數值嚴格轉換為 `null`，**嚴禁填補 0**（決策 D-008）。
    *   保留主要污染物 (pollutant)、AQI 狀態描述 (status) 與監測發布時間 (observedAt)。
*   **資料語意與彙整原則（決策 D-013）**：
    *   空品測站數值僅代表該測站本身。
    *   縣市層級若需呈現代表性 AQI，採用轄區內「最差測站」作為保護性指標，不以純數值平均掩蓋空氣品質危害。
*   **短期快取策略（決策 D-035）**：
    *   環境部資料一般每小時更新，伺服端提供 10～20 分鐘之短期快取。
    *   記錄 `cachedAt` 與官方發布時間，標記資料時效性。
*   **上游連線失敗行為（決策 D-038）**：
    *   若 MOENV API 暫時 503 維護或連線逾時且無可用快取，回傳 `unavailable: true` 與安全錯誤代碼，嚴禁顯示假資料。

### 非目標 (Non-Goals)：
*   **不寫入任何資料庫**：不建立 `aqi_stations` 或 `aqi_observations` 資料表（決策 D-033）。
*   **不保存長期空品歷史**：不進行歷史時序留存或跨月趨勢計算（決策 D-036）。
*   **不將金鑰傳送至前端**：前端不接觸任何 MOENV 金鑰（決策 D-034）。
*   **不在此階段開發前端地圖視覺化**：留待 M14 處理。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   `aqx_p_432`（空氣品質指標 AQI）：Candidate，待 M11 進行端點有效性與 live API 驗證。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!IMPORTANT]
> 本架構為 Stateless V2，無任何永久資料庫表。空品資料僅在 M7 快取介面中短暫暫存，不依賴 Function process 記憶體作為可靠儲存（決策 D-033, D-035, D-040）。

### 伺服端短期快取結構 (Cache Entry)
*   `cacheKey`: `air-quality:latest`
*   `initialCandidateTtl`: 300 ～ 900 秒 (5～15 分鐘，此為 Initial Candidate TTL，最終 TTL 依環境部每小時更新頻率、API response headers 與 freshness 需求實測決定)
*   `payload`:
    *   `datasetId`: `"aqx_p_432"`
    *   `sourceTimestamp`: 官方發布時間戳 (UTC+8 ISO8601)
    *   `fetchedTimestamp`: 伺服端請求或快取命中時間戳 (UTC+8 ISO8601)
    *   `freshness`: `"fresh" | "stale" | "unavailable"`
    *   `sites`: 空品測站最新讀數清單

---

## 5. API 與介面設計 (API & Interface Design)

### 內部端點規格：`GET /api/air-quality`
*   **Query Parameters**:
    *   `county`: 縣市名稱（選填，過濾特定縣市空品站）
*   **Response (200 OK)**:
    ```typescript
    interface AirQualityApiResponse {
      success: true;
      data: {
        sites: Array<{
          siteId: string;
          siteName: string;
          county: string;
          township: string | null;
          latitude: number;
          longitude: number;
          siteType: string | null;
          observedAt: string;          // 官方發布時間 (UTC+8)
          aqi: number | null;
          status: string | null;       // 如 "良好", "普通", "對敏感族群不健康"
          pm25: number | null;
          pm10: number | null;
          o3: number | null;
          co: number | null;
          so2: number | null;
          no2: number | null;
          pollutant: string | null;    // 主要污染物
        }>;
      };
      meta: {
        sourceTimestamp?: string;  // 官方資料發布時間 (ISO8601 UTC+8)
        fetchedTimestamp: string;  // 伺服端請求或快取命中時間 (ISO8601 UTC+8)
        freshness: "fresh" | "stale" | "unavailable"; // 明確定義：fresh 為 TTL 內有效，stale 為上游失敗但仍有實際可讀取之過期快取
        cacheStatus?: "HIT" | "MISS" | "STALE" | "BYPASS";
      };
    }
    ```
*   **Response (503 / 504 Unavailable)**:
    ```typescript
    interface AirQualityErrorResponse {
      success: false;
      data: null;
      error: {
        message: string;
        code: "UPSTREAM_TIMEOUT" | "UPSTREAM_ERROR" | "RATE_LIMITED" | "UNAVAILABLE";
        unavailable: true;
      };
      meta: {
        fetchedTimestamp: string;
        freshness: "unavailable";
      };
    }
    ```

---

## 6. 驗收標準 (Acceptance Criteria)

1.  成功完成 MOENV API 之伺服端連線與真實資料格式驗證。
2.  金鑰安全機製生效，未配置 `MOENV_API_KEY` 時拋出安全脫敏例外，絕不在日誌或回應暴露 Key。
3.  空字串數值安全轉換為 `null`，無補 0 現象；回應包含 `sourceTimestamp`、`fetchedTimestamp` 與 `freshness`。
4.  無任何資料庫連線代碼或持久化寫入邏輯。
5.  短期快取正常運作，候選 TTL 內重複請求直接命中快取，不重覆請求 MOENV API。
6.  上游異常且無實際可讀取快取時正確回傳 `freshness: "unavailable"`，絕不偽造假資料或補 0。
7.  單元與 Mock 測試 100% 通過。

---

## 7. 安全與 TLS 規範 (Security Requirements)

*   `MOENV_API_KEY` 僅留存於伺服端環境變數，禁止以 `NEXT_PUBLIC_` 匯出。
*   獨立驗證 MOENV TLS 憑證鏈，嚴禁關閉安全檢查。
*   測試嚴格使用 Mock 資料，不使用真實金鑰。

---

## 8. 測試策略 (Test Strategy)

*   單元測試：測試缺少金鑰例外拋出、空字串轉為 null、異常污染數值容錯。
*   Mock 整合測試：使用模擬 JSON 回應驗證 Route Handler 回傳結構與快取行為。
*   縣市過濾測試：驗證 `county` 參數正確篩選該縣市之空品測站。

---

## 9. 風險與應對 (Risks)

*   **風險**：環境部 API 曾有排程更新延遲或 503 暫時維護狀況。
*   **應對**：設定合理連線超時，若快取存在則允許標示 `STALE` 容錯，若無快取則安全回傳 `unavailable: true`，不中斷整體網站。

---

## 10. 手動驗收清單 (Manual Verification)

*   [ ] 呼叫 `/api/air-quality`，確認取得全臺測站清單。
*   [ ] 檢核永和等歷史缺測站點之 PM2.5 欄位正確為 null，非 0。
*   [ ] 驗證連續呼叫時伺服端正常命中短期快取。

---

## 11. 最終結果 (Final Result)

*(此處待 M11 實作與驗收完成後填寫)*
