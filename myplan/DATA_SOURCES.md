# 外部資料來源登錄表 (DATA_SOURCES.md)

本文件完整登記本專案所引用的外部開放資料來源、資料集識別碼 (Dataset ID)、更新頻率、認證金鑰欄位、驗證狀態與資料結構語意。

---

## 1. 資料來源狀態分類定義 (Status Taxonomy)

所有外部資料集依開發成熟度標示為以下 4 種狀態之一：
*   `Verified`：已透過真實 API response 完整驗證有效性、欄位結構、更新頻率與型態轉換，並已落地於正式流程。
*   `Candidate`：已選定為候選資料集，但其完整結構、地理涵蓋範圍或最新端點仍須在指定 Milestone 中實測驗證。
*   `Must Research`：尚未確定具體官方端點或尚未完成初步探勘，必須於指定 Milestone 進行深入研究。
*   `Deprecated`：舊版端點、已廢棄之資料集或不再支援之資料源。

---

## 2. 資料來源登錄總表

| 來源機關 (Source) | 資料集 ID (Dataset ID) | 官方標題 / 用途 (Title / Purpose) | 更新頻率 (Frequency) | 認證 Secret 欄位 | 目前驗證狀態 (Status) | 重要語意與實作備註 (Notes) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CWA (中央氣象署)** | **`F-D0047-091`** | 臺灣各縣市未來1週天氣預報（全臺 22 縣市預報） | 每日定時發布 (約每 3~6 小時一次) | `CWA_API_KEY` | **Verified for current county workflow；完整鄉鎮結構仍須 M8 驗證** | M1~M6 現行縣市預報資料源。每次擷取產出 22 縣市 × 15 區間 = 330 筆 12 小時預報記錄。完整鄉鎮細部結構將於 M8 探勘驗證。 |
| **CWA (中央氣象署)** | **`O-A0003-001`** | 氣象觀測站－10分鐘綜觀氣象資料（地面氣象即時觀測） | 每 10 分鐘更新一次 | `CWA_API_KEY` | **Official dataset verified；Response schema status: Must verify with live API during M10** | M10 即時測站氣象觀測資料源。資料預期包含座標與各氣象要素。官方缺失值以 `"-99"` 等 sentinel 表示，必須轉為 SQL `NULL`。待 M10 驗證。 |
| **CWA (中央氣象署)** | **`O-A0002-001`** | 雨量觀測站－雨量資料（自動雨量站資料） | 每 10 分鐘更新一次 | `CWA_API_KEY` | **Candidate / Must verify with live API (M10)** | M10 雨量測站擴充候選資料源。提供更密集之降雨觀測站網。待 M10 實測驗證。 |
| **MOENV (環境部)** | **`aqx_p_432`** | 空氣品質指標 (AQI) 與各類污染物即時觀測濃度 (`PM2.5`, `PM10`, `O3`, `CO`, `SO2`, `NO2`) | 每小時更新一次 (約整點 10~30 分發布) | `MOENV_API_KEY` | **Candidate，待 M11 真實驗證** | M11 空氣品質核心候選資料源。缺值欄位為空字串 `""`，**嚴禁轉為 0**，必須正規化為 SQL `NULL`。待 M11 完整實測。 |
| **CWA (中央氣象署)** | **`O-A0005-001` 等候選** | 紫外線觀測/預報資料集 (候選) | 待驗證確認 | `CWA_API_KEY` | **Candidate，待 M12 驗證** | 紫外線為 V2 必要功能，但目前不鎖定 Dataset ID。`O-A0005-001` 僅列為候選資料集。M12 開始時必須透過官方文件與真實 API response 驗證：有效性、資料語意（目前值/預報值/當日最大值）、更新頻率、測站涵蓋範圍與真實 JSON 結構。UI 標籤依驗證結果決定，不預先固定。 |
| **CWA (中央氣象署)** | **`W-C0033-001` 等警特報資料集** | 氣象災害警特報 (大雨、豪雨、陸上強風、低溫特報等) | 不定期發布 (依即時氣象災害狀況觸發) | `CWA_API_KEY` | **Must Research (M12)** | M12 天氣警特報候選資料源。待 M12 深入探勘具體端點、格式與多縣市警報匹配規則。 |
| **CWA (中央氣象署)** | **`O-A0058-001` 等** | 雷達回波圖、雷電落雷、衛星雲圖 | 定期發布 | `CWA_API_KEY` | **Must Research / Optional (M17)** | M17 進階選配圖層。視需求於 M17 評估。 |

---

## 3. M10 觀測資料來源詳細登錄 (Detailed Dataset Specifications)

