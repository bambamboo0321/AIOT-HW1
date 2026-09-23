# Milestone M16: Vercel 遷移、效能與無障礙優化 (M16-DEPLOYMENT-PERFORMANCE.md)

本文件為 M16（Vercel Migration, Performance and Accessibility）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 針對 Next.js 應用程式於 Vercel 進行 GitHub Preview Deployments 與 Production Deployment；落實 Streamlit (Legacy V1) 與 Vercel (Stateless V2) 之目前即時資料一致性 (Current-Data Parity) 驗收；優化行動端觸控操作、無障礙 (Accessibility WCAG AA)、地圖渲染效能；徹底檢驗伺服端路由安全性、API Key 零洩漏檢查、短期快取行為與外部 API 斷線容錯 (External API Outage Behavior)；建立正式切換門檻 (Cutover Gate) 與回退方案 (Rollback Plan)。**在 Vercel 通過全數驗收後，才由使用者評估並決定是否停止現有 Streamlit 網站**。
*   **Dependencies**: M7～M15（無狀態伺服端閘道、快取機制、診斷與前端地圖 UI 皆已就緒）

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **雙軌平行遷移與 Streamlit 保留（決策 D-027, D-031, D-032, D-037）**：
    *   在 Vercel 驗收完成前，現有 Streamlit App ([https://aiot-hw1-bambamboo.streamlit.app/](https://aiot-hw1-bambamboo.streamlit.app/)) 維持公開正常營運，絕不提早關閉。
    *   Vercel 僅部署 `web/` 的 Next.js 應用程式。
    *   不需將既有 SQLite 快照搬遷至 Vercel。
*   **Vercel 部署管道與環境變數注入**：
    *   設定 Vercel Root Directory 為 `web`。
    *   PR 觸發 Vercel Preview Deployments 進行功能與 UI 驗收。
    *   正式分支部署至 Vercel Production。
    *   僅在 Vercel Server-Side Environment Variables 配置 `CWA_API_KEY` 與 `MOENV_API_KEY`。
*   **伺服端路由安全與 API Key 洩漏檢查（決策 D-034）**：
    *   檢查前端 JS Bundle、Source Map、DOM 與 Network Request，確認絕無任何政府 API Key。
    *   確認無任何 `NEXT_PUBLIC_` 涉及機敏憑證。
    *   確認 `/api/...` 端點不透傳官方錯誤細節與授權標頭。
*   **快取行為驗證 (Caching Behavior)（決策 D-035, D-040, D-041）**：
    *   驗證伺服端短期快取於候選/選定 TTL 內正常命中（Hit）。
    *   驗證 TTL 到期後自動向官方重新抓取（Miss / Revalidate）。
    *   驗證部署重啟後能安全冷開機並自動回源，不依賴 Function process 記憶體跨部署保留。
*   **外部 API 斷線容錯行為 (Outage Behavior)（決策 D-022, D-038, D-040）**：
    *   模擬 CWA / MOENV 官方 API 斷線、逾時或 500 錯誤。
    *   若有合法存續之過期快取且機制支援，驗證標記 `freshness: "stale"` 並呈現原始時間戳；不得承諾過期項目必可讀取。
    *   若無可用快取，驗證 UI 清楚呈現 `unavailable` 狀態與重試按鈕，**絕不偽造資料、假時間或以 0 代替缺值**。
*   **Streamlit / Vercel 即時資料一致性 (Current-Data Parity)**：
    *   [ ] 22 縣市今日高低溫極值與未來預報趨勢一致。
    *   [ ] 地面測站即時觀測讀數（氣溫、濕度、氣壓、風速、陣風、雨量）一致。
    *   [ ] 空品 AQI、PM2.5、PM10 數值及最差測站篩選一致。
    *   [ ] 缺值與異常值處理（安全轉換為 null，絕無補 0）完全一致。
*   **效能、手機與無障礙 (a11y) 驗收**：
    *   手機觸控無滑鼠環境下，Click/Tap 與鍵盤操作完整可用（決策 D-019）。
    *   Lighthouse Performance ≥ 90，Accessibility (a11y) 符合 WCAG AA。
*   **正式切換門檻與回滾機制 (Cutover Gate & Rollback Plan)**：
    *   M16 全數驗收通過後，由使用者決定是否關閉 Streamlit；若 Vercel 出現不可預期故障，立即切回 Streamlit。

### 非目標 (Non-Goals)：
*   **不連接任何永久雲端資料庫**：不使用 PostgreSQL 或 Supabase（決策 D-033）。
*   **不遷移歷史資料庫**：SQLite 留在 Legacy V1（決策 D-005, D-037）。
*   **在使用者明確授權前，絕不關閉或刪除現有 Streamlit App**。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   本 Milestone 為全系統端到端部署與效能驗收，資料源為 Next.js Server Route Handlers 代理之 CWA 與 MOENV 官方端點。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!IMPORTANT]
> 本架構為 Stateless V2，無任何永久資料庫儲存。

---

## 5. 驗收標準 (Acceptance Criteria)

1.  Vercel Preview Deployment 與 Production Deployment 建置成功，無 TypeScript 錯誤或相容性問題。
2.  Streamlit / Vercel Current-Data Parity 查驗通過，即時觀測與預報資料無偏差。
3.  安全檢驗通過：前端 Bundle、Source Map 與 Network Request 100% 無官方 API Key。
4.  快取機制驗證通過：候選/選定 TTL 內命中快取、到期自動更新、冷重啟正常回源。
5.  外部 API 斷線情境驗證通過：清楚標記 `unavailable`，絕不顯示假資料或補 0。
6.  手機觸控與無障礙驗收通過，無滑鼠環境完整可用。
7.  Rollback 方案可行性確認。
8.  經使用者評估並授權後，才執行切換決策。

---

## 6. 安全與合規規範 (Security Requirements)

*   金鑰僅留存在 Vercel Server-Side Environment Variables。
*   生產環境嚴禁輸出除錯機敏日誌與連線細節。
*   嚴格符合決策 D-034 與 D-038。

---

## 7. 測試策略 (Test Strategy)

*   Parity 回歸比對：比對 Streamlit 與 Vercel 對同一時段官方資料之呈現一致性。
*   斷線與異常測試：透過 Mock 或代理中斷上游網路，檢核前端 `unavailable` 容錯狀態。
*   金鑰洩漏掃描：使用自動化腳本掃描生產構建產物之字串。
*   無障礙測試：使用 Lighthouse 檢驗色彩對比度與 a11y 標籤。

---

## 8. 風險與應對 (Risks)

*   **風險**：Vercel 正式上線初期因未預期之流量造成政府 API 限流。
*   **應對**：適度微調短期快取 TTL（依官方更新頻率與 freshness 需求調整），並維持 Streamlit App 雙軌並行作為即時備援。

---

## 9. 手動驗收清單 (Manual Verification)

*   [ ] 檢核 Vercel Preview Deployments 正常建置與預覽。
*   [ ] 逐項核對 Streamlit / Vercel 即時資料一致性清單。
*   [ ] 使用實體手機進行瀏覽、縮放、圖層切換與 Tap 操作。
*   [ ] 檢視線上網頁原始碼與 Network Tab，確認無任何金鑰暴露。
*   [ ] 模擬上游 API 斷線，確認前端安全顯示 `unavailable`。
*   [ ] 驗證 Rollback 方案可行性。

---

## 10. 最終結果 (Final Result)

*(此處待 M16 實作與驗收完成後填寫)*
