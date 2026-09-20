"""Unit tests for SQLite persistence module (M3).

All tests use pytest tmp_path and never touch production data/weather.db.
"""

from datetime import datetime, timedelta, timezone
import json
import os
import sqlite3
import numpy as np
import pandas as pd
import pytest

from src.database import (
    CwaDatabaseError,
    InsertResult,
    get_total_forecast_count,
    initialize_database,
    insert_forecasts,
)
from src.parser import parse_forecast_data

FIXTURE_PATH = os.path.join(
    os.path.dirname(__file__), "fixtures", "cwa_fd0047_sample.json"
)


@pytest.fixture
def valid_df():
    """Produce a clean, validated test DataFrame from the sample fixture."""
    with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    fixed_time = datetime(2026, 9, 20, 12, 0, 0, tzinfo=timezone.utc)
    return parse_forecast_data(data, fetched_at=fixed_time)


@pytest.fixture
def temp_db(tmp_path):
    """Provide a path to a temporary SQLite database."""
    return str(tmp_path / "test_weather.db")


class TestDatabaseInitialization:
    """Test suite for initialize_database()."""

    def test_database_and_table_creation(self, temp_db):
        """Verify database and weather_forecasts table are created."""
        assert not os.path.exists(temp_db)
        initialize_database(temp_db)
        assert os.path.exists(temp_db)

        # Inspect table existence
        conn = sqlite3.connect(temp_db)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='weather_forecasts'"
        )
        assert cursor.fetchone() is not None
        conn.close()

    def test_initialize_idempotency(self, temp_db):
        """Verify initialize_database can be called repeatedly without error."""
        initialize_database(temp_db)
        initialize_database(temp_db)
        assert get_total_forecast_count(temp_db) == 0


