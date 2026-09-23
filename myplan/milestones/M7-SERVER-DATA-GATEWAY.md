# Milestone M7: Vercel Web 基礎與伺服端資料閘道 (M7-SERVER-DATA-GATEWAY.md)

本文件為 M7（Vercel Web Foundation and Server Data Gateway）之規格骨架。
**本次僅修改規劃文件，不建立 `web/` 目錄或程式檔案，不得開始程式實作，亦不建立正式雲端資源。**

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 建立最小 `web/` Next.js + TypeScript 專案基礎、App Router 基礎、伺服端專用 (Server-Only) 安全 HTTP Client、Route Handler 基礎架構、伺服端環境變數安全校驗機制、Timeout、TLS 憑證安全驗證、錯誤分類與脫敏對映 (Credentials Redaction)、標準回應包裝 (Response Envelope)、快取介面 (Cache Interface) 與測試、最小健康/狀態檢查端點 (`/api/health`)，以及 Vitest 或合適之單元測試基礎。**不建立正式地圖 UI、不整合完整 CWA/MOENV 資料集、不建立資料庫（決策 D-033, D-039）**。
*   **Dependencies**: M1～M6.2（Legacy Streamlit V1 已驗證 CWA API 請求模式與欄位語意）

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 未來實作範圍 (Scope)：
*   **建立最小 `web/` Next.js + TypeScript 專案（決策 D-026, D-028, D-039）**：
    *   在 repository 的 `web/` 目錄建立最小 Next.js + TypeScript 專案骨架。
    *   配置 TypeScript、ESLint 與 Vercel Root Directory 部署所需基礎設定。
*   **建立 App Router 基礎**：
    *   建立基礎 App Router 結構（根佈局 `layout.tsx`、最小狀態頁 `page.tsx`）。
    *   **不建立正式地圖 UI**：正式地圖、圖層與控制元件留待 M14 實作。
*   **建立 Server-Only HTTP Client**：
    *   連線與讀取 Timeout（預設 8～10 秒），防止上游掛起導致伺服端執行逾時。
    *   嚴格要求 TLS/SSL 憑證校驗，嚴禁 `rejectUnauthorized: false` 或 `verify=False`（決策 D-009）。
    *   封裝安全 Headers、User-Agent 與金鑰注入機制。
*   **建立 Route Handler 基礎架構**：
    *   在 Next.js Server Route Handlers（`web/src/app/api/...`）建立安全代理閘道基礎。
    *   所有官方 API request 只能由伺服端發送，瀏覽器嚴禁直接發送含政府 API Key 之請求（決策 D-034）。
*   **建立環境變數安全校驗 (Environment Validation)**：
    *   `CWA_API_KEY` 與 `MOENV_API_KEY` 僅能由 Vercel Server-Side Environment Variables 注入。
    *   嚴格禁止附加 `NEXT_PUBLIC_` 前綴，嚴格禁止進入客戶端 JavaScript Bundle。
    *   使用 Zod 在啟動時嚴格驗證伺服端必要環境變數，缺失時拋出安全例外。
*   **建立 Timeout、TLS、Error Mapping 與 Redaction（決策 D-022, D-038）**：
    *   上游錯誤（401/403 AuthError, 429 RateLimitError, 5xx UpstreamError, TimeoutError, ParseError）在伺服端日誌記錄脫敏細節。
    *   回傳給瀏覽器的錯誤訊息必須安全脫敏，嚴禁暴露官方端點 URL、金鑰或授權標頭。
    *   上游失敗且沒有「實際可讀取」的快取 entry 時，明確回傳 `unavailable: true`，嚴禁偽造假資料或假成功。
*   **建立 Response Envelope 與資料正規化**：
    *   定義統一回應結構（含 `data`、`meta`、`error`），`meta` 包含 `sourceTimestamp`、`fetchedTimestamp`、`freshness` 等欄位。
    *   無效或缺失數值強制正規化為 `null`，嚴格禁止補 `0`。
*   **建立 Cache Interface 與測試（決策 D-035, D-040）**：
    *   定義快取抽象介面，支援取得、寫入、過期檢查與狀態判定。
    *   M7 Research 必須實測確認 Next.js / Vercel 正式支援之 cache API，快取實作在實測前保持未定。
