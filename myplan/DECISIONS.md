# 架構與產品決策紀錄 (DECISIONS.md)

本文件完整記錄本專案自 M1 至今所有關鍵架構、產品行為與技術選型決策 (ADR)。
所有決策一旦標記為 **Accepted**，即具有約束力；若有變更必須透過新的 ADR 或明確標記為 **Superseded** / **Revised**。

---

## 決策總表 (Decision Registry)

| 決策編號 | 提出日期 | 狀態 | 決策摘要 | 決策背景與動機 | 影響與約束 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **D-001** | 2026-09-21 | **Accepted** | 採用純單向管線架構 (API → Validation → Parsing → Persistence → Query → Streamlit) | 保證資料處理流程清晰，各模組職責單一，便於測試與除錯 | 模組間依賴單向流動，禁止循環依賴 |
| **D-002** | 2026-09-21 | **Accepted** | SQLite 儲存採用不可變歷史快照設計 (Immutable Snapshots) | 確保每次 API 取得之資料具備完整稽核軌跡，支援多快照時間序列比對 | 表結構需以 `(dataset_id, fetched_at, region, forecast_start, forecast_end)` 建立 UNIQUE 約束 |
| **D-003** | 2026-09-21 | **Accepted** | 查詢層實作快照隔離與最新快照解析 | 防止不同批次擷取之資料在計算指標與繪圖時產生跨快照交叉污染 | 查詢函式一律先解析出單一 `target_fetched_at` 再執行後續聚合 |
| **D-004** | 2026-09-21 | **Accepted** | 依中央氣象署規範以臺北時間 (UTC+8) 作為日度聚合基準 | 氣象署預報區間跨越 UTC 日期邊界，若以 UTC 聚合將導致日極值失真 | 跨日預報區間依據其在臺北時間中午 12:00 之所屬日期歸戶 |
| **D-005** | 2026-09-21 | **Accepted** | 測試與開發環境完全隔離，禁止使用正式資料庫檔案執行測試 | 避免測試執行破壞正式歷史資料，確保 CI 與本地測試具備冪等性 | 測試套件強制使用 pytest `tmp_path` 建立隔離之 SQLite 資料庫 |
| **D-006** | 2026-09-22 | **Superseded** | ~~V2 正式環境使用 Supabase PostgreSQL~~（已被 D-033 取代） | 原規劃引入外部 PostgreSQL；經評估目前需求僅需最新與預報，無需增加雲端資料庫複雜度 | 被 D-033 取代，V2 不再使用 Supabase PostgreSQL，轉為無狀態架構 |
| **D-007** | 2026-09-22 | **Accepted** | 所有對外公開之資料結構禁止包含內部實作細節與機密欄位 | 遵循最小權限原則與安全防禦深度 | 資料庫連線字串、API Key 等嚴禁暴露於公開 API 回應或前端 |
| **D-008** | 2026-09-22 | **Accepted** | 地圖標記採用縣市政府機關所在地代表座標 | 官方預報以縣市為單位無測站座標，需明確代表點以供視覺化展示 | 座標僅作為 UI 展示用途，非實際觀測站物理座標，已於文件揭露 |
| **D-009** | 2026-09-22 | **Accepted** | 嚴格維持 TLS/SSL 憑證驗證，嚴禁使用 `verify=False` | 維持通訊安全與資料完整性，防範中間人攻擊 (MITM) | 遇連線問題應由系統層憑證鏈 (CA Bundle) 或執行環境解決，絕不降低安全等級 |
| **D-010** | 2026-09-22 | **Accepted** | 線上雲端環境已驗證鎖定使用 Python 3.11 | Python 3.14.7 於雲端環境連線 CWA API 時曾發生 OpenSSL/憑證相容性異常 | 雲端設定固定使用 Python 3.11 運作，維持高度穩定相容性 |
| **D-011** | 2026-09-23 | **Accepted** | 介面支援 22 縣市（縣市模式）與北、中、南、東四區（地區模式） | 提供由大範圍宏觀切換至單一縣市微觀的階層化氣象觀察視角 | 彙整模組需能根據選定模式動態計算對應範圍之極值指標 |
| **D-012** | 2026-09-23 | **Accepted** | 澎湖、金門、連江只在縣市模式個別顯示，不建立「離島地區」彙整分區 | 三離島地理跨度極大、氣候條件迥異，強行合併為單一區域無氣象分析價值 | 地區模式僅設 4 區；離島縣市其 `region` 為 `None`，但在縣市模式中完整保留與呈現 |
| **D-013** | 2026-09-23 | **Accepted** | AQI 區域彙整採用區內有效測站之最大值（最差測站），不計算數值平均 | 空氣品質為健康防護指標，數值平均會稀釋污染熱點，失去預警意義 | 顯示最高 AQI 同時必須標示造成最高數值的測站名稱、主要污染物與有效測站數；全缺回傳 NaN 不補 0 |
| **D-014** | 2026-09-23 | **Accepted** | 降雨跨測站彙整採用最大值，不將不同測站雨量相加 | 將同一區域內多個測站之毫米數相加在氣象學上不具物理意義 | 區內雨量指標以「最大雨量」測站數值為準，明確代表該區目前最顯著之降雨強度 |
| **D-015** | 2026-09-23 | **Accepted** | 紫外線為 V2 必要功能，但目前不鎖定 Dataset ID，O-A0005-001 僅為候選（待 M12 驗證） | 避免在尚未完成資料源研究前，把候選 Dataset 和資料語意寫成已驗證事實 | M12 開始時透過官方文件與真實 API response 驗證有效性與資料語意；UI 標籤依驗證結果動態決定，不預先固定 |
| **D-016** | 2026-09-23 | **Accepted (Revised)** | 按需取得、驗證、短期快取、按需回傳 (On-Demand Fetch & Cache) | V2 無永久資料庫；公開訪客查詢時，由 Next.js Server Route Handlers 按需向 CWA/MOENV 取得最新資料，完成安全驗證與清洗後，寫入短期快取並回傳前端 | 省去永久資料庫同步工作程序與長時序排程，以輕量無狀態滿足即時性；TTL 採候選值待各 Milestone 定案 |
| **D-017** | 2026-09-23 | **Accepted (Revised)** | 服務端代理外部 API (Server-Side Gateway) | 避免前端金鑰外洩與政府 API 遭濫用 | 公開訪客僅能呼叫本站 Next.js Server 端點；僅有 Next.js Server 能使用伺服端環境變數呼叫 CWA/MOENV |
| **D-018** | 2026-09-23 | **Accepted** | 地理介面採全臺 → 縣市 → 鄉鎮的漸進式揭露 | 全臺 368 鄉鎮與數百測站若全部同時渲染，會造成視覺嚴重干擾與 DOM 節點過重 | 全臺視角顯示縣市摘要，放大或選取縣市後才載入該範圍鄉鎮與測站 |
| **D-019** | 2026-09-23 | **Accepted** | Hover 僅為桌面輔助；Click、Tap 與鍵盤操作必須能完成核心功能 | 手機與觸控螢幕裝置無滑鼠懸停事件，必須確保全裝置功能可用性 | Hover 僅顯示簡要提示；Click / Tap 叫出固定詳細面板，保證行動端 100% 可用 |
| **D-020** | 2026-09-23 | **Accepted** | 鄉鎮資料依目前 Viewport、Zoom 與選定圖層載入，不一次查詢全部完整時序 | 節省資料傳輸頻寬與減少伺服端運算負擔 | 查詢函式支援空間範圍 (Bounding Box) 或指定行政區過濾 |
| **D-021** | 2026-09-23 | **Accepted** | 預報、即時觀測、雨量測站、AQI 與 UV 必須清楚區分資料語意 | 預報為模型推估、觀測為感測器實況，混淆會嚴重誤導使用者判斷 | 端點分開處理，UI 明確標記資料性質、時間戳與感測器來源 |
| **D-022** | 2026-09-23 | **Accepted (Revised)** | 快取過期與外部失敗處理 (Cache Expiry and Upstream Failure) | 無狀態架構無永久資料庫保證，必須在維持高可用容錯的同時維持資料真實性與透明度 | 僅在選定機制確實支援 stale retention 且有實際可讀取快取時提供 stale response；無快取時回傳 unavailable，嚴禁偽造假資料或補 0 |
| **D-023** | 2026-09-23 | **Accepted** | 測站觀測只代表測站；不得直接冒充整個行政區的精確實況 | 縣市或鄉鎮統計值代表統計指標，並非該行政區全境均為該單一數值 | 顯示彙整數據時必須揭露具體貢獻測站名稱與有效測站計數 |
| **D-024** | 2026-09-23 | **Superseded** | ~~完整時序保存在資料庫，但不一次傳送至瀏覽器~~（已被 D-033 取代） | 原規劃在 PostgreSQL 保存完整歷史時序；V2 轉為無狀態架構，不保存長期歷史時序 | 被 D-033 取代，V2 只處理目前最新觀測與未來預報 |
| **D-025** | 2026-09-23 | **Accepted** | 先完成受保護的管理員手動刷新，再評估自動排程 | 降低初期系統複雜度與外部依賴風險，確保資料管道可在人工受控下完全驗證 | M15 實作受保護手動刷新與診斷，自動排程列為 M17 評估 |
| **D-026** | 2026-09-23 | **Accepted (Revised)** | V2 正式前端採用 Next.js + TypeScript，部署至 Vercel | 需要更完整的地圖互動、響應式 UI、viewport 查詢、Click/Tap 詳細面板以及更細緻的前端狀態控制 | 現有 Streamlit UI 不會直接部署到 Vercel；由 M7 建立最小 `web/` 專案基礎與伺服端閘道，M14 在其基礎上建立完整地圖 UI |
| **D-027** | 2026-09-23 | **Accepted** | Next.js 遷移期間保留既有 Streamlit 公開網站 | 避免重寫期間中斷目前已完成的 M1～M6 功能 | 只有在 M16 完成功能一致性與雲端驗收後，才決定是否停止 Streamlit |
| **D-028** | 2026-09-23 | **Accepted (Revised)** | Next.js App 放置於 repository 的 `web/` 目錄，Vercel Root Directory 設為 `web` | 保留現有 Python ingestion、tests 與 Streamlit App，避免兩種 runtime 混亂 | 由 M7 建立最小 `web/` 專案骨架與 Gateway，M14 實作完整 UI |
| **D-029** | 2026-09-23 | **Superseded** | ~~公開瀏覽器只能使用 Supabase public URL 與 anon key，受 RLS 保護~~（已被 D-033, D-034 取代） | 因 V2 不再使用 Supabase，移除 anon key、RLS 與 Service Role Key 規劃 | 被 D-033、D-034 取代；前端不直連任何雲端資料庫，一律走 Next.js Route Handlers |
| **D-030** | 2026-09-23 | **Accepted (Revised)** | 保留 Python Legacy parser，但 V2 Next.js server data gateway 可依需要以 TypeScript 實作 | 既有 Python 成果保留作為 Streamlit 與測試參照，V2 端點依 Vercel 最佳生態實作，不強求 Python Worker | M15 不強制建立 Python background worker，V2 著重於 Next.js 輕量化 Serverless 處理 |
| **D-031** | 2026-09-23 | **Accepted** | 不得將目前 `app.py` 視為可直接搬到 Vercel 的 Next.js frontend | Streamlit 是具有 Session/WebSocket 狀態的 Python client-server App，Vercel Functions 具有不同的執行模型與時間限制 | Vercel 遷移屬於前端重建，不只是修改部署設定 |
| **D-032** | 2026-09-23 | **Accepted** | Vercel 必須通過資料一致性、功能一致性、手機、效能、安全與 rollback 驗收，才可成為正式入口 | 避免尚未完成的新版取代目前可用的 Streamlit App | M16 必須提供 parity checklist、cutover checklist 和 rollback procedure |
| **D-033** | 2026-09-23 | **Accepted** | V2 不使用 PostgreSQL、Supabase、Neon 或其他永久資料庫 (No Persistent Database) | 作業與產品目標不要求歷史資料分析，主要需求為當前實況與未來預報，降低複雜度與維運成本 | 部署重啟或 cache miss 時重新向官方 API 取得資料；歷史分析需求延後至 M17 |
| **D-034** | 2026-09-23 | **Accepted** | 所有政府 API 請求由 Next.js Server Route Handlers 代理 (Server-Side API Gateway) | 避免任何 CWA_API_KEY 或 MOENV_API_KEY 暴露於瀏覽器端 bundle 或網路請求中 | 前端純粹呼叫本站 `/api/...` 端點，金鑰嚴格保存在 Vercel Server 端環境變數 |
| **D-035** | 2026-09-23 | **Accepted (Revised)** | 快取不是資料庫 (Cache Is Not a Database) | 快取可被清除、自然過期或因新版本部署而重置，不得作為可靠歷史存儲 | UI 必須顯示官方資料真實發布時間戳，並正確處理 fresh、stale 與 unavailable 狀態 |
| **D-036** | 2026-09-23 | **Accepted** | 歷史時序、Downsampling 與趨勢分析延後至 M17 (Historical Data Deferred) | 避免為目前未要求的歷史分析負擔不必要的永久資料庫建置、維運與 Migration 成本 | M7～M16 全面專注於無狀態即時觀測、空品、UV、警特報與預報呈現 |
| **D-037** | 2026-09-23 | **Accepted** | 現有 Streamlit + SQLite 維持原樣隔離 (Legacy Streamlit Isolation) | 保留目前可運作之成果，避免遷移期間破壞舊版或引入不相容依賴 | V2 不讀取、不搬移、不依賴 `data/weather.db`，兩者平行獨立 |
| **D-038** | 2026-09-23 | **Accepted** | 外部 API 失敗且無可用快取時，明確顯示 Unavailable 與安全錯誤 (External Failure Behavior) | 無永久資料庫可保證永久保留前次成功紀錄，必須維持資料真實性 | 不得偽造假成功資料、假時間戳，缺值嚴禁以 0 代替，介面提供重試指引 |
| **D-039** | 2026-09-23 | **Accepted** | M7 建立 Next.js 基礎與 Server Gateway，M14 建立地圖 UI (M7 Creates the Next.js Foundation) | Route Handlers 必須依附於 Next.js 專案中，不能等到 M14 才建立 web/ | M7 建立最小 web/ 專案骨架與健康檢查頁，M14 專注實作完整地圖 UI |
| **D-040** | 2026-09-23 | **Accepted** | 快取實作須經實測驗證，不預設記憶體可靠 (Cache Implementation Requires Verification) | Vercel Function process 記憶體跨 request/instance 無保留保證，快取機制在 M7 實測後定案 | 上游失敗且無實際可讀取快取時必須回傳 unavailable，不承諾過期項目必可讀取 |
| **D-041** | 2026-09-23 | **Accepted** | 各資料源 TTL 依官方行為獨立決定 (TTL Is Data-Source Specific) | 預報、觀測、空品與警特報之更新週期與時效性不同，目前 TTL 皆為 candidate | 各 Milestone 依官方 Header、更新頻率與 freshness 需求決定最終 TTL |

