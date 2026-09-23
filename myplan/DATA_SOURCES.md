# 外部資料來源登錄表 (DATA_SOURCES.md)

本文件完整登記本專案所引用的外部開放資料來源、資料集識別碼 (Dataset ID)、更新頻率、認證金鑰欄位、驗證狀態、無狀態閘道架構與 Secrets 安全邊界規範。

---

## 1. 資料來源狀態分類定義 (Status Taxonomy)

所有外部資料集依開發成熟度標示為以下 4 種狀態之一：
*   `Verified`：已透過真實 API response 完整驗證有效性、欄位結構、更新頻率與型態轉換，並已落地於正式流程。
*   `Candidate`：已選定為候選資料集，但其完整結構、地理涵蓋範圍或最新端點仍須在指定 Milestone 中實測驗證。
*   `Must Research`：尚未確定具體官方端點或尚未完成初步探勘，必須於指定 Milestone 進行深入研究。
*   `Deprecated`：舊版端點、已廢棄之資料集或不再支援之資料源。

---

## 2. 資料來源登錄總表

| 來源機關 (Source) | 資料集 ID (Dataset ID) | 官方標題 / 用途 (Title / Purpose) | 更新頻率 (Frequency) | 認證 Secret 欄位 (Vercel Server-Only) | 目前驗證狀態 (Status) | 重要語意與實作備註 (Notes) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CWA (中央氣象署)** | **`F-D0047-091`** | 臺灣各縣市未來1週天氣預報（全臺 22 縣市預報） | 每日定時發布 (約每 3~6 小時一次) | `CWA_API_KEY` | **Verified for current county workflow；完整鄉鎮結構仍須 M8 驗證** | M1~M6 現行縣市預報資料源。M9 將建立 Server Route Handler 進行即時查詢與短期快取，不寫入資料庫。 |
| **CWA (中央氣象署)** | **`O-A0003-001`** | 氣象觀測站－10分鐘綜觀氣象資料（地面氣象即時觀測） | 每 10 分鐘更新一次 | `CWA_API_KEY` | **Official dataset verified；Response schema status: Must verify with live API during M10** | M10 即時測站氣象觀測資料源。官方缺失值以 `"-99"` 等 sentinel 表示，必須轉為 `NULL`。不保存長期時序。 |
| **CWA (中央氣象署)** | **`O-A0002-001`** | 雨量觀測站－雨量資料（自動雨量站資料） | 每 10 分鐘更新一次 | `CWA_API_KEY` | **Candidate / Must verify with live API (M10)** | M10 雨量測站擴充候選資料源。提供更密集之降雨觀測站網，短暫快取最新值。 |
| **MOENV (環境部)** | **`aqx_p_432`** | 空氣品質指標 (AQI) 與各類污染物即時觀測濃度 (`PM2.5`, `PM10`, `O3`, `CO`, `SO2`, `NO2`) | 每小時更新一次 (約整點 10~30 分發布) | `MOENV_API_KEY` | **Candidate，待 M11 真實驗證** | M11 空氣品質核心候選資料源。缺值欄位為空字串 `""`，**嚴禁轉為 0**，必須正規化為 `NULL`。短期快取最新值，不存歷史庫。 |
| **CWA (中央氣象署)** | **`O-A0005-001` 等候選** | 紫外線觀測/預報資料集 (候選) | 待驗證確認 | `CWA_API_KEY` | **Candidate，待 M12 驗證** | 紫外線為 V2 必要功能，但目前不鎖定 Dataset ID。`O-A0005-001` 僅列為候選資料集。M12 開始時必須透過官方文件與真實 API response 驗證：有效性、資料語意（目前值/預報值/當日最大值）、更新頻率、測站涵蓋範圍與真實 JSON 結構。UI 標籤依驗證結果決定，不預先固定。 |
| **CWA (中央氣象署)** | **`W-C0033-001` 等警特報資料集** | 氣象災害警特報 (大雨、豪雨、陸上強風、低溫特報等) | 不定期發布 (依即時氣象災害狀況觸發) | `CWA_API_KEY` | **Must Research (M12)** | M12 天氣警特報候選資料源。待 M12 探勘具體端點，僅過濾並回傳當前有效警報。 |
| **CWA (中央氣象署)** | **`O-A0058-001` 等** | 雷達回波圖、雷電落雷、衛星雲圖 | 定期發布 | `CWA_API_KEY` | **Must Research / Optional (M17)** | M17 進階選配圖層。若未來需要時再行評估。 |

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
*   **Authentication**: `CWA_API_KEY` (Vercel Server-Only)
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
*   **Authentication**: `CWA_API_KEY` (Vercel Server-Only)

---

## 4. 外部 API 呼叫邊界與安全性原則 (API Security Gateway)

依決策 D-017、D-034，專案採用**完全無狀態的伺服端 API 閘道代理模式**：

### 存取邊界原則：
1.  **訪客完全隔離**：公開瀏覽器端（Next.js UI）**一律不持有任何政府 API 金鑰**，也嚴禁直接發送 HTTP 請求給政府平臺。瀏覽器純粹呼叫本站端點（如 `/api/forecast`、`/api/observations` 等）。
2.  **伺服端代理中繼**：所有向 CWA 與環境部發出的請求，均由 Next.js Server Route Handlers 發起，金鑰自伺服端環境變數讀取。
3.  **無永久資料庫**：V2 不建立 PostgreSQL / Supabase / Neon 等永久資料庫，外部資料經由伺服端驗證與正規化後，透過短期快取暫存，即時轉發回傳瀏覽器。

---

## 5. Secrets 分類與安全邊界規範 (Secrets Architecture)

### 5.1 權限與環境配置邊界

*   **Browser (前端公開環境)**：
    *   **不需要任何 CWA / MOENV key**。
    *   **無任何資料庫連線字串**。
    *   前端純粹發送 GET 請求給本站內部 API（如 `/api/forecast`、`/api/observations`）。
*   **Vercel Server-Only (伺服端安全環境)**：
    *   `CWA_API_KEY`：中央氣象署開放資料 API 金鑰。
    *   `MOENV_API_KEY`：環境部開放資料 API 金鑰。
    *   `ADMIN_PASSWORD`：管理員診斷功能保護密碼（若未來需要）。
*   **Optional M17 (未來擴充)**：
    *   永久資料庫配置（如 PostgreSQL / Supabase / Neon 之連線參數）全數移至 **M17 選配階段**，現階段 (M7～M16) 完全不引入。

### 5.2 絕對禁止之安全紅線：
1.  **嚴禁暴露給 Client**：
    *   **禁止 `NEXT_PUBLIC_CWA_API_KEY`**。
    *   **禁止 `NEXT_PUBLIC_MOENV_API_KEY`**。
2.  **嚴禁在 URL Query 中暴露金鑰**。
3.  **嚴禁 `console.log` 任何 API Key**。
4.  **嚴禁將官方完整原始錯誤回應（可能含有 Key 或 Authorization Header）原樣傳給 Browser**。
5.  **嚴禁將任何敏感 Authorization Header 回傳給 Browser**。
6.  **嚴禁在 API Client 中使用 `verify=False` 關閉 SSL 驗證（決策 D-009）**。
7.  **嚴禁以 `0` 代替任何缺失數值（必須正規化為 `null`）**。
8.  **嚴禁 Browser 直接呼叫需要 Key 的政府 API**。
9.  **測試環境隔離**：所有自動化測試一律使用 `test-cwa-api-key`、`test-moenv-api-key` 等虛擬假值，搭配 Mock 進行本機隔離驗證。