*   **建立最小 Health/Status Endpoint**：
    *   實作 `/api/health` 唯讀端點，安全檢查伺服端環境變數注入狀態、系統時間與閘道就緒狀態。
*   **建立 Vitest 或適合的 Unit-Test 基礎**：
    *   建立完整的 Mock HTTP Client 測試套件，不依賴外網即可完整驗證閘道邏輯、逾時與脫敏。

### 非目標 (Non-Goals)：
*   **不建立正式地圖 UI**：縣市/鄉鎮地圖、圖層控制、互動面板全數由 M14 實作。
*   **不整合完整 CWA/MOENV Dataset**：預報（M9）、觀測（M10）、空品（M11）、UV與警特報（M12）之完整資料集整合留待各自 Milestone。
*   **不建立永久雲端資料庫**：不使用 PostgreSQL、Supabase、Neon、Firebase 等永久資料庫（決策 D-033）。
*   **不進行資料庫 Migration**：移除所有 migration、`DATABASE_URL`、psycopg、RLS 與 Service Role Key 規劃。
*   **不在失敗時 fallback 寫入本機 SQLite**：SQLite 僅限 Legacy Streamlit V1 使用，不作為 V2 儲存（決策 D-005, D-037）。
*   **不保存長期時序快照**：不進行跨日、跨月歷史資料累積（決策 D-002, D-036）。
*   **本次不建立 web/ 目錄**：本次工作僅限規劃文件修正，不得建立任何程式檔案。

---

## 3. 候選資料來源與金鑰邊界 (Data Sources & Secrets Boundary)

| 服務項目 | 官方端點候選 | 伺服端環境變數名稱 | 存取權限邊界 |
| :--- | :--- | :--- | :--- |
| 中央氣象署 (CWA) | `https://opendata.cwa.gov.tw/api/...` | `CWA_API_KEY` | **Vercel Server-Only**（嚴禁前端讀取） |
| 環境部 (MOENV) | `https://data.moenv.gov.tw/api/v2/...` | `MOENV_API_KEY` | **Vercel Server-Only**（嚴禁前端讀取） |
| 管理員操作 (Admin) | 內部重新整理/診斷端點 | `ADMIN_PASSWORD` | **Vercel Server-Only**（選配，防護管理端點） |

*   **完全禁止**：
    *   `NEXT_PUBLIC_CWA_API_KEY`
    *   `NEXT_PUBLIC_MOENV_API_KEY`
    *   在 URL Query 暴露金鑰
    *   在日誌中輸出未遮蔽之金鑰

---

## 4. 儲存、快取與 TTL 規範 (Storage, Cache & TTL Architecture)

> [!IMPORTANT]
> **Stateless 與快取核心原則（決策 D-033, D-035, D-040）**：
> 1. V2 不採用任何持久化資料庫。
> 2. **快取不是資料庫 (Cache Is Not a Database)**：不得依賴快取作為資料可用性的唯一保證。
> 3. **不依賴 Function process 記憶體**：Vercel Function instance memory 不保證跨 request、instance 或 deployment 保留。
> 4. **快取實作機制待 M7 Research 實測定案**：M7 Research 必須確認目前 Next.js / Vercel 正式支援的 cache API；在 M7 Research 前保持未定，不得在規劃文件中假裝已完成選型。
>    * 候選機制（不預先 Accepted）：Next.js supported fetch/data cache、Vercel CDN caching headers 或其他 Vercel 官方支援的 cache primitive。
> 5. **Cache Miss 行為**：Cache Miss 時向官方 API 重新取得資料。
> 6. **失敗回退約束**：上游 API 失敗且沒有「實際可讀取」的快取 entry 時，必須回傳 `unavailable`。只有選定機制確實支援 stale retention / stale-while-revalidate 時，才能提供 stale response；**不得承諾 expired entry 一定仍可讀取**。

