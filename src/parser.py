"""CWA forecast JSON parsing and data cleaning module.

Transforms raw CWA F-D0047-091 JSON response into a clean, typed Pandas DataFrame.
Milestone: M2 — JSON Parsing and Data Cleaning
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import warnings
import numpy as np
import pandas as pd


class CwaParseError(Exception):
    """Raised when JSON payload is malformed or no valid rows can be parsed."""


def parse_forecast_data(
    raw_data: Dict[str, Any],
    fetched_at: Optional[datetime] = None,
) -> pd.DataFrame:
    """Parse raw CWA F-D0047-091 JSON into a standardized, sorted Pandas DataFrame.

    Output Columns:
        - region (str): County or city name.
        - forecast_start (datetime): Timezone-aware interval start (+08:00).
        - forecast_end (datetime): Timezone-aware interval end (+08:00).
        - min_temp (float): Minimum forecast temperature in °C.
        - max_temp (float): Maximum forecast temperature in °C.
        - fetched_at (datetime): Timezone-aware UTC timestamp generated once per parse.

    Args:
        raw_data: Decoded JSON dictionary from CWA API.
        fetched_at: Optional timezone-aware UTC datetime. If None, generated once.

    Returns:
        pd.DataFrame: Sorted DataFrame with reset index.

    Raises:
        CwaParseError: If input format is invalid, fetched_at is naive,
                       or no valid records can be produced.
    """
    # Step 1: Validate payload root structure
    if not isinstance(raw_data, dict):
        raise CwaParseError("Invalid payload: expected a JSON dictionary.")

    records = raw_data.get("records")
    if not isinstance(records, dict):
        raise CwaParseError("Invalid payload: missing 'records' object.")

    locations_container = records.get("Locations")
    if not isinstance(locations_container, list) or len(locations_container) == 0:
        raise CwaParseError("Invalid payload: missing or empty 'records.Locations'.")

    locations_group = locations_container[0]
    if not isinstance(locations_group, dict):
        raise CwaParseError("Invalid payload: 'Locations[0]' is not an object.")

    locations = locations_group.get("Location")
    if not isinstance(locations, list) or len(locations) == 0:
        raise CwaParseError("Invalid payload: missing or empty 'Location' list.")

    # Step 2: Resolve and validate fetched_at (must be timezone-aware)
    if fetched_at is None:
        fetched_at = datetime.now(timezone.utc)
    else:
        if fetched_at.tzinfo is None or fetched_at.tzinfo.utcoffset(fetched_at) is None:
            raise CwaParseError("Injected fetched_at must be a timezone-aware datetime.")

    # Step 3: Iterate through locations and build cleaned rows
    rows: List[Dict[str, Any]] = []

    for loc_idx, loc in enumerate(locations):
        if not isinstance(loc, dict):
            warnings.warn(
                f"Skipping malformed location at index {loc_idx}: not a dictionary.",
                UserWarning,
            )
            continue

        loc_name = loc.get("LocationName")
        if not loc_name or not isinstance(loc_name, str) or not loc_name.strip():
            identifier = loc_name if loc_name else f"index {loc_idx}"
            warnings.warn(
                f"Skipping malformed location at {identifier}: missing valid 'LocationName'.",
                UserWarning,
            )
            continue

        region_name = loc_name.strip()
        weather_elements = loc.get("WeatherElement")
        if not isinstance(weather_elements, list):
            warnings.warn(
                f"Skipping location '{region_name}': 'WeatherElement' is missing or not a list.",
                UserWarning,
            )
            continue

        # Find 最低溫度 and 最高溫度 elements regardless of list position
        mint_elem: Optional[Dict[str, Any]] = None
        maxt_elem: Optional[Dict[str, Any]] = None
        for elem in weather_elements:
            if isinstance(elem, dict):
                ename = elem.get("ElementName")
                if ename == "最低溫度":
                    mint_elem = elem
                elif ename == "最高溫度":
                    maxt_elem = elem

        if mint_elem is None and maxt_elem is None:
            warnings.warn(
                f"Skipping location '{region_name}': missing both '最低溫度' and '最高溫度' elements.",
                UserWarning,
            )
            continue

        def _extract_temp_map(
            elem: Optional[Dict[str, Any]], val_key: str, elem_label: str
        ) -> Dict[Tuple[datetime, datetime], float]:
            res: Dict[Tuple[datetime, datetime], float] = {}
            if not elem:
                return res
            time_list = elem.get("Time")
            if not isinstance(time_list, list):
                warnings.warn(
                    f"Location '{region_name}' element '{elem_label}': 'Time' is missing or not a list.",
                    UserWarning,
                )
                return res

            for t_idx, t_entry in enumerate(time_list):
                if not isinstance(t_entry, dict):
                    continue
                start_str = t_entry.get("StartTime")
                end_str = t_entry.get("EndTime")
                if not start_str or not end_str:
                    warnings.warn(
                        f"Location '{region_name}' element '{elem_label}' entry {t_idx}: missing StartTime or EndTime.",
                        UserWarning,
                    )
                    continue

                try:
                    start_dt = datetime.fromisoformat(start_str)
                    end_dt = datetime.fromisoformat(end_str)
                except (ValueError, TypeError):
                    warnings.warn(
                        f"Location '{region_name}' element '{elem_label}' entry {t_idx}: invalid timestamp format.",
                        UserWarning,
                    )
                    continue

                # Extract numeric value
                val_list = t_entry.get("ElementValue")
                val_raw = None
                if isinstance(val_list, list) and len(val_list) > 0 and isinstance(val_list[0], dict):
                    val_raw = val_list[0].get(val_key)

                temp_val: float = np.nan
                if val_raw is not None and str(val_raw).strip() != "" and str(val_raw).strip().upper() != "N/A":
                    try:
                        temp_val = float(val_raw)
                    except (ValueError, TypeError):
                        warnings.warn(
                            f"Location '{region_name}' interval {start_str} to {end_str}: non-numeric temperature {val_raw!r} converted to NaN.",
                            UserWarning,
                        )
                        temp_val = np.nan
                else:
                    warnings.warn(
                        f"Location '{region_name}' interval {start_str} to {end_str}: missing or empty temperature value converted to NaN.",
                        UserWarning,
                    )
                    temp_val = np.nan

                interval_key = (start_dt, end_dt)
                if interval_key in res:
                    warnings.warn(
                        f"Location '{region_name}' element '{elem_label}': duplicate interval {start_str} to {end_str} found; keeping last value.",
                        UserWarning,
                    )
                res[interval_key] = temp_val

            return res

        mint_map = _extract_temp_map(mint_elem, "MinTemperature", "最低溫度")
        maxt_map = _extract_temp_map(maxt_elem, "MaxTemperature", "最高溫度")

        # Union of time intervals
        all_intervals = sorted(set(mint_map.keys()) | set(maxt_map.keys()), key=lambda x: (x[0], x[1]))
        if not all_intervals:
            warnings.warn(
                f"Skipping location '{region_name}': no valid time intervals could be parsed.",
                UserWarning,
            )
            continue

        for start_dt, end_dt in all_intervals:
            has_min = (start_dt, end_dt) in mint_map
            has_max = (start_dt, end_dt) in maxt_map
            if not has_min or not has_max:
                missing_name = "最低溫度" if not has_min else "最高溫度"
                warnings.warn(
                    f"Location '{region_name}' interval {start_dt.isoformat()} to {end_dt.isoformat()}: missing {missing_name}; preserved with NaN.",
                    UserWarning,
                )

            min_v = mint_map.get((start_dt, end_dt), np.nan)
            max_v = maxt_map.get((start_dt, end_dt), np.nan)

            rows.append(
                {
                    "region": region_name,
                    "forecast_start": start_dt,
                    "forecast_end": end_dt,
                    "min_temp": min_v,
                    "max_temp": max_v,
                    "fetched_at": fetched_at,
                }
            )

    # Step 4: Ensure at least one valid record exists
    if not rows:
        raise CwaParseError("No valid forecast records could be extracted from payload.")

    # Step 5: Construct DataFrame with exact column ordering and numeric dtypes
    columns = [
        "region",
        "forecast_start",
        "forecast_end",
        "min_temp",
        "max_temp",
        "fetched_at",
    ]
    df = pd.DataFrame(rows, columns=columns)
    df["min_temp"] = pd.to_numeric(df["min_temp"], errors="coerce")
    df["max_temp"] = pd.to_numeric(df["max_temp"], errors="coerce")

    # Step 6: Sort and reset index
    df = df.sort_values(by=["region", "forecast_start", "forecast_end"]).reset_index(drop=True)
    return df
