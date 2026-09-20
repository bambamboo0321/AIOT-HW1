"""SQLite database query layer for CWA weather forecasts.

Provides parameterized, read-only querying for latest/historical snapshots,
region listings, and chronological forecast data with date-range filtering.
Milestone: M4 — SQLite Query Layer
"""

from datetime import datetime, timedelta, timezone
import pathlib
import sqlite3
from typing import Any, List, Optional
import numpy as np
import pandas as pd

TZ_TAIPEI = timezone(timedelta(hours=8))

# SQL Statements as module-level constants
LATEST_SNAPSHOT_SQL = """
SELECT MAX(fetched_at)
FROM weather_forecasts
WHERE dataset_id = ?;
"""

LIST_REGIONS_SQL = """
SELECT DISTINCT region
FROM weather_forecasts
WHERE dataset_id = ? AND fetched_at = ?
ORDER BY region ASC;
"""

BASE_QUERY_FORECASTS_SQL = """
SELECT region, forecast_start, forecast_end, min_temp, max_temp, fetched_at
FROM weather_forecasts
WHERE dataset_id = ? AND region = ? AND fetched_at = ?
"""

QUERY_COLUMNS = [
    "region",
    "forecast_start",
    "forecast_end",
    "min_temp",
    "max_temp",
    "fetched_at",
]


class CwaQueryError(Exception):
    """Raised when a query configuration error, database failure, or invalid input occurs."""


def _is_timezone_aware(val: Any) -> bool:
    """Check whether a datetime/Timestamp object is timezone-aware."""
    if val is None or not isinstance(val, datetime):
        return False
    tz = getattr(val, "tzinfo", None)
    if tz is None:
        return False
    try:
        return tz.utcoffset(val) is not None
    except Exception:
        return False


def _create_empty_forecast_dataframe() -> pd.DataFrame:
    """Return an empty DataFrame matching the documented 6-column schema and dtypes."""
    return pd.DataFrame(
        {
            "region": pd.Series(dtype="object"),
            "forecast_start": pd.Series(dtype="datetime64[ns, UTC+08:00]"),
            "forecast_end": pd.Series(dtype="datetime64[ns, UTC+08:00]"),
            "min_temp": pd.Series(dtype="float64"),
            "max_temp": pd.Series(dtype="float64"),
            "fetched_at": pd.Series(dtype="datetime64[ns, UTC]"),
        }
    )


def _get_ro_connection(db_path: str) -> sqlite3.Connection:
    """Validate database and table existence, and return a read-only sqlite3 connection.

    Uses safe pathlib-based URI construction to properly handle paths containing
    spaces, Unicode characters, '#', '?', or brackets.

    Args:
        db_path: Path to the SQLite database.

    Returns:
        sqlite3.Connection: Read-only SQLite connection.

    Raises:
        CwaQueryError: If database file or weather_forecasts table is missing,
                       or database is corrupt/unreadable.
    """
    path = pathlib.Path(db_path).resolve()
    if not path.exists():
        raise CwaQueryError(f"Database file does not exist at '{db_path}'.")
    if not path.is_file():
        raise CwaQueryError(f"Database path '{db_path}' is not a file.")

    uri = path.as_uri() + "?mode=ro"
    try:
        conn = sqlite3.connect(uri, uri=True)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='weather_forecasts'"
        )
        if not cursor.fetchone():
            conn.close()
            raise CwaQueryError(
                f"Table 'weather_forecasts' does not exist in database at '{db_path}'."
            )
        return conn
    except sqlite3.Error as exc:
        raise CwaQueryError(f"Database access error at '{db_path}': {exc}") from exc


def get_latest_snapshot_time(
    db_path: str = "data/weather.db",
    dataset_id: str = "F-D0047-091",
) -> Optional[datetime]:
    """Retrieve the latest snapshot timestamp (in UTC) for a specific dataset.

    Args:
        db_path: Path to the SQLite database file.
        dataset_id: CWA dataset identifier.

    Returns:
        Optional[datetime]: Timezone-aware UTC datetime, or None if no snapshot exists.

    Raises:
        CwaQueryError: If dataset_id is invalid or database/table access fails.
    """
    if not isinstance(dataset_id, str) or not dataset_id.strip():
        raise CwaQueryError("dataset_id must be a non-empty string.")

    conn = _get_ro_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(LATEST_SNAPSHOT_SQL, (dataset_id.strip(),))
        row = cursor.fetchone()
        if row is None or row[0] is None:
            return None

        # Parse normalized UTC ISO 8601 string back to timezone-aware UTC datetime
        dt = datetime.fromisoformat(row[0])
        return dt.astimezone(timezone.utc)
    except sqlite3.Error as exc:
        raise CwaQueryError(f"Failed to query latest snapshot time from '{db_path}': {exc}") from exc
    finally:
        conn.close()