### 統一 Response Envelope 與新鮮度規格 (Response Contract)
```typescript
export type FreshnessStatus = "fresh" | "stale" | "unavailable";

export interface ResponseMeta {
  sourceTimestamp?: string;   // 官方原始資料發布時間 (ISO8601 UTC+8，若官方提供)
  fetchedTimestamp: string;   // 本站伺服端向官方取得或命中快取之時間 (ISO8601 UTC+8)
  freshness: FreshnessStatus; // 明確定義之新鮮度狀態
  candidateTtlSeconds?: number; // 該資料源當前適用之候選 TTL (秒)
  cacheStatus?: "HIT" | "MISS" | "STALE" | "BYPASS";
}

export interface ApiResponseEnvelope<T> {
  success: boolean;
  data: T | null;
  meta: ResponseMeta;
  error?: SafeErrorResponse | null;
}
```

### 資料新鮮度狀態明確定義：
*   **`fresh`**：資料於有效 TTL 內，且與官方最新資料一致。
*   **`stale`**：上游官方 API 暫時連線失敗或未發布新版，但選定快取機制確實支援 stale retention 且仍有「實際可讀取」之合法快取 entry；此時回傳過期資料並明確標示 `freshness: "stale"` 與原始時間戳。**不得承諾過期項目必可讀取**。
*   **`unavailable`**：上游官方 API 失敗且沒有「實際可讀取」之快取 entry；伺服端安全回傳 `freshness: "unavailable"`、`data: null` 與錯誤代碼，**嚴禁偽造假成功資料、假時間戳，或將缺值補 0**。

### Initial Candidate TTL 規範（決策 D-041）：
所有目前列出之 TTL 均為 **Initial Candidate TTL**，不是最終決策。最終 TTL 必須在各 Milestone 根據以下內容決定：
1. 官方更新頻率 (Official Update Frequency)
2. API response headers (如 `Cache-Control`, `Last-Modified`, `Age`)
3. 資料發布時間 (Publication Schedule)
4. API 使用限制 (Rate Limits & Quotas)
5. 使用者 freshness 需求 (User Experience Freshness)
6. Vercel cache behavior (平台實際快取表現與生命週期)
7. Outage behavior (上游中斷時之容錯表現)

| 資料類別 | Initial Candidate TTL | 關鍵決定因素與特別要求 |
| :--- | :--- | :--- |
| **未來預報 (Forecast)** | 10～30 分鐘 | 官方定時批次發布（約每 3～6 小時），時效需求適中。 |
| **即時觀測 (Observations)** | 5～15 分鐘 | 官方測站每 10 分鐘更新。**特別要求：不得將舊資料標示為即時，必須揭露觀測時間**。 |
| **空氣品質 (AQI)** | 5～15 分鐘 | 官方每小時更新，需配合整點發布節奏。 |
| **警特報 (Alerts)** | 2～5 分鐘 | 災害警報突發且具生命財產安全性。**特別要求：快取不得因 TTL 過長延誤有效警報**。 |

---

## 5. API 與介面設計 (API & Interface Design)

### 內部基礎閘道架構
```
[ Browser / Client ]
        │  (Calls /api/...)
        ▼
[ Next.js Server Route Handler ] (server-only)
        │
   ┌────┴───────────────────────────────────────┐
   │ 1. Parameter Validation & Sanitization     │
   │ 2. Short-Term Cache Lookup (選定 API 查核)  │
   │    ├─ HIT -> Return cached data            │
   │    └─ MISS -> Fetch upstream               │
   │ 3. Safe HTTP Client (TLS + Timeout 8~10s)  │
   │    └─ CWA / MOENV with Server Secrets      │
   │ 4. Zod Schema Validation                   │
   │ 5. Normalization (sentinel -> null, 絕不補0)│
   │ 6. Write Short-Term Cache (若機制支援)      │
   │ 7. Wrap with Response Envelope             │
   └────┬───────────────────────────────────────┘
        ▼
[ Safe Sanitized JSON Response (Envelope) ]
```

### 統一安全錯誤回應規格 (Error Contract)
```typescript
export interface SafeErrorResponse {
  error: string;             // 脫敏後的通用友善錯誤訊息
  code: "UPSTREAM_TIMEOUT" | "UPSTREAM_ERROR" | "RATE_LIMITED" | "UNAVAILABLE" | "VALIDATION_ERROR";
  unavailable: true;         // 明確標記服務暫時無法取得
  timestamp: string;         // 錯誤發生時間 ISO8601 (UTC+8)
}
```