---

## 重要決策詳細規格 (Detailed ADR Specifications)

### D-006: (Superseded) 雲端 PostgreSQL 資料庫規範
*   **Status**: Superseded by D-033
*   **Original Decision**: 原規劃在正式雲端環境引入 Supabase PostgreSQL 作為持久化存儲。
*   **Superseded Reason**: 產品目標明確收斂為當前最新觀測與未來預報，無需歷史分析，全面採用無狀態架構降低架構負擔。

### D-016: 按需取得、驗證、短期快取、按需回傳 (Revised)
*   **Status**: Accepted
*   **Decision**:
    V2 不建置全量資料庫批次同步管道；公開訪客查詢時，由 Next.js Server Route Handlers 按需向 CWA/MOENV 取得最新資料，完成安全驗證與清洗後，寫入短期快取並回傳前端。
*   **Reason**:
    省去大型資料庫同步工作程序 (Sync Worker) 與長時序排程，以輕量無狀態方式滿足即時性。
*   **Consequence**:
    快取設置 Initial Candidate TTL（如預報 10～30 分鐘、觀測 5～15 分鐘、警特報 2～5 分鐘），最終 TTL 依官方更新頻率與 API 行為於各 Milestone 實測決定，避免頻繁呼叫觸發政府開放平臺 Rate Limit。

