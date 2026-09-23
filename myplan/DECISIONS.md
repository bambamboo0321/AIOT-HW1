# 架構與產品決策紀錄 (DECISIONS.md)

本文件使用架構決策紀錄 (Architecture Decision Record, ADR) 格式，系統性記錄本專案已採納的重要技術架構與產品規格決策。

---

## 決策總覽表 (Accepted Decisions)

| Decision ID | 日期 (Date) | 狀態 (Status) | 決策標題與摘要 | 決策理由 (Reason) | 主要後果與影響 (Consequence) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **D-001** | 2026-09-20 | **Accepted** | 使用 `F-D0047-091` 作為一週縣市預報主要資料集 | 包含全臺 22 縣市未來 7 天（15 個 12 小時區間）的高低溫與天氣預測 | 必須解析多層巢狀 JSON，產出標準化 330 筆預報紀錄 |
| **D-002** | 2026-09-20 | **Accepted** | 保留每次 `fetched_at` 作為獨立不可變快照 | 避免就地更新（In-place update）覆寫歷史預報，保留預報變化軌跡 | 資料庫需以複合唯一鍵 `(dataset_id, region, forecast_start, forecast_end, fetched_at)` 隔離寫入 |
| **D-003** | 2026-09-21 | **Accepted** | 查詢層嚴格禁止混合不同時間快照之資料 | 混合不同 fetch 時間點的預報會導致時間邏輯斷層與預測矛盾 | 查詢函式需明確解析出最新單一 `fetched_at` 或接受特定快照時間參數 |
| **D-004** | 2026-09-21 | **Accepted** | 12 小時區間依 `forecast_start` 的臺北當地日曆日期進行歸屬 | 預報跨子夜區間（如 18:00~06:00）必須有一致的日曆日歸屬規則 | 白天與夜間兩個區間合併為單一日曆日的每日高低溫極值，首日/末日缺區間時標記 `is_partial` |
| **D-005** | 2026-09-21 | **Accepted** | 本地開發與測試使用 SQLite，Streamlit 正式環境使用 Supabase PostgreSQL | Streamlit Community Cloud 容器重啟時本地磁碟會重設，SQLite 資料無法永久保留 | 儲存層需進行環境分離：本地端使用 SQLite，正式雲端環境使用外部 PostgreSQL |
| **D-006** | 2026-09-22 | **Accepted** | V2 正式環境使用 Supabase PostgreSQL，不使用 Google Sheets / Drive；失敗時禁止寫入 | PostgreSQL 具備完整 ACID 交易與高效能；若雲端失敗切回容器 SQLite 會造成資料已永久保存的假象 | 本地開發/pytest 使用 SQLite；Streamlit production 使用 Supabase。若正式環境未配置連線或連線失敗，顯示安全錯誤並禁止 Save，絕不默默寫入容器 SQLite |
| **D-007** | 2026-09-22 | **Accepted** | 公開訪客可自由瀏覽；Fetch / Save 操作使用簡易管理員密碼保護 | 避免公開訪客頻繁觸發爬蟲導致 CWA API 額度耗盡或寫入髒資料 | 前端加入密碼輸入對話框，比對 `ADMIN_PASSWORD` 後才解鎖資料更新動作 |
| **D-008** | 2026-09-22 | **Accepted** | API Key、DB URL、管理員密碼只能存放於 Secrets，嚴禁寫入原始碼 | 原始碼已開源公開，硬編碼憑證將造成嚴重的資安威脅與金鑰暴露 | 統一自 `st.secrets` / 環境變數優先讀取，本機環境 fallback 至 `os.getenv`；測試一律使用假金鑰 |
| **D-009** | 2026-09-22 | **Accepted** | API client 必須保持 TLS 驗證且不得關閉 SSL verification (禁止 `verify=False`) | 關閉 SSL 驗證有被中間人攻擊 (MITM) 風險，且不得假設 MOENV 與 CWA 具備完全相同的 TLS 環境 | 現有 CWA client 使用 certifi CA bundle 且禁止 verify=False；未來各 API client 的 TLS 測試對應 M8/M9、M10、M11、M12 |
| **D-010** | 2026-09-22 | **Accepted** | 線上雲端環境已驗證鎖定使用 Python 3.11 | Python 3.14.7 於雲端環境連線 CWA API 時曾發生 OpenSSL/憑證相容性異常 | 雲端設定固定使用 Python 3.11 運作，維持高度穩定相容性 |
| **D-011** | 2026-09-23 | **Accepted** | 介面支援 22 縣市（縣市模式）與北、中、南、東四區（地區模式） | 提供由大範圍宏觀切換至單一縣市微觀的階層化氣象觀察視角 | 彙整模組需能根據選定模式動態計算對應範圍之極值指標 |
| **D-012** | 2026-09-23 | **Accepted** | 澎湖、金門、連江只在縣市模式個別顯示，不建立「離島地區」彙整分區 | 三離島地理跨度極大、氣候條件迥異，強行合併為單一區域無氣象分析價值 | 地區模式僅設 4 區；離島縣市其 `region` 為 `None`，但在縣市模式中完整保留與呈現 |
| **D-013** | 2026-09-23 | **Accepted** | AQI 區域彙整採用區內有效測站之最大值（最差測站），不計算數值平均 | 空氣品質為健康防護指標，數值平均會稀釋污染熱點，失去預警意義 | 顯示最高 AQI 同時必須標示造成最高數值的測站名稱、主要污染物與有效測站數；全缺回傳 NaN 不補 0 |
| **D-014** | 2026-09-23 | **Accepted** | 降雨跨測站彙整採用最大值，不將不同測站雨量相加 | 將同一區域內多個測站之毫米數相加在氣象學上不具物理意義 | 區內雨量指標以「最大雨量」測站數值為準，明確代表該區目前最顯著之降雨強度 |
| **D-015** | 2026-09-23 | **Accepted** | 紫外線為 V2 必要功能，但目前不鎖定 Dataset ID，O-A0005-001 僅為候選（待 M12 驗證） | 避免在尚未完成資料源研究前，把候選 Dataset 和資料語意寫成已驗證事實 | M12 開始時透過官方文件與真實 API response 驗證有效性與資料語意；UI 標籤依驗證結果動態決定，不預先固定 |
| **D-016** | 2026-09-23 | **Accepted** | 後端同步完整資料，前端按需求查詢 | 避免瀏覽器一次載入全臺所有時序與圖層造成記憶體負載過大與傳輸延遲 | 資料庫保存完整時序，前端依目前層級、Viewport 與圖層按需查詢 |
| **D-017** | 2026-09-23 | **Accepted** | 公開訪客只讀取資料庫，不直接觸發 CWA 或 MOENV API | 防止公開流量濫用或耗盡政府開放資料平臺配額，消除外部 API 延遲風險 | 外部 API 呼叫嚴格收斂至受保護之管理員同步作業 (M15) 或自動排程 (M17) |
| **D-018** | 2026-09-23 | **Accepted** | 地理介面採全臺 → 縣市 → 鄉鎮的漸進式揭露 | 全臺 368 鄉鎮與數百測站若全部同時渲染，會造成視覺嚴重干擾與 DOM 節點過重 | 全臺視角顯示縣市摘要，放大或選取縣市後才載入該範圍鄉鎮與測站 |
| **D-019** | 2026-09-23 | **Accepted** | Hover 僅為桌面輔助；Click、Tap 與鍵盤操作必須能完成核心功能 | 手機與觸控螢幕裝置無滑鼠懸停事件，必須確保全裝置功能可用性 | Hover 僅顯示簡要提示；Click / Tap 叫出固定詳細面板，保證行動端 100% 可用 |
| **D-020** | 2026-09-23 | **Accepted** | 鄉鎮資料依目前 Viewport、Zoom 與選定圖層載入，不一次查詢全部完整時序 | 節省資料傳輸頻寬與減少資料庫計算負擔 | 查詢函式支援空間範圍 (Bounding Box) 或指定行政區過濾 |
| **D-021** | 2026-09-23 | **Accepted** | 預報、即時觀測、雨量測站、AQI 與 UV 必須清楚區分資料語意 | 預報為模型推估、觀測為感測器實況，混淆會嚴重誤導使用者判斷 | 資料庫分表獨立儲存，UI 明確標記資料性質、時間戳與感測器來源 |
| **D-022** | 2026-09-23 | **Accepted** | 同步失敗時保留並顯示最近一次成功資料及時間，不得產生假成功快照 | 保持系統容錯韌性，同時維持資料真實性與透明度 | 介面清楚提示最近成功時間與錯誤警告，且絕不默默改寫入容器 SQLite |
| **D-023** | 2026-09-23 | **Accepted** | 測站觀測只代表測站；不得直接冒充整個行政區的精確實況 | 縣市或鄉鎮統計值代表統計指標，並非該行政區全境均為該單一數值 | 顯示彙整數據時必須揭露具體貢獻測站名稱與有效測站計數 |
| **D-024** | 2026-09-23 | **Accepted** | 完整時序保存在資料庫，但不一次傳送至瀏覽器 | 兼顧歷史資料累積與大數據分析價值，以及前端輕量化快速載入 | 前端不進行全量快取，善用資料庫索引執行精確投影查詢 |
| **D-025** | 2026-09-23 | **Accepted** | 先完成受保護的管理員手動同步，再評估自動排程 | 降低初期系統複雜度與外部依賴風險，確保資料寫入流程可在人工受控下完全驗證 | M15 實作受保護手動同步，自動排程列為 M17 評估 |
| **D-026** | 2026-09-23 | **Accepted** | V2 正式前端採用 Next.js + TypeScript，部署至 Vercel | 需要更完整的地圖互動、響應式 UI、viewport 查詢、Click/Tap 詳細面板以及更細緻的前端狀態控制 | 現有 Streamlit UI 不會直接部署到 Vercel；M14 將建立新的 `web/` App |
| **D-027** | 2026-09-23 | **Accepted** | Next.js 遷移期間保留既有 Streamlit 公開網站 | 避免重寫期間中斷目前已完成的 M1～M6 功能 | 只有在 M16 完成功能一致性與雲端驗收後，才決定是否停止 Streamlit |
| **D-028** | 2026-09-23 | **Accepted** | Next.js App 預計放置於 repository 的 `web/` 目錄，Vercel Root Directory 設為 `web` | 保留現有 Python ingestion、tests 與 Streamlit App，避免兩種 runtime 混亂 | 未來 repository 同時包含 Python data pipeline 與 TypeScript web frontend |
| **D-029** | 2026-09-23 | **Accepted** | 公開瀏覽器只能使用 Supabase public URL 與 anon/publishable key，且必須受 Row Level Security 保護 | 瀏覽器中的公開設定無法視為秘密，資料安全必須由 RLS 保證 | Service Role Key、DATABASE_URL、CWA_API_KEY、MOENV_API_KEY、ADMIN_PASSWORD 不得出現在 NEXT_PUBLIC_*、client bundle 或瀏覽器請求中 |
| **D-030** | 2026-09-23 | **Accepted** | 保留已測試的 Python API clients、parser 與 transformation logic；不因前端改為 Next.js 就立即重寫成 TypeScript | 避免重複實作與破壞既有測試成果 | M15 再根據實際執行時間、資料量與平台限制，選擇 Python Worker 執行位置 |
| **D-031** | 2026-09-23 | **Accepted** | 不得將目前 `app.py` 視為可直接搬到 Vercel 的 Next.js frontend | Streamlit 是具有 Session/WebSocket 狀態的 Python client-server App，Vercel Functions 具有不同的執行模型與時間限制 | Vercel 遷移屬於前端重建，不只是修改部署設定 |
| **D-032** | 2026-09-23 | **Accepted** | Vercel 必須通過資料一致性、功能一致性、手機、效能、安全與 rollback 驗收，才可成為正式入口 | 避免尚未完成的新版取代目前可用的 Streamlit App | M16 必須提供 parity checklist、cutover checklist 和 rollback procedure |

