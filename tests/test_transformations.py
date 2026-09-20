"""Unit tests for forecast data transformation and daily aggregation module (M5).

Tests cover interval aggregation, overnight assignment, chronological sorting,
partial day flagging, temperature extremes, null handling, immutability,
duplicate deduplication, and inclusive date filtering.
"""

from datetime import date, datetime, timedelta, timezone
import numpy as np
import pandas as pd
import pytest

from src.transformations import (
    CwaTransformationError,
    DAILY_COLUMNS,
    MULTI_DAILY_COLUMNS,
    TZ_TAIPEI,
    aggregate_daily_forecast,
    aggregate_daily_forecasts_by_region,
    filter_daily_forecast,
    filter_raw_forecast_by_dates,
)



@pytest.fixture
def base_fetched_at():
    """Consistent UTC snapshot timestamp."""
    return datetime(2026, 9, 20, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def sample_two_full_days_plus_partial(base_fetched_at):
    """Fixture with two complete days (2 intervals each) and one partial day (1 interval).

    - Day 1 (2026-09-21):
        - Interval 1: 06:00 -> 18:00 (min: 24.0, max: 32.0)
        - Interval 2: 18:00 -> 06:00 next day (min: 22.0, max: 27.0)
    - Day 2 (2026-09-22):
        - Interval 3: 06:00 -> 18:00 (min: 25.0, max: 33.0)
        - Interval 4: 18:00 -> 06:00 next day (min: 23.0, max: 28.0)
    - Day 3 (2026-09-23):
        - Interval 5: 06:00 -> 18:00 (min: 26.0, max: 34.0) (Partial: 1 interval)
    """
    rows = [
        # Day 1
        {
            "region": "臺北市",
            "forecast_start": datetime(2026, 9, 21, 6, 0, 0, tzinfo=TZ_TAIPEI),
            "forecast_end": datetime(2026, 9, 21, 18, 0, 0, tzinfo=TZ_TAIPEI),
            "min_temp": 24.0,
            "max_temp": 32.0,
            "fetched_at": base_fetched_at,
        },
        {
            "region": "臺北市",
            "forecast_start": datetime(2026, 9, 21, 18, 0, 0, tzinfo=TZ_TAIPEI),
            "forecast_end": datetime(2026, 9, 22, 6, 0, 0, tzinfo=TZ_TAIPEI),
            "min_temp": 22.0,
            "max_temp": 27.0,
            "fetched_at": base_fetched_at,
        },
        # Day 2
        {
            "region": "臺北市",
            "forecast_start": datetime(2026, 9, 22, 6, 0, 0, tzinfo=TZ_TAIPEI),
            "forecast_end": datetime(2026, 9, 22, 18, 0, 0, tzinfo=TZ_TAIPEI),
            "min_temp": 25.0,
            "max_temp": 33.0,
            "fetched_at": base_fetched_at,
        },
        {
            "region": "臺北市",
            "forecast_start": datetime(2026, 9, 22, 18, 0, 0, tzinfo=TZ_TAIPEI),
            "forecast_end": datetime(2026, 9, 23, 6, 0, 0, tzinfo=TZ_TAIPEI),
            "min_temp": 23.0,
            "max_temp": 28.0,
            "fetched_at": base_fetched_at,
        },
        # Day 3 (Partial)
        {
            "region": "臺北市",
            "forecast_start": datetime(2026, 9, 23, 6, 0, 0, tzinfo=TZ_TAIPEI),
            "forecast_end": datetime(2026, 9, 23, 18, 0, 0, tzinfo=TZ_TAIPEI),
            "min_temp": 26.0,
            "max_temp": 34.0,
            "fetched_at": base_fetched_at,
        },
    ]
    return pd.DataFrame(rows)


class TestDailyAggregationCore:
    """Test suite for core aggregation logic, overnight assignment, and partial days."""

    def test_two_12h_intervals_aggregate_into_one_daily_row(self, base_fetched_at):
        """Verify two 12-hour intervals on the same day aggregate into exactly 1 row."""
        df = pd.DataFrame(
            [
                {
                    "region": "臺北市",
                    "forecast_start": datetime(2026, 9, 21, 6, 0, 0, tzinfo=TZ_TAIPEI),
                    "forecast_end": datetime(2026, 9, 21, 18, 0, 0, tzinfo=TZ_TAIPEI),
                    "min_temp": 24.0,
                    "max_temp": 32.0,
                    "fetched_at": base_fetched_at,
                },
                {
                    "region": "臺北市",
                    "forecast_start": datetime(2026, 9, 21, 18, 0, 0, tzinfo=TZ_TAIPEI),
                    "forecast_end": datetime(2026, 9, 22, 6, 0, 0, tzinfo=TZ_TAIPEI),
                    "min_temp": 22.0,
                    "max_temp": 26.0,
                    "fetched_at": base_fetched_at,
                },
            ]
        )
        daily = aggregate_daily_forecast(df)
        assert len(daily) == 1
        row = daily.iloc[0]
        assert row["forecast_date"] == date(2026, 9, 21)
        assert row["min_temp"] == 22.0
        assert row["max_temp"] == 32.0
        assert row["interval_count"] == 2
        assert row["is_partial"] == False

    def test_overnight_interval_belongs_to_forecast_start_date(self, base_fetched_at):
        """Verify overnight interval (18:00 -> 06:00 next day) belongs to start date only."""
        df = pd.DataFrame(
            [
                {
                    "region": "臺北市",
                    "forecast_start": datetime(2026, 9, 21, 18, 0, 0, tzinfo=TZ_TAIPEI),
                    "forecast_end": datetime(2026, 9, 22, 6, 0, 0, tzinfo=TZ_TAIPEI),
                    "min_temp": 21.5,
                    "max_temp": 25.5,
                    "fetched_at": base_fetched_at,
                }
            ]
        )
        daily = aggregate_daily_forecast(df)
        assert len(daily) == 1
        assert daily["forecast_date"].iloc[0] == date(2026, 9, 21)
        assert daily["interval_count"].iloc[0] == 1
        assert daily["is_partial"].iloc[0] == True

    def test_input_order_does_not_affect_output(self, sample_two_full_days_plus_partial):
        """Verify shuffling input raw intervals produces identical sorted output."""
        shuffled = sample_two_full_days_plus_partial.sample(frac=1.0, random_state=42)
        res_normal = aggregate_daily_forecast(sample_two_full_days_plus_partial)
        res_shuffled = aggregate_daily_forecast(shuffled)
        pd.testing.assert_frame_equal(res_normal, res_shuffled)

    def test_multiple_dates_sorted_chronologically(self, sample_two_full_days_plus_partial):
        """Verify resulting DataFrame is sorted chronologically by forecast_date."""
        daily = aggregate_daily_forecast(sample_two_full_days_plus_partial)
        dates = list(daily["forecast_date"])
        assert dates == sorted(dates)
        assert dates == [date(2026, 9, 21), date(2026, 9, 22), date(2026, 9, 23)]

    def test_partial_day_preserved_and_flagged(self, sample_two_full_days_plus_partial):
        """Verify Day 3 with only 1 interval is preserved and flagged as partial."""
        daily = aggregate_daily_forecast(sample_two_full_days_plus_partial)
        assert len(daily) == 3
        day3 = daily[daily["forecast_date"] == date(2026, 9, 23)].iloc[0]
        assert day3["interval_count"] == 1
        assert day3["is_partial"] == True

    def test_complete_day_interval_count_and_partial_flag(
        self, sample_two_full_days_plus_partial
    ):
        """Verify Day 1 and Day 2 have interval_count=2 and is_partial=False."""
        daily = aggregate_daily_forecast(sample_two_full_days_plus_partial)
        day1 = daily[daily["forecast_date"] == date(2026, 9, 21)].iloc[0]
        assert day1["interval_count"] == 2
        assert day1["is_partial"] == False

        day2 = daily[daily["forecast_date"] == date(2026, 9, 22)].iloc[0]
        assert day2["interval_count"] == 2
        assert day2["is_partial"] == False

    def test_daily_min_temp_uses_min_across_intervals(
        self, sample_two_full_days_plus_partial
    ):
        """Verify min_temp evaluates to minimum among daytime and nighttime intervals."""
        daily = aggregate_daily_forecast(sample_two_full_days_plus_partial)
        day1 = daily[daily["forecast_date"] == date(2026, 9, 21)].iloc[0]
        # Intervals had min_temp: 24.0 and 22.0
        assert day1["min_temp"] == 22.0

    def test_daily_max_temp_uses_max_across_intervals(
        self, sample_two_full_days_plus_partial
    ):
        """Verify max_temp evaluates to maximum among daytime and nighttime intervals."""
        daily = aggregate_daily_forecast(sample_two_full_days_plus_partial)
        day1 = daily[daily["forecast_date"] == date(2026, 9, 21)].iloc[0]
        # Intervals had max_temp: 32.0 and 27.0
        assert day1["max_temp"] == 32.0


class TestDailyAggregationNullAndSpecialValues:
    """Test suite for null handling, deduplication, and timezone conversions."""

    def test_null_temperatures_handled_correctly(self, base_fetched_at):
        """Verify that when one interval has NaN, the valid interval temperature is used."""
        df = pd.DataFrame(
            [
                {
                    "region": "臺北市",
                    "forecast_start": datetime(2026, 9, 21, 6, 0, 0, tzinfo=TZ_TAIPEI),
                    "forecast_end": datetime(2026, 9, 21, 18, 0, 0, tzinfo=TZ_TAIPEI),
                    "min_temp": 24.0,
                    "max_temp": np.nan,
                    "fetched_at": base_fetched_at,
                },
                {
                    "region": "臺北市",
                    "forecast_start": datetime(2026, 9, 21, 18, 0, 0, tzinfo=TZ_TAIPEI),
                    "forecast_end": datetime(2026, 9, 22, 6, 0, 0, tzinfo=TZ_TAIPEI),
                    "min_temp": np.nan,
                    "max_temp": 28.0,
                    "fetched_at": base_fetched_at,
                },
            ]
        )
        daily = aggregate_daily_forecast(df)
        assert len(daily) == 1
        assert daily["min_temp"].iloc[0] == 24.0
        assert daily["max_temp"].iloc[0] == 28.0

    def test_all_null_daily_min_remains_nan(self, base_fetched_at):
        """Verify that when all min_temp values for a date are null, output remains NaN."""
        df = pd.DataFrame(
            [
                {
                    "region": "臺北市",
                    "forecast_start": datetime(2026, 9, 21, 6, 0, 0, tzinfo=TZ_TAIPEI),
                    "forecast_end": datetime(2026, 9, 21, 18, 0, 0, tzinfo=TZ_TAIPEI),
                    "min_temp": np.nan,
                    "max_temp": 30.0,
                    "fetched_at": base_fetched_at,
                }
            ]
        )
        daily = aggregate_daily_forecast(df)
        assert np.isnan(daily["min_temp"].iloc[0])
        assert daily["max_temp"].iloc[0] == 30.0

    def test_all_null_daily_max_remains_nan(self, base_fetched_at):
        """Verify that when all max_temp values for a date are null, output remains NaN."""
        df = pd.DataFrame(
            [
                {
                    "region": "臺北市",
                    "forecast_start": datetime(2026, 9, 21, 6, 0, 0, tzinfo=TZ_TAIPEI),
                    "forecast_end": datetime(2026, 9, 21, 18, 0, 0, tzinfo=TZ_TAIPEI),
                    "min_temp": 20.0,
                    "max_temp": np.nan,
                    "fetched_at": base_fetched_at,
                }
            ]
        )
        daily = aggregate_daily_forecast(df)
        assert daily["min_temp"].iloc[0] == 20.0
        assert np.isnan(daily["max_temp"].iloc[0])

    def test_empty_input_returns_empty_schema(self):
        """Verify empty input returns empty DataFrame with documented 6 columns."""
        daily = aggregate_daily_forecast(pd.DataFrame())
        assert daily.empty
        assert daily.columns.tolist() == DAILY_COLUMNS
        assert daily["interval_count"].dtype == "int64"
        assert daily["is_partial"].dtype == "bool"

    def test_duplicate_raw_intervals_not_double_counted(self, base_fetched_at):
        """Verify duplicate raw intervals in input are deduplicated deterministically."""
        df = pd.DataFrame(
            [
                {
                    "region": "臺北市",
                    "forecast_start": datetime(2026, 9, 21, 6, 0, 0, tzinfo=TZ_TAIPEI),
                    "forecast_end": datetime(2026, 9, 21, 18, 0, 0, tzinfo=TZ_TAIPEI),
                    "min_temp": 24.0,
                    "max_temp": 32.0,
                    "fetched_at": base_fetched_at,
                },
                # Duplicate identical interval
                {
                    "region": "臺北市",
                    "forecast_start": datetime(2026, 9, 21, 6, 0, 0, tzinfo=TZ_TAIPEI),
                    "forecast_end": datetime(2026, 9, 21, 18, 0, 0, tzinfo=TZ_TAIPEI),
                    "min_temp": 24.0,
                    "max_temp": 32.0,
                    "fetched_at": base_fetched_at,
                },
            ]
        )
        daily = aggregate_daily_forecast(df)
        assert len(daily) == 1
        # Deduplicated to 1 interval, so interval_count=1 and is_partial=True
        assert daily["interval_count"].iloc[0] == 1
        assert daily["is_partial"].iloc[0] == True

    def test_forecast_start_with_non_taipei_offset_converted_correctly(
        self, base_fetched_at
    ):
        """Verify forecast_start with non-Taipei aware offset (e.g. UTC) maps to Taipei date."""
        # 16:00 UTC on Sep 20 is 00:00 UTC+8 on Sep 21 in Taipei
        df = pd.DataFrame(
            [
                {
                    "region": "臺北市",
                    "forecast_start": datetime(2026, 9, 20, 16, 0, 0, tzinfo=timezone.utc),
                    "forecast_end": datetime(2026, 9, 21, 4, 0, 0, tzinfo=timezone.utc),
                    "min_temp": 23.0,
                    "max_temp": 28.0,
                    "fetched_at": base_fetched_at,
                }
            ]
        )
        daily = aggregate_daily_forecast(df)
        assert len(daily) == 1
        assert daily["forecast_date"].iloc[0] == date(2026, 9, 21)

    def test_fetched_at_remains_utc_aware(self, sample_two_full_days_plus_partial):
        """Verify output fetched_at preserves UTC timezone awareness."""
        daily = aggregate_daily_forecast(sample_two_full_days_plus_partial)
        for ts in daily["fetched_at"]:
            assert ts.tzinfo is not None
            assert ts.utcoffset() == timedelta(0)

    def test_original_input_dataframe_not_mutated(
        self, sample_two_full_days_plus_partial
    ):
        """Verify calling aggregate_daily_forecast does not modify input DataFrame."""
        original_copy = sample_two_full_days_plus_partial.copy(deep=True)
        _ = aggregate_daily_forecast(sample_two_full_days_plus_partial)
        pd.testing.assert_frame_equal(sample_two_full_days_plus_partial, original_copy)


class TestDailyAggregationValidationErrors:
    """Test suite verifying validation error conditions."""

    def test_mixed_regions_rejected(self, sample_two_full_days_plus_partial):
        """Verify input containing multiple regions raises CwaTransformationError."""
        bad_df = sample_two_full_days_plus_partial.copy()
        bad_df.loc[1, "region"] = "新北市"
        with pytest.raises(CwaTransformationError, match="multiple regions"):
            aggregate_daily_forecast(bad_df)

    def test_mixed_snapshots_rejected(self, sample_two_full_days_plus_partial):
        """Verify input containing multiple fetched_at snapshots raises CwaTransformationError."""
        bad_df = sample_two_full_days_plus_partial.copy()
        bad_df.loc[1, "fetched_at"] = bad_df.loc[0, "fetched_at"] + timedelta(hours=1)
        with pytest.raises(CwaTransformationError, match="multiple fetched_at snapshots"):
            aggregate_daily_forecast(bad_df)

    def test_naive_timestamps_rejected(self, sample_two_full_days_plus_partial):
        """Verify input with timezone-naive timestamps raises CwaTransformationError."""
        bad_df = sample_two_full_days_plus_partial.copy()
        bad_df["forecast_start"] = bad_df["forecast_start"].astype(object)
        bad_df.loc[0, "forecast_start"] = datetime(2026, 9, 21, 6, 0, 0)
        with pytest.raises(CwaTransformationError, match="timezone-naive"):
            aggregate_daily_forecast(bad_df)


class TestDailyDateFiltering:
    """Test suite for filter_daily_forecast and filter_raw_forecast_by_dates."""

    def test_filter_with_no_dates_returns_all_rows(
        self, sample_two_full_days_plus_partial
    ):
        """Verify passing no dates returns all aggregated rows."""
        daily = aggregate_daily_forecast(sample_two_full_days_plus_partial)
        filtered = filter_daily_forecast(daily, start_date=None, end_date=None)
        assert len(filtered) == len(daily)

    def test_filter_with_single_date(self, sample_two_full_days_plus_partial):
        """Verify filtering with identical start_date and end_date isolates single day."""
        daily = aggregate_daily_forecast(sample_two_full_days_plus_partial)
        filtered = filter_daily_forecast(
            daily, start_date=date(2026, 9, 22), end_date=date(2026, 9, 22)
        )
        assert len(filtered) == 1
        assert filtered["forecast_date"].iloc[0] == date(2026, 9, 22)

    def test_filter_with_inclusive_date_range(self, sample_two_full_days_plus_partial):
        """Verify inclusive bounds start_date <= forecast_date <= end_date."""
        daily = aggregate_daily_forecast(sample_two_full_days_plus_partial)
        filtered = filter_daily_forecast(
            daily, start_date=date(2026, 9, 21), end_date=date(2026, 9, 22)
        )
        assert len(filtered) == 2
        assert list(filtered["forecast_date"]) == [
            date(2026, 9, 21),
            date(2026, 9, 22),
        ]

    def test_filter_start_after_end_rejected(self, sample_two_full_days_plus_partial):
        """Verify start_date > end_date raises CwaTransformationError."""
        daily = aggregate_daily_forecast(sample_two_full_days_plus_partial)
        with pytest.raises(CwaTransformationError, match="cannot be later than"):
            filter_daily_forecast(
                daily, start_date=date(2026, 9, 23), end_date=date(2026, 9, 21)
            )

    def test_raw_filter_matches_daily_dates(self, sample_two_full_days_plus_partial):
        """Verify filter_raw_forecast_by_dates isolates matching raw 12-hour intervals."""
        # Filter for 2026-09-21: raw should have 2 intervals (both start on Sep 21)
        raw_filtered = filter_raw_forecast_by_dates(
            sample_two_full_days_plus_partial,
            start_date=date(2026, 9, 21),
            end_date=date(2026, 9, 21),
        )
        assert len(raw_filtered) == 2
        assert raw_filtered["forecast_start"].dt.date.iloc[0] == date(2026, 9, 21)
        assert raw_filtered["forecast_start"].dt.date.iloc[1] == date(2026, 9, 21)


class TestAggregateDailyForecastsByRegion:
    """Test suite for multi-region daily forecast aggregation."""

    @pytest.fixture
    def multi_region_raw_df(self, base_fetched_at):
        """Fixture with two regions across two calendar dates."""
        rows = [
            # 臺北市 - Day 1: 2 intervals (complete)
            {
                "region": "臺北市",
                "forecast_start": datetime(2026, 9, 21, 6, 0, 0, tzinfo=TZ_TAIPEI),
                "forecast_end": datetime(2026, 9, 21, 18, 0, 0, tzinfo=TZ_TAIPEI),
                "min_temp": 24.0,
                "max_temp": 32.0,
                "fetched_at": base_fetched_at,
            },
            {
                "region": "臺北市",
                "forecast_start": datetime(2026, 9, 21, 18, 0, 0, tzinfo=TZ_TAIPEI),
                "forecast_end": datetime(2026, 9, 22, 6, 0, 0, tzinfo=TZ_TAIPEI),
                "min_temp": 22.0,
                "max_temp": 26.0,
                "fetched_at": base_fetched_at,
            },
            # 臺北市 - Day 2: 1 interval (partial)
            {
                "region": "臺北市",
                "forecast_start": datetime(2026, 9, 22, 6, 0, 0, tzinfo=TZ_TAIPEI),
                "forecast_end": datetime(2026, 9, 22, 18, 0, 0, tzinfo=TZ_TAIPEI),
                "min_temp": 25.0,
                "max_temp": 33.0,
                "fetched_at": base_fetched_at,
            },
            # 高雄市 - Day 1: 2 intervals (complete)
            {
                "region": "高雄市",
                "forecast_start": datetime(2026, 9, 21, 6, 0, 0, tzinfo=TZ_TAIPEI),
                "forecast_end": datetime(2026, 9, 21, 18, 0, 0, tzinfo=TZ_TAIPEI),
                "min_temp": 27.0,
                "max_temp": 34.0,
                "fetched_at": base_fetched_at,
            },
            {
                "region": "高雄市",
                "forecast_start": datetime(2026, 9, 21, 18, 0, 0, tzinfo=TZ_TAIPEI),
                "forecast_end": datetime(2026, 9, 22, 6, 0, 0, tzinfo=TZ_TAIPEI),
                "min_temp": 26.0,
                "max_temp": 29.0,
                "fetched_at": base_fetched_at,
            },
            # 高雄市 - Day 2: 1 interval (partial)
            {
                "region": "高雄市",
                "forecast_start": datetime(2026, 9, 22, 6, 0, 0, tzinfo=TZ_TAIPEI),
                "forecast_end": datetime(2026, 9, 22, 18, 0, 0, tzinfo=TZ_TAIPEI),
                "min_temp": 28.0,
                "max_temp": 35.0,
                "fetched_at": base_fetched_at,
            },
        ]
        return pd.DataFrame(rows)

    def test_aggregate_multi_region_basic(self, multi_region_raw_df, base_fetched_at):
        """Verify multiple regions aggregate into per-region per-date daily rows."""
        daily_df = aggregate_daily_forecasts_by_region(multi_region_raw_df)
        assert len(daily_df) == 4
        assert list(daily_df.columns) == MULTI_DAILY_COLUMNS

        # Verify regions and sorting
        assert list(daily_df["region"].unique()) == ["臺北市", "高雄市"]

        # Check 臺北市 Day 1
        tpe_d1 = daily_df[(daily_df["region"] == "臺北市") & (daily_df["forecast_date"] == date(2026, 9, 21))].iloc[0]
        assert tpe_d1["min_temp"] == 22.0
        assert tpe_d1["max_temp"] == 32.0
        assert tpe_d1["interval_count"] == 2
        assert tpe_d1["is_partial"] is False or tpe_d1["is_partial"] == False

        # Check 高雄市 Day 2
        kh_d2 = daily_df[(daily_df["region"] == "高雄市") & (daily_df["forecast_date"] == date(2026, 9, 22))].iloc[0]
        assert kh_d2["min_temp"] == 28.0
        assert kh_d2["max_temp"] == 35.0
        assert kh_d2["interval_count"] == 1
        assert kh_d2["is_partial"] is True or kh_d2["is_partial"] == True

    def test_aggregate_multi_region_rejects_duplicate_intervals(
        self, multi_region_raw_df
    ):
        """Verify duplicate (region, forecast_start, forecast_end) rows raise CwaTransformationError.

        Proves that duplicate multi-region intervals are strictly rejected rather than
        silently deduplicated.
        """
        # Duplicate the first row of 臺北市
        dup_row = multi_region_raw_df.iloc[0:1].copy()
        df_with_dups = pd.concat([multi_region_raw_df, dup_row], ignore_index=True)

        with pytest.raises(
            CwaTransformationError,
            match="Duplicate \\(region, forecast_start, forecast_end\\) intervals",
        ):
            aggregate_daily_forecasts_by_region(df_with_dups)

    def test_aggregate_multi_region_mixed_snapshots_rejected(
        self, multi_region_raw_df
    ):
        """Verify mixed fetched_at values raise CwaTransformationError."""
        df_mixed = multi_region_raw_df.copy()
        df_mixed.loc[0, "fetched_at"] = datetime(2026, 9, 20, 18, 0, 0, tzinfo=timezone.utc)

        with pytest.raises(
            CwaTransformationError,
            match="Input DataFrame contains multiple fetched_at snapshots",
        ):
            aggregate_daily_forecasts_by_region(df_mixed)

    def test_aggregate_multi_region_naive_timestamps_rejected(
        self, multi_region_raw_df
    ):
        """Verify timezone-naive timestamps raise CwaTransformationError."""
        df_naive = multi_region_raw_df.copy()
        df_naive["forecast_start"] = df_naive["forecast_start"].astype(object)
        df_naive.loc[0, "forecast_start"] = datetime(2026, 9, 21, 6, 0, 0)

        with pytest.raises(
            CwaTransformationError,
            match="'forecast_start' is timezone-naive",
        ):
            aggregate_daily_forecasts_by_region(df_naive)


    def test_aggregate_multi_region_empty_dataframe(self):
        """Verify empty DataFrame returns empty multi-daily DataFrame with correct schema."""
        empty_df = pd.DataFrame(
            columns=[
                "region",
                "forecast_start",
                "forecast_end",
                "min_temp",
                "max_temp",
                "fetched_at",
            ]
        )
        res = aggregate_daily_forecasts_by_region(empty_df)
        assert res.empty
        assert list(res.columns) == MULTI_DAILY_COLUMNS

    def test_aggregate_multi_region_non_dataframe_rejected(self):
        """Verify non-DataFrame input raises CwaTransformationError."""
        with pytest.raises(
            CwaTransformationError, match="Input must be a pandas DataFrame"
        ):
            aggregate_daily_forecasts_by_region("not_a_df")  # type: ignore

    def test_aggregate_multi_region_missing_columns_rejected(self):
        """Verify missing required columns raise CwaTransformationError."""
        df = pd.DataFrame({"region": ["臺北市"], "forecast_start": [None]})
        with pytest.raises(
            CwaTransformationError, match="missing required columns"
        ):
            aggregate_daily_forecasts_by_region(df)
