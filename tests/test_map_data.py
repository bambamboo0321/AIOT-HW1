"""Unit tests for Taiwan map data, coordinates, and marker preparation module (M6).

Tests cover:
- Coordinate completeness (22 CWA regions) and boundary ranges.
- Duplicate and invalid coordinate source validation.
- Fixed temperature color threshold boundaries (19.9, 20.0, 24.9, 25.0, 29.9, 30.0, NaN).
- Safe HTML escaping and popup formatting (N/A vs nan).
- Clear separation between missing coordinates and missing forecast regions.
- Viewport bounding box calculation for Folium fit_bounds.
- Default map date selection (complete across all regions vs earliest fallback).
"""

from datetime import date, datetime, timedelta, timezone
import html
import numpy as np
import pandas as pd
import pytest

from src.map_data import (
    EXPECTED_TAIWAN_REGIONS,
    TAIWAN_REGION_COORDINATES,
    _REGION_COORDINATE_ENTRIES,
    _validate_and_build_coordinate_dict,
    compute_bounds,
    get_default_map_date,
    get_temperature_color,
    prepare_map_markers,
)

TZ_TAIPEI = timezone(timedelta(hours=8))


class TestCoordinateValidation:
    """Tests for static coordinate definitions and integrity checks."""

    def test_coordinate_exact_keys_and_length(self):
        """Verify dictionary contains exactly the expected 22 CWA regions."""
        assert len(TAIWAN_REGION_COORDINATES) == 22
        assert set(TAIWAN_REGION_COORDINATES.keys()) == set(EXPECTED_TAIWAN_REGIONS)

    def test_coordinates_within_taiwan_bounding_box(self):
        """Verify all coordinates are valid WGS84 coordinates within greater Taiwan bounds.

        Greater Taiwan bounding box (including offshore islands Kinmen, Matsu, Penghu):
        - Latitude: 21.0 to 27.0 N
        - Longitude: 118.0 to 123.0 E
        """
        for region, (lat, lon) in TAIWAN_REGION_COORDINATES.items():
            assert 21.0 <= lat <= 27.0, f"{region} latitude {lat} out of bounds."
            assert 118.0 <= lon <= 123.0, f"{region} longitude {lon} out of bounds."

    def test_duplicate_source_entry_rejected(self):
        """Verify sequence validator catches duplicate region literals."""
        entries_with_dup = list(_REGION_COORDINATE_ENTRIES) + [
            ("臺北市", (25.0375, 121.5637))
        ]
        with pytest.raises(ValueError, match="Duplicate literal region key"):
            _validate_and_build_coordinate_dict(entries_with_dup)

    def test_out_of_bounds_lat_lon_rejected(self):
        """Verify invalid latitudes and longitudes raise ValueError."""
        bad_lat = [("臺北市", (95.0, 121.5))]
        with pytest.raises(ValueError, match="Latitude for 臺北市 .* is out of range"):
            _validate_and_build_coordinate_dict(bad_lat)

        bad_lon = [("臺北市", (25.0, 190.0))]
        with pytest.raises(ValueError, match="Longitude for 臺北市 .* is out of range"):
            _validate_and_build_coordinate_dict(bad_lon)

    def test_missing_or_extra_regions_rejected(self):
        """Verify incomplete or extra regions raise ValueError."""
        # Only 1 region
        incomplete = [("臺北市", (25.0375, 121.5637))]
        with pytest.raises(ValueError, match="Coordinate mapping does not match"):
            _validate_and_build_coordinate_dict(incomplete)


class TestTemperatureColorBoundaries:
    """Tests for exact marker color boundary values."""

    def test_color_boundary_19_9(self):
        """19.9 °C must be 'blue' (< 20.0)."""
        assert get_temperature_color(19.9) == "blue"

    def test_color_boundary_20_0(self):
        """20.0 °C must be 'green' (20.0 <= temp < 25.0)."""
        assert get_temperature_color(20.0) == "green"

    def test_color_boundary_24_9(self):
        """24.9 °C must be 'green' (20.0 <= temp < 25.0)."""
        assert get_temperature_color(24.9) == "green"

    def test_color_boundary_25_0(self):
        """25.0 °C must be 'orange' (25.0 <= temp < 30.0)."""
        assert get_temperature_color(25.0) == "orange"

    def test_color_boundary_29_9(self):
        """29.9 °C must be 'orange' (25.0 <= temp < 30.0)."""
        assert get_temperature_color(29.9) == "orange"

    def test_color_boundary_30_0(self):
        """30.0 °C must be 'red' (temp >= 30.0)."""
        assert get_temperature_color(30.0) == "red"

    def test_color_boundary_above_30(self):
        """35.5 °C must be 'red'."""
        assert get_temperature_color(35.5) == "red"

    def test_color_boundary_nan_and_none(self):
        """NaN and None must be 'gray'."""
        assert get_temperature_color(np.nan) == "gray"
        assert get_temperature_color(None) == "gray"
        assert get_temperature_color(float("nan")) == "gray"


