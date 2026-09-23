# Milestone M11: 環境部空氣品質 (M11-AIR-QUALITY.md)

本文件為 M11（MOENV Air Quality）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 驗證並安全串接環境部空氣品質開放資料集（候選 `aqx_p_432`），擷取全臺空氣品質測站之 AQI 指標、PM2.5、PM10、主要污染物及各項監測濃度，規範空值防護並寫入 Supabase PostgreSQL。
*   **Dependencies**: M7 (Cloud Data Foundation), M8 (Geographic Registry & CWA Dataset Discovery)

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   實作環境部 API client（`src/moenv_api.py`）：
    *   安全載入 `MOENV_API_KEY`（優先 `st.secrets`，fallback `os.getenv`）。
    *   缺少時拋出不洩密之 `MoenvAuthError`。
    *   獨立實作並驗證 TLS 憑證行為（決策 D-009）。
*   實作空品資料解析器（`src/parser_aqi.py`）：
    *   空字串 `""` 嚴格轉換為 `None` / SQL `NULL`，**嚴禁填補 0**。
*   建立 `aqi_stations` 測站表與 `aqi_observations` 觀測時序表。

### 非目標 (Non-Goals)：
*   不在此階段計算區域 AQI 數值平均（依決策 D-013 由 M13 實作最差測站彙整）。
*   嚴禁在程式碼、日誌或測試中記錄真實 MOENV 金鑰。
*   不在此階段實作前端地圖呈現（由 M14 負責）。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   `aqx_p_432`（空氣品質指標 AQI）：Candidate，待 M11 進行端點與憑證真實測試驗證。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!NOTE]
> 以下欄位結構為 M11 之規劃方向（Proposed Storage），供資料模型設計參考，非 M7 立即建表指令。

### 表 1：`aqi_stations` (空品測站主檔)
*   `site_id` (VARCHAR PK - 測站代碼)
*   `site_name` (VARCHAR - 測站中文名稱)
*   `county` (VARCHAR - 所屬縣市)
*   `township` (VARCHAR - 所屬鄉鎮)
*   `latitude` (NUMERIC - 測站緯度)
*   `longitude` (NUMERIC - 測站經度)
*   `site_type` (VARCHAR - 測站類型，如一般站、交通站等)

### 表 2：`aqi_observations` (空品觀測時序表)
*   `site_id` (VARCHAR - 關聯 `aqi_stations.site_id`)
*   `observed_at` (TIMESTAMPTZ - 發布時間 UTC+8)
*   `aqi` (INTEGER - AQI 數值，若缺失為 NULL)
*   `status` (VARCHAR - 空氣品質等級描述)
*   `pm25` (NUMERIC - PM2.5 濃度 μg/m3)
*   `pm10` (NUMERIC - PM10 濃度 μg/m3)
*   `o3` (NUMERIC - 臭氧濃度 ppb)
*   `co` (NUMERIC - 一氧化碳濃度 ppm)
*   `so2` (NUMERIC - 二氧化硫濃度 ppb)
*   `no2` (NUMERIC - 二氧化氮濃度 ppb)
*   `pollutant` (VARCHAR - 主要污染物)
*   `ingested_at` (TIMESTAMPTZ - 入庫時間)
*   **約束與索引規劃**：
    *   `UNIQUE (site_id, observed_at)`
    *   索引：`(site_id, observed_at DESC)`, `(observed_at DESC)`

---

## 5. 驗收標準 (Acceptance Criteria)

1.  成功完成 MOENV API 之真實連線驗證，確認 HTTP 狀態碼與 JSON 欄位結構。
2.  金鑰安全機製生效，缺少金鑰時拋出乾淨例外，測試一律使用明顯假金鑰。
3.  空字串數值安全轉換為 SQL `NULL`，無補 0 現象。
4.  AQI 測站與觀測數據完整寫入資料庫，單元測試 100% 通過。

---

## 6. 安全與 TLS 規範 (Security Requirements)

*   API client 必須獨立驗證 MOENV TLS 憑證鏈，不得假設與 CWA 具相同環境（決策 D-009）。
*   嚴禁使用 `verify=False`。
*   歷史金鑰永久作廢，絕不引入儲存庫。

---

## 7. 測試策略 (Test Strategy)

*   單元測試：測試缺少金鑰例外拋出、空字串轉型為 NULL、負數與異常污染數值容錯。
*   Mock 整合測試：使用模擬 JSON 回應驗證資料庫寫入與複合唯一約束。

---

## 8. 風險與應對 (Risks)

*   **風險**：環境部 API 曾有排程更新延遲或 503 暫時維護狀況。
*   **應對**：實作逾時重試，失敗時保留最近成功資料（決策 D-022），不中斷整體系統運作。

---

## 9. 手動驗收清單 (Manual Verification)

*   [ ] 執行同步作業，確認 AQI 數據與測站成功寫入 PostgreSQL。
*   [ ] 檢核永和等歷史缺測站點之 PM2.5 欄位正確為 NULL，非 0。
*   [ ] 驗證測試套件絕無任何真實金鑰輸出。

---

## 10. 最終結果 (Final Result)

*(此處待 M11 實作與驗收完成後填寫)*
