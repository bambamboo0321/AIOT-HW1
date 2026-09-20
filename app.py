"""Taiwan Weather Forecast.

Streamlit web application entry point.
Milestone: M0 — Repository and Minimum Deployment
"""

import streamlit as st

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

st.info("ℹ️ **Current Status**: Milestone M0 initialized. CWA API is not connected yet.")