---

## 重要決策詳細規格 (Detailed ADR Specifications)

### D-006: 本地與雲端資料庫環境分離規範
*   **Status**: Accepted
*   **Decision**:
    *   Local development / pytest：SQLite
    *   Streamlit production / V2 production：Supabase PostgreSQL
    *   Production 若 `DATABASE_URL` 缺失或 Supabase 連線失敗：顯示安全錯誤並禁止 Save
    *   不得默默寫入容器 SQLite，避免造成資料已永久保存的假象
*   **Reason**:
    雲端容器與無伺服器檔案系統為 Ephemeral，重啟或重新部署即重置。若在雲端失敗時自動 fallback 寫入本地 SQLite，會讓使用者誤以為資料已經永久留存。
*   **Consequence**:
    `src/database.py` 必須明確區分環境行為。正式環境連線失敗時拋出明確例外並停用儲存功能。

### D-009: API Client TLS 驗證與連線規範
*   **Status**: Accepted
*   **Decision**:
    *   現有 CWA client 使用 `certifi` CA bundle 且禁止 `verify=False`
    *   未來新增的 CWA、MOENV 或其他 HTTP client，必須保持 TLS 驗證，並在各自 Milestone 中測試其憑證與連線行為：
        - M8/M9 CWA forecast discovery and ingestion
        - M10 CWA observation
        - M11 MOENV
        - M12 UV and warning sources
    *   不得假設 MOENV 與 CWA 具有相同 TLS 環境
    *   API client 不得關閉 SSL verification
