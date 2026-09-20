"""Taiwan Weather Forecast.

Streamlit web application entry point.
Milestones: M0, M1, M2, M3, M4 — SQLite Query Layer
"""

from datetime import datetime, timedelta
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
from src.queries import (
    CwaQueryError,
    TZ_TAIPEI,
    get_latest_snapshot_time,
    list_regions,
    query_forecasts,
)

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

st.markdown("---")
st.subheader("🔍 資料查詢驗證 (M4 Query Layer)")

try:
    # Requirement 1: Resolve the latest snapshot only once per render/query flow
    latest_snapshot = get_latest_snapshot_time(db_file_path)

    if latest_snapshot is None:
        st.info("💡 目前資料庫中尚無預報快照。請先點擊上方「儲存預報至 SQLite」以寫入快照。")
    else:
        # Pass exact explicit latest_snapshot to list_regions
        available_regions = list_regions(db_file_path, snapshot_at=latest_snapshot)

        if not available_regions:
            st.info("💡 目前快照中無任何縣市資料。")
        else:
            col_info1, col_info2 = st.columns(2)
            with col_info1:
                st.metric(
                    "最新快照時間 (UTC)",
                    latest_snapshot.strftime("%Y-%m-%d %H:%M:%S UTC"),
                )
            with col_info2:
                latest_taipei = latest_snapshot.astimezone(TZ_TAIPEI)
                st.metric(
                    "最新快照時間 (臺灣時間)",
                    latest_taipei.strftime("%Y-%m-%d %H:%M:%S +08:00"),
                )

            selected_region = st.selectbox(
                "選擇欲查詢縣市 (Region):",
                options=available_regions,
            )

            # Optional date / date-range filter
            enable_date_filter = st.checkbox(
                "啟用日期區間過濾 (Optional Date Range Filter)",
                value=False,
            )

            range_start_dt = None
            range_end_dt = None

            if enable_date_filter:
                date_selection = st.date_input(
                    "選擇預報日期區間 (Date Range):",
                    value=(latest_taipei.date(), latest_taipei.date() + timedelta(days=2)),
                )
                # Requirement 2: Convert date selections to timezone-aware UTC+08:00 boundaries
                if isinstance(date_selection, (tuple, list)):
                    if len(date_selection) == 2:
                        start_d, end_d = date_selection
                        range_start_dt = datetime(
                            start_d.year, start_d.month, start_d.day, 0, 0, 0, tzinfo=TZ_TAIPEI
                        )
                        range_end_dt = datetime(
                            end_d.year, end_d.month, end_d.day, 0, 0, 0, tzinfo=TZ_TAIPEI
                        ) + timedelta(days=1)
                    elif len(date_selection) == 1:
                        single_d = date_selection[0]
                        range_start_dt = datetime(
                            single_d.year, single_d.month, single_d.day, 0, 0, 0, tzinfo=TZ_TAIPEI
                        )
                        range_end_dt = range_start_dt + timedelta(days=1)
                elif hasattr(date_selection, "year"):
                    range_start_dt = datetime(
                        date_selection.year, date_selection.month, date_selection.day, 0, 0, 0, tzinfo=TZ_TAIPEI
                    )
                    range_end_dt = range_start_dt + timedelta(days=1)

            # Requirement 1: Pass exact explicit latest_snapshot to query_forecasts
            query_res_df = query_forecasts(
                db_path=db_file_path,
                region=selected_region,
                snapshot_at=latest_snapshot,
                range_start=range_start_dt,
                range_end=range_end_dt,
            )

            st.metric("符合條件之預報筆數 (Matching Rows)", len(query_res_df))
            if not query_res_df.empty:
                st.markdown("##### 📋 查詢結果預覽 (前 5 筆)")
                st.dataframe(query_res_df.head(5), width="stretch")
            else:
                st.info("ℹ️ 該條件下無符合的預報紀錄。")

except CwaQueryError:
    # Requirement 4: Catch CwaQueryError and show friendly instruction without traceback
    st.info("💡 No local forecast database is available. Fetch and save a snapshot in M3 first.")
