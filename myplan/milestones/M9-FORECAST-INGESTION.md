# Milestone M9: 縣市與鄉鎮預報 API (M9-FORECAST-INGESTION.md)

本文件為 M9（County and Township Forecast API）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 建立 Next.js Server Route Handler 預報 API 端點（`/api/forecast`），提供縣市及鄉鎮雙層級天氣預報（逐時、逐 3 小時、逐 12 小時與逐日預報），完整解析溫度、體感溫度、相對濕度、降雨機率、風速風向與天氣現象。透過伺服端進行 Schema 驗證與資料正規化，並透過短期快取 (Short-Term Cache) 抵擋重複呼叫，**不寫入任何資料庫，不保存長期歷史時序**。
*   **Dependencies**: M7 (Vercel Server Data Gateway Foundation), M8 (Geographic Registry & CWA Dataset Discovery)

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **Server Route Handler 實作（決策 D-033, D-034）**：
    *   在 Next.js 伺服端實作預報端點（支援 `county` 與 `township` 參數查詢）。
    *   由伺服端使用 `CWA_API_KEY` 代理呼叫官方預報端點，前端不接觸金鑰。
*   **預報因子完整解析與多時段顆粒度**：
    *   解析氣溫、體感溫度、相對濕度、降雨機率 (PoP)、風速、風向、天氣現象描述與天氣代碼。
    *   支援不同時間解析度（逐時/逐 3 小時/逐 12 小時/逐日）之資料正規化。
*   **資料驗證與缺值防護**：
    *   使用 Zod 驗證 CWA 回傳結構，過濾異常結構。
    *   空值、官方 sentinel 或缺失數值統一轉換為 `null`，**嚴格禁止填補 0**。
    *   所有預報時段標準化為 UTC+8 ISO8601 字串。
*   **短期快取策略 (Short-Term Cache)（決策 D-035）**：
    *   對同一行政區之預報結果提供 10～30 分鐘之伺服端短期快取。
    *   快取記錄 `cachedAt` 與 `expiresAt`，明確註記官方預報發布時間。
*   **錯誤與離線容錯（決策 D-038）**：
    *   當 CWA API 暫時連線失敗或逾時且無快取可用時，回傳 `unavailable: true` 與安全錯誤代碼，嚴禁偽造假資料或假預報。

### 非目標 (Non-Goals)：
*   **不寫入任何資料庫**：不使用 PostgreSQL、Supabase、SQLite 保存時序（決策 D-033）。
*   **不保存歷史預報快照**：不進行預報歷史對比或時序分析（留待可選 M17 評估，決策 D-036）。
*   **不在此階段處理觀測或空品**：由 M10、M11 專責處理。
*   **不在此階段建立前端圖表 UI**：由 M14 實作。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   `F-D0047-091`（臺灣各縣市未來 1 週天氣預報）：Verified。
*   CWA 鄉鎮級預報資料集（依 M8 探勘結果確認之端點代碼）：Candidate。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!IMPORTANT]
> 本架構為 Stateless V2，不建立任何資料庫表。所有預報資料僅透過 M7 快取介面暫存，不依賴 Function process 記憶體作為可靠儲存（決策 D-033, D-035, D-040）。

### 伺服端短期快取項目結構 (Cache Entry)
*   `cacheKey`: `forecast:${entityLevel}:${entityCode}`
*   `initialCandidateTtl`: 600 ～ 1800 秒 (10～30 分鐘，此為 Initial Candidate TTL，最終 TTL 依官方更新頻率、API response headers 與 freshness 需求決定)
*   `payload`:
    *   `entityCode`: 行政區代碼
    *   `entityName`: 縣市或鄉鎮中文名
    *   `sourceTimestamp`: CWA 官方發布時間 (UTC+8)
    *   `fetchedTimestamp`: 伺服端向官方請求或快取命中時間 (UTC+8)
    *   `freshness`: `"fresh" | "stale" | "unavailable"`
    *   `forecasts`: 預報項目陣列（含開始結束時間、溫度、體感、降雨機率等）

