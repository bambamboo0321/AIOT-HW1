"""Forecast data transformation and aggregation module.

Transforms raw 12-hour forecast intervals into daily summaries per local
calendar date (Asia/Taipei), with support for partial-day flagging,
temperature extremes, and inclusive calendar-date filtering.
Milestone: M5 — User-Facing Streamlit Weather Dashboard
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any, List, Optional
import numpy as np
import pandas as pd

TZ_TAIPEI = timezone(timedelta(hours=8))

DAILY_COLUMNS = [
    "forecast_date",
    "min_temp",
    "max_temp",
    "interval_count",
    "is_partial",
    "fetched_at",
]


class CwaTransformationError(Exception):
    """Raised when DataFrame validation or transformation encounters an error."""


def _is_timezone_aware(val: Any) -> bool:
    """Check whether a datetime/Timestamp object is timezone-aware."""
    if val is None:
        return False
    tz = getattr(val, "tzinfo", None)
    if tz is None:
        return False
    try:
        return tz.utcoffset(val) is not None
    except Exception:
        return False


def _create_empty_daily_dataframe() -> pd.DataFrame:
    """Return an empty daily DataFrame with the documented schema and dtypes."""
    return pd.DataFrame(
        {
            "forecast_date": pd.Series(dtype="object"),
            "min_temp": pd.Series(dtype="float64"),
            "max_temp": pd.Series(dtype="float64"),
            "interval_count": pd.Series(dtype="int64"),
            "is_partial": pd.Series(dtype="bool"),
            "fetched_at": pd.Series(dtype="datetime64[ns, UTC]"),
        }
    )


def aggregate_daily_forecast(df: pd.DataFrame) -> pd.DataFrame:
    """Aggregate raw 12-hour forecast intervals into one row per Taipei calendar date.

    Assignment Rule:
        Each interval is assigned to the Asia/Taipei local calendar date of its
        `forecast_start`.
        - Daytime (06:00 -> 18:00) belongs to the date of forecast_start.
        - Nighttime (18:00 -> next day 06:00) also belongs strictly to the date
          of forecast_start.
        - Overnight intervals are never assigned to both days.

    Partial Day Rule:
        Dates with fewer than 2 intervals are marked with `is_partial = True`.

    Args:
        df: Raw forecast DataFrame for a single region and single snapshot.

    Returns:
        pd.DataFrame: Sorted DataFrame with columns:
            [forecast_date, min_temp, max_temp, interval_count, is_partial, fetched_at]

    Raises:
        CwaTransformationError: If input is invalid, contains mixed regions,
                                mixed snapshots, or naive timestamps.
    """
    if not isinstance(df, pd.DataFrame):
        raise CwaTransformationError("Input must be a pandas DataFrame.")

    if df.empty:
        return _create_empty_daily_dataframe()

    required_columns = [
        "region",
        "forecast_start",
        "forecast_end",
        "min_temp",
        "max_temp",
        "fetched_at",
    ]
    missing = [col for col in required_columns if col not in df.columns]
    if missing:
        raise CwaTransformationError(f"DataFrame is missing required columns: {missing}")

    # Enforce single region
    if df["region"].nunique() > 1:
        raise CwaTransformationError(
            f"Input DataFrame contains multiple regions: {df['region'].unique().tolist()}"
        )

    # Enforce single snapshot
    if df["fetched_at"].nunique() > 1:
        raise CwaTransformationError(
            "Input DataFrame contains multiple fetched_at snapshots; mixing snapshots is prohibited."
        )

    # Validate timezone awareness without mutating original DataFrame
    work_df = df.copy()

    for idx, row in work_df.iterrows():
        if not _is_timezone_aware(row["forecast_start"]):
            raise CwaTransformationError(f"Row {idx}: 'forecast_start' is timezone-naive.")
        if not _is_timezone_aware(row["forecast_end"]):
            raise CwaTransformationError(f"Row {idx}: 'forecast_end' is timezone-naive.")
        if not _is_timezone_aware(row["fetched_at"]):
            raise CwaTransformationError(f"Row {idx}: 'fetched_at' is timezone-naive.")

    # Deduplicate raw intervals deterministically to prevent silent double-counting
    work_df = work_df.drop_duplicates(
        subset=["forecast_start", "forecast_end"], keep="last"
    )

    # Convert forecast_start to Asia/Taipei and extract local calendar date
    # Works for both pd.Timestamp series and datetime objects
    start_series = pd.to_datetime(work_df["forecast_start"])
    work_df["forecast_date"] = start_series.dt.tz_convert(TZ_TAIPEI).dt.date

    fetched_at_val = work_df["fetched_at"].iloc[0]
    if hasattr(fetched_at_val, "to_pydatetime"):
        fetched_at_val = fetched_at_val.to_pydatetime()
    fetched_at_utc = fetched_at_val.astimezone(timezone.utc)

    # Group by local forecast date
    daily_rows: List[dict] = []
    for f_date, group in work_df.groupby("forecast_date", sort=True):
        min_series = group["min_temp"].dropna()
        max_series = group["max_temp"].dropna()

        min_val = float(min_series.min()) if not min_series.empty else np.nan
        max_val = float(max_series.max()) if not max_series.empty else np.nan
        cnt = len(group)
        is_part = bool(cnt < 2)

        daily_rows.append(
            {
                "forecast_date": f_date,
                "min_temp": min_val,
                "max_temp": max_val,
                "interval_count": cnt,
                "is_partial": is_part,
                "fetched_at": fetched_at_utc,
            }
        )

    if not daily_rows:
        return _create_empty_daily_dataframe()

    res_df = pd.DataFrame(daily_rows, columns=DAILY_COLUMNS)
    res_df["min_temp"] = pd.to_numeric(res_df["min_temp"], errors="coerce")
    res_df["max_temp"] = pd.to_numeric(res_df["max_temp"], errors="coerce")
    res_df["interval_count"] = res_df["interval_count"].astype("int64")
    res_df["is_partial"] = res_df["is_partial"].astype("bool")
    res_df["fetched_at"] = pd.to_datetime(res_df["fetched_at"])

    return res_df.sort_values(by="forecast_date").reset_index(drop=True)


def filter_daily_forecast(
    df: pd.DataFrame,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> pd.DataFrame:
    """Filter aggregated daily DataFrame by inclusive calendar dates [start_date, end_date].

    Args:
        df: Aggregated daily forecast DataFrame.
        start_date: Optional inclusive start calendar date.
        end_date: Optional inclusive end calendar date.

    Returns:
        pd.DataFrame: Filtered DataFrame with reset index.

    Raises:
        CwaTransformationError: If start_date is later than end_date.
    """
    if not isinstance(df, pd.DataFrame):
        raise CwaTransformationError("Input must be a pandas DataFrame.")

    if start_date is not None and end_date is not None:
        if start_date > end_date:
            raise CwaTransformationError(
                f"start_date ({start_date}) cannot be later than end_date ({end_date})."
            )

    if df.empty:
        return df.copy()

    mask = pd.Series(True, index=df.index)
    if start_date is not None:
        mask &= df["forecast_date"] >= start_date
    if end_date is not None:
        mask &= df["forecast_date"] <= end_date

    return df[mask].reset_index(drop=True)


def filter_raw_forecast_by_dates(
    raw_df: pd.DataFrame,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> pd.DataFrame:
    """Filter raw 12-hour forecasts by the Asia/Taipei calendar date of forecast_start.

    Ensures the raw detail expander corresponds strictly to the same calendar dates
    selected in the daily summary view.

    Args:
        raw_df: Raw 12-hour forecast DataFrame.
        start_date: Optional inclusive start calendar date.
        end_date: Optional inclusive end calendar date.

    Returns:
        pd.DataFrame: Filtered raw DataFrame with reset index.
    """
    if not isinstance(raw_df, pd.DataFrame) or raw_df.empty:
        return raw_df.copy() if isinstance(raw_df, pd.DataFrame) else pd.DataFrame()

    if start_date is not None and end_date is not None and start_date > end_date:
        return raw_df.iloc[0:0].copy()

    start_series = pd.to_datetime(raw_df["forecast_start"])
    raw_dates = start_series.dt.tz_convert(TZ_TAIPEI).dt.date

    mask = pd.Series(True, index=raw_df.index)
    if start_date is not None:
        mask &= raw_dates >= start_date
    if end_date is not None:
        mask &= raw_dates <= end_date

    return raw_df[mask].reset_index(drop=True)
