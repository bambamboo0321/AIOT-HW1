# Milestone M8: 行政區地理登記簿與 CWA 資料集探勘 (M8-GEOGRAPHIC-DISCOVERY.md)

本文件為 M8（Geographic Registry & CWA Dataset Discovery）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 建立全臺 22 縣市與 368 鄉鎮階層之官方行政區地理登記簿，並驗證 `F-D0047-091` 完整 JSON、鄉鎮級資料集端點、geocode、坐標、行政區界線及預報因子，為後續預報擷取與漸進式地圖奠定標準化地理基礎。
*   **Dependencies**: M7 (Cloud Data Foundation)

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   驗證 `F-D0047-091` 完整 JSON 結構（確認包含之預報因子：溫度、體感、濕度、降雨機率、風速風向、天氣現象等）。
*   探勘 CWA 鄉鎮級預報資料集代碼（如 `F-D0047-093` 或各縣市個別代碼），記錄端點有效性、更新頻率與資料結構。
*   建立全臺 22 縣市與 368 鄉鎮階層資料模型（`geographic_entities`），包含標準代碼、名稱、WGS84 代表坐標與四分區映射（本島 19 縣市映射四區，澎湖、金門、連江 3 離島個別呈現、無地區分組，決策 D-011, D-012）。

### 非目標 (Non-Goals)：
*   不在此階段執行持續性大量時序預報資料的常態寫入（由 M9 負責）。
*   不在此階段整合即時測站或空品測站（由 M10、M11 負責）。
*   不實作前端地圖視覺化（由 M14 負責）。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   `F-D0047-091`：Verified for current county workflow；完整鄉鎮結構仍須於本 Milestone 深入驗證。
*   CWA 鄉鎮預報候選資料集（如 `F-D0047-093` 等）：待本 Milestone 實測探勘。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!NOTE]
> 以下欄位結構為 M8 之規劃方向（Proposed Storage），供資料模型設計參考，非 M7 立即建表指令。

### 表：`geographic_entities` (行政區地理主檔)
*   `entity_code` (VARCHAR, PK - 行政區代碼)
*   `entity_name` (VARCHAR - 縣市/鄉鎮中文名稱)
*   `entity_level` (VARCHAR - 'COUNTY' 或 'TOWNSHIP')
*   `parent_code` (VARCHAR - 所屬縣市代碼，縣市層級為 NULL)
*   `region_group` (VARCHAR - '北部', '中部', '南部', '東部'；澎湖金門連江為 NULL)
*   `latitude` (NUMERIC - 代表點緯度 WGS84)
*   `longitude` (NUMERIC - 代表點經度 WGS84)
*   `boundary_geojson` (JSONB / TEXT - 邊界坐標序列，選配)
*   `is_island` (BOOLEAN - 是否為離島縣市)

---

## 5. 驗收標準 (Acceptance Criteria)

1.  全臺 22 縣市與 368 鄉鎮階層均有唯一代碼、名稱與正確 WGS84 座標，無重複遺漏。
2.  四分區映射正確無誤（北部 7、中部 5、南部 5、東部 2），離島 3 縣市正確回傳 `None` 且不自選單遺失。
3.  產出 CWA 預報資料集完整欄位對照清冊，明確標記各預報因子的真實 JSON 路徑。
4.  行政區模型查詢單元測試 100% 通過。

---

## 6. 安全與 TLS 規範 (Security Requirements)

*   API 呼叫嚴格保持 TLS 驗證，禁止使用 `verify=False`（決策 D-009）。
*   金鑰讀取遵循優先序，測試一律使用假金鑰。

---

## 7. 測試策略 (Test Strategy)

*   單元測試：參數化測試全臺 22 縣市與 368 鄉鎮的行政區代碼對齊、分區映射正確性。
*   Mock 整合測試：使用離線 JSON Fixture 驗證資料集探勘解析邏輯。

---

## 8. 風險與應對 (Risks)

*   **風險**：鄉鎮預報資料量極大，全臺單一端點可能面臨回應過慢或傳輸逾時。
*   **應對**：評估全臺綜合端點與各縣市個別端點之穩定度，選擇最適擷取架構。

---

## 9. 手動驗收清單 (Manual Verification)

*   [ ] 檢核 22 縣市與 368 鄉鎮清冊無缺失。
*   [ ] 驗證四分區與離島獨立規則完全符合決策 D-011、D-012。
*   [ ] 檢視產出之 CWA 預報因子清冊無誤。

---

## 10. 最終結果 (Final Result)

*(此處待 M8 實作與驗收完成後填寫)*
