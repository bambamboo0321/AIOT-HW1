"""Taiwan Weather Forecast Dashboard.

Main application entry point for Streamlit.
Milestone: M0 — Repository and Minimum Deployment
"""

import streamlit as st

# 設定網頁標題與基本佈局
st.set_page_config(
    page_title="Taiwan Weather Forecast | 台灣天氣預報",
    page_icon="⛅",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.title("⛅ 台灣天氣預報儀表板 (Taiwan Weather Forecast)")
st.caption("AIoT 課程作業：從氣象資料到互動式天氣預報應用 | CWA API × SQLite × Streamlit")

st.markdown("---")

# M0 狀態展示
st.success("✅ **Milestone M0: 專案基礎與最小部署環境已就緒！**")

col1, col2 = st.columns([2, 1])

with col1:
    st.subheader("📌 專案管線流程 (Pipeline Overview)")
    st.markdown(
        """
        本系統整合交通部中央氣象署 (CWA) 開放資料，打造端到端氣象預報儀表板：
        1. **M0 — 專案初始與最小部署**（當前階段：CI/CD 雲端連線驗證）
        2. **M1 — CWA API 資料擷取**（使用 Requests 安全獲取 JSON 氣象預報）
        3. **M2 — JSON 解析與資料清洗**（Pandas 結構化處理高低氣溫數據）
        4. **M3 — SQLite 資料庫儲存**（本地資料持久化與去重寫入）
        5. **M4 — SQL 查詢封裝層**（模組化查詢過濾與時間排序）
        6. **M5 — Streamlit 互動儀表板**（地區/日期篩選、統計指標、折線圖、資料表格）
        7. **M6 — 台灣地圖視覺化**（Folium 地圖空間呈現各區溫度分布）
        8. **M7 — 品質優化、測試與完整文件**（單元測試與自動化驗證）
        """
    )

with col2:
    st.subheader("⚙️ 系統資訊")
    st.info(
        """
        - **架構模式**: 模組化分層架構 (src/)
        - **前端框架**: Streamlit
        - **資料來源**: 中央氣象署 (CWA) Open Data API
        - **儲存引擎**: SQLite
        - **部署目標**: Streamlit Community Cloud
        """
    )

st.markdown("---")
st.markdown("💡 *準備進入下一個里程碑：M1 — CWA API 資料擷取*")
