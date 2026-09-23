# Milestone M9: 縣市與鄉鎮完整預報資料擷取 (M9-FORECAST-INGESTION.md)

本文件為 M9（Complete County and Township Forecast Ingestion）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 建立全量預報資料擷取與寫入管道，涵蓋縣市及鄉鎮雙層級預報（逐時、逐 3 小時、逐 12 小時與逐日資料），完整解析溫度、體感溫度、濕度、降雨機率、風與天氣現象，寫入 Supabase PostgreSQL 保存時序快照。
*   **Dependencies**: M7 (Cloud Data Foundation), M8 (Geographic Registry & CWA Dataset Discovery)

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   實作縣市及鄉鎮預報解析器，支援多種時段顆粒度（逐時/逐 3 小時/逐 12 小時/逐日）與多維度預報因子。
*   建立預報時序表與快照管理機制。
*   每次同步建立獨立 `sync_run_id` 與 `fetched_at` 快照，建立複合唯一約束防範重複寫入。
*   空值與無效數據正規化為 SQL `NULL`，嚴格禁止補 `0`。

### 非目標 (Non-Goals)：
*   不在此階段處理即時氣象觀測（由 M10 負責）或空氣品質（由 M11 負責）。
*   不開放公開訪客在前端直接發動擷取（依決策 D-017）。
*   不更動即時地圖呈現層（由 M14 負責）。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   `F-D0047-091`（縣市級預報）：Verified。
*   CWA 鄉鎮級預報資料集（依 M8 探勘結果確認之具體端點）：Candidate。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!NOTE]
> 以下欄位結構為 M9 之規劃方向（Proposed Storage），供資料模型設計參考，非 M7 立即建表指令。

### 表：`forecast_records` (縣市與鄉鎮預報時序表)
*   `id` (BIGSERIAL PK)
*   `entity_code` (VARCHAR - 關聯至 `geographic_entities.entity_code`)
*   `dataset_id` (VARCHAR - 如 'F-D0047-091' 等)
*   `forecast_start` (TIMESTAMPTZ - UTC+8)
*   `forecast_end` (TIMESTAMPTZ - UTC+8)
*   `granularity` (VARCHAR - '1_HOUR', '3_HOUR', '12_HOUR', 'DAILY')
*   `temperature` (NUMERIC - 氣溫攝氏度)
*   `apparent_temperature` (NUMERIC - 體感溫度攝氏度)
*   `relative_humidity` (NUMERIC - 相對濕度百分比)
*   `pop_percentage` (NUMERIC - 降雨機率百分比)
*   `wind_speed` (NUMERIC - 風速公尺/秒)
*   `wind_direction` (VARCHAR - 風向描述或度數)
*   `weather_description` (VARCHAR - 天氣現象描述)
*   `weather_code` (VARCHAR - 天氣現象代碼)
*   `fetched_at` (TIMESTAMPTZ - 快照抓取時間戳)
*   `sync_run_id` (UUID - 關聯至同步批次)
*   **約束與索引規劃**：
    *   `UNIQUE (dataset_id, entity_code, forecast_start, forecast_end, granularity, fetched_at)`
    *   索引：`(entity_code, forecast_start, forecast_end)`, `(fetched_at DESC)`

---

## 5. 驗收標準 (Acceptance Criteria)

1.  成功解析並寫入縣市與鄉鎮多時段預報，包含體感、降雨機率等所有必要因子。
2.  所有時間戳精確正規化為 UTC+8 時區感知物件。
3.  重複寫入相同快照時自動忽略 (`ON CONFLICT DO NOTHING`)，回傳精確之寫入與重複統計。
4.  解析與寫入測試 100% 通過。

---

## 6. 安全與 TLS 規範 (Security Requirements)

*   API client 必須通過 TLS 憑證驗證，嚴格禁止關閉 SSL 驗證（決策 D-009）。
*   測試嚴格使用假金鑰與 Mock 伺服器，嚴禁真實連線或敏感資料洩漏。

---

## 7. 測試策略 (Test Strategy)

*   單元測試：測試各預報因子的數值轉型、異常結構容錯、空值轉 NULL。
*   整合測試：模擬批次寫入 PostgreSQL，驗證快照隔離與交易回滾。

---

## 8. 風險與應對 (Risks)

*   **風險**：鄉鎮多預報因子資料量龐大，批次寫入過慢可能導致連線逾時。
*   **應對**：採用高效率批次插入（Batch Insert / PostgreSQL `unnest`）並控制單一交易筆數。

---

## 9. 手動驗收清單 (Manual Verification)

*   [ ] 執行同步作業，驗證 PostgreSQL 中縣市與鄉鎮預報時序資料完整。
*   [ ] 檢查體感溫度、降雨機率等因子正確寫入。
*   [ ] 驗證快照重複寫入不產生髒資料。

---

## 10. 最終結果 (Final Result)

*(此處待 M9 實作與驗收完成後填寫)*