---

## 6. 驗收標準 (Acceptance Criteria)

1.  **專案骨架就緒**：
    *   在 `web/` 目錄成功建立最小 Next.js + TypeScript 專案，`npm run build`、`npm run lint` 與 `npm test` 通過。
    *   建立最小狀態頁面與 `/api/health` 端點，不提前實作地圖 UI。
2.  **Server-Only 憑證防護**：
    *   代碼庫全面檢查，無任何 `NEXT_PUBLIC_CWA_API_KEY` 或 `NEXT_PUBLIC_MOENV_API_KEY`。
    *   客戶端 bundle 檢查，無任何官方 API Key。
3.  **安全 HTTP 請求**：
    *   HTTP Client 具備可配置 Timeout（8～10s），超時時拋出可控錯誤並安全轉換為 `UPSTREAM_TIMEOUT`。
    *   強制 TLS 憑證驗證，拒絕不安全的無效憑證。
4.  **無永久資料庫**：
    *   無 PostgreSQL / Supabase / SQLite 讀寫連線，無 ORM / migration 模組。
5.  **Schema 驗證與脫敏防護**：
    *   回應經由驗證模型檢核，官方未知或異常欄位不洩漏至客戶端。
    *   錯誤日誌不包含金鑰或完整授權標頭。
6.  **快取合約與 Freshness 語意**：
    *   實作 Cache Interface 抽象與測試，不依賴 Function process 記憶體作為可靠儲存。
    *   M7 Research 完成 Next.js / Vercel 正式 cache API 之實測與選型記錄。
    *   明確支援 `fresh`、`stale` 與 `unavailable` 語意轉換。
7.  **全數 Mock 測試通過**：
    *   單元測試與 Mock 整合測試覆蓋正常回傳、超時、401/403 授權失敗、429 限流與 500 官方崩潰情境。

---

## 7. 安全規範 (Security Requirements)

*   **金鑰儲存**：僅存在於伺服端環境變數（Vercel Project Settings 或本機 `.env.local`），本機檔案加入 `.gitignore`。
*   **錯誤脫敏**：官方 API 回傳之錯誤 HTML 或 JSON 訊息嚴格攔截，不原樣透傳給前端。
*   **禁止繞過 TLS**：代碼中禁止出現 `NODE_TLS_REJECT_UNAUTHORIZED='0'` 或 `verify=False`。
*   **防阻阻斷攻擊 (DoS/Brute Force)**：
    *   對公開代理端點進行參數白名單校驗。
    *   短期快取可防範同參數的高頻刷屏。

---

## 8. 測試策略 (Test Strategy)

1.  **單元測試 (Vitest)**：
    *   測試環境變數讀取安全校驗（缺失時丟出清楚安全例外）。
    *   測試安全錯誤對映器（確保回傳文字無金鑰與內部路徑）。
    *   測試 Zod 驗證器對畸形或缺值資料的處理（確保缺值轉換為 `null` 而非 `0`）。
    *   測試快取抽象介面於命中、過期與失效時之狀態判定。
2.  **Mock 整合測試 (MSW / Fetch Mock)**：
    *   模擬 CWA API 正常回應，確認資料通過正規化並包裝 Response Envelope。
    *   模擬 CWA API 500/503 崩潰，確認回傳 `freshness: "unavailable"` 與安全錯誤。
    *   模擬 CWA API 逾時，確認在設定秒數內安全中止並回傳 `UPSTREAM_TIMEOUT`。
    *   模擬快取命中情境，確認第二筆請求不觸發上游網路呼叫。

---

## 9. 依賴與相依性 (Dependencies)

*   **前置依賴**：M1～M6.2（已完成 Legacy Streamlit V1，建立官方資料格式認知）。
*   **後續解鎖**：
    *   M8（地理登記簿靜態化與端點探勘）
    *   M9～M12（各領域 Route Handler 實作）
    *   M13（統一 API 合約與彙整）
    *   M14（在 M7 已建立之 `web/` 基礎上實作完整地圖 UI）

