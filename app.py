"""Taiwan Weather Forecast Dashboard.

Streamlit web application entry point.
Milestones: M0, M1, M2, M3, M4, M5 — User-Facing Weather Dashboard
"""

from datetime import datetime, timedelta
import pandas as pd
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
from src.transformations import (
    CwaTransformationError,
    aggregate_daily_forecast,
    filter_daily_forecast,
    filter_raw_forecast_by_dates,
)

st.set_page_config(
    page_title="Taiwan Weather Forecast",
    page_icon="⛅",
    layout="wide",
)

db_file_path = "data/weather.db"

# ==============================================================================
# 1. Initialize Session State Defaults
# ==============================================================================
if "parsed_df" not in st.session_state:
    st.session_state["parsed_df"] = None

# ==============================================================================
# 2. Render & Process Data Management Controls (Sidebar)
# ==============================================================================
st.sidebar.title("⛅ 控制面板 (Controls)")

with st.sidebar.expander("🛠️ 資料管理與開發者工具 (Data & Admin)", expanded=False):
    st.caption("從中央氣象署 API 更新並儲存最新預報快照：")

    if st.button("🚀 擷取並解析氣象預報 (Fetch & Parse)", type="primary"):
        with st.spinner("正在自中央氣象署 API 擷取並清洗資料..."):
            try:
                raw_data = fetch_forecast_raw("F-D0047-091")
                df = parse_forecast_data(raw_data)
                st.session_state["parsed_df"] = df
                st.success("✅ **資料擷取成功！** 已暫存至 Session State。")
            except CwaAuthError as exc:
                st.error(f"❌ **認證錯誤**: {exc}")
            except CwaRateLimitError as exc:
                st.warning(f"⚠️ **存取頻率受限**: {exc}")
            except CwaConnectionError as exc:
                st.error(f"❌ **連線失敗或逾時**: {exc}")
            except CwaServerError as exc:
                st.error(f"❌ **氣象署伺服器異常**: {exc}")
            except (CwaParseError, CwaApiError) as exc:
                st.error(f"❌ **資料解析錯誤**: {exc}")

    has_cached = st.session_state["parsed_df"] is not None
    if st.button("💾 儲存快照至 SQLite (Save Snapshot)", disabled=not has_cached):
        target_df = st.session_state["parsed_df"]
        try:
            res = insert_forecasts(target_df, db_path=db_file_path)
            if res.inserted_rows > 0:
                st.success(f"✅ **寫入成功！** 新增 {res.inserted_rows} 筆紀錄。")
            else:
                st.info(f"ℹ️ **未新增紀錄**：此快照已存在（略過 {res.duplicate_rows} 筆重複資料）。")
        except CwaDatabaseError as exc:
            st.error(f"❌ **資料庫錯誤**: {exc}")

    st.markdown("---")
    try:
        total_in_db = get_total_forecast_count(db_path=db_file_path)
        st.caption(f"📊 資料庫現有總筆數: **{total_in_db}** 筆")
    except CwaDatabaseError:
        st.caption("📊 資料庫尚未建立")

    st.caption(f"📁 資料庫檔案: `{db_file_path}`")
    st.warning(
        "⚠️ Streamlit Community Cloud 上的 SQLite 資料庫並非持久化儲存，"
        "重新部署時可能重設。目前作為本地開發與展示用途。"
    )

# ==============================================================================
# 3. Resolve Latest Snapshot Exactly Once for Dashboard Flow
# ==============================================================================
latest_snapshot = None
try:
    latest_snapshot = get_latest_snapshot_time(db_file_path)
except CwaQueryError:
    latest_snapshot = None

# ==============================================================================
# 4. Page Header
# ==============================================================================
st.title("⛅ 臺灣縣市天氣預報儀表板 (Taiwan Weather Forecast)")
st.caption("資料來源：中央氣象署開放資料平台（資料集代碼：`F-D0047-091`）")

if latest_snapshot is None:
    # Requirement 11: Missing database and first-run empty state
    st.info(
        "💡 **目前本地資料庫尚無預報資料。**\n\n"
        "請展開側邊欄的「**🛠️ 資料管理與開發者工具**」，"
        "依序點擊「**🚀 擷取並解析氣象預報**」與「**💾 儲存快照至 SQLite**」以載入最新氣象資料。"
    )