### D-017: 服務端代理外部 API (Revised)
*   **Status**: Accepted
*   **Decision**:
    公開訪客僅能呼叫本站 Next.js Server 端點（如 `/api/forecast`, `/api/observations` 等）；僅有 Next.js Server 能使用伺服端環境變數安全呼叫 CWA / MOENV。
*   **Reason**:
    杜絕前端金鑰外洩風險，防止惡意爬蟲直接利用使用者的金鑰刷取外部政府服務。
*   **Consequence**:
    前端程式碼完全不引用任何外部金鑰，所有請求皆由本站伺服端作為 Gateway。

### D-022: 快取過期與外部失敗處理 (Revised)
*   **Status**: Accepted
*   **Decision**:
    若外部 API 暫時連線失敗：
    1. 只有選定機制確實支援 stale retention / stale-while-revalidate 且仍有「實際可讀取」的快取 entry 時，才能提供 stale response，並清楚標註原始資料時間戳（Stale）。不得承諾 expired entry 一定仍可讀取。
    2. 若上游失敗且沒有「實際可讀取」的快取 entry，直接回傳 Unavailable 狀態並提示重試，嚴禁偽造假成功或補 0。
*   **Reason**:
    無狀態架構無永久資料庫保證，必須在維持高可用容錯的同時維持資料真實性與透明度。
