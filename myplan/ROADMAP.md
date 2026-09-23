# 專案里程碑總表 (ROADMAP.md)

本文件追蹤專案自 M1 至今的所有 Milestone 進度與目前狀態。

---

## 1. 狀態詞彙定義 (Status Dictionary)

為維持狀態紀錄的嚴謹性與一致性，所有 Milestone 狀態**僅限使用以下 7 種狀態標記**：

*   `Planned`：已排定需求與規劃，尚未開始實作。
*   `In Progress`：目前正在進行規格細化、程式碼開發或測試編寫。
*   `Implemented`：程式碼與自動化測試已完成（本機測試通過），等待手動驗收。
*   `Verified`：開發者或使用者已完成手動功能驗收，等待發布。
*   `Completed`：已完成 Git Commit、Push 至 GitHub，且線上環境部署驗收完成。
*   `Blocked`：因外部依賴、缺少憑證或重大技術阻礙暫停。
*   `Optional`：非核心功能，視後續資源與需求彈性決定是否實施。

---

## 2. 里程碑進度總表

| Milestone | 範圍 (Scope) | 目標內容 | 狀態 (Status) |
| :--- | :--- | :--- | :--- |
| **M1** | CWA API acquisition | CWA API 憑證載入、HTTP 請求封裝、狀態驗證與錯誤處理 | **Completed** |
| **M2** | JSON parsing and cleaning | 22 縣市 × 15 區間巢狀結構解析、時區標準化為臺北時間 | **Completed** |
| **M3** | SQLite persistence | 快照式 SQLite 表結構建立、唯讀約束、防止重複寫入 | **Completed** |
| **M4** | Snapshot query layer | 快照隔離查詢介面、日期區間過濾、跨快照防污染機制 | **Completed** |
| **M5** | Daily Streamlit dashboard | 每日高低溫極值彙整、殘缺日偵測、Streamlit 圖表與指標 | **Completed** |
| **M6** | Taiwan county weather map | 22 縣市代表座標標記、溫度色階渲染、Folium 地圖展示 | **Completed** |
| **M6.1** | Cloud connectivity timeout handling | 強化雲端環境網路逾時重試與連線容錯機制 | **Completed** |
| **M6.2** | Streamlit Cloud SSL/runtime compatibility | 鎖定 Python 3.11 執行環境，解決 SSL 憑證鏈相容問題 | **Completed** |
| **M7** | Cloud Data Foundation | Supabase PostgreSQL、SQLite/PostgreSQL storage adapter、migrations、sync metadata、secure connection handling 與 production failure behavior | **Planned** |
| **M8** | Geographic Registry & CWA Dataset Discovery | 縣市／鄉鎮階層、F-D0047-091 完整結構、geocode、座標、行政區界線及預報因子探勘 | **Planned** |
| **M9** | Complete County and Township Forecast Ingestion | 縣市與鄉鎮完整預報同步（逐時、逐 3 小時、逐 12 小時與逐日資料，涵蓋各預報要素） | **Planned** |
| **M10** | Real-Time Weather Observations | O-A0003-001 綜觀氣象觀測、O-A0002-001 雨量觀測、測站即時觀測入庫 | **Planned** |
| **M11** | MOENV Air Quality | AQI、PM2.5、PM10、主要污染物與空品測站資料整合 | **Planned** |
| **M12** | UV and Weather Alerts | 紫外線官方 Dataset 驗證與資料語意確立、天氣警特報資料整合 | **Planned** |
| **M13** | Supabase Query Contract and Aggregation | PostgreSQL views、PostgreSQL functions / RPC（僅在確實需要時）、geographic queries、viewport queries、snapshot isolation、public read model、TypeScript data contract 規劃、Row Level Security (RLS) 規劃 | **Planned** |
| **M14** | Next.js Progressive Multi-Layer Map UI | 在 `web/` 建立 Next.js + TypeScript App、地圖支援全臺/縣市/鄉鎮、progressive disclosure、viewport / zoom loading、Hover 僅為輔助、Click / Tap / keyboard 為核心操作、多資料圖層、手機響應式 UI、loading / empty / stale / error states | **Planned** |
| **M15** | Python Sync Worker and Administration | 保留現有 Python API client 與 parser、管理員手動同步、sync run status、防止重複同步、Worker 執行環境另行評估（GitHub Actions、Vercel Functions、Supabase Edge Functions 列為候選，實測決定；初期不重寫 Python parser） | **Planned** |
| **M16** | Vercel Migration, Performance and Accessibility | GitHub → Vercel Preview Deployments、Vercel production deployment、Supabase integration、RLS verification、Streamlit / Vercel data parity、mobile、accessibility、map performance、caching、stale data behavior、rollback plan（Vercel 通過驗收後才決定是否停止 Streamlit） | **Planned** |
| **M17** | Optional Advanced Layers | 雷達、雷電、衛星、颱風、歷史趨勢、通知與自動排程 | **Optional** |

---

## 3. 當前焦點 (Current Focus)

*   **當前階段**：確立 Next.js + Vercel 為前端目標架構，完成 M7～M17 Roadmap 與架構決策重整。
*   **遷移策略**：遷移期間維持現有 Streamlit App 正式公開運作，待 M16 Vercel 驗收完成後再決定是否停用。
*   **下一目標**：M7 (Cloud Data Foundation) 雲端資料庫基礎架構設計與實作。
