# Milestone M10: 即時氣象觀測 API (M10-WEATHER-OBSERVATIONS.md)

本文件為 M10（Real-Time Weather Observation API）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 實測驗證並串接 CWA 地面即時觀測資料集（`O-A0003-001` 綜觀氣象觀測與候選 `O-A0002-001` 雨量觀測），建立 Next.js Server Route Handler 端點（`/api/observations`），提供全臺最新地面測站觀測（氣溫、相對濕度、氣壓、風向、風速、陣風）與最新雨量，包含測站 Metadata 與座標。實作官方缺值 sentinel 轉換與短期快取 (Short-Term Cache)，**不保存長期時序，不寫入任何永久資料庫**。
*   **Dependencies**: M7 (Vercel Server Data Gateway Foundation), M8 (Geographic Registry & CWA Dataset Discovery)

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **M10 實測驗證清單（官方真實 API 調查）**：
    *   真實 top-level JSON keys 與 station list 路徑
    *   StationId / StationName 真實欄位名稱
    *   ObsTime 真實格式與時區轉換 (UTC+8)
    *   GeoInfo 結構 (經緯度、海拔等)
    *   WeatherElement 真實欄位與數值結構
    *   官方特殊缺值 sentinel（例如 `-99`、`-999` 或其他缺測標記）
    *   各測站缺少部分要素時之容錯行為
    *   API response 體積大小與全臺總測站數量評估（用於評估快取策略）
    *   官方實際更新頻率與延遲情況
*   **資料語意分離（決策 D-021, D-023）**：
    *   測站觀測 (Observation) 僅代表特定經緯度測站之實測讀數，嚴禁直接宣稱為整個縣市或鄉鎮之實況。
    *   雨量測站網獨立標記為雨量專用，與綜觀氣象站明確區分。
*   **缺值防護與正規化**：
    *   官方缺值 sentinel（如 `-99`、`-999`）強制轉換為 `null`，**嚴格禁止填補 0**。
    *   無效數值不得參與任何平均計算。
*   **Server Route Handler 實作（決策 D-034）**：
    *   實作 `/api/observations` 端點，由伺服端持 `CWA_API_KEY` 代理取得資料。
    *   支援按縣市 (`county`) 或經緯度 Viewport 空間範圍進行過濾。
*   **短期快取策略（決策 D-035）**：
    *   全臺最新觀測資料於伺服端快取 5～15 分鐘。
    *   快取記載 `cachedAt` 與官方 `observedAt`，提供客戶端時間戳標示。
*   **上游連線失敗行為（決策 D-038）**：
    *   若 CWA API 暫時逾時或失敗且無可用快取，回傳 `unavailable: true` 與安全錯誤代碼，嚴禁顯示假資料或偽造假觀測時間。

### 非目標 (Non-Goals)：
*   **不寫入任何資料庫**：不建立 `weather_stations` 或 `weather_observations` 資料表（決策 D-033）。
*   **不保存長期觀測時序**：不進行跨天歷史時序留存或累積分析（決策 D-036）。
*   **不混淆預報與觀測**：兩者端點與資料模型嚴格分離（決策 D-021）。
*   **不在此階段開發前端地圖視覺化**：留待 M14 處理。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   **`O-A0003-001`**（氣象觀測站－10分鐘綜觀氣象資料）：
    *   來源：CWA（中央氣象署）
    *   狀態：Official dataset verified；Response schema 於本階段透過 live API 進行驗證。
    *   用途：即時地面測站氣象觀測（溫度、濕度、氣壓、風速、陣風等）。
*   **`O-A0002-001`**（雨量觀測站－雨量資料）：
    *   來源：CWA（中央氣象署）
    *   狀態：Candidate；提供更密集之雨量測站網擴充。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!IMPORTANT]
> 本架構為 Stateless V2，無任何永久資料庫表。觀測資料僅在 M7 快取介面中短暫暫存，不依賴 Function process 記憶體作為可靠儲存（決策 D-033, D-035, D-040）。

### 伺服端短期快取結構 (Cache Entry)
*   `cacheKey`: `observations:latest`
*   `initialCandidateTtl`: 300 ～ 900 秒 (5～15 分鐘，此為 Initial Candidate TTL，最終 TTL 依官方觀測每 10 分鐘更新頻率、API response headers 與 freshness 需求決定。**特別要求：Observation cache 不得將舊資料標示為即時，UI 必須顯示實際觀測時間**。)
*   `payload`:
    *   `datasetId`: `"O-A0003-001"`
    *   `sourceTimestamp`: 官方觀測資料發布時間戳 (UTC+8 ISO8601)
    *   `fetchedTimestamp`: 快取或擷取時間戳 (UTC+8 ISO8601)
    *   `freshness`: `"fresh" | "stale" | "unavailable"`
    *   `stations`: 測站最新觀測清單