*   **Consequence**:
    前端需有清楚的 Stale 狀態提示與 Unavailable 錯誤邊界元件。

### D-026: V2 正式前端採用 Next.js + TypeScript (Revised)
*   **Status**: Accepted
*   **Decision**:
    V2 正式前端採用 Next.js + TypeScript 部署至 Vercel。
*   **Reason**:
    需要更完整的地圖互動、響應式 UI、viewport 查詢、Click/Tap 詳細面板以及更細緻的前端狀態控制。
*   **Consequence**:
    現有 Streamlit UI 不會直接部署到 Vercel；由 M7 建立最小 `web/` 專案基礎與伺服端閘道，M14 在其基礎上建立完整地圖 UI。

### D-028: Next.js App 放置於 `web/` 目錄 (Revised)
*   **Status**: Accepted
*   **Decision**:
    Next.js App 放置於 repository 的 `web/` 目錄，Vercel Root Directory 設為 `web`。
*   **Reason**:
    保留現有 Python ingestion、tests 與 Streamlit App，避免兩種 runtime 混亂。
*   **Consequence**:
    M7 建立最小 `web/` 專案骨架與 Route Handlers 基礎，M14 專注實作完整前端地圖 UI。

### D-029: (Superseded) Supabase 瀏覽器安全與 RLS 規範
*   **Status**: Superseded by D-033, D-034
*   **Original Decision**: 原規劃瀏覽器使用 Supabase anon key 搭配 RLS 存取資料庫。
*   **Superseded Reason**: 因 V2 全面棄用 Supabase，改由 Next.js Server Route Handlers 代理，故不再需要 anon key、Service Role Key 或 RLS 策略。

