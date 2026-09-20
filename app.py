"""Taiwan Weather Forecast.

Streamlit web application entry point.
Milestone: M1 — CWA API Acquisition
"""

import streamlit as st
from src.cwa_api import (
    CwaApiError,
    CwaAuthError,
    CwaConnectionError,
    CwaRateLimitError,
    CwaServerError,
    fetch_forecast_raw,
    validate_response_m1,
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
st.subheader("📡 CWA API 連線檢測 (API Connection Test)")
st.caption("當前里程碑：**M1 — CWA API 資料擷取**（使用資料集 `F-D0047-091` 全臺 22 縣市一週預報）")

if st.button("🚀 測試 CWA API 連線 (Test CWA API Connection)", type="primary"):
    with st.spinner("正在連線中央氣象署 API..."):
        try:
            raw_data = fetch_forecast_raw("F-D0047-091")
            summary = validate_response_m1(raw_data)
            st.success(
                f"✅ **CWA API 連線成功！**\n\n"
                f"- **資料集**: `F-D0047-091` (全臺灣各縣市未來 1 週天氣預報)\n"
                f"- **地區數量**: 取得全台 {summary['location_count']} 個縣市預報資料\n"
                f"- **範例地區**: {summary['sample_location']}"
            )
        except CwaAuthError as exc:
            st.error(f"❌ **認證錯誤**: {exc}")
            st.info("💡 請確認 `.streamlit/secrets.toml` 或環境變數中的 `CWA_API_KEY` 是否正確。")
        except CwaRateLimitError as exc:
            st.warning(f"⚠️ **API 存取頻率受限**: {exc}")
        except CwaConnectionError as exc:
            st.error(f"❌ **連線超時或網路失敗**: {exc}")
        except CwaServerError as exc:
            st.error(f"❌ **中央氣象署伺服器異常**: {exc}")
        except CwaApiError as exc:
            st.error(f"❌ **資料格式或狀態錯誤**: {exc}")
