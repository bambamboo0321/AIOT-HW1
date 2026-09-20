"""Taiwan Weather Forecast.

Streamlit web application entry point.
Milestones: M0, M1, M2, M3 — SQLite Persistence
"""

import streamlit as st
from src.cwa_api import (
    CwaApiError,
    CwaAuthError,
    CwaConnectionError,
    CwaRateLimitError,
    CwaServerError,
    fetch_forecast_raw,
)
from src.database import (
    CwaDatabaseError,
    get_total_forecast_count,
    insert_forecasts,
)
from src.parser import CwaParseError, parse_forecast_data

st.set_page_config(
    page_title="Taiwan Weather Forecast",
    page_icon="⛅",
    layout="centered",
)

st.title("Taiwan Weather Forecast")
st.write(
    """
    An interactive dashboard visualizing weather forecasts across Taiwan,
    powered by Central Weather Administration (CWA) Open Data, SQLite,
    and Streamlit.
    """
)

st.markdown("---")
st.subheader("📊 資料擷取與解析 (M2 Data Ingestion)")
st.caption("資料集：`F-D0047-091`（全臺 22 縣市一週天氣預報）")

if st.button("🚀 擷取並解析氣象預報 (Fetch & Parse Forecast)", type="primary"):
    with st.spinner("正在自中央氣象署 API 擷取並清洗資料..."):
        try:
            raw_data = fetch_forecast_raw("F-D0047-091")
            df = parse_forecast_data(raw_data)
            st.session_state["parsed_df"] = df
            st.success("✅ **資料擷取與解析成功！已暫存於工作階段 (Session State)。**")
        except CwaAuthError as exc:
            st.error(f"❌ **認證錯誤**: {exc}")
        except CwaRateLimitError as exc:
            st.warning(f"⚠️ **API 存取頻率受限**: {exc}")
        except CwaConnectionError as exc:
            st.error(f"❌ **連線失敗或逾時**: {exc}")
        except CwaServerError as exc:
            st.error(f"❌ **氣象署伺服器異常**: {exc}")
        except (CwaParseError, CwaApiError) as exc:
            st.error(f"❌ **資料錯誤**: {exc}")

# Display M2 preview if parsed DataFrame is in session state
if "parsed_df" in st.session_state and st.session_state["parsed_df"] is not None:
    cached_df = st.session_state["parsed_df"]
    col1, col2 = st.columns(2)
    with col1:
        st.metric("資料維度 (Shape)", f"{cached_df.shape[0]} 列 × {cached_df.shape[1]} 欄")
        st.metric("涵蓋縣市數 (Regions)", f"{cached_df['region'].nunique()} 個縣市")
    with col2:
        earliest_start = cached_df["forecast_start"].min().strftime("%Y-%m-%d %H:%M %Z")
        latest_end = cached_df["forecast_end"].max().strftime("%Y-%m-%d %H:%M %Z")
        st.metric("最早預報時間", earliest_start)
        st.metric("最晚預報時間", latest_end)

    st.markdown("##### 📋 清洗後資料預覽 (前 5 筆)")
    st.dataframe(cached_df.head(5), width="stretch")

st.markdown("---")
st.subheader("💾 SQLite 本地持久化 (M3 Persistence)")
st.warning(
    "⚠️ SQLite data stored on Streamlit Community Cloud is not durable and may be "
    "reset during redeployment. This database is currently intended for local "
    "learning and development."
)

db_file_path = "data/weather.db"
has_cached_df = "parsed_df" in st.session_state and st.session_state["parsed_df"] is not None

if not has_cached_df:
    st.info("💡 請先點擊上方「擷取並解析氣象預報」以取得快照資料，再執行資料庫寫入。")

if st.button("💾 儲存預報至 SQLite (Save Snapshot to SQLite)", disabled=not has_cached_df):
    target_df = st.session_state["parsed_df"]
    try:
        res = insert_forecasts(target_df, db_path=db_file_path)
        total_rows = get_total_forecast_count(db_path=db_file_path)

        if res.inserted_rows > 0:
            st.success(f"✅ **寫入成功！** 本次新增 {res.inserted_rows} 筆預報紀錄。")
        else:
            st.info(f"ℹ️ **未新增紀錄**：此快照已存在於資料庫中（略過 {res.duplicate_rows} 筆重複資料）。")

        m1, m2, m3, m4 = st.columns(4)
        m1.metric("嘗試寫入 (Attempted)", res.attempted_rows)
        m2.metric("實際寫入 (Inserted)", res.inserted_rows)
        m3.metric("重複略過 (Duplicates)", res.duplicate_rows)
        m4.metric("資料庫總筆數 (Total in DB)", total_rows)
        st.caption(f"📁 資料庫檔案路徑: `{db_file_path}`")

    except CwaDatabaseError as exc:
        st.error(f"❌ **資料庫錯誤**: {exc}")
