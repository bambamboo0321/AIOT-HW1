"""Taiwan geographic coordinate mapping and map marker preparation module.

Provides static, version-controlled WGS84 coordinates for all 22 CWA county/city
divisions, fixed temperature color thresholds, safe HTML popup formatting, and
viewport bounds calculation for the Folium map.

Coordinate Provenance:
----------------------
本專案使用手動整理的縣市政府所在地代表座標，僅供地圖視覺化，並非官方測量座標。
Coordinates in this module represent the primary administrative seats (City Hall
or County Government headquarters) for the 22 administrative divisions of Taiwan,
manually compiled from municipal and county government public address information.

Administrative Region and Boundary References:
- Ministry of the Interior (內政部地政司) Open Data:「直轄市、縣市界線（TWD97經緯度）」(https://data.gov.tw/dataset/7441)
  （僅作為行政區名稱與行政範圍之對照參考，非點座標直接來源）。


Datum: WGS84 (EPSG:4326)
Compiled / Accessed: September 2026

Note:
These coordinates serve solely as user-interface presentation metadata for
rendering regional map markers and do NOT represent specific meteorological
observation stations.

Milestone: M6 — Taiwan County Weather Map
"""


from dataclasses import dataclass
from datetime import date
import html
from typing import Any, Dict, List, Optional, Sequence, Tuple
import numpy as np
import pandas as pd

# Expected 22 CWA region names with traditional '臺' characters
EXPECTED_TAIWAN_REGIONS: Tuple[str, ...] = (
    "基隆市",
    "臺北市",
    "新北市",
    "桃園市",
    "新竹市",
    "新竹縣",
    "苗栗縣",
    "臺中市",
    "彰化縣",
    "南投縣",
    "雲林縣",
    "嘉義市",
    "嘉義縣",
    "臺南市",
    "高雄市",
    "屏東縣",
    "宜蘭縣",
    "花蓮縣",
    "臺東縣",
    "澎湖縣",
    "金門縣",
    "連江縣",
)

# Sequence of coordinate tuples: (region_name, (latitude, longitude))
# Using administrative centers (city/county halls) to ensure markers are placed
# in recognizable population hubs rather than uninhabited mountain peaks.
_REGION_COORDINATE_ENTRIES: Tuple[Tuple[str, Tuple[float, float]], ...] = (
    ("基隆市", (25.1323, 121.7404)),  # 基隆市政府 (中正區義一路1號)
    ("臺北市", (25.0375, 121.5637)),  # 臺北市政府 (信義區市府路1號)
    ("新北市", (25.0118, 121.4658)),  # 新北市政府 (板橋區中山路一段161號)
    ("桃園市", (24.9936, 121.3010)),  # 桃園市政府 (桃園區縣府路1號)
    ("新竹市", (24.8066, 120.9687)),  # 新竹市政府 (北區中正路120號)
    ("新竹縣", (24.8387, 121.0177)),  # 新竹縣政府 (竹北市光明六路10號)
    ("苗栗縣", (24.5602, 120.8214)),  # 苗栗縣政府 (苗栗市縣府路100號)
    ("臺中市", (24.1618, 120.6469)),  # 臺中市政府 (西屯區臺灣大道三段99號)
    ("彰化縣", (24.0754, 120.5447)),  # 彰化縣政府 (彰化市中山路二段416號)
    ("南投縣", (23.9100, 120.6860)),  # 南投縣政府 (南投市中興路660號)
    ("雲林縣", (23.7092, 120.5434)),  # 雲林縣政府 (斗六市雲林路二段515號)
    ("嘉義市", (23.4801, 120.4491)),  # 嘉義市政府 (東區中山路199號)
    ("嘉義縣", (23.4518, 120.2930)),  # 嘉義縣政府 (太保市祥和一路東段1號)
    ("臺南市", (22.9908, 120.1856)),  # 臺南市政府 (安平區永華路二段6號)
    ("高雄市", (22.6273, 120.3014)),  # 高雄市政府 (苓雅區四維三路2號)
    ("屏東縣", (22.6761, 120.4885)),  # 屏東縣政府 (屏東市自由路527號)
    ("宜蘭縣", (24.7308, 121.7634)),  # 宜蘭縣政府 (宜蘭市縣政北路1號)
    ("花蓮縣", (23.9872, 121.6016)),  # 花蓮縣政府 (花蓮市府前路17號)
    ("臺東縣", (22.7583, 121.1444)),  # 臺東縣政府 (臺東市中山路276號)
    ("澎湖縣", (23.5712, 119.5793)),  # 澎湖縣政府 (馬公市治平路32號)
    ("金門縣", (24.4327, 118.3226)),  # 金門縣政府 (金城鎮民生路60號)
    ("連江縣", (26.1558, 119.9519)),  # 連江縣政府 (南竿鄉介壽村76號)
)