*   **Reason**:
    關閉 SSL 驗證有安全隱患；且不同政府開放資料平臺之伺服器憑證鏈與 TLS 實作各有差異，不能將 CWA 憑證修復經驗直接假定適用於 MOENV。
*   **Consequence**:
    新增 API client 時，必須於各自 Milestone 建立獨立的連線與憑證測試。

### D-015: 紫外線資料集與語意驗證規範
*   **Status**: Accepted
*   **Decision**:
    紫外線為 V2 必要功能，但目前不鎖定 Dataset ID。`O-A0005-001` 僅列為候選資料集。M12 開始時必須透過官方文件與真實 API response 驗證：
    - Dataset 是否仍有效
    - 資料是目前值、預報值或當日最大值
    - 發布時間與更新頻率
    - 測站及地理涵蓋範圍
    - 真實 JSON 欄位結構
*   **Reason**:
    避免在尚未完成 M12 資料源研究前，把候選 Dataset 和資料語意寫成已驗證事實。
*   **Consequence**:
    M12 UI 標籤必須依驗證結果使用「目前 UV」、「UV 預報」或「今日最大 UV」，不得預先固定。

### D-016: 後端同步完整資料，前端按需求查詢
*   **Status**: Accepted
*   **Decision**:
    後端定期完整同步縣市、鄉鎮、氣象觀測、空品與紫外線資料；前端依當前視角、縮放層級與選定圖層按需求發出查詢。
