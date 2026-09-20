"""Taiwan Weather Forecast.

Streamlit web application entry point.
Milestone: M2 — JSON Parsing and Data Cleaning
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
st.subheader("📊 資料解析與清洗預覽 (M2 Data Cleaning Preview)")
st.caption("當前里程碑：**M2 — JSON 解析與資料清洗**（資料集 `F-D0047-091` 全臺 22 縣市一週預報）")

if st.button("🚀 擷取並解析氣象預報 (Fetch & Parse Forecast)", type="primary"):
    with st.spinner("正在自中央氣象署 API 擷取並清洗資料..."):
        try:
            raw_data = fetch_forecast_raw("F-D0047-091")
            df = parse_forecast_data(raw_data)

            st.success("✅ **資料擷取與解析成功！**")

            # M2 規範摘要指標
            col1, col2 = st.columns(2)
            with col1:
                st.metric("資料維度 (Shape)", f"{df.shape[0]} 列 × {df.shape[1]} 欄")
                st.metric("涵蓋縣市數 (Unique Regions)", f"{df['region'].nunique()} 個縣市")
            with col2:
                earliest_start = df["forecast_start"].min().strftime("%Y-%m-%d %H:%M %Z")
                latest_end = df["forecast_end"].max().strftime("%Y-%m-%d %H:%M %Z")
                st.metric("最早預報時間 (Earliest Start)", earliest_start)
                st.metric("最晚預報時間 (Latest End)", latest_end)

            st.markdown("##### 📋 清洗後資料預覽 (前 5 筆)")
            st.dataframe(df.head(5), width="stretch")

        except CwaAuthError as exc:
            st.error(f"❌ **認證錯誤**: {exc}")
            st.info("💡 請確認 `.streamlit/secrets.toml` 中的 `CWA_API_KEY` 是否正確。")
        except CwaRateLimitError as exc:
            st.warning(f"⚠️ **API 存取頻率受限**: {exc}")
        except CwaConnectionError as exc:
            st.error(f"❌ **連線失敗或逾時**: {exc}")
        except CwaServerError as exc:
            st.error(f"❌ **氣象署伺服器異常**: {exc}")
        except CwaParseError as exc:
            st.error(f"❌ **資料解析失敗**: {exc}")
        except CwaApiError as exc:
            st.error(f"❌ **API 錯誤**: {exc}")