### D-030: Python 與 TypeScript 實作邊界 (Revised)
*   **Status**: Accepted
*   **Decision**:
    保留既有 Python API client 與 parser 作為 Legacy V1 與測試參照；V2 Next.js Server Data Gateway 依需求可直接以 TypeScript 實作，不強制要求建立 Python Worker。
*   **Reason**:
    避免在無狀態 Web 架構下強行跨語言混合排程，簡化 Vercel 部署維護。
*   **Consequence**:
    V2 API Gateway 可直接於 Next.js 內部完成請求與正規化。

### D-033: V2 不使用永久資料庫 (No Persistent Database for V2)
*   **Status**: Accepted
*   **Decision**:
    V2 全面採用無狀態 (Stateless) 架構，不使用 PostgreSQL、Supabase、Neon 或其他任何持久化雲端資料庫。
*   **Reason**:
    本作業與目前產品目標不要求歷史資料分析，主要需求為顯示目前觀測、空品、UV、警特報與官方未來預報。移除資料庫能顯著降低架構、帳號、Secrets、Migration 與維運複雜度。
*   **Consequence**:
    Server 重啟或 Cache Miss 時直接向官方 API 取得資料；歷史資料與長期分析需求延後至 M17 評估。

### D-034: 伺服端 API 閘道代理 (Server-Side API Gateway)
*   **Status**: Accepted
*   **Decision**:
    所有需要 `CWA_API_KEY` 或 `MOENV_API_KEY` 的外部請求，嚴格只能由 Next.js Server-side Route Handlers 發送。
