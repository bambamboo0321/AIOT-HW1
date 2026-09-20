"""SQLite database persistence module for CWA weather forecasts.

Responsible for database initialization, schema creation, pre-insert validation,
parameterized execution, transactional rollback, and duplicate snapshot tracking.
Milestone: M3 — SQLite Persistence
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import os
import sqlite3
from typing import Any, List, Optional, Tuple
import pandas as pd


class CwaDatabaseError(Exception):
    """Raised when validation fails or a database operation encounters an error."""


@dataclass(frozen=True)
class InsertResult:
    """Result summary of a forecast snapshot insertion."""

    attempted_rows: int
    inserted_rows: int
    duplicate_rows: int


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS weather_forecasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_id TEXT NOT NULL,
    region TEXT NOT NULL,
    forecast_start TEXT NOT NULL,
    forecast_end TEXT NOT NULL,
    min_temp REAL NULL,
    max_temp REAL NULL,
    fetched_at TEXT NOT NULL,
    UNIQUE (
        dataset_id,
        region,
        forecast_start,
        forecast_end,
        fetched_at
    )
);
"""

INSERT_FORECAST_SQL = """
INSERT INTO weather_forecasts (
    dataset_id,
    region,
    forecast_start,
    forecast_end,
    min_temp,
    max_temp,
    fetched_at
)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (
    dataset_id,
    region,
    forecast_start,
    forecast_end,
    fetched_at
)
DO NOTHING;
"""


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


def validate_dataframe_for_insert(df: pd.DataFrame, dataset_id: str) -> None:
    """Validate DataFrame integrity and business rules before beginning database transaction.

    Args:
        df: The parsed forecast DataFrame.
        dataset_id: Identifier for the weather dataset.

    Raises:
        CwaDatabaseError: If any validation rule fails.
    """
    if not isinstance(dataset_id, str) or not dataset_id.strip():
        raise CwaDatabaseError("dataset_id must be a non-empty string.")

    if not isinstance(df, pd.DataFrame):
        raise CwaDatabaseError("Input must be a pandas DataFrame.")

    if df.empty:
        raise CwaDatabaseError("Cannot insert an empty DataFrame.")

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
        raise CwaDatabaseError(f"DataFrame is missing required columns: {missing}")

    # Check regions are non-empty strings
    for idx, reg in enumerate(df["region"]):
        if pd.isna(reg) or not isinstance(reg, str) or not reg.strip():
            raise CwaDatabaseError(f"Invalid region at row {idx}: must be a non-empty string.")

    # Check fetched_at uniformity and timezone awareness
    first_fetched = df["fetched_at"].iloc[0]
    if not _is_timezone_aware(first_fetched):
        raise CwaDatabaseError("Timestamp 'fetched_at' is timezone-naive; timezone-aware UTC is required.")

    # Check forecast timestamps, intervals, and temperatures
    for idx, row in df.iterrows():
        start = row["forecast_start"]
        end = row["forecast_end"]
        fetched = row["fetched_at"]

        if not _is_timezone_aware(start):
            raise CwaDatabaseError(f"Row {idx}: 'forecast_start' is timezone-naive.")
        if not _is_timezone_aware(end):
            raise CwaDatabaseError(f"Row {idx}: 'forecast_end' is timezone-naive.")
        if not _is_timezone_aware(fetched):
            raise CwaDatabaseError(f"Row {idx}: 'fetched_at' is timezone-naive.")

        # Uniform fetched_at check across all rows
        if fetched != first_fetched:
            raise CwaDatabaseError(
                "Mixed fetched_at values detected in batch; all rows must share the same snapshot timestamp."
            )

        # Interval logic: start must be earlier than end
        if start >= end:
            raise CwaDatabaseError(
                f"Row {idx}: 'forecast_start' ({start}) must be strictly earlier than 'forecast_end' ({end})."
            )

        # Temperature logic: numeric checks and min <= max
        min_val = row["min_temp"]
        max_val = row["max_temp"]

        min_f: Optional[float] = None
        max_f: Optional[float] = None

        if not pd.isna(min_val):
            try:
                min_f = float(min_val)
            except (ValueError, TypeError):
                raise CwaDatabaseError(f"Row {idx}: 'min_temp' is non-numeric.")

        if not pd.isna(max_val):
            try:
                max_f = float(max_val)
            except (ValueError, TypeError):
                raise CwaDatabaseError(f"Row {idx}: 'max_temp' is non-numeric.")

        if min_f is not None and max_f is not None:
            if min_f > max_f:
                raise CwaDatabaseError(
                    f"Row {idx}: min_temp ({min_f}) cannot be greater than max_temp ({max_f})."
                )


