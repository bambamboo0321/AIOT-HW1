"""Unit tests for SQLite query layer (M4).

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
    get_total_forecast_count,
    initialize_database,
    insert_forecasts,
)
from src.parser import parse_forecast_data
from src.queries import (
    CwaQueryError,
    QUERY_COLUMNS,
    TZ_TAIPEI,
    get_latest_snapshot_time,
    list_regions,
    query_forecasts,
)

FIXTURE_PATH = os.path.join(
    os.path.dirname(__file__), "fixtures", "cwa_fd0047_sample.json"
)


@pytest.fixture
def sample_payload():
    """Load the sanitized sample JSON fixture."""
    with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def snap1_df(sample_payload):
    """Snapshot 1 DataFrame at 2026-09-20 12:00:00 UTC."""
    t1 = datetime(2026, 9, 20, 12, 0, 0, tzinfo=timezone.utc)
    return parse_forecast_data(sample_payload, fetched_at=t1)


@pytest.fixture
def snap2_df(sample_payload):
    """Snapshot 2 DataFrame at 2026-09-20 18:00:00 UTC."""
    t2 = datetime(2026, 9, 20, 18, 0, 0, tzinfo=timezone.utc)
    return parse_forecast_data(sample_payload, fetched_at=t2)


@pytest.fixture
def multi_snap_db(tmp_path, snap1_df, snap2_df):
    """Database populated with two snapshots for F-D0047-091."""
    db_file = str(tmp_path / "multi_snap_weather.db")
    insert_forecasts(snap1_df, db_path=db_file, dataset_id="F-D0047-091")
    insert_forecasts(snap2_df, db_path=db_file, dataset_id="F-D0047-091")
    return db_file


@pytest.fixture
def empty_table_db(tmp_path):
    """Database initialized with table but 0 rows."""
    db_file = str(tmp_path / "empty_table.db")
    initialize_database(db_file)
    return db_file


class TestSnapshotSelection:
    """Test suite for snapshot resolution and isolation."""

    def test_latest_snapshot_time_from_multiple_snapshots(self, multi_snap_db):
        """Verify get_latest_snapshot_time returns the latest UTC datetime."""
        latest = get_latest_snapshot_time(multi_snap_db, dataset_id="F-D0047-091")
        assert latest is not None
        assert latest == datetime(2026, 9, 20, 18, 0, 0, tzinfo=timezone.utc)

    def test_latest_snapshot_is_selected_per_dataset_id(self, tmp_path, snap1_df, snap2_df):
        """Verify latest snapshot is dataset-specific, not global."""
        db_file = str(tmp_path / "two_datasets.db")
        # Dataset A has snap1 (12:00 UTC)
        insert_forecasts(snap1_df, db_path=db_file, dataset_id="DATASET-A")
        # Dataset B has snap2 (18:00 UTC)
        insert_forecasts(snap2_df, db_path=db_file, dataset_id="DATASET-B")

        latest_a = get_latest_snapshot_time(db_file, dataset_id="DATASET-A")
        latest_b = get_latest_snapshot_time(db_file, dataset_id="DATASET-B")

        assert latest_a == datetime(2026, 9, 20, 12, 0, 0, tzinfo=timezone.utc)
        assert latest_b == datetime(2026, 9, 20, 18, 0, 0, tzinfo=timezone.utc)

    def test_empty_table_returns_none_for_latest_snapshot(self, empty_table_db):
        """Verify get_latest_snapshot_time returns None when table has no rows."""
        res = get_latest_snapshot_time(empty_table_db)
        assert res is None

    def test_different_timezone_offset_locates_same_utc_snapshot(self, multi_snap_db):
        """Verify snapshot_at in UTC+8 correctly locates stored UTC snapshot."""
        # Snapshot 1 was stored as 12:00:00 UTC, which equals 20:00:00 UTC+8
        t_taipei = datetime(2026, 9, 20, 20, 0, 0, tzinfo=TZ_TAIPEI)
        df = query_forecasts(multi_snap_db, region="臺北市", snapshot_at=t_taipei)
        assert not df.empty
        assert df["fetched_at"].iloc[0] == datetime(2026, 9, 20, 12, 0, 0, tzinfo=timezone.utc)

    def test_default_query_returns_only_latest_snapshot(self, multi_snap_db):
        """Verify snapshot_at=None pulls exclusively from the latest snapshot."""
        df = query_forecasts(multi_snap_db, region="臺北市", snapshot_at=None)
        assert not df.empty
        assert df["fetched_at"].iloc[0] == datetime(2026, 9, 20, 18, 0, 0, tzinfo=timezone.utc)
        assert df["fetched_at"].nunique() == 1

    def test_explicit_historical_snapshot_returns_requested(self, multi_snap_db):
        """Verify explicit snapshot_at returns earlier snapshot records."""
        t_hist = datetime(2026, 9, 20, 12, 0, 0, tzinfo=timezone.utc)
        df = query_forecasts(multi_snap_db, region="臺北市", snapshot_at=t_hist)
        assert not df.empty
        assert df["fetched_at"].iloc[0] == t_hist

    def test_different_snapshots_never_mixed(self, multi_snap_db):
        """Verify results never mix rows from multiple snapshots."""
        df_latest = query_forecasts(multi_snap_db, region="臺北市")
        assert df_latest["fetched_at"].nunique() == 1

        t_hist = datetime(2026, 9, 20, 12, 0, 0, tzinfo=timezone.utc)
        df_hist = query_forecasts(multi_snap_db, region="臺北市", snapshot_at=t_hist)
        assert df_hist["fetched_at"].nunique() == 1


class TestListRegions:
    """Test suite for list_regions()."""

    def test_list_regions_uses_only_selected_or_latest_snapshot(self, tmp_path, snap1_df, snap2_df):
        """Verify list_regions inspects only the target snapshot."""
        db_file = str(tmp_path / "regions_diff.db")
        # Snap1 only has 臺北市
        df1 = snap1_df[snap1_df["region"] == "臺北市"]
        insert_forecasts(df1, db_path=db_file)

        # Snap2 has 新北市 and 臺北市
        insert_forecasts(snap2_df, db_path=db_file)

        # Latest (snap2) should have both
        latest_regions = list_regions(db_file)
        assert latest_regions == ["新北市", "臺北市"]

        # Historical (snap1) should have only 臺北市
        t1 = snap1_df["fetched_at"].iloc[0]
        hist_regions = list_regions(db_file, snapshot_at=t1)
        assert hist_regions == ["臺北市"]

    def test_list_regions_unique_and_deterministic(self, multi_snap_db):
        """Verify list_regions returns unique, deterministically ordered list."""
        r1 = list_regions(multi_snap_db)
        r2 = list_regions(multi_snap_db)
        assert r1 == r2
        assert len(r1) == len(set(r1))
        assert r1 == sorted(r1)

    def test_empty_table_returns_empty_list(self, empty_table_db):
        """Verify list_regions returns [] for an empty table."""
        assert list_regions(empty_table_db) == []


class TestQueryForecastsFilters:
    """Test suite for query_forecasts region and date filters."""

    def test_region_filter_returns_only_requested_region(self, multi_snap_db):
        """Verify region filter isolates specified region."""
        df = query_forecasts(multi_snap_db, region="新北市")
        assert not df.empty
        assert (df["region"] == "新北市").all()

    def test_unknown_region_returns_empty_typed_dataframe(self, multi_snap_db):
        """Verify querying an unknown region returns empty DataFrame with correct schema."""
        df = query_forecasts(multi_snap_db, region="不存在縣")
        assert df.empty
        assert df.columns.tolist() == QUERY_COLUMNS
        assert df["forecast_start"].dtype.name.startswith("datetime64")

    def test_blank_region_rejected(self, multi_snap_db):
        """Verify blank or whitespace region raises CwaQueryError."""
        with pytest.raises(CwaQueryError, match="region must be a non-empty string"):
            query_forecasts(multi_snap_db, region="   ")

    def test_date_range_overlap_behavior(self, multi_snap_db):
        """Verify half-open interval overlap [range_start, range_end)."""
        # In sample data, 臺北市 intervals are:
        # A: 2026-09-20 18:00:00+08:00 to 2026-09-21 06:00:00+08:00
        # B: 2026-09-21 06:00:00+08:00 to 2026-09-21 18:00:00+08:00
        t_start = datetime(2026, 9, 20, 18, 0, 0, tzinfo=TZ_TAIPEI)
        t_end = datetime(2026, 9, 21, 0, 0, 0, tzinfo=TZ_TAIPEI)

        # Range [18:00 Sep 20, 00:00 Sep 21):
        # Interval A (18:00 to 06:00) overlaps because end (06:00) > 18:00 and start (18:00) < 00:00.
        # Interval B (06:00 to 18:00) does NOT overlap because start (06:00) is NOT < 00:00.
        df = query_forecasts(multi_snap_db, region="臺北市", range_start=t_start, range_end=t_end)
        assert len(df) == 1
        assert df["forecast_start"].iloc[0] == pd.Timestamp("2026-09-20 18:00:00+08:00")

    def test_interval_crossing_midnight_included_correctly(self, multi_snap_db):
        """Verify interval crossing midnight (18:00 to 06:00) is included when selecting next day start."""
        # Range [2026-09-21 00:00, 2026-09-21 06:00)
        t_start = datetime(2026, 9, 21, 0, 0, 0, tzinfo=TZ_TAIPEI)
        t_end = datetime(2026, 9, 21, 6, 0, 0, tzinfo=TZ_TAIPEI)

        df = query_forecasts(multi_snap_db, region="臺北市", range_start=t_start, range_end=t_end)
        # Interval A ends at 06:00 on Sep 21 (> 00:00) and starts at 18:00 Sep 20 (< 06:00 Sep 21) -> Included
        # Interval B starts at 06:00 Sep 21 (not < 06:00) -> Excluded
        assert len(df) == 1
        assert df["forecast_start"].iloc[0] == pd.Timestamp("2026-09-20 18:00:00+08:00")
        assert df["forecast_end"].iloc[0] == pd.Timestamp("2026-09-21 06:00:00+08:00")

    def test_start_only_range_behavior(self, multi_snap_db):
        """Verify range_start only includes intervals ending after range_start."""
        t_start = datetime(2026, 9, 21, 6, 0, 0, tzinfo=TZ_TAIPEI)
        df = query_forecasts(multi_snap_db, region="臺北市", range_start=t_start)
        # Interval A ends at 06:00 (not > 06:00) -> Excluded
        # Interval B ends at 18:00 (> 06:00) -> Included
        assert len(df) == 1
        assert df["forecast_start"].iloc[0] == pd.Timestamp("2026-09-21 06:00:00+08:00")

    def test_end_only_range_behavior(self, multi_snap_db):
        """Verify range_end only includes intervals starting before range_end."""
        t_end = datetime(2026, 9, 21, 6, 0, 0, tzinfo=TZ_TAIPEI)
        df = query_forecasts(multi_snap_db, region="臺北市", range_end=t_end)
        # Interval A starts at 18:00 Sep 20 (< 06:00 Sep 21) -> Included
        # Interval B starts at 06:00 Sep 21 (not < 06:00 Sep 21) -> Excluded
        assert len(df) == 1
        assert df["forecast_start"].iloc[0] == pd.Timestamp("2026-09-20 18:00:00+08:00")

    def test_invalid_range_start_ge_end_rejected(self, multi_snap_db):
        """Verify range_start >= range_end raises CwaQueryError."""
        t_start = datetime(2026, 9, 21, 12, 0, 0, tzinfo=TZ_TAIPEI)
        t_end = datetime(2026, 9, 21, 0, 0, 0, tzinfo=TZ_TAIPEI)
        with pytest.raises(CwaQueryError, match="strictly earlier than"):
            query_forecasts(multi_snap_db, region="臺北市", range_start=t_start, range_end=t_end)

    def test_naive_range_timestamps_rejected(self, multi_snap_db):
        """Verify timezone-naive range timestamps raise CwaQueryError."""
        naive_dt = datetime(2026, 9, 21, 12, 0)
        with pytest.raises(CwaQueryError, match="range_start must be a timezone-aware datetime"):
            query_forecasts(multi_snap_db, region="臺北市", range_start=naive_dt)

        with pytest.raises(CwaQueryError, match="range_end must be a timezone-aware datetime"):
            query_forecasts(multi_snap_db, region="臺北市", range_end=naive_dt)

    def test_naive_snapshot_at_rejected(self, multi_snap_db):
        """Verify timezone-naive snapshot_at raises CwaQueryError."""
        naive_dt = datetime(2026, 9, 21, 12, 0)
        with pytest.raises(CwaQueryError, match="snapshot_at must be a timezone-aware datetime"):
            query_forecasts(multi_snap_db, region="臺北市", snapshot_at=naive_dt)
        with pytest.raises(CwaQueryError, match="snapshot_at must be a timezone-aware datetime"):
            list_regions(multi_snap_db, snapshot_at=naive_dt)


class TestQueryForecastsDataIntegrity:
    """Test suite for returned DataFrame structure, types, and SQL safety."""

    def test_returned_timestamps_are_timezone_aware(self, multi_snap_db):
        """Verify returned forecast timestamps have +08:00 timezone."""
        df = query_forecasts(multi_snap_db, region="臺北市")
        assert not df.empty
        assert str(df["forecast_start"].dt.tz) in ["UTC+08:00", "+08:00"]
        assert str(df["forecast_end"].dt.tz) in ["UTC+08:00", "+08:00"]

    def test_returned_fetched_at_is_utc(self, multi_snap_db):
        """Verify returned fetched_at is UTC."""
        df = query_forecasts(multi_snap_db, region="臺北市")
        assert not df.empty
        assert str(df["fetched_at"].dt.tz) in ["UTC", "UTC+00:00", "+00:00"]

    def test_returned_rows_are_sorted_and_index_reset(self, multi_snap_db):
        """Verify rows are sorted chronologically and index is 0..N-1."""
        df = query_forecasts(multi_snap_db, region="臺北市")
        assert list(df.index) == list(range(len(df)))
        assert df["forecast_start"].is_monotonic_increasing

    def test_null_temperatures_return_as_nan(self, tmp_path, snap1_df):
        """Verify SQL NULL temperatures return as np.nan."""
        db_file = str(tmp_path / "null_temp.db")
        snap_nan = snap1_df.copy()
        snap_nan.loc[0, "min_temp"] = np.nan
        insert_forecasts(snap_nan, db_path=db_file)

        df = query_forecasts(db_file, region=snap_nan.loc[0, "region"])
        assert pd.isna(df["min_temp"].iloc[0])

    def test_quotes_and_unicode_in_region_safe(self, tmp_path, snap1_df):
        """Verify region names with quotes, apostrophes, and Unicode are safely queried."""
        db_file = str(tmp_path / "special_region.db")
        snap_special = snap1_df.copy()
        special_name = "O'Connor 特區 測試"
        snap_special.loc[snap_special["region"] == "臺北市", "region"] = special_name
        insert_forecasts(snap_special, db_path=db_file)

        df = query_forecasts(db_file, region=special_name)
        assert len(df) == 2
        assert (df["region"] == special_name).all()

    def test_empty_dataframe_column_contract(self, empty_table_db):
        """Verify empty DataFrame contract returns exact 6 columns in documented order."""
        df = query_forecasts(empty_table_db, region="臺北市")
        assert df.empty
        assert df.columns.tolist() == QUERY_COLUMNS

    def test_queries_do_not_modify_database_row_counts(self, multi_snap_db):
        """Verify read-only queries do not alter database contents or row counts."""
        count_before = get_total_forecast_count(multi_snap_db)
        _ = get_latest_snapshot_time(multi_snap_db)
        _ = list_regions(multi_snap_db)
        _ = query_forecasts(multi_snap_db, region="臺北市")
        count_after = get_total_forecast_count(multi_snap_db)
        assert count_before == count_after


class TestDatabaseErrorHandlingAndPathUri:
    """Test suite for missing, unreadable, or special-character database paths."""

    def test_missing_database_file_behavior(self, tmp_path):
        """Verify querying non-existent database file raises CwaQueryError."""
        missing_db = str(tmp_path / "does_not_exist.db")
        with pytest.raises(CwaQueryError, match="Database file does not exist"):
            get_latest_snapshot_time(missing_db)

    def test_missing_table_behavior(self, tmp_path):
        """Verify database without weather_forecasts table raises CwaQueryError."""
        db_file = str(tmp_path / "no_table.db")
        conn = sqlite3.connect(db_file)
        conn.execute("CREATE TABLE other_table (id INT)")
        conn.commit()
        conn.close()

        with pytest.raises(CwaQueryError, match="Table 'weather_forecasts' does not exist"):
            get_latest_snapshot_time(db_file)

    def test_corrupt_database_behavior(self, tmp_path):
        """Verify corrupt database file raises CwaQueryError."""
        db_file = str(tmp_path / "corrupt.db")
        with open(db_file, "wb") as f:
            f.write(b"NOT_A_VALID_SQLITE_DATABASE_FILE_HEADER")

        with pytest.raises(CwaQueryError, match="Database access error"):
            get_latest_snapshot_time(db_file)

    def test_readonly_uri_with_spaces_and_unicode_and_symbols(self, tmp_path, snap1_df):
        """Verify pathlib URI construction safely handles spaces, Unicode, '#', '?', brackets."""
        special_dir = tmp_path / "天氣 測試 目錄 #1"
        special_dir.mkdir()
        db_file = str(special_dir / "天氣 預報 #2 ? [2026].db")

        insert_forecasts(snap1_df, db_path=db_file)
        assert os.path.exists(db_file)

        # Query through read-only URI
        latest = get_latest_snapshot_time(db_file)
        assert latest is not None
        regions = list_regions(db_file)
        assert len(regions) > 0
        df = query_forecasts(db_file, region=regions[0])
        assert not df.empty