*   **Reason**:
    兼顧時序資料完整性與前端網頁載入效能，避免過大 Payload 癱瘓瀏覽器。
*   **Consequence**:
    資料庫保留歷史時序快照，前端查詢限制返回欄位與空間範圍。

### D-017: 公開訪客只讀取資料庫，不直接觸發 CWA 或 MOENV API
*   **Status**: Accepted
*   **Decision**:
    公開訪客在前端介面上的所有瀏覽、查詢與圖層切換，一律只讀取 Supabase PostgreSQL，嚴禁直接呼叫 CWA 或 MOENV 外部 API。
*   **Reason**:
    防止公開訪客流量耗盡政府開放資料平臺配額、造成逾時等待或觸發 Rate Limit。
*   **Consequence**:
    外部 API 呼叫權限嚴格收斂至受管理員密碼保護之同步後台 (M15) 或自動排程 (M17)。

### D-018: 地理介面採全臺 → 縣市 → 鄉鎮的漸進式揭露
*   **Status**: Accepted
*   **Decision**:
    地圖採漸進式揭露：全臺視角顯示縣市摘要，放大或選取縣市後才查詢並渲染該範圍之鄉鎮與測站。
*   **Reason**:
    全臺 368 鄉鎮與數百測站若全部同時渲染，會造成視覺嚴重干擾與 DOM 節點過重。
