# Taiwan Weather Forecast

An interactive dashboard visualizing weather forecasts across Taiwan, powered by Central Weather Administration (CWA) Open Data, SQLite, and Streamlit.

---

## 📌 Project Summary

This project is a graduate-level AIoT homework application designed to build an end-to-end data pipeline:
- Fetch regional weather forecasts from Taiwan's Central Weather Administration (CWA) API.
- Parse and clean nested JSON data into structured tabular records.
- Persist forecasts in a local SQLite database with duplicate prevention.
- Expose a modular SQL query layer.
- Render interactive Streamlit components: regional/date selectors, temperature metrics, high/low temperature trend charts, data tables, and an interactive Taiwan map with Folium.

---

## 📍 Current Milestone

**M0 — Repository and Minimum Deployment** (Active)
- The project structure, environment configuration, and minimal Streamlit deployment base are established.
- The CWA API and SQLite storage are intentionally not connected yet.

---

## 🏗️ Planned Architecture

```
[ CWA Open Data REST API ]
            │
            ▼
    [ src/cwa_api.py ]     (HTTP requests & error handling)
            │
            ▼
     [ src/parser.py ]     (JSON parsing & data cleaning)
            │
            ▼
    [ src/database.py ]    (SQLite persistence & schema)
            │
            ▼
    [ src/queries.py ]     (Filtered, sorted SQL queries)
            │
            ▼
        [ app.py ]         (Streamlit dashboard & Folium map)
```

---

## 🚀 Local Setup Instructions (macOS / Linux)

### 1. Clone the repository
```bash
git clone https://github.com/bambamboo0321/AIOT-HW1.git
cd AIOT-HW1
```

### 2. Create and activate a virtual environment
```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3. Install required dependencies
```bash
pip install -r requirements.txt
```

---

## ▶️ How to Run Streamlit

Once dependencies are installed and the virtual environment is active:
```bash
streamlit run app.py
```
Streamlit will launch a local web server and open `http://localhost:8501` in your browser.

---

## 🔐 Security Warning About API Keys

- **Never hard-code API keys into source code.**
- **Never commit `.streamlit/secrets.toml` or any `.env` files to GitHub.**
- `.gitignore` is configured to exclude all secrets, `.venv/`, caches, and local database files (`*.db`).
- For local development, copy `.streamlit/secrets.toml.example` to `.streamlit/secrets.toml` and populate your personal key.
- For Streamlit Community Cloud, enter your secrets directly in the application's **Settings > Secrets** web console.

---

## 🗺️ Geographic Coordinate Provenance

The interactive weather map utilizes a static coordinate mapping for all 22 first-level administrative divisions (counties and cities) of Taiwan:

- **說明**: 本專案使用手動整理的縣市政府所在地代表座標，僅供地圖視覺化，並非官方測量座標。
- **Representation**: Geographic coordinates represent the primary **administrative seats** (City Hall or County Government headquarters) for each administrative division, ensuring markers appear in recognizable population centers rather than uninhabited mountain peaks or arbitrary geometric centroids.
- **Datum & Coordinate System**: WGS84 (`EPSG:4326`).
- **Data Source & Reference**:
  - 點座標：手動整理自各直轄市、縣市政府公開之機關地址所在地位置。
- 行政區名稱與界線範圍參考來源：內政部地政司開放資料 [直轄市、縣市界線（TWD97經緯度）](https://data.gov.tw/dataset/7441)（僅作為行政區名稱與行政範圍之對照參考，非點座標直接來源。）
- **Access / Compilation Date**: September 2026.
- **Note**: These coordinates serve strictly as user-interface presentation metadata for map marker visualization and do **not** represent specific meteorological observation stations.