class TestPrepareMapMarkers:
    """Tests for marker creation, HTML safety, and missing-data separation."""

    @pytest.fixture
    def full_22_region_daily_df(self):
        """Create a complete 22-region daily forecast fixture for 2026-09-22."""
        t_fetch = datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc)
        target_d = date(2026, 9, 22)
        rows = []
        for i, region in enumerate(EXPECTED_TAIWAN_REGIONS):
            rows.append(
                {
                    "region": region,
                    "forecast_date": target_d,
                    "min_temp": 22.0 + (i % 5),
                    "max_temp": 28.0 + (i % 6),
                    "interval_count": 2,
                    "is_partial": False,
                    "fetched_at": t_fetch,
                }
            )
        return pd.DataFrame(rows)

    def test_all_22_markers_render_for_complete_fixture(
        self, full_22_region_daily_df
    ):
        """Verify a complete 22-region dataset produces 22 markers and 0 missing items."""
        result = prepare_map_markers(
            full_22_region_daily_df, target_date=date(2026, 9, 22)
        )
        assert len(result.markers) == 22
        assert result.missing_coordinates == []
        assert result.missing_forecast_regions == []

        # Check marker details for 臺北市
        tpe = next(m for m in result.markers if m.region == "臺北市")
        assert tpe.latitude == TAIWAN_REGION_COORDINATES["臺北市"][0]
        assert tpe.longitude == TAIWAN_REGION_COORDINATES["臺北市"][1]
        assert tpe.data_status == "完整"
        assert "📍 臺北市" in tpe.popup_html
        assert "完整" in tpe.popup_html
        assert "nan" not in tpe.popup_html.lower()

    def test_missing_forecast_regions_reported_separately(
        self, full_22_region_daily_df
    ):
        """Verify regions absent from forecast data are in missing_forecast_regions."""
        # Drop 連江縣 and 金門縣 from forecast data
        subset = full_22_region_daily_df[
            ~full_22_region_daily_df["region"].isin(["連江縣", "金門縣"])
        ].copy()

        result = prepare_map_markers(subset, target_date=date(2026, 9, 22))
        assert len(result.markers) == 20
        assert result.missing_coordinates == []
        assert set(result.missing_forecast_regions) == {"金門縣", "連江縣"}


    def test_missing_coordinates_reported_separately(
        self, full_22_region_daily_df
    ):
        """Verify regions with forecast data but missing coordinates are in missing_coordinates."""
        # Custom coordinate dict missing "澎湖縣"
        custom_coords = {
            k: v for k, v in TAIWAN_REGION_COORDINATES.items() if k != "澎湖縣"
        }

        result = prepare_map_markers(
            full_22_region_daily_df,
            target_date=date(2026, 9, 22),
            coordinates=custom_coords,
        )
        assert len(result.markers) == 21
        assert result.missing_coordinates == ["澎湖縣"]
        # Since 澎湖縣 was in forecast data, it is NOT in missing_forecast_regions
        assert "澎湖縣" not in result.missing_forecast_regions

    def test_safe_marker_output_for_nan_temperatures(self):
        """Verify NaN temperatures produce 'N/A', never 'nan°C', and color 'gray'."""
        row = {
            "region": "臺北市",
            "forecast_date": date(2026, 9, 22),
            "min_temp": np.nan,
            "max_temp": None,
            "interval_count": 1,
            "is_partial": True,
            "fetched_at": datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc),
        }
        df = pd.DataFrame([row])
        result = prepare_map_markers(df, target_date=date(2026, 9, 22))
        assert len(result.markers) == 1
        marker = result.markers[0]

        assert marker.marker_color == "gray"
        assert marker.data_status == "部分資料"
        assert "N/A" in marker.popup_html
        assert "nan" not in marker.popup_html.lower()

    def test_html_escaping_in_popups(self):
        """Verify region names with HTML special characters are properly escaped."""
        row = {
            "region": "<script>alert('xss')</script>",
            "forecast_date": date(2026, 9, 22),
            "min_temp": 20.0,
            "max_temp": 26.0,
            "interval_count": 2,
            "is_partial": False,
            "fetched_at": datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc),
        }
        df = pd.DataFrame([row])
        custom_coords = {"<script>alert('xss')</script>": (25.0, 121.5)}
        result = prepare_map_markers(
            df, target_date=date(2026, 9, 22), coordinates=custom_coords
        )
        marker = result.markers[0]
        assert "<script>" not in marker.popup_html
        assert "&lt;script&gt;" in marker.popup_html


