# AIOT-HW1 專案規劃核心庫 (myplan/)

本目錄為本專案第二版 (V2) 及後續演進的單一且權威規劃來源。
所有架構設計、系統資料流、里程碑狀態追蹤、架構決策紀錄 (ADR) 與資料來源規範皆集中記錄於此。

---

## 1. 目錄結構與文件職責

```
myplan/
├── README.md                               # 規劃庫說明、文件權威性與工作流程規範（本文件）
├── FLOW.md                                 # 系統資料流架構（Stateless Vercel V2 閘道資料流、快取合約、公開網站與雙軌平行動態遷移）與開發交付流程
├── ROADMAP.md                              # 里程碑狀態總表與目前進度（M1 至 M17，V2 為 Stateless Vercel 架構）
├── DECISIONS.md                            # 架構與產品決策紀錄 (ADR，含 D-001 至 D-041)
├── DATA_SOURCES.md                         # 外部 API、資料集 ID、資料語意與 Secrets 映射規範 (Vercel Server-only)
└── milestones/                             # 個別 Milestone 之詳細設計、實作計畫與驗收紀錄
    ├── M1-M6-SUMMARY.md                    # M1～M6 已完成功能、模組、測試與部署總結 (Legacy Streamlit V1)
    ├── M7-SERVER-DATA-GATEWAY.md           # M7 Vercel Web 基礎與伺服端資料閘道 (Vercel Web Foundation and Server Data Gateway)
    ├── M8-GEOGRAPHIC-DISCOVERY.md          # M8 地理資訊登記與 CWA 資料集探勘 (Geographic Registry & CWA Dataset Discovery)
    ├── M9-FORECAST-INGESTION.md            # M9 縣市與鄉鎮預報 API (County and Township Forecast API)
    ├── M10-WEATHER-OBSERVATIONS.md         # M10 即時氣象觀測 API (Real-Time Weather Observation API)
    ├── M11-AIR-QUALITY.md                  # M11 環境部空氣品質 API (MOENV Air Quality API)
    ├── M12-UV-AND-ALERTS.md                # M12 紫外線與氣象警特報 API (UV and Weather Alerts API)
    ├── M13-QUERY-AND-AGGREGATION.md        # M13 統一 API 合約與分級彙整 (Unified API Contract and Aggregation)
    ├── M14-PROGRESSIVE-MAP.md              # M14 漸進式多圖層地圖 UI (Progressive Multi-Layer Map UI)
    ├── M15-SYNC-ADMINISTRATION.md          # M15 重新整理、快取與管理員診斷 (Refresh, Cache and Admin Diagnostics)
    ├── M16-DEPLOYMENT-PERFORMANCE.md       # M16 Vercel 遷移、效能與無障礙優化 (Vercel Migration, Performance and Accessibility)
    └── M17-OPTIONAL-LAYERS.md              # M17 選配持久化與進階圖層 (Optional Persistence and Advanced Layers)
```

### 文件責任邊界
*   **[FLOW.md](FLOW.md)**：負責定義 Stateless Vercel V2 伺服端資料閘道架構（瀏覽器呼叫 Next.js Server Route Handlers 代理官方 API、Schema 驗證、短期快取、免永久資料庫），以及 Legacy Streamlit V1 與 Vercel V2 平行雙軌運作機制與交付流程。
*   **[ROADMAP.md](ROADMAP.md)**：負責追蹤專案自 M1 至 M17 的整體進度，作為狀態盤點的唯一依據。
*   **[DECISIONS.md](DECISIONS.md)**：負責記錄不可輕易變更的關鍵架構、技術與產品決策 (ADR)。
*   **[DATA_SOURCES.md](DATA_SOURCES.md)**：負責按狀態（Verified / Candidate / Must Research / Deprecated）登記所有外部資料源、更新頻率、Secrets 權限邊界 (Vercel Server-only) 與欄位解析限制。
*   **[milestones/](milestones/)**：負責承載各階段專案的任務範圍、驗收條件、測試策略與回退方案。

---

