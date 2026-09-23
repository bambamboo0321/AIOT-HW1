# Milestone M15: Python 同步工作程序與管理 (M15-SYNC-ADMINISTRATION.md)

本文件為 M15（Python Sync Worker and Administration）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 建立管理員手動同步後台與 Python 同步工作程序 (Sync Worker)，保留並重用已測試之 Python API client 與 parser，受密碼保護執行全臺預報、觀測、空品與紫外線之完整同步；管理同步狀態 (Sync Run Status)、記錄同步歷程中繼資訊、防止重複同步；針對 Worker 託管執行環境進行實測評估（GitHub Actions、Vercel Python Functions、Supabase Edge Functions 皆為候選，實測後決定；初期絕不重寫 Python parser）。
*   **Dependencies**: M9～M12（各 Python 擷取管道皆已具備）

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **保留既有 Python Ingestion 成果（決策 D-030）**：
    *   完整保留現有經過單元測試與 TLS 驗證之 Python API client、parser 與資料清洗模組。
    *   **初期嚴禁為了適應 Vercel 前端而將 Python parser 全部重寫為 TypeScript**，避免浪費資源與破壞既有穩定度。
*   **管理員身分驗證與手動觸發（決策 D-007, D-025）**：
    *   在受保護的管理介面或受保護的 API route 設定密碼驗證，比對伺服端 `ADMIN_PASSWORD`。
    *   未驗證前，完全鎖定外部同步觸發控制項。
    *   一鍵手動觸發全流程同步：縣市/鄉鎮預報、地面氣象觀測、雨量、空品 AQI、紫外線與警特報。
*   **同步狀態與排他鎖（決策 D-006, D-022）**：
    *   紀錄同步中繼資訊（Sync Run Metadata）：觸發時間、完成時間、各資料集成功筆數、錯誤狀態。
    *   防止重複同步：實作排他鎖（如 `sync_locks`），同一時間僅允許單一同步作業進行，避免重疊觸發。
    *   同步若失敗，系統維持保留最近一次成功資料及時間戳，顯示安全錯誤訊息，**絕不默默寫入容器 SQLite**。
*   **Worker 託管環境候選評估（尚未定案，待實測決定）**：
    *   **候選 1：GitHub Actions Workflow**（適合多資料源長時間循序抓取，無 Serverless 逾時壓力）。
    *   **候選 2：Vercel Serverless Functions (Python runtime)**（與前端同平台，但需實測免費方案 10s / Pro 60s 執行上限是否足夠）。
    *   **候選 3：Supabase Edge Functions / External Container Worker**（近資料庫端，但需評估 runtime 相容性）。
    *   **要求**：各平台均為候選方案，必須依資料量與網路延遲實測後再行定案，不得在規劃階段假裝已確定。

### 非目標 (Non-Goals)：
*   不在此階段將 Python parser 改寫為 TypeScript（依決策 D-030 保留 Python 實作）。
*   不預先宣稱任何 Worker 託管平台已確定。
*   不假裝自動定時排程已完成（排程列為 M17 評估，決策 D-025）。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   本 Milestone 調度由 M9、M10、M11、M12 所建立之 Python API client 與擷取管道。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!NOTE]
> 以下中繼表結構為 M15 之規劃方向（Proposed Storage），供同步歷程與排他控制設計參考，非 M7 立即建表指令。

### 表 1：`sync_locks` (同步排他分散式鎖)
*   `lock_name` (VARCHAR PK - 如 'global_sync_lock')
*   `locked_at` (TIMESTAMPTZ - 鎖定時間)
*   `locked_by` (VARCHAR - 觸發來源識別碼)
*   `expires_at` (TIMESTAMPTZ - 逾時釋放時間，防死鎖)

### 表 2：`sync_run_logs` (同步詳細日誌中繼表)
*   `log_id` (BIGSERIAL PK)
*   `sync_run_id` (UUID - 關聯至 `sync_runs.sync_run_id`)
*   `dataset_id` (VARCHAR - 資料集代碼)
*   `status` (VARCHAR - 'SUCCESS', 'FAILED', 'SKIPPED')
*   `records_ingested` (INTEGER - 成功寫入筆數)
*   `records_skipped` (INTEGER - 重複忽略筆數)
*   `duration_ms` (INTEGER - 擷取耗時毫秒)
*   `error_message` (TEXT - 脫敏後之錯誤摘要)

---

## 5. 驗收標準 (Acceptance Criteria)

1.  未輸入正確密碼時，完全無法觸發同步請求。
2.  輸入正確密碼可觸發手動同步，並能即時查詢同步狀態與進度。
3.  同步執行成功後，各資料表均能查詢到最新快照時間戳。
4.  同步發生網路或資料異常時，系統記錄清楚之錯誤提示並保留最近成功數據，絕不產生假成功快照。
5.  完成 Worker 候選託管環境（GitHub Actions / Vercel Python / Supabase 等）實測報告，確認最佳運行方案。

---

## 6. 安全與防洩密規範 (Security Requirements)

*   `ADMIN_PASSWORD`、`CWA_API_KEY`、`MOENV_API_KEY`、`SUPABASE_SERVICE_ROLE_KEY` 嚴格僅能存在安全伺服端環境，絕不得暴露至公開前端（決策 D-029）。
*   錯誤日誌自動過濾連線密碼、API Key 等敏感字串。

---

## 7. 測試策略 (Test Strategy)

*   單元測試：測試密碼校驗邏輯、同步狀態狀態機運作。
*   整合測試：模擬同步異常時的錯誤捕獲與最近成功狀態保留機制。
*   效能基準測試：量測各 API 擷取耗時與 Payload 大小，評估 Worker 託管平台之逾時風險。

---

## 8. 風險與應對 (Risks)

*   **風險**：全臺多圖層資料抓取時間過長，超過 Serverless Function 執行時限 (Timeout)。
*   **應對**：若實測發現超過 Vercel 限制，優先選用 GitHub Actions Workflow 作為獨立 Worker 執行排程同步。

---

## 9. 手動驗收清單 (Manual Verification)

*   [ ] 嘗試以錯誤密碼點擊同步，確認被安全拒絕。
*   [ ] 輸入正確密碼點擊同步，確認各資料源依序更新並成功寫入 PostgreSQL。
*   [ ] 模擬斷網情境，確認系統出現安全錯誤提示，且前端仍可檢視最近成功歷史資料。
*   [ ] 檢核 Worker 候選環境之實測數據與耗時記錄。

---

## 10. 最終結果 (Final Result)

*(此處待 M15 實作與驗收完成後填寫)*