def list_regions(
    db_path: str = "data/weather.db",
    dataset_id: str = "F-D0047-091",
    snapshot_at: Optional[datetime] = None,
) -> List[str]:
    """List unique region names present in the selected forecast snapshot.

    Args:
        db_path: Path to the SQLite database file.
        dataset_id: CWA dataset identifier.
        snapshot_at: Optional timezone-aware datetime. If None, queries the latest snapshot.

    Returns:
        List[str]: Deterministically sorted list of unique region names.
                   Returns empty list [] if no rows exist for the snapshot.

    Raises:
        CwaQueryError: If inputs are invalid or database errors occur.
    """
    if not isinstance(dataset_id, str) or not dataset_id.strip():
        raise CwaQueryError("dataset_id must be a non-empty string.")

    # Resolve snapshot time
    if snapshot_at is None:
        target_snapshot = get_latest_snapshot_time(db_path, dataset_id=dataset_id)
        if target_snapshot is None:
            return []
    else:
        if not _is_timezone_aware(snapshot_at):
            raise CwaQueryError("snapshot_at must be a timezone-aware datetime.")
        target_snapshot = snapshot_at

    snapshot_iso_utc = target_snapshot.astimezone(timezone.utc).isoformat()

    conn = _get_ro_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(LIST_REGIONS_SQL, (dataset_id.strip(), snapshot_iso_utc))
        rows = cursor.fetchall()
        return [r[0] for r in rows]
    except sqlite3.Error as exc:
        raise CwaQueryError(f"Failed to list regions from '{db_path}': {exc}") from exc
    finally:
        conn.close()


def query_forecasts(
    db_path: str = "data/weather.db",
    region: str = "",
    dataset_id: str = "F-D0047-091",
    snapshot_at: Optional[datetime] = None,
    range_start: Optional[datetime] = None,
    range_end: Optional[datetime] = None,
) -> pd.DataFrame:
    """Query forecast rows for a specific region and snapshot with optional date filtering.

    Date range uses half-open interval semantics [range_start, range_end).
    A forecast interval overlaps the range if forecast_end > range_start AND forecast_start < range_end.

    Args:
        db_path: Path to SQLite database file.
        region: County/city name (non-empty string).
        dataset_id: CWA dataset identifier.
        snapshot_at: Optional timezone-aware datetime. If None, queries the latest snapshot.
        range_start: Optional timezone-aware datetime for range start (inclusive).
        range_end: Optional timezone-aware datetime for range end (exclusive).

    Returns:
        pd.DataFrame: DataFrame with columns [region, forecast_start, forecast_end, min_temp, max_temp, fetched_at].
                      Sorted by forecast_start, forecast_end, region.

    Raises:
        CwaQueryError: If inputs are invalid or database errors occur.
    """
    if not isinstance(dataset_id, str) or not dataset_id.strip():
        raise CwaQueryError("dataset_id must be a non-empty string.")

    if not isinstance(region, str) or not region.strip():
        raise CwaQueryError("region must be a non-empty string.")
    clean_region = region.strip()

    # Validate snapshot_at
    if snapshot_at is None:
        target_snapshot = get_latest_snapshot_time(db_path, dataset_id=dataset_id)
        if target_snapshot is None:
            return _create_empty_forecast_dataframe()
    else:
        if not _is_timezone_aware(snapshot_at):
            raise CwaQueryError("snapshot_at must be a timezone-aware datetime.")
        target_snapshot = snapshot_at

    snapshot_iso_utc = target_snapshot.astimezone(timezone.utc).isoformat()

    # Validate date range boundaries
    if range_start is not None and not _is_timezone_aware(range_start):
        raise CwaQueryError("range_start must be a timezone-aware datetime.")
    if range_end is not None and not _is_timezone_aware(range_end):
        raise CwaQueryError("range_end must be a timezone-aware datetime.")
    if range_start is not None and range_end is not None and range_start >= range_end:
        raise CwaQueryError(
            f"range_start ({range_start}) must be strictly earlier than range_end ({range_end})."
        )

    # Construct parameterized SQL
    sql = BASE_QUERY_FORECASTS_SQL
    params: List[Any] = [dataset_id.strip(), clean_region, snapshot_iso_utc]

    # ISO text comparison is valid because M3 guarantees all forecast timestamps
    # use a consistent ISO 8601 format with identical UTC+08:00 offset.
    if range_start is not None:
        sql += " AND forecast_end > ?"
        params.append(range_start.astimezone(TZ_TAIPEI).isoformat())

    if range_end is not None:
        sql += " AND forecast_start < ?"
        params.append(range_end.astimezone(TZ_TAIPEI).isoformat())

    sql += " ORDER BY forecast_start ASC, forecast_end ASC, region ASC;"

    conn = _get_ro_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        if not rows:
            return _create_empty_forecast_dataframe()

        df = pd.DataFrame(rows, columns=QUERY_COLUMNS)
        df["region"] = df["region"].astype("object")
        df["forecast_start"] = pd.to_datetime(df["forecast_start"])
        df["forecast_end"] = pd.to_datetime(df["forecast_end"])
        df["min_temp"] = pd.to_numeric(df["min_temp"], errors="coerce")
        df["max_temp"] = pd.to_numeric(df["max_temp"], errors="coerce")
        df["fetched_at"] = pd.to_datetime(df["fetched_at"])
        df = df.sort_values(by=["forecast_start", "forecast_end", "region"]).reset_index(drop=True)
        return df
    except sqlite3.Error as exc:
        raise CwaQueryError(f"Failed to query forecasts from '{db_path}': {exc}") from exc
    finally:
        conn.close()
