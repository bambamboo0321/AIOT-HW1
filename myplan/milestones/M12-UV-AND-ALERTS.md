# Milestone M12: 紫外線與氣象警特報 (M12-UV-AND-ALERTS.md)

本文件為 M12（UV and Weather Alerts）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 實測驗證 CWA 官方紫外線資料集與資料語意（候選 `O-A0005-001` 等），並整合適合之 CWA 天氣災害警特報（候選 `W-C0033-001` 等），建立資料持久化並標定準確之業務與 UI 語意。
*   **Dependencies**: M7 (Cloud Data Foundation), M8 (Geographic Registry & CWA Dataset Discovery)

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **紫外線資料集研究與驗證（決策 D-015）**：
    *   透過官方文件與真實 API response 驗證：Dataset 是否仍有效、資料代表目前值/預報值或當日最大值、發布時間與更新頻率、測站涵蓋範圍與真實 JSON 欄位結構。
    *   UI 標籤依驗證結果決定（「目前 UV」、「UV 預報」或「今日最大 UV」），不預先固定。
*   **紫外線資料持久化**：建立 `uv_stations` 與 `uv_observations` 資料表。
*   **氣象警特報整合**：探勘並解析官方警特報資料集，擷取各縣市大雨、豪雨、陸上強風、低溫特報等有效預警。

### 非目標 (Non-Goals)：
*   不預先宣稱紫外線資料集已固定或已驗證完成（嚴格於本 Milestone 進行實測確認）。
*   不實作推播通知或簡訊發送（保持 Web 視覺化呈現）。
*   不在此階段完成地圖警示圖層視覺化（由 M14 負責）。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   CWA 紫外線候選資料集（如 `O-A0005-001` 等）：Candidate，待 M12 驗證。
*   CWA 警特報資料集（如 `W-C0033-001` 等）：Must Research。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!NOTE]
> 以下欄位結構為 M12 之規劃方向（Proposed Storage），供資料模型設計參考，非 M7 立即建表指令。

### 表 1：`uv_observations` (紫外線觀測時序表)
*   `station_id` (VARCHAR)
*   `observed_at` (TIMESTAMPTZ - 觀測或發布時間)
*   `uv_index` (NUMERIC - 紫外線指數，無效值為 NULL)
*   `uv_level` (VARCHAR - 低量 0-2 / 中量 3-5 / 高量 6-7 / 過量 8-10 / 危險 11+)
*   `data_semantic` (VARCHAR - 依實測驗證標記為 'CURRENT', 'DAILY_MAX' 或 'FORECAST')
*   `ingested_at` (TIMESTAMPTZ)
*   **約束**：`UNIQUE (station_id, observed_at, data_semantic)`

### 表 2：`weather_alerts` (氣象警特報即時狀態表)
*   `alert_id` (VARCHAR PK - 警報唯一代碼)
*   `event_name` (VARCHAR - 警特報類型，如豪雨、大雨、強風、低溫)
*   `severity` (VARCHAR - 嚴重等級)
*   `effective_from` (TIMESTAMPTZ - 生效起始時間)
*   `effective_to` (TIMESTAMPTZ - 生效截止時間)
*   `affected_county` (VARCHAR - 受影響縣市)
*   `headline` (TEXT - 警報標題與簡述)
*   `is_active` (BOOLEAN - 當前是否生效中)
*   `updated_at` (TIMESTAMPTZ)

---

## 5. 驗收標準 (Acceptance Criteria)

1.  完成紫外線資料源實測報告，確認官方 Dataset ID、資料語意與欄位結構。
2.  紫外線指數與 risk_level（低量、中量、高量、過量、危險）正確計算，無效值寫入 SQL `NULL`。
3.  警特報資料集能正確解析出各縣市生效中之警報項目與有效時間。
4.  解析與寫入測試 100% 通過。

---

## 6. 安全與 TLS 規範 (Security Requirements)

*   API client 必須獨立執行 TLS 憑證與連線測試，嚴禁關閉 SSL 驗證（決策 D-009）。
*   金鑰讀取遵循統一規範，禁止寫入原始碼。

---

## 7. 測試策略 (Test Strategy)

*   單元測試：測試紫外線等級分類演算法、警特報文字與起訖時間解析。
*   整合測試：模擬真實 API 回應，驗證入庫與時間戳處理。

---

## 8. 風險與應對 (Risks)

*   **風險**：紫外線候選資料集可能缺乏測站經緯度或中文名稱。
*   **應對**：利用 M8/M10 建立的測站主檔庫，透過 StationID 自動關聯補齊座標與縣市歸屬。

---

## 9. 手動驗收清單 (Manual Verification)

*   [ ] 檢核紫外線資料集實測報告，確認端點與資料語意。
*   [ ] 執行同步作業，確認紫外線與警特報數據正確寫入 PostgreSQL。
*   [ ] 驗證警特報時間過期時能正確更新狀態。

---

## 10. 最終結果 (Final Result)

*(此處待 M12 實作與驗收完成後填寫)*
