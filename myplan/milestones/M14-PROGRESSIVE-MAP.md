# Milestone M14: Next.js 漸進式多圖層地圖 UI (M14-PROGRESSIVE-MAP.md)

本文件為 M14（Next.js Progressive Multi-Layer Map UI）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 在 `web/` 目錄建立基於 Next.js 與 TypeScript 之現代化漸進式多圖層地圖應用程式，地圖支援全臺、縣市、鄉鎮三層級漸進揭露與 Viewport / Zoom 按需載入；建立 Hover 輔助與 Click/Tap/鍵盤常駐詳細面板機制，確保行動端無 Hover 裝置完整可用；實作多資料圖層、手機響應式 UI 以及 loading / empty / stale / error 等各狀態防護。
*   **Dependencies**: M13 (Supabase Query Contract and Aggregation)

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **應用程式架構與技術棧（決策 D-026, D-028）**：
    *   Proposed path：`web/`
    *   Proposed stack：Next.js、TypeScript、CSS Modules / TailwindCSS。
    *   **地圖函式庫評估**：地圖函式庫（如 MapLibre GL JS、React Leaflet、OpenLayers 等）最終選擇**延後至 M14 Research 實測效能與載入體驗後決定，現階段不預先宣稱任何地圖庫已確定**。
*   **漸進式揭露地圖（決策 D-018, D-020）**：
    *   預設全臺視角展示 22 縣市統計標記。
    *   選取縣市或放大 Viewport 後，按需載入該範圍之鄉鎮與測站。
*   **跨裝置核心互動（決策 D-019）**：
    *   Hover 僅作為桌面滑鼠之簡短 Tooltip 輔助。
    *   **Click / Tap / Keyboard 叫出固定詳細面板 (Pinned Detail Panel)**，展示趨勢折線圖、測站清單、詳細污染物與紫外線指標。
    *   支援手機觸控與無障礙鍵盤導航，核心功能完全不依賴 Hover。
*   **多資料圖層切換**：
    *   氣溫、雨量、平均風速、風向、相對濕度、AQI、PM2.5、紫外線指數、測站位置。
*   **狀態完整性處理**：
    *   Loading state（骨架屏 Skeleton / 載入指示）。
    *   Empty state（查無測站或無資料時友善提示）。
    *   Stale state（後端未即時更新時提示資料時間戳，決策 D-022）。
    *   Error state（網路或資料庫異常時之安全錯誤訊息與重試按鈕）。

### 非目標 (Non-Goals)：
*   不在此階段整合雷達回波或衛星雲圖等選配進階圖層（留待 M17）。
*   公開訪客絕不在此介面觸發外部 API 抓取（依決策 D-017）。
*   不預先鎖定特定地圖底圖函式庫。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   本 Milestone 為純前端呈現層，資料源全數取自 M13 所定義之 Supabase 公開 Views 與 RPC 合約。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!NOTE]
> 本階段為 Next.js 前端介面，不新增後端資料表。前端狀態由 React Context / Zustand / URL Query Params 管理：

*   `URL Query Params` (`?county=...&layer=...&zoom=...`)：維持地圖視角可分享性與瀏覽器歷史紀錄 (Back/Forward)。
*   `active_layer`：當前啟用之觀測圖層 (如 'temperature', 'aqi', 'rain' 等)。
*   `viewport_bounds`：當前可視範圍經緯度 Bounding Box。
*   `selected_feature`：當前選取之行政區或固定檢視之測站 ID (Pinned Detail Panel)。
*   `client_cache`：前端 React Query / SWR 快取，避免重複請求相同 Viewport 資料。

---

## 5. 驗收標準 (Acceptance Criteria)

1.  在 `web/` 目錄成功建置 Next.js + TypeScript App，無 build error 或 lint error。
2.  全臺視角至縣市/鄉鎮縮放平滑切換，無顯著畫面卡頓或大量 DOM 節點崩潰。
3.  在無 Hover 之行動設備（或瀏覽器觸控模擬）上，所有點擊 (Tap) 操作皆可順利喚出詳細面板並獲取完整資訊。
4.  多資料圖層切換色階與圖例正確無誤。
5.  Loading、Empty、Stale 與 Error 狀態介面齊全且體驗平順。

---

## 6. 安全與效能規範 (Security Requirements)

*   僅使用 `NEXT_PUBLIC_SUPABASE_URL` 與 `NEXT_PUBLIC_SUPABASE_ANON_KEY`，絕不在前端 bundle 中洩露任何 Service Role Key 或後端金鑰（決策 D-029）。
*   Popup 與詳細面板之 HTML / Markdown 格式化必須進行安全轉義防範 XSS。
*   按需載入資料，避免前端單次保留過多未使用的 GeoJSON 或測站特徵。

---

## 7. 測試策略 (Test Strategy)

*   單元測試：測試地圖色階計算、狀態轉換與安全轉義。
*   元件測試：使用 Jest / React Testing Library 驗證詳細面板點擊切換與圖層選單。
*   跨裝置與無障礙驗收：於桌面瀏覽器、手機螢幕模擬器進行功能驗收。

---

## 8. 風險與應對 (Risks)

*   **風險**：特定向量地圖函式庫 bundle 體積過大或在行動裝置耗電。
*   **應對**：於 M14 開發初期實測對比 MapLibre 與 React Leaflet 之效能、體積與行動端觸控相容性後再行選定。

---

## 9. 手動驗收清單 (Manual Verification)

*   [ ] 檢核全臺宏觀視角顯示縣市摘要。
*   [ ] 點擊任一縣市，確認地圖放大並載入該縣市鄉鎮及測站。
*   [ ] 點擊測站標記，確認常駐詳細面板正確彈出並顯示數值與圖表。
*   [ ] 模擬手機觸控環境，確認無 Hover 亦能完成全部操作。
*   [ ] 檢核 Loading、Stale 與 Error 狀態之視覺提示。

---

## 10. 最終結果 (Final Result)

*(此處待 M14 實作與驗收完成後填寫)*
