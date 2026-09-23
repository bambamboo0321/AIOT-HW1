# Milestone M7: 雲端資料庫基礎 (M7-CLOUD-DATABASE.md)

本文件為 M7（Cloud Data Foundation）之規格骨架。
**現階段僅進行結構規劃，不進行 M7 程式碼實作，亦不建立正式雲端資源。**

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 建立 Supabase PostgreSQL 雲端資料庫基礎架構、SQLite/PostgreSQL 適配器、核心 Schema、Sync Run Metadata 紀錄表、安全連線池、Transaction 與 Production Failure Behavior，徹底劃分本地與正式儲存環境。
*   **Dependencies**: M1～M6.2（既有預報擷取與展示管道已穩定）

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **環境分離（決策 D-005, D-006）**：
    *   Local development / pytest：使用本機 SQLite。
    *   Streamlit production：使用雲端關聯式資料庫（Supabase PostgreSQL）作為永久儲存媒介。
*   **Production 防護機制 (Production Failure Behavior)**：
    *   正式環境若 `DATABASE_URL` 缺失或 Supabase 連線失敗，系統顯示安全錯誤並**禁止 Save**；**嚴禁自動切換寫入容器本機 SQLite**，避免造成資料已永久保存的假象。
*   **核心 Schema 與 Metadata**：
    *   建立 `weather_forecasts` 表結構與複合唯一鍵約束。
    *   建立 `sync_runs` 同步歷程中繼表（紀錄觸發時間、完成時間、各來源狀態、錯誤日誌）。
*   **安全連線與交易**：
    *   實作連線池管理、連線異常安全遮蔽（防洩密）與 Transaction Rollback。

### 非目標 (Non-Goals)：
*   不實作 M8~M17 的新資料集探勘或擷取。
*   不更動 Streamlit 前端 UI 佈局。
*   不直接於正式雲端環境操作 Migration。
*   不使用 Google Sheets 或 Google Drive API（決策 D-006）。
*   不在雲端失敗時自動 fallback 寫入本地 SQLite（決策 D-006）。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   本 Milestone 專注於資料庫基礎與適配層建立，不新增外部資料源，沿用現有 `F-D0047-091` 預報資料結構驗證適配器。

---

## 4. 規劃儲存結構 (Proposed Storage)

### 表 1：`weather_forecasts`
*   `id` (BIGSERIAL / INTEGER PK)
*   `dataset_id` (VARCHAR, 如 'F-D0047-091')
*   `region` (VARCHAR, 縣市名稱)
*   `forecast_start` (TIMESTAMPTZ, UTC+8)
*   `forecast_end` (TIMESTAMPTZ, UTC+8)
*   `temperature_min` (NUMERIC)
*   `temperature_max` (NUMERIC)
*   `weather_description` (VARCHAR)
*   `weather_code` (VARCHAR)
*   `fetched_at` (TIMESTAMPTZ, UTC+8)
*   **約束**：`UNIQUE (dataset_id, region, forecast_start, forecast_end, fetched_at)`

### 表 2：`sync_runs` (同步歷程中繼表)
*   `sync_run_id` (UUID / BIGSERIAL PK)
*   `triggered_at` (TIMESTAMPTZ)
*   `finished_at` (TIMESTAMPTZ)
*   `status` (VARCHAR, 如 'SUCCESS', 'FAILED', 'PARTIAL')
*   `sources_status` (JSONB / TEXT)
*   `error_summary` (TEXT)

---

## 5. 驗收標準 (Acceptance Criteria)

1.  **環境分離與連線防護**：
    *   Local development 與 pytest 環境預設使用 SQLite。
    *   Streamlit production 環境使用 Supabase PostgreSQL。
    *   Production 環境若 `DATABASE_URL` 缺失或連線失敗，介面顯示清楚且安全的錯誤訊息，並**禁止 Save 操作**；**絕不自動寫入 Streamlit 容器本地 SQLite**。
2.  **資料完整性與約束**：
    *   PostgreSQL 成功建立 `weather_forecasts` 表與 `sync_runs` 表，具備正確之唯一鍵約束與交易安全。
    *   重複寫入相同快照時自動忽略 (`ON CONFLICT DO NOTHING`)，回傳正確之 `InsertResult` 統計。
3.  **查詢層 100% 向後相容**：
    *   `src/queries.py` 無需修改或僅需微幅調整，所有回傳之 DataFrame 欄位名稱、型態與時區感知（UTC+8）完全一致。
4.  **自動化測試綠燈**：
    *   既有測試（最後已知 153 passed）全數通過。
    *   新增之適配器測試（包含環境分離、連線失敗阻絕寫入本地 SQLite 等情境）全數通過。

---

## 6. 安全規範 (Security Requirements)

*   **連線字串保密**：`SUPABASE_DB_URL` 嚴格僅能從 `st.secrets["SUPABASE_DB_URL"]` 或 `os.getenv("SUPABASE_DB_URL")` 讀取。
*   **防洩密例外**：若連線失敗，日誌與例外訊息必須屏蔽帳號與密碼等敏感連線片段。
*   **測試隔離**：任何自動化測試嚴禁對真實遠端 Supabase 發動寫入操作，一律使用 Mock 或本機暫存 SQLite。

---

## 7. 測試策略 (Test Strategy)

1.  **單元測試**：
    *   測試連線字串解析與防洩密脫敏函式。
    *   測試在不同環境配置下的分流行為（Postgres vs SQLite）。
2.  **Mock 整合測試**：
    *   模擬 Production 環境下 PostgreSQL 斷線或未配置情境，斷言系統顯示安全錯誤並禁止 Save，斷言絕不寫入本地 SQLite。
    *   驗證交易 Rollback 機制在發生異常時正確生效。
3.  **既有相容性回歸測試**：
    *   完整執行既有測試套件，確保查詢層各項邊界條件不退化。

---

## 8. 風險與應對 (Risks)

*   **風險**：Streamlit Community Cloud 容器生命週期可能導致資料庫連線逾時或連線數耗盡。
*   **應對**：適當配置連線池大小，確保連線使用後正確關閉釋放。

---

## 9. 手動驗收清單 (Manual Verification)

*   [ ] Local 模式下啟動 Streamlit，確認預設使用 SQLite 運作正常。
*   [ ] Production 模式下配置 `SUPABASE_DB_URL`，確認預報成功寫入與讀取遠端 Supabase。
*   [ ] Production 模式下模擬斷網或連線錯誤，確認介面出現安全錯誤訊息並明確**禁止 Save**，確認無任何資料寫入本機 SQLite。

---

## 10. 最終結果 (Final Result)

*(此處待 M7 實作、測試、使用者驗收與雲端部署完成後填寫)*