else:
    latest_taipei = latest_snapshot.astimezone(TZ_TAIPEI)
    st.markdown(
        f"🕒 **最新預報快照發布時間：** `{latest_taipei.strftime('%Y-%m-%d %H:%M:%S')} (UTC+08:00)`"
    )
    st.markdown("---")

    # ==========================================================================
    # 5. Load Regions & Query Selected Region Using Resolved Snapshot
    # ==========================================================================
    try:
        available_regions = list_regions(db_file_path, snapshot_at=latest_snapshot)
    except CwaQueryError as exc:
        st.error(f"❌ **讀取縣市列表失敗**: {exc}")
        available_regions = []

    if not available_regions:
        st.warning("⚠️ 目前快照中無縣市資料。")
    else:
        # Default to 臺北市 if available, else first option
        default_index = available_regions.index("臺北市") if "臺北市" in available_regions else 0
        selected_region = st.sidebar.selectbox(
            "選擇欲查詢縣市 (Region):",
            options=available_regions,
            index=default_index,
        )

        try:
            # Query raw forecasts for selected region and snapshot
            raw_forecasts = query_forecasts(
                db_path=db_file_path,
                region=selected_region,
                snapshot_at=latest_snapshot,
            )
            # Aggregate raw 12-hour intervals into daily summaries
            daily_forecasts = aggregate_daily_forecast(raw_forecasts)
        except (CwaQueryError, CwaTransformationError) as exc:
            st.error(f"❌ **資料轉換錯誤**: {exc}")
            daily_forecasts = pd.DataFrame()
            raw_forecasts = pd.DataFrame()

        if daily_forecasts.empty:
            st.warning(f"⚠️ 縣市「{selected_region}」目前查無預報資料。")
        else:
            # ==================================================================
            # 6. Date Range Filter Controls (Sidebar)
            # ==================================================================
            all_dates = list(daily_forecasts["forecast_date"])
            min_date = min(all_dates)
            max_date = max(all_dates)

            date_selection = st.sidebar.date_input(
                "選擇預報日期區間 (Date Range):",
                value=(min_date, max_date),
                min_value=min_date,
                max_value=max_date,
            )

            # Handle date input transitional states cleanly (Requirement 3)
            filter_start = min_date
            filter_end = max_date
            invalid_range = False

            if not date_selection:
                filter_start = min_date
                filter_end = max_date
            elif isinstance(date_selection, (tuple, list)):
                if len(date_selection) == 1:
                    filter_start = date_selection[0]
                    filter_end = date_selection[0]
                elif len(date_selection) == 2:
                    filter_start, filter_end = date_selection
                    if filter_start > filter_end:
                        invalid_range = True
            elif hasattr(date_selection, "year"):
                filter_start = date_selection
                filter_end = date_selection

            if invalid_range:
                st.sidebar.error("❌ 起始日期不得晚於結束日期，請重新選取。")
                filtered_daily = daily_forecasts.iloc[0:0]
                filtered_raw = raw_forecasts.iloc[0:0]
            else:
                filtered_daily = filter_daily_forecast(
                    daily_forecasts, start_date=filter_start, end_date=filter_end
                )
                filtered_raw = filter_raw_forecast_by_dates(
                    raw_forecasts, start_date=filter_start, end_date=filter_end
                )

            # ==================================================================
            # 7. Dashboard Main View: KPIs, Chart, and Daily Table
            # ==================================================================
            st.subheader(f"📍 {selected_region} 一週天氣預報概況")

            if filtered_daily.empty:
                st.warning("⚠️ 所選日期區間無預報紀錄，請調整側邊欄日期範圍。")
            else:
                # KPI Cards (Requirement 6)
                k1, k2, k3, k4 = st.columns(4)
                k1.metric("所選縣市", selected_region)

                valid_mins = filtered_daily["min_temp"].dropna()
                lowest_label = f"{valid_mins.min():.1f} °C" if not valid_mins.empty else "N/A"
                k2.metric(
                    "區間最低預報",
                    lowest_label,
                    help="所選區間預報最低氣溫極值（非即時觀測溫度）",
                )

                valid_maxs = filtered_daily["max_temp"].dropna()
                highest_label = f"{valid_maxs.max():.1f} °C" if not valid_maxs.empty else "N/A"
                k3.metric(
                    "區間最高預報",
                    highest_label,
                    help="所選區間預報最高氣溫極值（非即時觀測溫度）",
                )

                k4.metric(
                    "預報涵蓋天數",
                    f"{len(filtered_daily)} 天",
                    help="目前顯示之彙整預報天數",
                )

                st.caption("ℹ️ 以上數值為預報區間之氣溫極值，非即時現場觀測氣溫。")
                st.markdown("")

                # Daily Temperature Trend Chart (Requirement 8)
                st.markdown("#### 📈 每日氣溫走勢 (Daily Temperature Trend)")
                st.caption("單位：攝氏度 (°C)")

                chart_df = filtered_daily.copy()
                chart_df["預報日期"] = chart_df["forecast_date"].astype(str)
                chart_series = chart_df.rename(
                    columns={"min_temp": "最低氣溫", "max_temp": "最高氣溫"}
                ).set_index("預報日期")[["最低氣溫", "最高氣溫"]]

                st.line_chart(chart_series, width="stretch")

                # Daily Forecast Summary Table (Requirement 7)
                st.markdown("#### 📅 逐日氣溫預報清單 (Daily Forecast Summary)")
                st.caption("說明：部分資料表示該日期目前只有一個日間或夜間預報區間。")

                summary_table = filtered_daily.copy()
                summary_table["預報日期"] = summary_table["forecast_date"].astype(str)
                summary_table["最低氣溫 (°C)"] = summary_table["min_temp"].apply(
                    lambda v: f"{v:.1f} °C" if pd.notna(v) else "N/A"
                )
                summary_table["最高氣溫 (°C)"] = summary_table["max_temp"].apply(
                    lambda v: f"{v:.1f} °C" if pd.notna(v) else "N/A"
                )
                summary_table["時段數"] = summary_table["interval_count"]
                summary_table["資料狀態"] = summary_table["is_partial"].apply(
                    lambda p: "⚠️ 部分資料" if p else "完整"
                )

                display_cols = [
                    "預報日期",
                    "最低氣溫 (°C)",
                    "最高氣溫 (°C)",
                    "時段數",
                    "資料狀態",
                ]
                st.dataframe(
                    summary_table[display_cols],
                    width="stretch",
                    hide_index=True,
                )

                # Raw 12-Hour Interval Details Expander (Requirement 5)
                with st.expander("🔍 查看原始 12 小時預報細節 (Raw 12-Hour Interval Details)", expanded=False):
                    st.caption("展示中央氣象署原始 12 小時（日間 06:00-18:00 與夜間 18:00-06:00）時段紀錄：")
                    if not filtered_raw.empty:
                        raw_table = filtered_raw.copy()
                        raw_table["預報開始時間"] = pd.to_datetime(
                            raw_table["forecast_start"]
                        ).dt.strftime("%Y-%m-%d %H:%M")
                        raw_table["預報結束時間"] = pd.to_datetime(
                            raw_table["forecast_end"]
                        ).dt.strftime("%Y-%m-%d %H:%M")
                        raw_table["最低氣溫 (°C)"] = raw_table["min_temp"].apply(
                            lambda v: f"{v:.1f} °C" if pd.notna(v) else "N/A"
                        )
                        raw_table["最高氣溫 (°C)"] = raw_table["max_temp"].apply(
                            lambda v: f"{v:.1f} °C" if pd.notna(v) else "N/A"
                        )

                        raw_cols = [
                            "預報開始時間",
                            "預報結束時間",
                            "最低氣溫 (°C)",
                            "最高氣溫 (°C)",
                        ]
                        st.dataframe(
                            raw_table[raw_cols],
                            width="stretch",
                            hide_index=True,
                        )
                    else:
                        st.info("所選條件下無原始時段紀錄。")