*   **Consequence**:
    地圖與查詢層依縮放層級 (Zoom level) 動態切換顯示顆粒度。

### D-019: Hover 僅為桌面輔助；Click、Tap 與鍵盤操作必須能完成核心功能
*   **Status**: Accepted
*   **Decision**:
    Hover 僅用於簡要提示 (Tooltip)；Click、Tap 與鍵盤操作叫出固定詳細面板 (Detail Panel)，必須能完成核心功能。
*   **Reason**:
    手機、平板等觸控螢幕裝置無滑鼠 Hover 事件，必須保證全裝置皆可完整操作。
*   **Consequence**:
    詳細氣象資訊必須透過點擊操作展示於常駐面板，不能僅存於 Hover 彈窗中。

### D-020: 鄉鎮資料依目前 Viewport、Zoom 與選定圖層載入，不一次查詢全部完整時序
*   **Status**: Accepted
*   **Decision**:
    鄉鎮與詳細測站資料僅在特定縣市被選取或進入地圖 Viewport 時動態載入，不一次查詢全部完整時序。
*   **Reason**:
    大幅降低記憶體佔用與網路傳輸頻寬。
*   **Consequence**:
    查詢介面支援空間邊界 (Bounding Box) 或指定行政區代碼過濾。

### D-021: 預報、即時觀測、雨量測站、AQI 與 UV 必須清楚區分資料語意
*   **Status**: Accepted
*   **Decision**:
    資料庫儲存與 UI 展示必須嚴格區分預報、即時觀測、雨量測站、AQI 與 UV 之資料語意與時間戳。
*   **Reason**:
    模型推估與感測器實況不可混為一談，避免誤導防災與出行決策。
*   **Consequence**:
    各資料源分表儲存，前端 UI 明確標記資料性質與觀測時間。

### D-022: 同步失敗時保留並顯示最近一次成功資料及時間，不得產生假成功快照
*   **Status**: Accepted
*   **Decision**:
    雲端同步外部 API 失敗時，前端呈現最近一次成功資料與其時間戳，絕不產生假成功快照，且絕不默默改寫入容器 SQLite。
*   **Reason**:
    提供容錯可用性，同時維護資料透明度與真實性。
*   **Consequence**:
    前端需有清楚的資料更新狀態指示與警示通知元件。

### D-023: 測站觀測只代表測站；不得直接冒充整個行政區的精確實況
*   **Status**: Accepted
*   **Decision**:
    行政區或分區彙整數據（如最高溫、最差 AQI）必須標明為彙整值，並列出貢獻測站名稱與有效測站數，不得直接冒充整個行政區的精確實況。
*   **Reason**:
    保持氣象數據之客觀性，防止使用者誤認全區皆為單一測站讀數。
*   **Consequence**:
    彙整函式回傳值需包含貢獻測站清單或代表測站名稱。

### D-024: 完整時序保存在資料庫，但不一次傳送至瀏覽器
*   **Status**: Accepted
*   **Decision**:
    資料庫保存完整時序與各測站明細，瀏覽器僅取得當前視角與圖層所需之最小數據集。
*   **Reason**:
    兼顧歷史資料累積與大數據分析價值，以及前端輕量化快速載入。
*   **Consequence**:
    前端不進行全量快取，善用關聯式索引進行輕量化投影查詢。