---

## 5. API 與介面設計 (API & Interface Design)

### 內部端點規格：`GET /api/forecast`
*   **Query Parameters**:
    *   `level`: `"county"` | `"township"` (必填)
    *   `code`: 行政區代碼（如縣市代碼或鄉鎮代碼）
*   **Response (200 OK)**:
    ```typescript
    interface ForecastApiResponse {
      success: true;
      data: {
        entityCode: string;
        entityName: string;
        items: Array<{
          startTime: string;
          endTime: string;
          granularity: "1_HOUR" | "3_HOUR" | "12_HOUR" | "DAILY";
          temperature: number | null;
          apparentTemperature: number | null;
          relativeHumidity: number | null;
          popPercentage: number | null;
          windSpeed: number | null;
          windDirection: string | null;
          weatherDescription: string;
          weatherCode: string;
        }>;
      };
      meta: {
        sourceTimestamp?: string;  // CWA 官方發布時間 (ISO8601 UTC+8)
        fetchedTimestamp: string;  // 伺服端擷取或快取命中時間 (ISO8601 UTC+8)
        freshness: "fresh" | "stale" | "unavailable"; // 新鮮度狀態定義：fresh 為 TTL 內有效，stale 為上游失敗但仍有實際可讀取之過期快取
        cacheStatus?: "HIT" | "MISS" | "STALE" | "BYPASS";
      };
    }
    ```
*   **Response (503 / 504 Unavailable)**:
    ```typescript
    interface ForecastErrorResponse {
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

1.  成功透過 Next.js Route Handler 回傳縣市與鄉鎮預報，包含體感溫度、降雨機率等所有必要因子。
2.  所有預報時間統一標準化為 UTC+8 ISO8601 字串，回應包含 `sourceTimestamp`、`fetchedTimestamp` 與 `freshness`。
3.  無效或缺失預報值正確轉化為 `null`，嚴禁出現 `0` 替代缺失值的狀況。
4.  無任何資料庫連線代碼或持久化寫入邏輯。
5.  短期快取正常運作，連續多次請求同一行政區時，後續請求於候選 TTL 內回傳且不重發官方 API 請求。
6.  官方 API 異常且無實際可讀取快取時，安全回傳 `freshness: "unavailable"` 與錯誤代碼，絕不偽造假資料或假時間戳。
7.  Mock 整合測試與單元測試 100% 通過。

---

## 7. 安全與 TLS 規範 (Security Requirements)

*   `CWA_API_KEY` 僅在伺服端讀取，絕不透過 Response 或 Header 回傳給前端。
*   伺服端呼叫 CWA API 必須保持 TLS 憑證校驗，嚴禁 `verify=False`。
*   測試嚴格使用 Mock 假資料與假金鑰。

---

## 8. 測試策略 (Test Strategy)

*   單元測試：測試預報各因子的數值正規化、空值處理、時區轉換。
*   Mock Route Handler 測試：模擬 CWA API 回應，驗證 Route Handler 回傳格式、快取命中與快取過期行為。
*   異常情境測試：模擬 CWA API 逾時或 500 錯誤，確認前端獲得標準脫敏錯誤回應。

---

## 9. 風險與應對 (Risks)

*   **風險**：全臺所有鄉鎮一次查詢資料量龐大，可能導致官方 API 逾時。
*   **應對**：前端依選取之縣市按需發送請求 (`level=township&code=...`)，各縣市結果獨立快取。

---

## 10. 手動驗收清單 (Manual Verification)

*   [ ] 呼叫 `/api/forecast?level=county&code=63000`，驗證回傳臺北市未來預報結構正確。
*   [ ] 檢核體感溫度與降雨機率皆正確呈現。
*   [ ] 驗證快速連續呼叫時伺服端正常命中短期快取。
*   [ ] 驗證關閉網路時回傳安全的 `unavailable: true`。

---

## 11. 最終結果 (Final Result)

*(此處待 M9 實作與驗收完成後填寫)*