class TestComputeBounds:
    """Tests for viewport bounds calculation."""

    def test_compute_bounds_encloses_all_markers(self):
        """Verify computed bounding box covers the min/max latitude and longitude of all markers."""
        t_fetch = datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc)
        target_d = date(2026, 9, 22)
        rows = [
            {
                "region": r,
                "forecast_date": target_d,
                "min_temp": 20.0,
                "max_temp": 28.0,
                "interval_count": 2,
                "is_partial": False,
                "fetched_at": t_fetch,
            }
            for r in EXPECTED_TAIWAN_REGIONS
        ]
        result = prepare_map_markers(pd.DataFrame(rows), target_date=target_d)
        bounds = compute_bounds(result.markers)

        assert bounds is not None
        min_pt, max_pt = bounds[0], bounds[1]
        all_lats = [m.latitude for m in result.markers]
        all_lons = [m.longitude for m in result.markers]

        assert min_pt[0] == min(all_lats)
        assert min_pt[1] == min(all_lons)
        assert max_pt[0] == max(all_lats)
        assert max_pt[1] == max(all_lons)

    def test_compute_bounds_empty_markers(self):
        """Verify compute_bounds returns None when markers list is empty."""
        assert compute_bounds([]) is None


class TestGetDefaultMapDate:
    """Tests for default map date selection."""

    def test_selects_earliest_complete_date_across_all_regions(self):
        """When Day 1 is partial for at least one region, select Day 2 if Day 2 is complete."""
        t_fetch = datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc)
        d1 = date(2026, 9, 21)
        d2 = date(2026, 9, 22)
        rows = []
        for i, reg in enumerate(EXPECTED_TAIWAN_REGIONS):
            # On Day 1, region 0 is partial
            rows.append(
                {
                    "region": reg,
                    "forecast_date": d1,
                    "min_temp": 20.0,
                    "max_temp": 28.0,
                    "interval_count": 1 if i == 0 else 2,
                    "is_partial": (i == 0),
                    "fetched_at": t_fetch,
                }
            )
            # On Day 2, all 22 regions are complete
            rows.append(
                {
                    "region": reg,
                    "forecast_date": d2,
                    "min_temp": 21.0,
                    "max_temp": 29.0,
                    "interval_count": 2,
                    "is_partial": False,
                    "fetched_at": t_fetch,
                }
            )

        df = pd.DataFrame(rows)
        chosen = get_default_map_date(df, valid_dates=[d1, d2], expected_regions_count=22)
        # Must choose d2 because d1 had a partial region
        assert chosen == d2

    def test_fallback_to_earliest_date_if_no_date_is_complete(self):
        """When all available dates have partial data, fall back to earliest available date."""
        t_fetch = datetime(2026, 9, 20, 12, 0, tzinfo=timezone.utc)
        d1 = date(2026, 9, 21)
        d2 = date(2026, 9, 22)
        rows = [
            {
                "region": reg,
                "forecast_date": d1,
                "min_temp": 20.0,
                "max_temp": 28.0,
                "interval_count": 1,
                "is_partial": True,
                "fetched_at": t_fetch,
            }
            for reg in EXPECTED_TAIWAN_REGIONS
        ]
        df = pd.DataFrame(rows)
        chosen = get_default_map_date(df, valid_dates=[d1, d2], expected_regions_count=22)
        assert chosen == d1

    def test_empty_valid_dates(self):
        """Returns None if valid_dates is empty."""
        assert get_default_map_date(pd.DataFrame(), valid_dates=[]) is None