---

## 5. API 與介面設計 (API & Interface Design)

### 內部端點規格：`GET /api/observations`
*   **Query Parameters**:
    *   `county`: 縣市名稱（選填，過濾特定縣市測站）
    *   `bbox`: `minLng,minLat,maxLng,maxLat`（選填，空間視角過濾）
*   **Response (200 OK)**:
    ```typescript
    interface ObservationsApiResponse {
      success: true;
      data: {
        stations: Array<{
          stationId: string;
          stationName: string;
          county: string;
          township: string;
          latitude: number;
          longitude: number;
          elevation: number | null;
          observedAt: string;          // 測站實際觀測時間 (UTC+8，UI 必須顯示此資料時間)
          temperature: number | null;
          relativeHumidity: number | null;
          pressure: number | null;
          windSpeed: number | null;
          windDirection: number | null;
          gustSpeed: number | null;
          precipitation: number | null;
          weatherDescription: string | null;
          qualityStatus: string | null; // 缺測或異常註記
        }>;
      };
      meta: {
        sourceTimestamp?: string;  // 官方觀測時間戳 (ISO8601 UTC+8)
        fetchedTimestamp: string;  // 伺服端請求或快取命中時間戳 (ISO8601 UTC+8)
        freshness: "fresh" | "stale" | "unavailable"; // 明確定義：fresh 為 TTL 內有效，stale 為上游失敗但仍有實際可讀取之過期快取
        cacheStatus?: "HIT" | "MISS" | "STALE" | "BYPASS";
      };
    }
    ```
*   **Response (503 / 504 Unavailable)**:
    ```typescript
    interface ObservationsErrorResponse {
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

1.  落實 M10 實測驗證清單，確認 CWA 觀測端點之真實 JSON 結構與測站欄位對應。
2.  Route Handler 回傳全臺即時測站之氣溫、濕度、氣壓、風速、陣風與雨量數值，且包含 `sourceTimestamp`、`fetchedTimestamp` 與 `freshness`。
3.  官方 `-99`、`-999` 等 sentinel 數值正確轉換為 `null`，嚴禁被替代為 `0`。
4.  資料庫無任何連線或持久化儲存邏輯。
5.  短期快取正常運作，候選 TTL 內重複呼叫直接命中快取，不重打 CWA API。
6.  外部 API 連線失敗且無實際可讀取快取時，安全回傳 `freshness: "unavailable"`，絕不將舊資料偽裝成即時。
7.  單元與 Mock 測試 100% 通過。

---

## 7. 安全與 TLS 規範 (Security Requirements)

*   `CWA_API_KEY` 僅留存於伺服端，不得出現在 Response、Header 或客戶端日誌中。
*   伺服端連線維持 TLS 憑證驗證，嚴禁關閉安全檢查。
*   測試嚴格使用 Mock 資料，不消耗正式 API 配額。

---

## 8. 測試策略 (Test Strategy)

*   單元測試：測試各類型測站之欄位多樣性與缺失值轉換（含 `-99` 轉 null）。
*   空間過濾測試：驗證 `county` 與 `bbox` 參數能正確篩選測站子集。
*   Mock 整合測試：驗證 Route Handler 於快取過期前與過期後的呼叫行為。
*   異常情境測試：模擬 CWA API 逾時或回傳 5xx，確認安全錯誤與 `unavailable: true` 格式。

---

## 9. 風險與應對 (Risks)

*   **風險**：全臺測站總數較多（數百個），單次 JSON 體積較大。
*   **應對**：伺服端快取單一全臺原始資料，由伺服端依照客戶端 `county` 或 `bbox` 參數快速過濾後再回傳精簡子集。

---

## 10. 手動驗收清單 (Manual Verification)

*   [ ] 呼叫 `/api/observations`，確認能取得全臺測站清單。
*   [ ] 檢查測站經緯度、溫度、濕度與雨量欄位正確對應。
*   [ ] 檢核故障測站數值為 null，未被填補 0。
*   [ ] 驗證連續請求正常命中短期快取。

---

## 11. 最終結果 (Final Result)

*(此處待 M10 實作與驗收完成後填寫)*
