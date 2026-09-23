# Milestone M8: 行政區地理登記簿與 CWA 資料集探勘 (M8-GEOGRAPHIC-DISCOVERY.md)

本文件為 M8（Geographic Registry & CWA Dataset Discovery）之規格骨架。

---

## 1. 狀態與基本資訊

*   **Status**: `Planned`
*   **Objective**: 建立全臺 22 縣市與 368 鄉鎮階層之官方行政區地理登記簿，並驗證 `F-D0047-091` 完整 JSON 結構、鄉鎮級資料集端點、geocode、坐標、行政區界線及預報因子時間解析。**地理登記簿採用版本控制之靜態檔案儲存，不建立資料庫表，亦不保存 API 歷史資料**。
*   **Dependencies**: M7 (Vercel Server Data Gateway Foundation)

---

## 2. 範疇與非目標 (Scope & Non-Goals)

### 範圍 (Scope)：
*   **CWA 預報資料集深入驗證**：
    *   驗證 `F-D0047-091` 完整 JSON 結構（確認包含之預報因子：溫度、體感、濕度、降雨機率、風速風向、天氣現象等）。
    *   探勘 CWA 鄉鎮級預報端點（如各縣市專屬代碼或綜合端點），釐清時間解析（逐 3 小時、逐 12 小時等）與資料更新頻率。
*   **靜態行政區地理登記簿（決策 D-011, D-012, D-033）**：
    *   建立全臺 22 縣市與 368 鄉鎮階層資料模型，採用版本控制的靜態檔案（如 JSON / TypeScript 模組）提供給伺服端與前端使用。
    *   包含標準代碼、中文名稱、WGS84 代表坐標、行政區邊界 GeoJSON（依需求精簡）與四分區映射（本島 19 縣市映射四區，澎湖、金門、連江 3 離島個別呈現、無分區映射）。
*   **預報因子與時間解析規格化**：
    *   建立預報因子字典與欄位路徑對照清冊，定義時間格式標準化轉換規範 (UTC+8)。

### 非目標 (Non-Goals)：
*   **不寫入資料庫**：不建立關聯式資料庫表或保存時序快照（決策 D-033, D-036）。
*   **不保存 API 歷史資料**：本 Milestone 專注於地理基準與官方 API 結構釐清，不收集歷史檔案。
*   **不實作即時觀測或空品串接**：留待 M10、M11 進行。
*   **不實作地圖互動渲染**：留待 M14 處理。

---

## 3. 候選資料來源 (Proposed Data Sources)

*   `F-D0047-091`（臺灣各縣市未來 1 週天氣預報）：Verified。
*   CWA 鄉鎮級預報候選資料集（如各縣市鄉鎮天氣預報端點）：Candidate，待本階段實測。
*   臺灣行政區圖資與邊界（內政部 / 政府開放資料平臺經簡化之 TopoJSON/GeoJSON）：靜態資產。

---

## 4. 規劃儲存結構 (Proposed Storage)

> [!NOTE]
> 本架構依據 Stateless Vercel V2 原則，地理靜態資料直接納入專案版本控制，無需透過資料庫動態查詢。

### 靜態檔案：`web/src/data/geographic-registry.json` (或 TS 模組)
*   `entityCode` (string - 行政區代碼 / 郵遞區號)
*   `entityName` (string - 縣市/鄉鎮中文名稱)
*   `entityLevel` ("COUNTY" | "TOWNSHIP")
*   `parentCode` (string | null - 所屬縣市代碼，縣市為 null)
*   `regionGroup` ("北部" | "中部" | "南部" | "東部" | null - 離島為 null)
*   `latitude` (number - WGS84 緯度)
*   `longitude` (number - WGS84 經度)
*   `isIsland` (boolean - 是否為離島)
*   `boundary` (GeoJSON Feature / Polygon - 經簡化之向量邊界，選配)

---

## 5. 驗收標準 (Acceptance Criteria)

1.  全臺 22 縣市與 368 鄉鎮階層均具唯一代碼、名稱與正確 WGS84 座標，無重複或缺漏。
2.  四分區映射正確無誤（北部 7、中部 5、南部 5、東部 2），離島 3 縣市正確回傳 `null`，且完整保留於清單中。
3.  產出 CWA 預報資料集完整欄位對照清冊，明確標記各預報因子的真實 JSON 路徑。
4.  地理登記簿純為靜態版本控制檔案，無任何資料庫依賴。
5.  靜態模型單元測試 100% 通過。

---

## 6. 安全與 TLS 規範 (Security Requirements)

*   API 探勘請求嚴格由伺服端或開發腳本發出，使用 `CWA_API_KEY`，絕不將 Key 寫死於靜態地理資料中。
*   探勘請求嚴格維持 TLS 憑證驗證，禁止使用 `verify=False` 或 `rejectUnauthorized: false`。

---

## 7. 測試策略 (Test Strategy)

*   單元測試：參數化測試全臺 22 縣市與 368 鄉鎮的行政區代碼對齊、分區映射正確性。
*   靜態結構驗證：使用 JSON Schema / Zod 驗證地理主檔格式正確。
*   Mock 整合測試：使用離線 JSON Fixture 驗證 CWA 預報資料集解析路徑對映。

---

## 8. 風險與應對 (Risks)

*   **風險**：鄉鎮預報資料量極大，全臺單一端點可能面臨回應過慢或傳輸逾時。
*   **應對**：若全臺綜合端點過大，後續端點實作時評估按縣市代碼按需向官方 API 查詢，並由短期快取保存各縣市最新結果。

---

## 9. 手動驗收清單 (Manual Verification)

*   [ ] 檢核 22 縣市與 368 鄉鎮清冊無缺失。
*   [ ] 驗證四分區與離島獨立規則完全符合決策 D-011、D-012。
*   [ ] 檢視產出之 CWA 預報因子清冊無誤。
*   [ ] 確認地理登記簿為純靜態檔案，無資料庫連結。

---

## 10. 最終結果 (Final Result)

*(此處待 M8 實作與驗收完成後填寫)*