class TestInsertForecasts:
    """Test suite for insert_forecasts() and duplicate handling."""

    def test_insert_valid_dataframe(self, valid_df, temp_db):
        """Verify inserting a valid DataFrame reports correct counts."""
        result = insert_forecasts(valid_df, db_path=temp_db)
        assert isinstance(result, InsertResult)
        assert result.attempted_rows == 4
        assert result.inserted_rows == 4
        assert result.duplicate_rows == 0
        assert get_total_forecast_count(temp_db) == 4

    def test_read_back_inserted_records(self, valid_df, temp_db):
        """Verify inserted rows can be queried back with accurate values."""
        insert_forecasts(valid_df, db_path=temp_db)
        conn = sqlite3.connect(temp_db)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT dataset_id, region, min_temp, max_temp FROM weather_forecasts ORDER BY region, forecast_start"
        )
        rows = cursor.fetchall()
        conn.close()

        assert len(rows) == 4
        assert rows[0][0] == "F-D0047-091"
        assert rows[0][1] == "新北市"
        assert rows[0][2] == 22.0
        assert rows[0][3] == 27.0

    def test_duplicate_insertion_creates_no_new_rows(self, valid_df, temp_db):
        """Verify exact same DataFrame inserted twice produces 0 new rows."""
        res1 = insert_forecasts(valid_df, db_path=temp_db)
        assert res1.inserted_rows == 4
        assert res1.duplicate_rows == 0

        # Second insert of identical DataFrame
        res2 = insert_forecasts(valid_df, db_path=temp_db)
        assert res2.attempted_rows == 4
        assert res2.inserted_rows == 0
        assert res2.duplicate_rows == 4
        # Total rows in DB remains 4
        assert get_total_forecast_count(temp_db) == 4

    def test_different_fetched_at_creates_new_snapshot(self, valid_df, temp_db):
        """Verify same forecast intervals with different fetched_at are stored as new snapshot."""
        insert_forecasts(valid_df, db_path=temp_db)
        assert get_total_forecast_count(temp_db) == 4

        # Create second snapshot with new fetched_at (+1 hour)
        df_snap2 = valid_df.copy()
        new_time = valid_df["fetched_at"].iloc[0] + timedelta(hours=1)
        df_snap2["fetched_at"] = new_time

        res2 = insert_forecasts(df_snap2, db_path=temp_db)
        assert res2.attempted_rows == 4
        assert res2.inserted_rows == 4
        assert res2.duplicate_rows == 0
        assert get_total_forecast_count(temp_db) == 8

    def test_two_regions_same_interval_stored_separately(self, valid_df, temp_db):
        """Verify different regions sharing the same interval do not collide."""
        insert_forecasts(valid_df, db_path=temp_db)
        conn = sqlite3.connect(temp_db)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT region FROM weather_forecasts")
        regions = {r[0] for r in cursor.fetchall()}
        conn.close()
        assert regions == {"臺北市", "新北市"}

    def test_nan_temperature_becomes_sql_null(self, valid_df, temp_db):
        """Verify that pandas NaN temperature values are stored as SQL NULL."""
        df_with_nan = valid_df.copy()
        df_with_nan.loc[0, "min_temp"] = np.nan

        insert_forecasts(df_with_nan, db_path=temp_db)
        conn = sqlite3.connect(temp_db)
        cursor = conn.cursor()
        cursor.execute("SELECT min_temp FROM weather_forecasts WHERE min_temp IS NULL")
        null_rows = cursor.fetchall()
        conn.close()

        assert len(null_rows) == 1
        assert null_rows[0][0] is None

    def test_iso_timestamps_preserve_offsets(self, valid_df, temp_db):
        """Verify stored forecast timestamps preserve original +08:00 offset string."""
        insert_forecasts(valid_df, db_path=temp_db)
        conn = sqlite3.connect(temp_db)
        cursor = conn.cursor()
        cursor.execute("SELECT forecast_start, fetched_at FROM weather_forecasts LIMIT 1")
        row = cursor.fetchone()
        conn.close()

        assert "+08:00" in row[0]
        assert "+00:00" in row[1]

    def test_fetched_at_normalized_to_utc(self, valid_df, temp_db):
        """Verify fetched_at supplied with non-UTC offset is normalized to UTC."""
        df_tokyo = valid_df.copy()
        # Tokyo is UTC+9; 21:00 Tokyo is 12:00 UTC
        tz_tokyo = timezone(timedelta(hours=9))
        tokyo_time = datetime(2026, 9, 20, 21, 0, 0, tzinfo=tz_tokyo)
        df_tokyo["fetched_at"] = tokyo_time

        insert_forecasts(df_tokyo, db_path=temp_db)
        conn = sqlite3.connect(temp_db)
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT fetched_at FROM weather_forecasts")
        stored_ts = cursor.fetchone()[0]
        conn.close()

        assert stored_ts == "2026-09-20T12:00:00+00:00"

    def test_sql_values_with_apostrophes_stored_safely(self, valid_df, temp_db):
        """Verify regions with quotes/apostrophes are safely handled by parameterization."""
        df_special = valid_df.copy()
        df_special["region"] = "O'Connor 縣"
        insert_forecasts(df_special, db_path=temp_db)

        conn = sqlite3.connect(temp_db)
        cursor = conn.cursor()
        cursor.execute("SELECT region FROM weather_forecasts LIMIT 1")
        stored_name = cursor.fetchone()[0]
        conn.close()

        assert stored_name == "O'Connor 縣"