*   **Reason**:
    保護政府開放平臺 API Key，防止金鑰進入 Browser Client Bundle 或在瀏覽器 Network 請求中暴露。
*   **Consequence**:
    前端客戶端只能呼叫本站 `/api/...` 端點，絕不持有任何政府金鑰。

### D-035: 短期快取非永久儲存 (Cache Is Not a Database)
*   **Status**: Accepted (Revised)
*   **Decision**:
    快取不是資料庫 (Cache Is Not a Database)。不得依賴快取作為資料可用性的唯一保證。V2 不依賴 Function process memory 作為可靠共享快取。
*   **Reason**:
    Vercel Function instance memory 不保證跨 request、instance 或 deployment 保留。快取可被清除、自然過期或因新版本部署而重置。
*   **Consequence**:
    Cache miss 時向官方 API 重新取得；上游 API 失敗且沒有「實際可讀取」的快取 entry 時回傳 unavailable。UI 必須清楚呈現官方發布之資料時間戳，並正確處理 fresh、stale 與 unavailable 狀態。

### D-036: 歷史時序與持久化延後 (Historical Data Deferred)
*   **Status**: Accepted
*   **Decision**:
    歷史時序儲存、Downsampling、Retention 與跨期趨勢分析全數延後至 M17 評估。
*   **Reason**:
    避免過早最佳化與承擔未被要求的資料庫維護成本。
*   **Consequence**:
    M7～M16 全力專注於即時觀測與預報之流暢度與無障礙體驗。

### D-037: 現有 Streamlit 與 V2 完全隔離 (Legacy Streamlit Isolation)
*   **Status**: Accepted
*   **Decision**:
    現有 Streamlit + SQLite 保持原狀運作，與 Vercel V2 完全解耦。
*   **Reason**:
    維持既有已上線系統正常服務，不因 V2 遷移而干擾或破壞現有功能。
*   **Consequence**:
    V2 不讀取、不搬移 `data/weather.db`，兩者平行獨立。

### D-038: 外部 API 異常處理 (External API Failure Behavior)
*   **Status**: Accepted
*   **Decision**:
    當外部官方 API 發生中斷且無可用短期快取時，明確呈現 Unavailable 與友善錯誤提示。
*   **Reason**:
    在無永久資料庫的前提下，無法保證永久保留前次成功紀錄，系統必須維持資料真實性。
*   **Consequence**:
    嚴禁偽造假成功快照、偽造時間戳或將缺失數值補成 0。

### D-039: M7 建立 Next.js 基礎與 Server Gateway，M14 建立地圖 UI (M7 Creates the Next.js Foundation)
*   **Status**: Accepted
*   **Decision**:
    M7 建立最小 `web/` Next.js + TypeScript 基礎與 server data gateway；M14 在此基礎上建立完整地圖 UI。
*   **Reason**:
    Route Handlers 必須存在於 Next.js 專案中，不能等到 M14 才建立 `web/`。
*   **Consequence**:
    M7 只建立技術骨架與最小狀態頁，不提前實作完整產品 UI。

### D-040: 快取實作須經實測驗證，不預設記憶體可靠 (Cache Implementation Requires Verification)
*   **Status**: Accepted
*   **Decision**:
    V2 不依賴 Function process memory 作為可靠共享 cache。具體 cache API 與 stale 行為必須在 M7 Research 中實測確認。
*   **Reason**:
    Serverless instance 記憶體、生命週期與跨 instance 共用沒有可靠保證。
*   **Consequence**:
    如果上游失敗且沒有實際可讀取的 cache entry，必須回傳 unavailable。

### D-041: 各資料源 TTL 依官方行為獨立決定 (TTL Is Data-Source Specific)
*   **Status**: Accepted
*   **Decision**:
    每個資料源的 TTL 依官方更新頻率、API 行為與 freshness 要求決定。
*   **Reason**:
    Forecast、observation、AQI 與 alerts 的更新頻率與時效需求不同。
*   **Consequence**:
    目前文件中的 TTL 只能標示為候選值 (Initial Candidate TTL)，不能視為最終設定。