### D-025: 先完成受保護的管理員手動同步，再評估自動排程
*   **Status**: Accepted
*   **Decision**:
    優先完成管理員受密碼保護的手動同步功能，後續於 M17 再評估自動排程機制。
*   **Reason**:
    降低初期架構複雜度與外部依賴風險，確保資料寫入流程可在人工受控下完全驗證。
*   **Consequence**:
    M15 專注於管理員密碼驗證與手動同步，自動定時排程列為 M17 評估。

### D-026: 目標前端平台採用 Next.js + TypeScript 部署至 Vercel (Target Frontend Platform)
*   **Status**: Accepted
*   **Decision**:
    V2 正式前端採用 Next.js + TypeScript，部署至 Vercel。
*   **Reason**:
    需要更完整的地圖互動、響應式 UI、viewport 查詢、Click/Tap 詳細面板以及更細緻的前端狀態控制。
*   **Consequence**:
    現有 Streamlit UI 不會直接部署到 Vercel；M14 將建立新的 `web/` App。

### D-027: 平行雙軌遷移策略 (Parallel Migration)
*   **Status**: Accepted
*   **Decision**:
    Next.js 遷移期間保留既有 Streamlit 公開網站。
*   **Reason**:
    避免重寫期間中斷目前已完成的 M1～M6 功能。
*   **Consequence**:
    只有在 M16 完成功能一致性與雲端驗收後，才決定是否停止 Streamlit。

### D-028: 儲存庫結構分流規劃 (Repository Layout)
*   **Status**: Accepted
*   **Decision**:
    Next.js App 預計放置於 repository 的 `web/` 目錄，Vercel Root Directory 設為 `web`。
*   **Reason**:
    保留現有 Python ingestion、tests 與 Streamlit App，避免兩種 runtime 混亂。
*   **Consequence**:
    未來 repository 同時包含 Python data pipeline 與 TypeScript web frontend。

### D-029: 瀏覽器端 Supabase 安全與 RLS 規範 (Supabase Browser Security)
*   **Status**: Accepted
*   **Decision**:
    公開瀏覽器只能使用 Supabase public URL 與 anon/publishable key，且必須受 Row Level Security (RLS) 保護。
*   **Reason**:
    瀏覽器中的公開設定無法視為秘密，資料安全必須由 RLS 保證。
*   **Consequence**:
    Service Role Key、DATABASE_URL、CWA_API_KEY、MOENV_API_KEY、ADMIN_PASSWORD 不得出現在 `NEXT_PUBLIC_*`、client bundle 或瀏覽器請求中。

### D-030: 保留既有 Python Ingestion 成果 (Python Ingestion Preservation)
*   **Status**: Accepted
*   **Decision**:
    保留已測試的 Python API clients、parser 與 transformation logic；不因前端改為 Next.js 就立即重寫成 TypeScript。
*   **Reason**:
    避免重複實作與破壞既有測試成果。
*   **Consequence**:
    M15 再根據實際執行時間、資料量與平台限制，選擇 Python Worker 執行位置。

### D-031: Streamlit 不得直接搬到 Vercel (Streamlit Is Not Deployed Directly to Vercel)
*   **Status**: Accepted
*   **Decision**:
    不得將目前 `app.py` 視為可直接搬到 Vercel 的 Next.js frontend。
*   **Reason**:
    Streamlit 是具有 Session/WebSocket 狀態的 Python client-server App，Vercel Functions 具有不同的執行模型與時間限制。
*   **Consequence**:
    Vercel 遷移屬於前端重建，不只是修改部署設定。

### D-032: 正式切換門檻與驗收規範 (Production Cutover Gate)
*   **Status**: Accepted
*   **Decision**:
    Vercel 必須通過資料一致性、功能一致性、手機、效能、安全與 rollback 驗收，才可成為正式入口。
*   **Reason**:
    避免尚未完成的新版取代目前可用的 Streamlit App。
*   **Consequence**:
    M16 必須提供 parity checklist、cutover checklist 和 rollback procedure。