class TestValidationBeforeInsert:
    """Test suite for validation rules in insert_forecasts()."""

    def test_empty_dataframe_rejected(self, temp_db):
        """Verify empty DataFrame raises CwaDatabaseError."""
        with pytest.raises(CwaDatabaseError, match="Cannot insert an empty DataFrame"):
            insert_forecasts(pd.DataFrame(), db_path=temp_db)

    def test_blank_dataset_id_rejected(self, valid_df, temp_db):
        """Verify blank or whitespace dataset_id is rejected."""
        with pytest.raises(CwaDatabaseError, match="dataset_id must be a non-empty string"):
            insert_forecasts(valid_df, db_path=temp_db, dataset_id="   ")

    def test_missing_columns_rejected(self, valid_df, temp_db):
        """Verify missing column raises CwaDatabaseError."""
        bad_df = valid_df.drop(columns=["min_temp"])
        with pytest.raises(CwaDatabaseError, match="missing required columns"):
            insert_forecasts(bad_df, db_path=temp_db)

    def test_blank_region_rejected(self, valid_df, temp_db):
        """Verify whitespace region raises CwaDatabaseError."""
        bad_df = valid_df.copy()
        bad_df.loc[0, "region"] = "   "
        with pytest.raises(CwaDatabaseError, match="Invalid region at row 0"):
            insert_forecasts(bad_df, db_path=temp_db)

    def test_naive_timestamp_rejected(self, valid_df, temp_db):
        """Verify timezone-naive timestamps are rejected."""
        bad_df = valid_df.copy()
        bad_df["forecast_start"] = pd.Series([datetime(2026, 9, 20, 12, 0)] * len(bad_df))
        with pytest.raises(CwaDatabaseError, match="timezone-naive"):
            insert_forecasts(bad_df, db_path=temp_db)

    def test_invalid_interval_rejected(self, valid_df, temp_db):
        """Verify forecast_start >= forecast_end is rejected."""
        bad_df = valid_df.copy()
        # Set start later than end
        bad_df.loc[0, "forecast_start"] = bad_df.loc[0, "forecast_end"] + timedelta(hours=1)
        with pytest.raises(CwaDatabaseError, match="strictly earlier than"):
            insert_forecasts(bad_df, db_path=temp_db)

    def test_min_temp_greater_than_max_rejected(self, valid_df, temp_db):
        """Verify min_temp > max_temp is rejected."""
        bad_df = valid_df.copy()
        bad_df.loc[0, "min_temp"] = 35.0
        bad_df.loc[0, "max_temp"] = 20.0
        with pytest.raises(CwaDatabaseError, match="min_temp .* cannot be greater than max_temp"):
            insert_forecasts(bad_df, db_path=temp_db)

    def test_mixed_fetched_at_rejected(self, valid_df, temp_db):
        """Verify mixed fetched_at values in one snapshot batch are rejected."""
        bad_df = valid_df.copy()
        bad_df.loc[1, "fetched_at"] = bad_df.loc[0, "fetched_at"] + timedelta(seconds=10)
        with pytest.raises(CwaDatabaseError, match="Mixed fetched_at values detected"):
            insert_forecasts(bad_df, db_path=temp_db)


class TestTransactionalRollback:
    """Test suite verifying transactional rollback behavior."""

    def test_failed_batch_rolls_back_completely(self, valid_df, temp_db):
        """Verify that a batch failure during execution rolls back without partial rows."""
        initialize_database(temp_db)
        # Add a trigger on weather_forecasts that deliberately raises an error on row 3
        conn = sqlite3.connect(temp_db)
        conn.execute(
            """
            CREATE TRIGGER fail_on_third_row
            BEFORE INSERT ON weather_forecasts
            WHEN (SELECT COUNT(*) FROM weather_forecasts) = 2
            BEGIN
                SELECT RAISE(ABORT, 'Simulated mid-batch database failure');
            END;
            """
        )
        conn.close()

        with pytest.raises(CwaDatabaseError, match="Database insertion error"):
            insert_forecasts(valid_df, db_path=temp_db)

        # Confirm rollback: table must be completely empty (0 rows)
        assert get_total_forecast_count(temp_db) == 0

    def test_unrelated_database_errors_not_treated_as_duplicates(self, valid_df, temp_db):
        """Verify that an unrelated database constraint failure raises CwaDatabaseError rather than being swallowed as a duplicate."""
        initialize_database(temp_db)
        conn = sqlite3.connect(temp_db)
        conn.execute(
            """
            CREATE TRIGGER check_temp_constraint
            BEFORE INSERT ON weather_forecasts
            WHEN NEW.min_temp < 50
            BEGIN
                SELECT RAISE(FAIL, 'CHECK constraint failed: min_temp too low');
            END;
            """
        )
        conn.close()

        with pytest.raises(CwaDatabaseError, match="Database insertion error"):
            insert_forecasts(valid_df, db_path=temp_db)

        # Verify nothing was inserted
        assert get_total_forecast_count(temp_db) == 0