def _validate_and_build_coordinate_dict(
    entries: Sequence[Tuple[str, Tuple[float, float]]]
) -> Dict[str, Tuple[float, float]]:
    """Validate uniqueness and boundary correctness before dictionary construction."""
    names_seen = []
    mapping: Dict[str, Tuple[float, float]] = {}

    for name, (lat, lon) in entries:
        if name in names_seen:
            raise ValueError(f"Duplicate literal region key in coordinate source: {name}")
        names_seen.append(name)

        if not (-90.0 <= lat <= 90.0):
            raise ValueError(f"Latitude for {name} ({lat}) is out of range [-90, 90].")
        if not (-180.0 <= lon <= 180.0):
            raise ValueError(f"Longitude for {name} ({lon}) is out of range [-180, 180].")

        mapping[name] = (lat, lon)

    if set(mapping.keys()) != set(EXPECTED_TAIWAN_REGIONS):
        missing = set(EXPECTED_TAIWAN_REGIONS) - set(mapping.keys())
        extra = set(mapping.keys()) - set(EXPECTED_TAIWAN_REGIONS)
        raise ValueError(
            f"Coordinate mapping does not match expected 22 CWA regions. Missing: {missing}, Extra: {extra}"
        )

    if len(mapping) != 22:
        raise ValueError(f"Expected exactly 22 coordinates, but got {len(mapping)}.")

    return mapping


TAIWAN_REGION_COORDINATES: Dict[str, Tuple[float, float]] = (
    _validate_and_build_coordinate_dict(_REGION_COORDINATE_ENTRIES)
)


def get_temperature_color(max_temp: Optional[float]) -> str:
    """Return marker color based on daily maximum forecast temperature.

    Fixed Thresholds:
        - max_temp < 20.0 °C: "blue" (偏涼 / 寒冷)
        - 20.0 <= max_temp < 25.0 °C: "green" (舒適)
        - 25.0 <= max_temp < 30.0 °C: "orange" (溫暖 / 偏熱)
        - max_temp >= 30.0 °C: "red" (炎熱)
        - missing / NaN: "gray" (資料缺失)

    Args:
        max_temp: Daily maximum forecast temperature in Celsius.

    Returns:
        str: Color string ('blue', 'green', 'orange', 'red', or 'gray').
    """
    if max_temp is None or pd.isna(max_temp):
        return "gray"

    val = float(max_temp)
    if val < 20.0:
        return "blue"
    if val < 25.0:
        return "green"
    if val < 30.0:
        return "orange"
    return "red"


@dataclass(frozen=True)
class MarkerData:
    """Structured data representation for a single map marker."""

    region: str
    latitude: float
    longitude: float
    forecast_date: date
    min_temp: Optional[float]
    max_temp: Optional[float]
    interval_count: int
    is_partial: bool
    marker_color: str
    data_status: str
    popup_html: str


@dataclass(frozen=True)
class MapMarkerResult:
    """Result summary of map marker preparation."""

    markers: List[MarkerData]
    missing_coordinates: List[str]
    missing_forecast_regions: List[str]


