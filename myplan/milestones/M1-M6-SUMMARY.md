# M1～M6 已完成功能與部署總結 (M1-M6-SUMMARY.md)

本文件整理專案第一版 (V1 / M1～M6.2) 所完成之全部核心功能、模組劃分、自動化測試覆蓋與雲端部署現況。

---

## 1. 功能摘要 (Feature Summary)

專案現已成功建立一條端到端、單向資料流的氣象預報展示管道：
1.  **CWA API 串接 (M1)**：安全載入 `CWA_API_KEY`，具備逾時重試機制與自定義例外階層（`CwaAuthError`, `CwaConnectionError` 等）。
2.  **預報資料解析與清洗 (M2)**：解析 `F-D0047-091` 巢狀 JSON，產出全臺 22 縣市各 15 個 12 小時預報區間（單次 330 筆），時間統一轉換為 UTC+8 臺北時區。
3.  **SQLite 快照式持久化 (M3)**：以 `weather_forecasts` 資料表儲存預報，每次抓取以 UTC 時間戳 `fetched_at` 作為快照標記，利用複合唯一鍵防止重複。
4.  **快照隔離查詢層 (M4)**：提供無副作用的唯讀查詢介面，自動鎖定最新快照或歷史特定快照，杜絕不同快照混合污染。
5.  **日曆日彙整與 Streamlit 儀表板 (M5)**：將跨子夜 12 小時區間依 `forecast_start` 歸入對應臺北日期，計算每日高低溫極值、標記殘缺日，並提供區域選擇、日期過濾、極值 KPI、趨勢折線圖與預報明細表格。
6.  **臺灣縣市氣象地圖 (M6)**：手動編譯 22 縣市政府代表座標，以 Folium 地圖標記各縣市當前預報氣溫，搭配動態顏色階梯（<15°C 藍、15-20°C 青、20-28°C 綠、28-33°C 橙、≥33°C 紅）與安全 HTML Popup 彈窗。
7.  **雲端連線與相容性修復 (M6.1 & M6.2)**：整合 `certifi` CA 憑證庫確保 TLS 連線安全，並驗證線上鎖定使用 **Python 3.11** 執行環境，解決特定 Python 版本在雲端的 SSL 握手相容性問題。

---

## 2. 主要程式模組 (Main Modules)

| 模組路徑 | 責任劃分 | 主要類別與函式 |
| :--- | :--- | :--- |
| `src/cwa_api.py` | CWA API 通訊與驗證 | `get_cwa_api_key()`, `fetch_forecast_data()`, `validate_response_m1()` |
| `src/parser.py` | JSON 資料解析與 DataFrame 轉換 | `parse_cwa_forecast()`, `CwaParserError` |
| `src/database.py` | SQLite 資料庫連線、初始化與交易寫入 | `init_db()`, `insert_forecast_records()`, `validate_dataframe_for_insert()` |
| `src/queries.py` | 快照隔離之唯讀 SQL 查詢層 | `get_latest_snapshot_time()`, `list_available_regions()`, `query_forecasts()`, `query_all_regions_forecasts()` |
| `src/transformations.py`| 12 小時區間至日曆日之彙整計算 | `aggregate_daily_forecasts()`, `aggregate_multi_region_daily_forecasts()`, `filter_daily_forecasts()` |
| `src/map_data.py` | 縣市座標映射、色階與 Folium 標記建置 | `get_region_coordinate()`, `get_temperature_color()`, `build_weather_map()` |
| `app.py` | Streamlit 應用程式進入點與 UI 呈現 | 側邊欄控制項、手動刷新按鈕、KPI 指標卡片、Altair 圖表、Folium 地圖整合 |

---

## 3. 測試覆蓋與驗證結果 (Automated Testing)

*   **測試框架**：`pytest`
*   **測試總數（最後已知測試結果）**：**153 passed**（隨後續 Milestone 開發動態更新）
*   **測試耗時**：~1.32 秒
*   **涵蓋範圍**：
    *   `tests/test_cwa_api.py`：憑證讀取優先序、網路錯誤與逾時、HTTP 異常狀態碼處理。
    *   `tests/test_parser.py`：空結構拒絕、型態轉換、時區正規化、22 縣市覆蓋率與筆數檢核。
    *   `tests/test_database.py`：SQLite DDL 初始化、交易安全、重複 Snapshot 略過 (ON CONFLICT DO NOTHING)、非時區感知拒絕。
    *   `tests/test_queries.py`：最新快照鎖定、唯讀性檢查、跨快照不污染、Unicode 縣市名稱安全、空資料合約。
    *   `tests/test_transformations.py`：子夜區間歸屬、日曆日極值計算、單區間殘缺日標記、時間排序不變性。
    *   `tests/test_map_data.py`：22 縣市座標完整性、色階閾值臨界測試、HTML 標記轉義防 XSS。

---

## 4. Git 歷史與 Commit SHA (Key Commits)

以下所有 Commit SHA 均可在專案 `git log` 歷史紀錄中完整檢索驗證：

| Milestone | Commit SHA | Commit 說明 |
| :--- | :--- | :--- |
| **M1** | `d67f456` | feat: add CWA forecast API integration |
| **M2** | `95d689f` | feat: parse CWA forecast data into DataFrame |
| **M3** | `a9c343d` | feat: persist forecast snapshots in SQLite |
| **M4** | `d614359` | feat: add SQLite forecast query layer |
| **M5** | `369c284` | feat: build daily weather forecast dashboard |
| **M6** | `091ede2` | feat: add Taiwan county weather map |
| **M6.1**| `02ca04a` | fix: improve CWA API cloud connectivity |
| **M6.2**| `dddc61b` | fix: use certifi CA bundle for CWA API |
| **Docs**| `7547b6a` | docs: document Streamlit deployment and snapshot behavior |

---

## 5. 線上部署現況 (Live Deployment)

*   **Streamlit Community Cloud 網址**：[https://aiot-hw1-bambamboo.streamlit.app/](https://aiot-hw1-bambamboo.streamlit.app/)
*   **部署狀態**：正常運行中 (Active)
*   **部署分支**：`main`
*   **執行環境**：Python 3.11

---

## 6. 現存已知限制 (Known Limitations)

1.  **SQLite 本地生命週期短暫**：在 Streamlit Community Cloud 上，SQLite 資料庫存於容器本機磁碟，容器休眠重啟或重新部署時，歷史快照會被清除，需依賴重新抓取。
2.  **單一預報資料源**：目前僅包含 `F-D0047-091` 一週預報，缺乏即時地面觀測、雨量、風速、AQI 空氣品質與紫外線資料。
3.  **無存取控制**：任何造訪公開網頁的訪客皆可點擊「Fetch and Save」觸發 CWA API 抓取與寫入，缺乏管理員保護。
4.  **分區模式單一**：僅能依全臺 22 縣市個別切換，尚未支援北部、中部、南部、東部之大區域宏觀彙整。
