# Taiwan Weather Forecast (台灣天氣預報互動式儀表板)

[![Streamlit App](https://static.streamlit.io/badges/streamlit_badge_black_white.svg)](https://share.streamlit.io)
[![Python 3.9+](https://img.shields.io/badge/python-3.9+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

AIoT 課程實作專案：使用中央氣象署 (CWA) 開放資料 API、Python、SQLite 與 Streamlit 打造的互動式天氣預報儀表板。

---

## 📌 專案簡介

本專案遵循端到端（End-to-End）軟體工程規範，從交通部中央氣象署 Open Data 平台自動擷取天氣預報資料，經過解析清洗後存入 SQLite 資料庫，並透過 Streamlit 提供互動式圖表、資料表格以及台灣地圖視覺化。

### 核心技術棧
- **資料來源**：交通部中央氣象署 (CWA) 開放資料 API (`F-C0032-003` / `F-D0047`)
- **後端與邏輯**：Python 3.9+、Requests、Pandas
- **資料庫**：SQLite 3
- **前端介面**：Streamlit、Folium、Streamlit-Folium
- **雲端部署**：GitHub + Streamlit Community Cloud

---

## 🚀 快速開始 (Local Setup)

### 1. 複製儲存庫
```bash
git clone https://github.com/bambamboo0321/AIOT-HW1.git
cd AIOT-HW1
```

### 2. 建立並啟動 Python 虛擬環境
```bash
python3 -m venv .venv
source .venv/bin/activate  # macOS / Linux
# 或 Windows: .venv\Scripts\activate
```

### 3. 安裝必要套件
```bash
pip install -r requirements.txt
```

### 4. 設定中央氣象署 API 金鑰 (Secrets)
複製範本檔案建立本機設定：
```bash
mkdir -p .streamlit
cp .streamlit/secrets.toml.example .streamlit/secrets.toml
```
編輯 `.streamlit/secrets.toml`，填入您的 CWA API 授權碼：
```toml
CWA_API_KEY = "CWA-YOUR-API-KEY-HERE"
```
> ⚠️ **重要安全性注意**：`.streamlit/secrets.toml` 已列入 `.gitignore`，**絕對不可將真實金鑰提交至 Git 或公開平台**。

### 5. 啟動本機應用程式
```bash
streamlit run app.py
```
啟動後瀏覽器會自動開啟 `http://localhost:8501`。

---

## ☁️ 部署至 Streamlit Community Cloud

1. 前往 [Streamlit Community Cloud](https://share.streamlit.io/) 並使用 GitHub 帳號登入。
2. 點擊 **"New app"**。
3. 填入以下設定：
   - **Repository**: `bambamboo0321/AIOT-HW1`
   - **Branch**: `main`
   - **Main file path**: `app.py`
4. 展開 **"Advanced settings..."** > 點選 **"Secrets"**，貼上您的金鑰設定：
   ```toml
   CWA_API_KEY = "您的中央氣象署API授權碼"
   ```
5. 點擊 **"Deploy!"** 即可自動完成建置並取得公開存取網址。

---

## 🗺️ 開發里程碑進度 (Milestones)

- [x] **M0 — 儲存庫初始化與最小部署 (Repository and Minimum Deployment)**
- [ ] **M1 — CWA API 資料擷取 (API Acquisition)**
- [ ] **M2 — JSON 解析與資料清洗 (JSON Parsing & Data Cleaning)**
- [ ] **M3 — SQLite 資料庫儲存 (SQLite Persistence)**
- [ ] **M4 — SQL 查詢封裝層 (SQL Query Layer)**
- [ ] **M5 — Streamlit 預報儀表板 (Dashboard UI)**
- [ ] **M6 — 台灣地圖視覺化 (Interactive Map Integration)**
- [ ] **M7 — 品質優化、測試與完整文件 (Quality, Testing & Docs)**

---

## 📂 專案目錄結構

```text
AIOT-HW1/
├── app.py                      # Streamlit 應用程式主入口
├── workflow.md                 # 專案詳細規格與開發手冊
├── README.md                   # 專案說明與部署指南
├── requirements.txt            # Python 依賴套件清單
├── .gitignore                  # Git 忽略設定（包含金鑰與本機 DB）
├── .streamlit/
│   ├── secrets.toml            # 本機機密設定 (已被 gitignore)
│   └── secrets.toml.example    # 機密設定公開範本
├── data/
│   └── .gitkeep                # 本機資料庫存放目錄
├── src/                        # 核心業務邏輯模組 (M1~M4 陸續加入)
│   ├── __init__.py
│   ├── cwa_api.py
│   ├── parser.py
│   ├── database.py
│   └── queries.py
└── tests/                      # 單元測試 (M2~M7 陸續加入)
    ├── test_parser.py
    └── test_database.py
```
