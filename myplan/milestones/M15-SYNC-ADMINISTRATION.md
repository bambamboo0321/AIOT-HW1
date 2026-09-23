# Milestone M15: 重新整理、快取與管理員診斷 (M15-SYNC-ADMINISTRATION.md)

本文件為 M15（Refresh, Cache and Admin Diagnostics）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 建立安全的手動重新整理機制 (Manual Refresh)、快取狀態與時效檢查 (Cache Status & Freshness)、官方最新資料時間戳檢視 (Official Timestamps)、伺服端連線診斷 (Server Fetch Diagnostics) 以及防高頻刷新的冷卻限流機制。**專注於無狀態伺服端快取管理與健康診斷，不做資料庫同步，不做歷史時序累積，不建立 Python 背景工作程序 (Background Worker)**。
*   **Dependencies**: M7～M14（Next.js 伺服端閘道與前端介面皆已建立）

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **安全的手動 Refresh 機制**：
    *   提供安全、受控的資料更新機制，可清除特定領域（預報、觀測、空品）之伺服端短期快取，強制回源取得官方最新資料。
    *   若為一般訪客觸發，實作冷卻時間（如 60 秒 Cooldown）與全域 Rate Limit，防止公眾高頻刷爆 CWA/MOENV API 配額。
    *   若為管理端點，受 `ADMIN_PASSWORD` 保護，提供即時重置快取功能。
*   **快取狀態與時效呈現 (Cache Status)**：
    *   在診斷介面或 API Header 提供快取中繼資訊：`X-Cache: HIT | MISS | STALE`、快取生成時間 (`cachedAt`)、過期剩餘時間 (`ttlRemaining`)。
    *   前端 UI 清楚展示官方實際資料發布時間戳（`officialIssueTime` / `observedAt`），落實決策 D-022 與 D-035。
*   **伺服端連線診斷 (Server Fetch Diagnostics)**：
    *   提供安全且脫敏之伺服端健康檢查端點（`/api/diagnostics`）。
    *   檢測 CWA 與 MOENV 官方端點連線狀態、HTTP 延遲、TLS 握手狀態與錯誤分類。
    *   診斷日誌嚴格過濾與脫敏，絕不暴露 API Key、授權標頭或敏感路徑。
*   **高頻刷新防護 (Anti-Abuse / Rate Limiting)**：
    *   客戶端：按鈕防抖 (Debounce) 與倒數冷卻 UI。
    *   伺服端：IP / Token 級別的限流機制（如每分鐘最多 5 次強制 refresh 請求）。

### 非目標 (Non-Goals)：
*   **不做資料庫同步**：V2 不採用任何持久化資料庫，不進行 DB Ingestion 或 Table Sync（決策 D-033）。
*   **不做歷史資料保存**：不收集歷史快照（決策 D-036）。
*   **不建立 Python 背景工作程序**：依決策 D-030，V2 由 Next.js 伺服端按需代理，不建立常駐或排程 Python Worker，除非未來另行專案批准。
*   **不得依賴快取作為資料可用性唯一保證**：若上游失敗且沒有「實際可讀取」的快取 entry，安全回傳 `unavailable: true`；不得承諾過期項目必可讀取，亦嚴禁偽造假資料或補 0（決策 D-035, D-038, D-040）。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   本 Milestone 診斷與控制對象為 M7～M12 之 Next.js 伺服端 API Gateway、短期快取模組以及外部 CWA / MOENV 官方端點連線狀況。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!IMPORTANT]
> 本架構為 Stateless V2，無任何資料庫儲存。限流與快取狀態透過 M7 實測選定之快取與邊緣介面進行管理，不依賴 Function process 記憶體作為可靠儲存（決策 D-033, D-035, D-040）。

---

## 5. API 與介面設計 (API & Interface Design)

### 內部端點規格 1：`POST /api/refresh`
*   **Headers**:
    *   `x-admin-password`: 密碼（選填，若有則略過冷卻；若無則受 60s 訪客限流保護）
*   **Body**:
    *   `target`: `"all"` | `"forecast"` | `"observations"` | `"air-quality"` | `"uv"`
*   **Response (200 OK)**:
    ```typescript
    interface RefreshResponse {
      status: "REFRESHED" | "RATE_LIMITED";
      refreshedAt: string;
      cooldownSeconds: number;
      target: string;
    }
    ```

### 內部端點規格 2：`GET /api/diagnostics` (受 ADMIN_PASSWORD 保護或脫敏公開)
*   **Response (200 OK)**:
    ```typescript
    interface DiagnosticsResponse {
      timestamp: string;
      cwaApi: {
        reachable: boolean;
        latencyMs: number;
        tlsValid: boolean;
        status: number;
      };
      moenvApi: {
        reachable: boolean;
        latencyMs: number;
        tlsValid: boolean;
        status: number;
      };
      cache: {
        totalKeys: number;
        forecastAgeSeconds: number | null;
        observationAgeSeconds: number | null;
        aqiAgeSeconds: number | null;
      };
    }
    ```

---

## 6. 驗收標準 (Acceptance Criteria)

1.  手動 Refresh 功能正常，能在清除快取後觸發向官方 API 重新取得最新資料。
2.  訪客觸發 Refresh 具有明確冷卻限制（60 秒內無法重複觸發），防止濫用。
3.  管理診斷端點能精確回傳官方端點連線延遲、TLS 狀態與快取年齡，且所有日誌與回應 100% 脫敏無金鑰。
4.  無任何資料庫連線、無 migration、無 Python Worker 依賴。
5.  前端介面正確顯示官方資料發布時間與快取狀態標籤。
6.  單元與整合測試 100% 通過。

---

## 7. 安全與防洩密規範 (Security Requirements)

*   `ADMIN_PASSWORD`、`CWA_API_KEY`、`MOENV_API_KEY` 僅留存於伺服端環境變數，絕不出現在診斷回應中。
*   診斷端點對外暴露時，若未帶管理憑證僅回傳布林值健康狀態（如 `healthy: true`），詳細延遲與快取細節需驗證管理密碼。

---

## 8. 測試策略 (Test Strategy)

*   限流測試：驗證高頻連續發送 Refresh 請求時，正確觸發 429 Too Many Requests 或冷卻阻絕。
*   快取刷新測試：驗證在 Cache Hit 狀態下呼叫 Refresh 後，下一次讀取正確觸發 Fetch 並更新快取。
*   診斷脫敏測試：檢查診斷回應與伺服端 Console 日誌，驗證零金鑰、零 Authorization Header。

---

## 9. 風險與應對 (Risks)

*   **風險**：惡意使用者利用 Refresh 端點發動大量請求導致伺服端向官方 API 發動 DoS。
*   **應對**：伺服端設置全域與 IP 級別嚴格 Rate Limiter，必要時啟用 Cloudflare / Vercel WAF 防護。

---

## 10. 手動驗收清單 (Manual Verification)

*   [ ] 點擊介面上之手動重新整理按鈕，確認資料時間戳更新，且按鈕進入 60 秒冷卻狀態。
*   [ ] 快速連續點擊或發送 Refresh 請求，確認後續請求被伺服端安全攔截。
*   [ ] 檢核診斷端點，確認 CWA 與 MOENV 連線檢測正確，無敏感資訊洩漏。

---

## 11. 最終結果 (Final Result)

*(此處待 M15 實作與驗收完成後填寫)*
