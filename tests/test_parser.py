"""Unit tests for CWA forecast data parser (M2).

Tests data cleaning, interval matching, timestamp handling, tolerance to malformed inputs,
and deterministic behavior using a sanitized JSON fixture.
"""

from datetime import datetime, timezone, timedelta
import json
import os
import numpy as np
import pandas as pd
import pytest

from src.parser import CwaParseError, parse_forecast_data

FIXTURE_PATH = os.path.join(
    os.path.dirname(__file__), "fixtures", "cwa_fd0047_sample.json"
)


@pytest.fixture
def sample_payload():
    """Load the sanitized CWA F-D0047-091 sample fixture."""
    with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


class TestParseForecastData:
    """Test suite for parse_forecast_data()."""

    def test_parse_valid_fixture(self, sample_payload):
        """Verify normal parsing of the 2-location, 2-interval sample fixture."""
        fixed_time = datetime(2026, 9, 20, 10, 0, 0, tzinfo=timezone.utc)
        df = parse_forecast_data(sample_payload, fetched_at=fixed_time)

        # Check DataFrame structure
        expected_columns = [
            "region",
            "forecast_start",
            "forecast_end",
            "min_temp",
            "max_temp",
            "fetched_at",
        ]
        assert list(df.columns) == expected_columns
        # 2 locations × 2 intervals = 4 rows
        assert len(df) == 4

        # Check sorting: first by region (新北市 then 臺北市), then forecast_start
        assert df["region"].tolist() == ["新北市", "新北市", "臺北市", "臺北市"]
        assert df["forecast_start"].iloc[0] <= df["forecast_start"].iloc[1]
        assert df["forecast_start"].iloc[2] <= df["forecast_start"].iloc[3]

        # Check Pandas dtypes
        assert pd.api.types.is_float_dtype(df["min_temp"])
        assert pd.api.types.is_float_dtype(df["max_temp"])
        assert pd.api.types.is_datetime64_any_dtype(df["forecast_start"])
        assert pd.api.types.is_datetime64_any_dtype(df["forecast_end"])
        assert pd.api.types.is_datetime64_any_dtype(df["fetched_at"])

    def test_matching_by_interval_not_list_position(self, sample_payload):
        """Verify that MinT and MaxT are matched by time interval, not array index.

        In the fixture, 臺北市 has:
        - 最高溫度: Interval 1 (18:00->06:00, 28°C), Interval 2 (06:00->18:00, 32°C)
        - 最低溫度: Interval 2 (06:00->18:00, 25°C), Interval 1 (18:00->06:00, 23°C) [REVERSED]
        """
        df = parse_forecast_data(sample_payload)
        taipei = df[df["region"] == "臺北市"].reset_index(drop=True)

        # Row 0: Interval 1 (starts at 18:00)
        row0 = taipei.iloc[0]
        assert row0["min_temp"] == 23.0
        assert row0["max_temp"] == 28.0

        # Row 1: Interval 2 (starts at 06:00 next day)
        row1 = taipei.iloc[1]
        assert row1["min_temp"] == 25.0
        assert row1["max_temp"] == 32.0

    def test_timezone_aware_timestamps(self, sample_payload):
        """Verify that timestamps preserve timezone awareness (+08:00)."""
        df = parse_forecast_data(sample_payload)
        start_ts = df["forecast_start"].iloc[0]
        tz8 = timezone(timedelta(hours=8))
        # Ensure timestamp has tzinfo and offset matches +08:00
        assert start_ts.tzinfo is not None
        assert start_ts.utcoffset() == timedelta(hours=8)

    def test_deterministic_injected_fetched_at(self, sample_payload):
        """Verify that injected fetched_at is applied uniformly to all rows."""
        fixed_dt = datetime(2026, 9, 20, 15, 30, 0, tzinfo=timezone.utc)
        df = parse_forecast_data(sample_payload, fetched_at=fixed_dt)
        for val in df["fetched_at"]:
            assert val == fixed_dt

    def test_naive_fetched_at_raises_parse_error(self, sample_payload):
        """Verify that injecting a timezone-naive fetched_at raises CwaParseError."""
        naive_dt = datetime(2026, 9, 20, 15, 30, 0)  # No tzinfo
        with pytest.raises(CwaParseError, match="must be a timezone-aware datetime"):
            parse_forecast_data(sample_payload, fetched_at=naive_dt)

    def test_missing_root_structures(self):
        """Verify CwaParseError on malformed root structures."""
        with pytest.raises(CwaParseError, match="missing 'records' object"):
            parse_forecast_data({"success": "true"})

        with pytest.raises(CwaParseError, match="missing or empty 'records.Locations'"):
            parse_forecast_data({"success": "true", "records": {"Locations": []}})

        with pytest.raises(CwaParseError, match="missing or empty 'Location' list"):
            parse_forecast_data({"success": "true", "records": {"Locations": [{"Location": []}]}})

    def test_missing_location_name_skipped_with_warning(self, sample_payload):
        """Verify that a location missing LocationName emits a warning and is skipped."""
        # Insert a corrupt location missing LocationName
        corrupt_loc = {"WeatherElement": []}
        sample_payload["records"]["Locations"][0]["Location"].insert(0, corrupt_loc)

        with pytest.warns(UserWarning, match="missing valid 'LocationName'"):
            df = parse_forecast_data(sample_payload)

        # Valid locations still parsed (2 locations × 2 = 4 rows)
        assert len(df) == 4
        assert "臺北市" in df["region"].values

    def test_single_corrupt_location_isolation(self, sample_payload):
        """Verify that one malformed location does not prevent parsing valid ones."""
        # Corrupt the first location's WeatherElement
        sample_payload["records"]["Locations"][0]["Location"][0]["WeatherElement"] = "corrupt-string"

        with pytest.warns(UserWarning, match="'WeatherElement' is missing or not a list"):
            df = parse_forecast_data(sample_payload)

        # Second location should still be parsed (2 rows)
        assert len(df) == 2
        assert df["region"].unique().tolist() == ["新北市"]

    def test_mismatched_time_intervals_preserves_row_with_nan(self, sample_payload):
        """Verify that an interval existing only in MinT or MaxT is preserved with NaN."""
        # Add an extra interval only to 最高溫度
        loc = sample_payload["records"]["Locations"][0]["Location"][0]
        for elem in loc["WeatherElement"]:
            if elem["ElementName"] == "最高溫度":
                elem["Time"].append(
                    {
                        "StartTime": "2026-09-22T06:00:00+08:00",
                        "EndTime": "2026-09-22T18:00:00+08:00",
                        "ElementValue": [{"MaxTemperature": "35"}],
                    }
                )

        with pytest.warns(UserWarning, match="missing 最低溫度; preserved with NaN"):
            df = parse_forecast_data(sample_payload)

        # 臺北市 should now have 3 intervals
        taipei = df[df["region"] == "臺北市"]
        assert len(taipei) == 3
        extra_row = taipei[taipei["forecast_start"] == pd.Timestamp("2026-09-22 06:00:00+08:00")]
        assert len(extra_row) == 1
        assert np.isnan(extra_row["min_temp"].iloc[0])
        assert extra_row["max_temp"].iloc[0] == 35.0

    def test_malformed_temperature_converted_to_nan(self, sample_payload):
        """Verify non-numeric or N/A temperature string is converted to NaN with a warning."""
        loc = sample_payload["records"]["Locations"][0]["Location"][0]
        for elem in loc["WeatherElement"]:
            if elem["ElementName"] == "最高溫度":
                elem["Time"][0]["ElementValue"][0]["MaxTemperature"] = "N/A"

        with pytest.warns(UserWarning, match="missing or empty temperature value converted to NaN"):
            df = parse_forecast_data(sample_payload)

        taipei = df[df["region"] == "臺北市"].iloc[0]
        assert np.isnan(taipei["max_temp"])
        assert taipei["min_temp"] == 23.0

    def test_duplicate_interval_policy_keeps_last_value(self, sample_payload):
        """Verify that duplicate (start, end) intervals emit warning and keep the last value."""
        loc = sample_payload["records"]["Locations"][0]["Location"][0]
        for elem in loc["WeatherElement"]:
            if elem["ElementName"] == "最高溫度":
                # Duplicate the first interval with a different value (28 -> 39)
                elem["Time"].append(
                    {
                        "StartTime": "2026-09-20T18:00:00+08:00",
                        "EndTime": "2026-09-21T06:00:00+08:00",
                        "ElementValue": [{"MaxTemperature": "39"}],
                    }
                )

        with pytest.warns(UserWarning, match="duplicate interval.*found; keeping last value"):
            df = parse_forecast_data(sample_payload)

        taipei = df[df["region"] == "臺北市"].iloc[0]
        # Should have kept 39 instead of 28
        assert taipei["max_temp"] == 39.0

    def test_empty_result_raises_cwa_parse_error(self):
        """Verify CwaParseError when no valid records can be extracted."""
        empty_payload = {
            "success": "true",
            "records": {
                "Locations": [
                    {
                        "Location": [
                            {"LocationName": "", "WeatherElement": []}
                        ]
                    }
                ]
            },
        }
        with pytest.raises(CwaParseError, match="No valid forecast records could be extracted"):
            parse_forecast_data(empty_payload)
