# Milestone M17: 選配進階圖層與自動化排程 (M17-OPTIONAL-LAYERS.md)

本文件為 M17（Optional Advanced Layers）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Optional`
*   **Objective**: 評估並視需求實作進階氣象圖層（雷達回波、雷電落雷、即時衛星雲圖、颱風路徑）、歷史趨勢分析、警報主動通知機制，以及評估引入外部自動定時排程同步作業。
*   **Dependencies**: M16（核心系統已於雲端穩定運作）

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **進階圖層整合**：
    *   CWA 即時雷達回波圖層（如 `O-A0058-001` 等網格圖層）。
    *   即時落雷偵測圖層。
    *   衛星雲圖影像疊加。
    *   颱風警報與路徑預測圖層。
*   **歷史趨勢視覺化**：跨快照歷史氣溫變化曲線與長條統計。
*   **自動化排程同步（決策 D-025）**：評估使用 GitHub Actions Cron 或外部排程 Webhook 週期性觸發後端同步。

### 非目標 (Non-Goals)：
*   非 V2 核心必做功能，不阻礙專案核心驗收。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   CWA 雷達回波、衛星雲圖、落雷資料集（全數標記為 Must Research / Optional）。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!NOTE]
> 以下結構為 M17 選配進階圖資與排程快取之規劃方向（Proposed Storage）：

### 表：`advanced_layer_cache` (進階圖資快取表)
*   `layer_id` (VARCHAR PK - 如 'radar', 'lightning', 'satellite', 'typhoon')
*   `data_timestamp` (TIMESTAMPTZ - 官方發布時間)
*   `image_url_or_tile` (TEXT - 圖磚或靜態影像 URL)
*   `layer_geojson` (JSONB - 向量路徑或警示區塊，選配)
*   `cached_at` (TIMESTAMPTZ - 快取時間戳)

---

## 5. 驗收標準 (Acceptance Criteria)

1.  進階圖層能以 WMS 或圖磚疊加於 Folium 地圖上，不影響基礎圖層操作。
2.  若實作排程同步，需確保與管理員手動同步互斥防重入。
3.  對現有 M1～M16 之核心功能無回歸破壞。

---

## 6. 安全與效能規範 (Security Requirements)

*   若開放 Webhook 排程觸發，必須使用獨立的 Secret Token 進行驗證。
*   大圖層圖磚需注意頻寬與快取控制。

---

## 7. 測試策略 (Test Strategy)

*   圖層疊加單元測試與排程觸發整合測試。

---

## 8. 風險與應對 (Risks)

*   **風險**：雷達圖等大圖檔傳輸過大，影響前端頁面載入速度。
*   **應對**：採用定時預抓圖檔快取或縮圖處理。

---

## 9. 手動驗收清單 (Manual Verification)

*   [ ] 檢核進階圖層正常顯示於圖層選單並可切換。
*   [ ] 驗證排程作業正常執行且無日誌外洩。

---

## 10. 最終結果 (Final Result)

*(此處待 M17 啟動並驗收後填寫)*
