# Taiwan Weather Forecast Dashboard

An interactive dashboard visualizing weather forecasts across Taiwan, powered by Central Weather Administration (CWA) Open Data, SQLite, and Streamlit.

---

## 🌐 Live Demo

- **Streamlit Community Cloud App**: [https://aiot-hw1-bambamboo.streamlit.app/](https://aiot-hw1-bambamboo.streamlit.app/)
- **GitHub Repository**: [https://github.com/bambamboo0321/AIOT-HW1](https://github.com/bambamboo0321/AIOT-HW1)

---

## 📌 Project Summary

This project is an end-to-end meteorological data pipeline and interactive dashboard application:
- Fetch regional 7-day weather forecasts from Taiwan's Central Weather Administration (CWA) Open Data API (`F-D0047-091`).
- Parse and clean nested JSON data into structured tabular records (22 administrative regions, 330 intervals of 12-hour forecasts per fetch).
- Persist forecasts as immutable historical snapshots in a local SQLite database with unique constraints to prevent duplicates.
- Expose a modular, snapshot-isolated SQL query and transformation layer.
- Render interactive Streamlit components: regional and date selectors, temperature KPI metrics, high/low temperature trend charts, raw interval and daily summary data tables, and an interactive Taiwan county weather map powered by Folium.

---

## 🏗️ Project Pipeline & Architecture

The system processes meteorological data through a robust unidirectional pipeline:

```
[ CWA Open Data REST API (F-D0047-091) ]
                  │
                  ▼
          [ requests (HTTP GET) ]
                  │  (Headers: Authorization, Accept, User-Agent; certifi CA bundle)
                  ▼
         [ JSON Validation ]
                  │  (Schema validation & error boundary)
                  ▼
        [ Pandas Data Parsing ]
                  │  (Extract 22 regions × 15 intervals = 330 rows, UTC+8 Taipei time)
                  ▼
     [ SQLite Snapshot Persistence ]
                  │  (Immutable historical snapshots keyed by fetched_at)
                  ▼
   [ Snapshot-Isolated SQL Query Layer ]
                  │  (Explicit latest snapshot resolution, zero snapshot cross-contamination)
                  ▼
       [ Daily Data Aggregation ]
                  │  (Assign intervals to Taipei date, calculate MinT/MaxT, detect partial days)
                  ▼
    ┌─────────────┴─────────────┐
    ▼                           ▼
[ Streamlit Dashboard ]   [ Folium Taiwan County Map ]
(KPIs, Trends, Tables)    (22-Region Markers & Metrics)
```

---

## ☁️ Deployment

- **Deployment Platform**: Streamlit Community Cloud
- **Repository**: [bambamboo0321/AIOT-HW1](https://github.com/bambamboo0321/AIOT-HW1)
- **Branch**: `main`
- **Application Entry Point**: `app.py`
- **Python Runtime**: `3.11`
- **Continuous Deployment**: Pushing or merging commits to the GitHub `main` branch automatically triggers dependency checks and redeployment on Streamlit Community Cloud.

---

## 🔐 Streamlit Secrets Configuration

API credentials must be provided via Streamlit Secrets and must **never** be hard-coded into source files or committed to Git.

### Cloud Deployment (Streamlit Community Cloud)
In the Streamlit Cloud management dashboard:
1. Navigate to your app settings: **App Settings** → **Secrets**.
2. Add your CWA API key in TOML format:
   ```toml
   CWA_API_KEY = "your-cwa-api-key"
   ```
3. Save changes. Streamlit Cloud securely injects this secret into the runtime environment.

### Local Development
1. Copy the example secrets file:
   ```bash
   cp .streamlit/secrets.toml.example .streamlit/secrets.toml
   ```
2. Edit `.streamlit/secrets.toml` and supply your actual key:
   ```toml
   CWA_API_KEY = "your-cwa-api-key"
   ```
3. `.streamlit/secrets.toml` is strictly ignored by `.gitignore` and must never be committed to GitHub.

---

## 🛡️ Cloud Runtime Compatibility

- **Verified Deployment Runtime**: 本專案線上部署已驗證於 Streamlit Community Cloud 的 **Python 3.11** 環境正常運作（CWA API 成功連線並取得 330 筆預報資料）。
- **Python 3.14.7 SSL Verification Failure**: 平台先前使用 Python 3.14.7 時，曾觀察到 CWA API 發生 `SSL verification failed (generic_ssl_failure)`。
- **CA Bundle Investigation**: 在 Python 3.14.7 環境下，即便更新 `certifi>=2025.1.31` 並明確指定 `verify=certifi.where()`，連線仍未恢復。
- **Runtime Resolution**: 將雲端 runtime 切換為 **Python 3.11** 後，CWA API 連線與資料擷取即順利成功。
- **Status & Scope**: 目前將 **Python 3.11** 記錄為本專案已驗證的部署環境。尚未進一步斷定 Python 3.14.7 失敗的底層憑證或 OpenSSL 根因。
- **Security Principle**: 本專案堅持網路安全原則，絕不使用 `verify=False`，亦不關閉 TLS 憑證驗證或抑制 SSL warnings。

---

## 📸 Snapshot Persistence Behavior

The database layer implements an immutable historical snapshot architecture:
- **Snapshot Identification**: Every API fetch generates an independent, timestamped snapshot identified by its UTC `fetched_at` timestamp.
- **Historical Snapshots**: If forecast data is fetched again at a different time, it is stored as a new snapshot. For instance, fetching twice results in $330 \text{ rows} \times 2 = 660 \text{ rows}$ in the database, representing valid historical forecasts.
- **Duplicate Prevention**: If the user clicks "Save Snapshot" repeatedly on the *same* fetched DataFrame without re-fetching, the database `UNIQUE(dataset_id, fetched_at, region, forecast_start, forecast_end)` constraint prevents double-writing, skipping all 330 duplicate records.
- **Snapshot Isolation**: The query and visualization layers resolve the latest `fetched_at` exactly once, guaranteeing that metrics, charts, tables, and map markers never mix intervals from different fetch times.

---

## 💾 SQLite Cloud Storage Limitations

- **Local File Security**: The SQLite database file (`data/weather.db`) is ignored by `.gitignore` and is never tracked in version control.
- **Ephemeral Cloud Storage**: On Streamlit Community Cloud, local filesystem storage is ephemeral. Data saved to SQLite will reset whenever the container is rebooted, rebuilt, replaced, or redeployed.
- **Intended Scope**: This file-based SQLite design is optimal for homework grading, educational exploration, and interactive demonstrations.
- **Production Recommendation**: For permanent production data persistence, the query and storage layer should be configured to use an external managed database service such as PostgreSQL or Supabase.

---

## 💻 Local Development & Testing

### 1. Clone the repository
```bash
git clone https://github.com/bambamboo0321/AIOT-HW1.git
cd AIOT-HW1
```

### 2. Create and activate a virtual environment
```bash
python -m venv .venv
source .venv/bin/activate
```

### 3. Install dependencies
```bash
pip install -r requirements-dev.txt
```

### 4. Configure local secrets
```bash
cp .streamlit/secrets.toml.example .streamlit/secrets.toml
# Edit .streamlit/secrets.toml with your CWA_API_KEY
```

### 5. Run the local Streamlit application
```bash
streamlit run app.py
```

### 6. Run the test suite
```bash
pytest tests/ -v
```

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
