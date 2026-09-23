# Milestone M14: 漸進式多圖層地圖 UI (M14-PROGRESSIVE-MAP.md)

本文件為 M14（Progressive Multi-Layer Map UI）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 在 M7 已建立的 `web/` Next.js + TypeScript 專案基礎上，建立完整使用者介面與現代化漸進式多圖層地圖應用程式，地圖支援全臺、縣市、鄉鎮三層級漸進揭露與 Viewport / Zoom 按需載入；建立 Hover 輔助與 Click / Tap / keyboard 核心操作及常駐詳細面板機制，確保行動端無 Hover 裝置完整可用；實作多資料圖層、手機響應式 UI、視覺設計與 accessibility，以及 loading / empty / stale / unavailable / error 等各狀態防護。**所有資料源皆由內部 Next.js Server Route Handlers 提供，前端不持有任何資料庫或外部 API 金鑰（決策 D-018, D-019, D-026, D-039）**。
*   **Dependencies**: M7（已建立 `web/` 專案骨架與 Server Gateway）、M8～M13（已建立統一 API 合約與資料代理端點）

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **在 M7 已建立的 `web/` 專案上建立完整使用者介面（決策 D-026, D-039）**：
    *   在 M7 既有之 `web/` Next.js 專案內建構完整產品級前端 UI。
    *   **地圖函式庫評估**：地圖函式庫（如 MapLibre GL JS、React Leaflet、OpenLayers 等）最終選擇延後至 M14 Research 實測效能與載入體驗後決定，現階段不預先宣稱任何地圖庫已確定。
*   **漸進式揭露地圖 (Progressive Disclosure)（決策 D-018, D-020）**：
    *   預設全臺視角展示 22 縣市統計標記。
    *   選取縣市或放大 Viewport 後，按需呼叫內部端點載入該範圍之鄉鎮與測站。
*   **跨裝置核心互動（決策 D-019）**：
    *   Hover 僅作為桌面滑鼠之簡短 Tooltip 輔助。
    *   **Click / Tap / Keyboard 叫出固定詳細面板 (Pinned Detail Panel)**，展示趨勢預報折線圖、測站清單、詳細污染物與紫外線指標。
    *   支援手機觸控與無障礙鍵盤導航，核心功能完全不依賴 Hover。
*   **多資料圖層切換**：
    *   氣溫、雨量、平均風速、相對濕度、AQI、PM2.5、紫外線指數、測站位置。
*   **響應式 UI、視覺設計與 Accessibility**：
    *   手機、平板與桌面跨尺寸流暢自適應佈局。
    *   符合 WCAG 對比度規範與清晰圖例色階。
*   **狀態完整性處理（決策 D-022, D-035, D-038, D-040）**：
    *   Loading state（骨架屏 Skeleton / 載入指示）。
    *   Empty state（查無測站或無資料時友善提示）。
    *   Stale state（上游未即時更新或快取保留時，清楚標記官方資料時間戳與 stale 狀態）。
    *   Unavailable state（官方 API 失敗且無快取時，顯示服務暫時無法取得與重試按鈕，絕不顯示假資料或補 0）。
    *   Error state（網路或客戶端異常之安全錯誤提示）。

### 非目標 (Non-Goals)：
*   **不在此階段初次建立 Next.js 專案**：`web/` 專案基礎已由 M7 建立，M14 專注於前端 UI 實作（決策 D-039）。
*   **不連接任何外部資料庫**：前端與後端皆不直連 PostgreSQL 或 Supabase。
*   **不持有任何外部金鑰**：前端 bundle 零金鑰，無 `NEXT_PUBLIC_*_KEY`。
*   **不在此階段整合雷達回波或衛星雲圖等選配進階圖層**：留待 M17 評估。
*   **不預先鎖定特定地圖底圖函式庫**。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   本 Milestone 為純前端呈現層，資料源全數取自 M7～M13 定義之內部 Next.js Server Route Handlers（`/api/overview`, `/api/forecast`, `/api/observations`, `/api/air-quality`, `/api/uv`, `/api/alerts`）。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!NOTE]
> 本階段為 Next.js 前端介面，無後端資料表。前端狀態由 React Context / Zustand / URL Query Params 管理：

*   `URL Query Params` (`?county=...&layer=...&zoom=...`)：維持地圖視角可分享性與瀏覽器歷史紀錄 (Back/Forward)。
*   `active_layer`：當前啟用之觀測圖層 (如 'temperature', 'aqi', 'rain' 等)。
*   `viewport_bounds`：當前可視範圍經緯度 Bounding Box。
*   `selected_feature`：當前選取之行政區或固定檢視之測站 ID (Pinned Detail Panel)。
*   `client_cache`：前端 React Query / SWR 客戶端快取，避免重複請求相同 Viewport 資料。

---

## 5. 驗收標準 (Acceptance Criteria)

1.  在 M7 已建立的 `web/` 基礎上成功建置完整地圖 UI，`npm run build` 與 `npm run lint` 通過無錯誤。
2.  全臺視角至縣市/鄉鎮縮放平滑切換，無顯著畫面卡頓或大量 DOM 節點崩潰。
3.  在無 Hover 之行動設備（或瀏覽器觸控模擬）上，所有點擊 (Tap) 操作皆可順利喚出詳細面板並獲取完整資訊。
4.  多資料圖層切換色階與圖例正確無誤。
5.  Loading、Empty、Stale、Unavailable 與 Error 狀態介面齊全，且確實呈現官方資料時間戳。
6.  前端 Bundle 經掃描無任何金鑰洩漏。

---

## 6. 安全與效能規範 (Security Requirements)

*   前端完全不接觸任何金鑰，不設定任何 `NEXT_PUBLIC_` 官方 API Key。
*   Popup 與詳細面板之 HTML / 文本格式化必須進行安全轉義防範 XSS。
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
*   [ ] 檢核 Loading、Stale、Unavailable 與 Error 狀態之視覺提示與時間戳。

---

## 10. 最終結果 (Final Result)

*(此處待 M14 實作與驗收完成後填寫)*