## 2. 文件階層與衝突仲裁規則

1.  **歷史需求文件保留**：
    *   根目錄下的 [`workflow.md`](../workflow.md) 保留作為原始課堂作業需求、初始架構與 M1～M6 開發歷程文件。
2.  **V2 權威來源**：
    *   `myplan/` 目錄是專案進入 V2 之後的**最新且唯一規劃來源**。
3.  **衝突裁決順序**：
    *   若 `workflow.md`、`README.md` 與 `myplan/` 之內容發生衝突，**一律以 `myplan/` 內最新且標示為 `Accepted` 的決策與文件為準**。

---

## 3. 里程碑維護規則 (Milestone Lifecycle)

每個 Milestone 的生命週期必須嚴格依循以下階段進行文件與狀態更新：

1.  **開始 Milestone**：
    *   將 `ROADMAP.md` 中該 Milestone 的狀態更新為 `In Progress`。
    *   建立或更新對應的 `milestones/Mx-*.md` 文件，完整記載目標、範圍、檔案清單與驗收條件。
2.  **完成實作與自動化測試**：
    *   所有單元與整合測試通過（`pytest` / `npm test` 綠燈）。
    *   將狀態更新為 `Implemented`，並於 Milestone 文件中記錄檔案差異與測試結果。
3.  **使用者手動驗收**：
    *   本機或 Vercel Preview 展示環境手動操作驗收通過。
    *   將狀態更新為 `Verified`。
4.  **發布與雲端部署**：
    *   執行 Git Commit 與 Push 至 GitHub `main` 分支。
    *   確認雲端自動部署成功並連線正常。
    *   將狀態更新為 `Completed`，記錄 Commit SHA 與驗收日誌。
5.  **決策與資料源變更**：
    *   重大架構或技術選擇變更必須記錄於 `DECISIONS.md`。
    *   API 端點或資料集變動必須同步至 `DATA_SOURCES.md`。

---

## 4. 授權與確認邊界 (Authorization Boundaries)

為確保開發效率與系統安全性，在 `AIOT-HW1` 儲存庫內遵循以下授權邊界（詳見 [AGENTS.md](../AGENTS.md)）：

### 允許自主執行之操作（低風險，無需逐項詢問）：
*   新增標準 Python import。
*   新增或修改當前 Milestone 範圍內的程式檔案與模組。
*   新增或更新單元測試、整合測試與測試 Fixture（使用明顯的假金鑰，如 `test-api-key`）。
*   修改 `README.md`、`workflow.md` 或 `myplan/` 規劃文件。
*   修改 `requirements.txt`、`requirements-dev.txt` 或 `package.json` 加入明確需要的套件。
*   使用 Node/npm 工具執行 `npm install`、`npm test`、`npm run lint`、`npm run typecheck`、`npm run build`。
*   執行唯讀檢查與診斷命令（如 `pytest`、`git diff`、`git status`、`git grep`）。
*   建立 pytest `tmp_path` 測試用暫存資料庫。
*   修正程式碼格式、Typing、Linting、Warning 或小型相容性問題。

### 必須停止並獲得使用者明確授權之操作（高風險/外部影響）：
*   執行 `git commit` 或 `git push`。
*   執行分支 `merge`、`rebase`、`force push` 或改寫 Git history。
*   建立或連接 Vercel Project、修改 Vercel Environment Variables、執行正式部署或更動網域。
*   停止或刪除現有 Streamlit App。
*   未來若要引入 PostgreSQL、Supabase、Neon 等永久雲端資料庫。
*   刪除或覆蓋使用者現存的正式資料。
*   修改真實的 `.streamlit/secrets.toml`、`.env`、`.env.local` 或變更系統環境變數中的真實憑證。
*   顯示、搬移、打印或記錄任何真實 API Key。
*   建立或修改任何外部雲端服務之付費或正式資源。
*   大幅改變在 `DECISIONS.md` 中已被標註為 `Accepted` 的核心產品或架構決策。
*   操作路徑超出 `AIOT-HW1` 儲存庫根目錄。
