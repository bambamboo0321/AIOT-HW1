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

### Legacy Streamlit V1 (已完成基線)
| Milestone | 範圍 (Scope) | 目標內容 | 狀態 (Status) |
| :--- | :--- | :--- | :--- |
| **M1** | CWA API acquisition | CWA API 憑證載入、HTTP 請求封裝、狀態驗證與錯誤處理 | **Completed (Legacy V1)** |
| **M2** | JSON parsing and cleaning | 22 縣市 × 15 區間巢狀結構解析、時區標準化為臺北時間 | **Completed (Legacy V1)** |
| **M3** | SQLite persistence | 快照式 SQLite 表結構建立、唯讀約束、防止重複寫入 | **Completed (Legacy V1)** |
| **M4** | Snapshot query layer | 快照隔離查詢介面、日期區間過濾、跨快照防污染機制 | **Completed (Legacy V1)** |
| **M5** | Daily Streamlit dashboard | 每日高低溫極值彙整、殘缺日偵測、Streamlit 圖表與指標 | **Completed (Legacy V1)** |
| **M6** | Taiwan county weather map | 22 縣市代表座標標記、溫度色階渲染、Folium 地圖展示 | **Completed (Legacy V1)** |
| **M6.1** | Cloud connectivity timeout handling | 強化雲端環境網路逾時重試與連線容錯機制 | **Completed (Legacy V1)** |
| **M6.2** | Streamlit Cloud SSL/runtime compatibility | 鎖定 Python 3.11 執行環境，解決 SSL 憑證鏈相容問題 | **Completed (Legacy V1)** |

### Stateless Vercel V2 (目標演進)
| Milestone | 範圍 (Scope) | 目標內容 | 狀態 (Status) |
| :--- | :--- | :--- | :--- |
| **M7** | Vercel Web Foundation and Server Data Gateway | 建立最小 `web/` Next.js + TypeScript 專案、App Router 基礎、server-only HTTP client、Route Handler 基礎架構、環境變數校驗、timeout / TLS / error mapping / redaction、response envelope、cache interface 與測試、最小 health/status endpoint、Vitest 基礎；不建立正式地圖 UI、不整合完整 Dataset、不建立資料庫 | **Planned** |
| **M8** | Geographic Registry & CWA Dataset Discovery | F-D0047-091 完整結構、22 縣市與 368 鄉鎮、geocode、座標與行政邊界、預報因子與時間解析；地理資料可使用版本控制的靜態檔案，不保存 API 歷史資料 | **Planned** |
| **M9** | County and Township Forecast API | 縣市與鄉鎮預報、逐時、逐 3 小時、逐 12 小時與逐日資料，包含溫度、體感、濕度、降雨機率、風與天氣現象；Server Route Handler、validation / normalization、short-term cache，不寫入資料庫 | **Planned** |
| **M10** | Real-Time Weather Observation API | O-A0003-001、O-A0002-001 最新測站觀測、最新雨量、測站 metadata、缺值 sentinel、short-term cache，不保存長期時序 | **Planned** |
| **M11** | MOENV Air Quality API | AQI、PM2.5、PM10、主要污染物、最新空品測站資料、server-side MOENV_API_KEY、short-term cache，不保存歷史資料 | **Planned** |
| **M12** | UV and Weather Alerts API | 驗證 UV Dataset、最新官方 UV 資料、有效天氣警特報、發布與有效時間、short-term cache，不保存過期歷史 | **Planned** |
| **M13** | Unified API Contract and Aggregation | 統一 TypeScript response contract、全臺／四區／縣市／鄉鎮 aggregation、viewport query parameters、forecast / observation / AQI / UV 語意分離、server validation、browser-safe response，不再規劃 Supabase View、RPC 或 RLS | **Planned** |
| **M14** | Progressive Multi-Layer Map UI | 在 M7 已存在的 `web/` 基礎上建立完整地圖使用者介面、全臺→縣市→鄉鎮 progressive disclosure、viewport / zoom loading、圖層切換、Hover 輔助、Click / Tap / keyboard 核心操作、responsive UI、視覺設計與 accessibility、loading / empty / stale / unavailable / error states | **Planned** |
| **M15** | Refresh, Cache and Admin Diagnostics | 安全的手動 refresh、cache status、latest official data timestamp、server fetch diagnostics、防止使用者高頻重複 refresh，不做資料庫同步、不做 historical ingestion，不建立 Python background worker，除非未來另行批准 | **Planned** |
| **M16** | Vercel Migration, Performance and Accessibility | Vercel Preview、production deployment、Streamlit / Vercel current-data parity、mobile、accessibility、server route security、API key leakage inspection、caching behavior、external API outage behavior、cutover and rollback（Vercel 通過驗收後才由使用者決定是否停止 Streamlit） | **Planned** |
| **M17** | Optional Persistence and Advanced Layers | 歷史資料、PostgreSQL / Supabase / Neon、雷達、雷電、衛星、颱風、趨勢分析、通知、自動排程（只有未來真的需要歷史分析，才評估 M17 永久資料庫） | **Optional** |

---

## 3. 當前焦點 (Current Focus)

*   **當前階段**：確立 Stateless Vercel V2 架構，移除永久資料庫與歷史快照負擔，聚焦呈現最新觀測與官方預報。
*   **遷移策略**：現有 Streamlit + SQLite 保持公開運作作為 Legacy V1 基線，直到 M16 Vercel 驗收完成。
*   **下一目標**：M7 (Vercel Web Foundation and Server Data Gateway) 建立最小 web/ 專案骨架與伺服端無狀態資料閘道基礎。
