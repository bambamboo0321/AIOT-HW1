# Milestone M17: 選配持久化與進階圖層 (M17-OPTIONAL-LAYERS.md)

本文件為 M17（Optional Persistence and Advanced Layers）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Optional`
*   **Objective**: 評估並視未來延伸需求引入永久雲端資料庫（如 PostgreSQL / Supabase / Neon），用以支援長期歷史資料保存、降頻取樣 (Downsampling) 與時序趨勢分析；同時評估進階氣象圖層（雷達回波、雷電落雷、即時衛星雲圖、颱風路徑）、主動通知機制與外部自動排程。**本階段純屬選配 (Optional)，僅在未來確實需要歷史資料分析時才評估實施，不影響 V2 核心產品之交付與驗收**。
*   **Dependencies**: M16（Stateless Vercel V2 核心系統已穩定運作並通過驗收）

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **選配永久雲端資料庫評估（決策 D-033, D-036）**：
    *   若未來產品目標新增「跨日/跨月歷史氣象趨勢比對」或「歷史空品惡化分析」，評估引入 PostgreSQL / Supabase / Neon 等雲端資料庫。
    *   設計歷史資料庫 Schema、時序寫入管道、資料保留週期 (Retention) 與降頻取樣 (Downsampling) 演算法。
*   **選配進階圖層整合**：
    *   CWA 即時雷達回波圖層（如 `O-A0058-001` 等網格圖磚/影像疊加）。
    *   即時落雷偵測向量圖層。
    *   即時衛星雲圖影像疊加。
    *   颱風警報、暴風圈與路徑預測動態圖層。
*   **歷史趨勢視覺化與分析**：
    *   跨快照歷史氣溫變化曲線、降雨趨勢圖與統計極值回顧。
*   **通知與自動化排程（決策 D-025）**：
    *   評估天氣災害或極端 AQI 警報通知（Web Push / LINE Notify / Email）。
    *   評估引入外部自動排程（如 GitHub Actions Cron 或外部 Webhook）進行定期資料拉取。

### 非目標 (Non-Goals)：
*   **非 V2 核心交付項目**：不阻礙 M7～M16 之無狀態架構開發與驗收。
*   **不提早引入永久資料庫**：在未獲得明確歷史分析需求前，不建立資料庫資源。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   CWA 雷達回波、衛星雲圖、落雷、颱風路徑資料集（全數標記為 Must Research / Optional）。
*   持久化資料庫連線（PostgreSQL / Supabase / Neon，標記為 Optional）。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!NOTE]
> 以下結構僅供未來若評估引入永久資料庫時之參考設計：

### 選配表 1：`historical_snapshots` (歷史時序資料庫表)
*   `id` (BIGSERIAL PK)
*   `entity_code` (VARCHAR)
*   `data_type` (VARCHAR - 'OBSERVATION' | 'AQI' | 'FORECAST')
*   `record_timestamp` (TIMESTAMPTZ)
*   `metrics` (JSONB - 氣溫、濕度、AQI 等結構化數值)
*   `created_at` (TIMESTAMPTZ)

### 選配表 2：`advanced_layers_cache` (進階圖資快取表)
*   `layer_id` (VARCHAR PK - 如 'radar', 'lightning', 'satellite', 'typhoon')
*   `data_timestamp` (TIMESTAMPTZ)
*   `image_url_or_tile` (TEXT)
*   `geojson_data` (JSONB)
*   `cached_at` (TIMESTAMPTZ)

---

## 5. 驗收標準 (Acceptance Criteria)

1.  進階圖層能以圖磚或影像疊加於地圖上，不影響基礎圖層之流暢度與響應速度。
2.  若引入永久資料庫，需具備明確之資料保留政策 (Retention) 與安全連線池，不破壞 M7～M16 之無狀態閘道行為。
3.  對現有 M1～M16 之核心功能無回歸破壞。

---

## 6. 安全與效能規範 (Security Requirements)

*   若引入外部排程或 Webhook 觸發，必須使用獨立的 Secret Token 進行驗證。
*   大圖層圖磚與靜態影像需注意 CDN 流量與快取控制。
*   資料庫密碼與連線字串嚴格隔離於伺服端，不得外洩至前端。

---

## 7. 測試策略 (Test Strategy)

*   圖層疊加單元測試與排程觸發整合測試。
*   歷史資料庫寫入與查詢效能測試（若啟用資料庫）。

---

## 8. 風險與應對 (Risks)

*   **風險**：雷達圖等大圖檔傳輸過大，影響前端頁面載入速度。
*   **應對**：採用定時預抓圖檔快取或縮圖處理，或使用外部圖磚伺服器。

---

## 9. 手動驗收清單 (Manual Verification)

*   [ ] 檢核進階圖層正常顯示於圖層選單並可切換。
*   [ ] 驗證排程作業正常執行且無日誌外洩。
*   [ ] （若啟用資料庫）驗證歷史資料時序查詢正確無遺漏。

---

## 10. 最終結果 (Final Result)

*(此處待 M17 啟動並驗收後填寫)*