def prepare_map_markers(
    multi_daily_df: pd.DataFrame,
    target_date: date,
    coordinates: Optional[Dict[str, Tuple[float, float]]] = None,
) -> MapMarkerResult:
    """Filter daily forecasts for a target date and prepare map marker records.

    Distinguishes:
        - missing_coordinates: Forecast exists for region, but coordinate mapping is missing.
        - missing_forecast_regions: Region in EXPECTED_TAIWAN_REGIONS has no forecast for date.

    Args:
        multi_daily_df: Multi-region aggregated daily forecast DataFrame.
        target_date: Local calendar date to visualize.
        coordinates: Optional coordinate mapping (defaults to TAIWAN_REGION_COORDINATES).

    Returns:
        MapMarkerResult: Dataclass containing markers, missing coordinates, and missing regions.
    """
    if coordinates is None:
        coordinates = TAIWAN_REGION_COORDINATES

    if not isinstance(multi_daily_df, pd.DataFrame) or multi_daily_df.empty:
        return MapMarkerResult(
            markers=[],
            missing_coordinates=[],
            missing_forecast_regions=list(EXPECTED_TAIWAN_REGIONS),
        )

    # Filter for target date without mutating input
    date_df = multi_daily_df[multi_daily_df["forecast_date"] == target_date].copy()

    markers: List[MarkerData] = []
    missing_coords: List[str] = []
    present_regions = set()

    for _, row in date_df.iterrows():
        reg = str(row["region"]).strip()
        present_regions.add(reg)

        if reg not in coordinates:
            missing_coords.append(reg)
            continue

        lat, lon = coordinates[reg]
        min_v = float(row["min_temp"]) if pd.notna(row["min_temp"]) else None
        max_v = float(row["max_temp"]) if pd.notna(row["max_temp"]) else None
        cnt = int(row["interval_count"])
        is_part = bool(row["is_partial"])

        color = get_temperature_color(max_v)
        status_text = "部分資料" if is_part else "完整"

        # Safe formatting for HTML popup
        safe_region = html.escape(reg)
        min_display = f"{min_v:.1f} °C" if min_v is not None else "N/A"
        max_display = f"{max_v:.1f} °C" if max_v is not None else "N/A"

        popup_html = (
            f"<div style='font-family: -apple-system, BlinkMacSystemFont, sans-serif; "
            f"font-size: 13px; line-height: 1.5; min-width: 140px;'>"
            f"<b style='font-size: 14px;'>📍 {safe_region}</b><br/>"
            f"<span style='color: #666;'>預報日期：{target_date.isoformat()}</span><hr style='margin: 4px 0;'/>"
            f"🔥 最高氣溫：<b>{max_display}</b><br/>"
            f"❄️ 最低氣溫：<b>{min_display}</b><br/>"
            f"📊 時段狀態：<b>{status_text}</b> ({cnt} 時段)"
            f"</div>"
        )

        markers.append(
            MarkerData(
                region=reg,
                latitude=lat,
                longitude=lon,
                forecast_date=target_date,
                min_temp=min_v,
                max_temp=max_v,
                interval_count=cnt,
                is_partial=is_part,
                marker_color=color,
                data_status=status_text,
                popup_html=popup_html,
            )
        )

    # Detect expected CWA regions lacking forecast data for this date
    missing_forecast = [r for r in EXPECTED_TAIWAN_REGIONS if r not in present_regions]

    return MapMarkerResult(
        markers=markers,
        missing_coordinates=missing_coords,
        missing_forecast_regions=missing_forecast,
    )


def compute_bounds(markers: List[MarkerData]) -> Optional[List[List[float]]]:
    """Compute [[min_lat, min_lon], [max_lat, max_lon]] bounding box for markers.

    Args:
        markers: List of MarkerData instances.

    Returns:
        Optional[List[List[float]]]: Bounding box coordinates, or None if markers is empty.
    """
    if not markers:
        return None

    lats = [m.latitude for m in markers]
    lons = [m.longitude for m in markers]
    return [[min(lats), min(lons)], [max(lats), max(lons)]]


def get_default_map_date(
    multi_daily_df: pd.DataFrame,
    valid_dates: List[date],
    expected_regions_count: int = 22,
) -> Optional[date]:
    """Find the default map date from available dates.

    Selects the earliest date that is complete across all expected regions
    (all available regions have is_partial == False and len == expected_regions_count).
    If no such date exists, selects the earliest available date in valid_dates.

    Args:
        multi_daily_df: Multi-region aggregated daily forecast DataFrame.
        valid_dates: Chronologically sorted list of candidate dates within range.
        expected_regions_count: Expected region count for a complete snapshot.

    Returns:
        Optional[date]: Default date, or None if valid_dates is empty.
    """
    if not valid_dates:
        return None

    if multi_daily_df.empty:
        return valid_dates[0]

    for d in valid_dates:
        subset = multi_daily_df[multi_daily_df["forecast_date"] == d]
        if len(subset) == expected_regions_count and (subset["is_partial"] == False).all():
            return d

    return valid_dates[0]