def _prepare_row_params(row: pd.Series, dataset_id: str) -> Tuple[Any, ...]:
    """Convert a validated DataFrame row into a parameterized SQLite tuple."""
    clean_region = str(row["region"]).strip()

    # Preserve original timezone offset (e.g. +08:00) for forecast intervals
    start_dt = row["forecast_start"]
    if hasattr(start_dt, "to_pydatetime"):
        start_dt = start_dt.to_pydatetime()
    start_str = start_dt.isoformat()

    end_dt = row["forecast_end"]
    if hasattr(end_dt, "to_pydatetime"):
        end_dt = end_dt.to_pydatetime()
    end_str = end_dt.isoformat()

    # Normalize fetched_at to UTC
    fetch_dt = row["fetched_at"]
    if hasattr(fetch_dt, "to_pydatetime"):
        fetch_dt = fetch_dt.to_pydatetime()
    fetched_utc_str = fetch_dt.astimezone(timezone.utc).isoformat()

    # Map NaN / pd.NA to SQL NULL (None)
    min_temp = None if pd.isna(row["min_temp"]) else float(row["min_temp"])
    max_temp = None if pd.isna(row["max_temp"]) else float(row["max_temp"])

    return (
        dataset_id.strip(),
        clean_region,
        start_str,
        end_str,
        min_temp,
        max_temp,
        fetched_utc_str,
    )


def initialize_database(db_path: str = "data/weather.db") -> None:
    """Initialize the SQLite database and create weather_forecasts table if not present.

    Args:
        db_path: Path to the SQLite database file.

    Raises:
        CwaDatabaseError: If directory creation or table initialization fails.
    """
    db_dir = os.path.dirname(os.path.abspath(db_path))
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    conn = sqlite3.connect(db_path)
    try:
        conn.execute("BEGIN")
        conn.execute(CREATE_TABLE_SQL)
        conn.commit()
    except sqlite3.Error as exc:
        conn.rollback()
        raise CwaDatabaseError(f"Failed to initialize database schema at '{db_path}': {exc}") from exc
    finally:
        conn.close()


def insert_forecasts(
    df: pd.DataFrame,
    db_path: str = "data/weather.db",
    dataset_id: str = "F-D0047-091",
) -> InsertResult:
    """Insert forecast records transactionally with duplicate snapshot prevention.

    Args:
        df: Validated DataFrame containing forecast records.
        db_path: Destination SQLite database path.
        dataset_id: CWA dataset identifier.

    Returns:
        InsertResult: Dataclass reporting attempted_rows, inserted_rows, duplicate_rows.

    Raises:
        CwaDatabaseError: If validation fails or an unexpected database error occurs.
    """
    # Step 1: Pre-insert validation occurs before opening transaction
    validate_dataframe_for_insert(df, dataset_id)

    # Step 2: Ensure database and schema exist
    initialize_database(db_path)

    # Step 3: Prepare parameterized values
    param_rows = [_prepare_row_params(row, dataset_id) for _, row in df.iterrows()]
    attempted_rows = len(param_rows)

    # Step 4: Execute single transaction with explicit commit/rollback
    conn = sqlite3.connect(db_path)
    try:
        changes_before = conn.total_changes
        conn.execute("BEGIN")
        conn.executemany(INSERT_FORECAST_SQL, param_rows)

        changes_after = conn.total_changes
        inserted_rows = changes_after - changes_before

        if not (0 <= inserted_rows <= attempted_rows):
            conn.rollback()
            raise CwaDatabaseError(
                f"Database insertion count ({inserted_rows}) is outside expected range [0, {attempted_rows}]."
            )

        duplicate_rows = attempted_rows - inserted_rows
        if duplicate_rows < 0:
            conn.rollback()
            raise CwaDatabaseError(
                f"Calculated duplicate count ({duplicate_rows}) cannot be negative."
            )

        conn.commit()

        return InsertResult(
            attempted_rows=attempted_rows,
            inserted_rows=inserted_rows,
            duplicate_rows=duplicate_rows,
        )
    except sqlite3.Error as exc:
        conn.rollback()
        raise CwaDatabaseError(f"Database insertion error at '{db_path}': {exc}") from exc
    finally:
        conn.close()


def get_total_forecast_count(db_path: str = "data/weather.db") -> int:
    """Return total row count in weather_forecasts table.

    Args:
        db_path: Path to the SQLite database.

    Returns:
        int: Number of rows in weather_forecasts table, or 0 if database/table absent.

    Raises:
        CwaDatabaseError: If query fails.
    """
    if not os.path.exists(db_path):
        return 0

    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM weather_forecasts")
        row = cursor.fetchone()
        return int(row[0]) if row else 0
    except sqlite3.Error as exc:
        raise CwaDatabaseError(f"Failed to query forecast count from '{db_path}': {exc}") from exc
    finally:
        conn.close()