### 3.1 CWA 地面綜觀氣象觀測 `O-A0003-001`
*   **Source**: Central Weather Administration (CWA)
*   **Dataset ID**: `O-A0003-001`
*   **Official title**: 氣象觀測站－10分鐘綜觀氣象資料
*   **Milestone**: M10
*   **Dataset status**: Official dataset verified
*   **Response schema status**: Must verify with live API during M10
*   **Purpose**: Real-time station weather observations
*   **Authentication**: `CWA_API_KEY`
*   **Expected data**（此為 M10 之驗證清單，不得聲稱每個測站或真實 JSON 已確認全部提供這些欄位）：
    *   station identifier (測站識別代碼)
    *   station name (測站中文名稱)
    *   observation time (觀測時間)
    *   latitude / longitude (地理座標)
    *   elevation (測站海拔高度)
    *   temperature (氣溫)
    *   relative humidity (相對濕度)
    *   pressure (氣壓)
    *   wind speed (風速)
    *   wind direction (風向)
    *   gust (陣風)
    *   precipitation (降水量)
    *   weather or visibility fields where available (天氣現象或能見度，若具備)
    *   source quality / missing-value indicators (品質或缺值指示標記)

### 3.2 CWA 雨量觀測 `O-A0002-001`
*   **Source**: Central Weather Administration (CWA)
*   **Dataset ID**: `O-A0002-001`
*   **Official title**: 雨量觀測站－雨量資料
*   **Milestone**: M10
*   **Status**: Candidate / Must verify with live API
*   **Purpose**: Denser precipitation-station coverage (提供更密集的雨量測站網)
*   **Authentication**: `CWA_API_KEY`

---

## 4. 外部 API 呼叫邊界與安全規範

### 存取邊界原則 (決策 D-017)：
1.  **訪客完全隔離**：公開訪客在網頁上的所有操作（瀏覽、篩選、縮放、圖層切換）**一律只讀取 Supabase PostgreSQL**，絕不直接發送 HTTP 請求至 CWA 或環境部。
2.  **後端同步保護**：外部 API 的呼叫權限嚴格收斂至受管理員密碼保護之同步後台（M15）或後續排程工作（M17）。

### 金鑰防洩密原則：
1.  **禁止硬編碼**：所有 API Key、資料庫連線字串或管理員密碼**嚴禁**寫入任何 Python 程式碼、TypeScript 原始碼、Markdown 文件、Commit 紀錄或測試 Fixture 中。
2.  **歷史金鑰隔離**：使用者先前在對話中提及之暴露金鑰一律作廢，絕不複製進儲存庫的任何角落。
3.  **範例標準化**：文件與範例檔（如 `.streamlit/secrets.toml.example`）僅能使用顯著的佔位符或假金鑰：
    ```toml
    # .streamlit/secrets.toml.example 範例標準
    CWA_API_KEY = "your-cwa-api-key"
    MOENV_API_KEY = "your-moenv-api-key"
    SUPABASE_DB_URL = "postgresql://user:password@host:5432/postgres"
    ADMIN_PASSWORD = "your-admin-password"
    ```
4.  **測試 Key 標準**：自動化測試一律使用 `test-cwa-api-key`、`test-moenv-api-key` 等虛擬假值，搭配 Mock 進行本機阻斷驗證。

---

## 5. Secrets 分類與環境隔離規範 (Secrets Architecture)

依決策 D-008、D-029，專案中涉及之各類敏感配置嚴格遵循以下二元環境分類：

### 類別 A：可在未來 Vercel Client (前端公開環境) 使用，但必須搭配 RLS
僅限公開讀取 Supabase API 且無法被視為機密的公開識別參數：
*   `NEXT_PUBLIC_SUPABASE_URL`：Supabase 專案公開 API URL。
*   `NEXT_PUBLIC_SUPABASE_ANON_KEY`：Supabase 公開匿名金鑰（或平台目前正式建議的 publishable key 名稱）。
*   **必備防護**：此金鑰直接暴露給公開瀏覽器，**資料庫必須依決策 D-029 配置嚴密的 Row Level Security (RLS)**，確保匿名端點僅具備已發布快照與公開檢視表之唯讀權限，絕無任何資料寫入或跨越權限。

### 類別 B：只能存在 Vercel Server、GitHub Actions、同步 Worker 或安全伺服器環境
絕不可打包進前端 Client Bundle，絕不對外洩露：
*   `SUPABASE_SERVICE_ROLE_KEY`：Supabase 高權限服務金鑰（具備繞過 RLS 之完整管理權限）。
*   `DATABASE_URL`：PostgreSQL 直接連線字串（包含帳號密碼）。
*   `CWA_API_KEY`：中央氣象署開放資料 API 金鑰。
*   `MOENV_API_KEY`：環境部開放資料 API 金鑰。
*   `ADMIN_PASSWORD`：手動同步後台保護密碼。

### 嚴格遵守之規則：
1.  **禁止真實值**：本檔案、其他規劃文件與程式碼中不得放入任何真實金鑰值。
2.  **前綴防護**：嚴禁將 `SUPABASE_SERVICE_ROLE_KEY`、`DATABASE_URL`、`CWA_API_KEY`、`MOENV_API_KEY` 或 `ADMIN_PASSWORD` 使用 `NEXT_PUBLIC_` 前綴。
3.  **防洩露邊界**：上述機敏項目不得出現在 Client Bundle、瀏覽器 Console Log、網路請求 Payload 或錯誤訊息堆疊中。
4.  **操作時機**：真實 Secrets 設定延後至對應 Milestone（如 M7、M15、M16），由使用者於本機環境變數、Streamlit Secrets 或 Vercel Environment Variables 自行配置，Agent 絕不代替操作。
