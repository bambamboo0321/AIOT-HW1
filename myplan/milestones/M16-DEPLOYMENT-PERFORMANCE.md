# Milestone M16: Vercel 遷移、效能與無障礙優化 (M16-DEPLOYMENT-PERFORMANCE.md)

本文件為 M16（Vercel Migration, Performance and Accessibility）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 針對 Next.js 前端於 Vercel 進行 GitHub Preview Deployments 與 Production Deployment，完成與 Supabase PostgreSQL 之端到端整合及 RLS 權限驗證；落實 Streamlit 與 Vercel 雙端之資料與功能一致性 (Parity) 驗收；優化手機觸控操作、無障礙 (Accessibility WCAG AA)、地圖渲染效能、CDN/客戶端快取與 Stale Data 容錯；建立正式切換門檻 (Cutover Gate) 與回退方案 (Rollback Plan)，在 Vercel 通過全數驗收後才評估是否停止現有 Streamlit 網站。
*   **Dependencies**: M7～M15（資料管線、Supabase 查詢合約、Next.js 前端與同步機制皆已就緒）

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **雙軌平行遷移與 Streamlit 保留（決策 D-027, D-031, D-032）**：
    *   在 Vercel 驗收完成前，現有 Streamlit App ([https://aiot-hw1-bambamboo.streamlit.app/](https://aiot-hw1-bambamboo.streamlit.app/)) 維持公開正常營運，絕不提早關閉。
    *   **嚴禁將 `app.py` 視為可直接搬至 Vercel 的前端**，Vercel 僅部署 `web/` 的 Next.js 應用程式。
*   **Vercel 部署管道**：
    *   設定 Vercel Root Directory 為 `web`。
    *   PR 觸發 Vercel Preview Deployments 進行功能與 UI 驗收。
    *   主分支部署至 Vercel Production。
*   **Supabase 整合與 RLS 驗證（決策 D-029）**：
    *   確認 Vercel 環境僅注入 `NEXT_PUBLIC_SUPABASE_URL` 與 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
    *   驗證匿名連線受 RLS 保護，嚴禁 Service Role Key 外洩至前端。
*   **Streamlit / Vercel 功能與資料一致性 (Parity Checklist)**：
    *   [ ] 22 縣市每日高低溫極值與 12 小時區間時序完全一致。
    *   [ ] 地面測站即時觀測讀數（氣溫、相對濕度、氣壓、風速、陣風、雨量）完全一致。
    *   [ ] 空品 AQI、PM2.5、PM10 數值及最差測站篩選規則完全一致。
    *   [ ] 紫外線指數、警特報文字與有效時間完全一致。
    *   [ ] 缺值與異常值處理（安全轉換為 NULL，絕無補 0）完全一致。
    *   [ ] 同步失敗時呈現最近成功快照時間戳之行為完全一致。
*   **效能、手機與無障礙 (a11y) 驗收**：
    *   手機觸控無滑鼠環境下，Click/Tap 與鍵盤操作完整可用（決策 D-019）。
    *   Lighthouse Performance ≥ 90，Accessibility (a11y) 符合 WCAG AA。
    *   地圖 Viewport 移動載入時間小於 300ms。
*   **正式切換門檻與回滾機制 (Cutover Gate & Rollback Plan)**：
    *   制定清晰的切換清單與一旦發生線上異常時切回 Streamlit 的回退流程。

### 非目標 (Non-Goals)：
*   不實作進階選配圖層（留待 M17）。
*   在 Vercel Preview 與 Parity 驗收通過前，絕不關閉或刪除現有 Streamlit App。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   本 Milestone 為全系統端到端部署與效能驗收，使用由 Supabase PostgreSQL 提供的生產時序資料與公開 Views。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!NOTE]
> 本階段為系統部署與效能調優，不新增業務資料表，規劃在生產資料庫建立以下空間與時序索引加速查詢：

*   `CREATE INDEX IF NOT EXISTS idx_obs_station_time ON weather_observations (station_id, observed_at DESC);`
*   `CREATE INDEX IF NOT EXISTS idx_aqi_site_time ON aqi_observations (site_id, observed_at DESC);`
*   `CREATE INDEX IF NOT EXISTS idx_geo_lat_lon ON geographic_entities (latitude, longitude);`
*   `CREATE INDEX IF NOT EXISTS idx_forecast_lookup ON forecast_records (entity_code, forecast_start, forecast_end);`

---

## 5. 驗收標準 (Acceptance Criteria)

1.  Vercel Preview Deployment 與 Production Deployment 建置成功，無 TypeScript 錯誤或相容性問題。
2.  Streamlit / Vercel Parity Checklist 全數查驗通過，資料與統計計算無偏差。
3.  RLS 權限檢核通過，前端 Bundle 與網路封包絕無暴露 Service Role Key 或後端 API Key。
4.  手機觸控環境操作驗收通過，確認所有測站與詳細面板均可由 Tap 順暢喚出。
5.  Rollback 演練通過：具備可立即切換回 Streamlit 之備援措施。
6.  Vercel 正式上線並通過驗收後，由使用者評估並決定是否停止 Streamlit。

---

## 6. 安全與合規規範 (Security Requirements)

*   `NEXT_PUBLIC_*` 變數嚴格限於公開 Supabase URL 與 Anon Key。
*   生產環境嚴禁輸出除錯機敏日誌與資料庫 Traceback 連線細節。
*   嚴格符合決策 D-029 瀏覽器安全防護。

---

## 7. 測試策略 (Test Strategy)

*   Parity 回歸比對測試：自動比對 Streamlit 與 Vercel 查詢相同快照之 JSON 輸出。
*   負載與延遲測試：針對 Supabase 空間查詢執行延遲測試。
*   無障礙測試：使用 Lighthouse 與 a11y 工具檢驗色彩對比度與無障礙標籤。

---

## 8. 風險與應對 (Risks)

*   **風險**：Vercel 上線初期可能因邊界情況導致特定圖層載入異常。
*   **應對**：維持 Streamlit App 雙軌並行作為即時備援，待全面穩定後再行收斂。

---

## 9. 手動驗收清單 (Manual Verification)

*   [ ] 檢核 Vercel Preview Deployments 正常建置與預覽。
*   [ ] 逐項核對 Streamlit / Vercel Parity Checklist，確認資料無落差。
*   [ ] 使用實體手機進行瀏覽、縮放、圖層切換與 Tap 操作。
*   [ ] 檢視線上網頁原始碼與 Network Tab，確認無任何機敏金鑰暴露。
*   [ ] 驗證 Rollback 方案可行性。

---

## 10. 最終結果 (Final Result)

*(此處待 M16 實作與驗收完成後填寫)*