---

## 10. 風險與緩解措施 (Risks & Mitigation)

| 風險項目 | 影響程度 | 緩解措施 |
| :--- | :--- | :--- |
| 上游官方 API 無預警逾時或連線中斷 | 中 | 嚴格設定 8～10 秒連線超時，回傳 `unavailable: true` 與安全錯誤，前端展示友善無效狀態，不阻死伺服端。 |
| 政府 API 呼叫額度被公眾訪客耗盡 | 高 | 透過伺服端短期快取吸收重複查詢；若無快取則以安全錯誤阻隔。 |
| 金鑰意外暴露於前端構建檔案 | 嚴重 | 嚴格命名不帶 `NEXT_PUBLIC_`；CI/CD 建立 build 前掃描檢核機制。 |
| 誤將 Function process 記憶體視為可靠快取 | 中 | M7 Research 明確進行 Next.js / Vercel 正式 cache API 實測選型，嚴禁依賴 instance 記憶體跨請求保留。 |

---

## 11. 未來實作計畫與步驟 (Future Implementation Steps)

> [!NOTE]
> 本步驟為未來 M7 實作計畫，本次僅記錄規劃，不得開始程式實作。

1.  在 `web/` 目錄建立最小 Next.js + TypeScript 專案骨架與 App Router。
2.  建立 Vitest 單元測試環境與 Mock 設施。
3.  建立 Next.js 伺服端環境變數配置與型別定義（`server-env.ts`）。
4.  封裝具備 Timeout、TLS 校驗與 Header 注入的安全 HTTP Client（`http-client.ts`）。
5.  實作通用錯誤分類器與安全脫敏轉換器（`errors.ts`）。
6.  進行 M7 Research 實測 Next.js / Vercel 正式支援之 cache API，並實作快取抽象介面（`cache.ts`）。
7.  建立 Response Envelope 與新鮮度狀態判斷邏輯（`envelope.ts`）。
8.  實作最小 health/status 檢查端點（`/api/health`）。
9.  撰寫基於 Mock 之完整單元測試與邊界測試。
10. 驗證無任何資料庫連線代碼或憑證洩漏風險。

---

## 12. 檔案變更清單 (File Changes)

> [!NOTE]
> 本清單為 M7 未來規劃路徑，現階段不建立檔案。

*   `web/package.json`：[NEW] 最小 Next.js + TypeScript 依賴宣告
*   `web/tsconfig.json`：[NEW] TypeScript 配置
*   `web/next.config.ts`：[NEW] Next.js 配置（server-only 邊界設定）
*   `web/vitest.config.ts`：[NEW] 單元測試配置
*   `web/src/app/layout.tsx`：[NEW] 最小 App Router 根佈局
*   `web/src/app/page.tsx`：[NEW] 最小狀態/說明頁（非正式地圖 UI）
*   `web/src/app/api/health/route.ts`：[NEW] 最小 health/status endpoint
*   `web/src/lib/server-env.ts`：[NEW] 伺服端專用環境變數讀取與安全校驗
*   `web/src/lib/http-client.ts`：[NEW] 伺服端安全 HTTP Client (Timeout / TLS / Header)
*   `web/src/lib/errors.ts`：[NEW] 錯誤分類、脫敏轉換與通用錯誤回應
*   `web/src/lib/cache.ts`：[NEW] 短期快取抽象與介面
*   `web/src/types/api.ts`：[NEW] 統一 Response Envelope 與 Meta 型別定義
*   `web/tests/gateway/`：[NEW] 閘道基礎設施 Mock 單元與整合測試

---

## 13. 回退與災難復原方案 (Rollback & Contingency)

*   **閘道不可用**：若 Next.js 伺服端閘道異常，Legacy Streamlit V1（`app.py` + `data/weather.db`）仍獨立運行於 Streamlit Cloud，不中斷對外提供服務。
*   **回退機制**：由於 V2 屬於無狀態架構，不涉及資料庫遷移或資料回滾，僅需重新部署前一個穩定版本之 Next.js 即可完成復原。
