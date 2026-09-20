"""CWA API communication module.

Responsible for sending HTTP requests to Taiwan's Central Weather
Administration (CWA) Open Data API, validating responses, and handling errors.
Milestone: M1 — CWA API Acquisition
"""

import os
from typing import Any, Dict, Optional
import requests
import streamlit as st
import streamlit.errors


class CwaApiError(Exception):
    """Base exception for all CWA API-related errors."""


class CwaAuthError(CwaApiError):
    """Raised when API key is missing or authentication fails (401/403)."""


class CwaConnectionError(CwaApiError):
    """Raised when connection to CWA API fails or times out."""


class CwaRateLimitError(CwaApiError):
    """Raised when CWA API rate limit is exceeded (HTTP 429)."""


class CwaServerError(CwaApiError):
    """Raised when CWA API server encounters an internal error (5xx)."""


def get_cwa_api_key() -> str:
    """Retrieve the CWA API key safely.

    Priority:
    1. Streamlit secrets (`st.secrets["CWA_API_KEY"]`) when in Streamlit runtime.
    2. Environment variable (`os.getenv("CWA_API_KEY")`) outside Streamlit.

    Returns:
        str: The CWA API authorization key.

    Raises:
        CwaAuthError: If the API key is not configured in secrets or environment.
    """
    key: Optional[str] = None

    # Step 1: Attempt to read from Streamlit secrets.
    # Catch only expected missing-secret / runtime configuration exceptions.
    try:
        key = st.secrets.get("CWA_API_KEY")  # type: ignore[attr-defined]
    except (
        streamlit.errors.StreamlitSecretNotFoundError,
        FileNotFoundError,
        KeyError,
        AttributeError,
    ):
        key = None

    # Step 2: Fall back to environment variable.
    if not key:
        key = os.getenv("CWA_API_KEY")

    if not key or not str(key).strip():
        raise CwaAuthError(
            "CWA_API_KEY is not configured. Please set it in "
            ".streamlit/secrets.toml or as an environment variable."
        )

    return str(key).strip()


def validate_response_m1(data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate that the CWA response conforms to the expected M1 structure.

    Checks:
    - Data is a dictionary.
    - Top-level `success` represents success ("true").
    - `records` dictionary exists.
    - `Locations` list exists and contains at least one locations entry.
    - `Location` list exists and contains at least one location entry.
    - At least one location has a non-empty `LocationName`.

    Args:
        data: The decoded JSON response dictionary.

    Returns:
        dict: A summary dictionary with `location_count` and `sample_location`.

    Raises:
        CwaApiError: If any validation rule is not satisfied.
    """
    if not isinstance(data, dict):
        raise CwaApiError("Invalid response format: expected a JSON object.")

    # Check top-level success field
    success_val = data.get("success")
    if str(success_val).lower() != "true":
        raise CwaApiError(
            f"CWA API returned unsuccessful response flag: success={success_val!r}"
        )

    # Check records object
    records = data.get("records")
    if not isinstance(records, dict):
        raise CwaApiError("Invalid response format: missing 'records' object.")

    # Check Locations container
    locations_group = records.get("Locations")
    if not isinstance(locations_group, list) or len(locations_group) == 0:
        raise CwaApiError(
            "Invalid response format: 'records.Locations' is empty or not a list."
        )

    # Check inner Location list
    first_group = locations_group[0]
    if not isinstance(first_group, dict):
        raise CwaApiError("Invalid response format: 'Locations[0]' is not an object.")

    locations = first_group.get("Location")
    if not isinstance(locations, list) or len(locations) == 0:
        raise CwaApiError(
            "Invalid response format: 'Location' list is empty or missing."
        )

    # Check that at least one location has LocationName
    first_loc = locations[0]
    if not isinstance(first_loc, dict):
        raise CwaApiError("Invalid response format: first location item is not an object.")

    sample_name = first_loc.get("LocationName")
    if not sample_name or not isinstance(sample_name, str):
        raise CwaApiError(
            "Invalid response format: location item is missing a valid 'LocationName'."
        )

    return {
        "location_count": len(locations),
        "sample_location": sample_name,
    }


def fetch_forecast_raw(
    dataset_id: str = "F-D0047-091",
    timeout: int = 10,
    api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """Fetch raw forecast JSON data from the CWA Open Data API.

    Args:
        dataset_id: CWA dataset identifier (default: "F-D0047-091" 1-week forecast).
        timeout: Maximum time in seconds to wait for network response.
        api_key: Optional explicit API key; if None, resolved via `get_cwa_api_key()`.

    Returns:
        dict: The parsed and validated JSON response dictionary.

    Raises:
        CwaAuthError: If authorization fails (HTTP 401, 403) or API key is absent.
        CwaRateLimitError: If API rate limit is exceeded (HTTP 429).
        CwaServerError: If the CWA API returns a 5xx server error.
        CwaConnectionError: If network connection fails or times out.
        CwaApiError: If HTTP status is not 200, JSON is invalid, or structure fails validation.
    """
    key = api_key if api_key is not None else get_cwa_api_key()
    url = f"https://opendata.cwa.gov.tw/api/v1/rest/datastore/{dataset_id}"
    headers = {"Authorization": key}
    params = {"format": "JSON"}

    # Step 1: Perform network request with timeout
    try:
        response = requests.get(url, headers=headers, params=params, timeout=timeout)
    except requests.exceptions.Timeout as exc:
        raise CwaConnectionError("Request to CWA API timed out.") from exc
    except requests.exceptions.ConnectionError as exc:
        raise CwaConnectionError("Failed to connect to CWA API server.") from exc
    except requests.exceptions.RequestException as exc:
        raise CwaConnectionError("A network error occurred while reaching CWA API.") from exc

    # Step 2: Check HTTP status code before parsing JSON body
    status = response.status_code

    if status in (401, 403):
        raise CwaAuthError(
            f"Authentication failed (HTTP {status}). Please verify your CWA API authorization key."
        )
    if status == 404:
        raise CwaApiError(f"Dataset '{dataset_id}' not found on CWA API (HTTP 404).")
    if status == 429:
        raise CwaRateLimitError("CWA API rate limit exceeded (HTTP 429). Please try again later.")
    if 500 <= status < 600:
        raise CwaServerError(f"CWA API server error (HTTP {status}). Please try again later.")
    if status != 200:
        raise CwaApiError(f"CWA API returned unexpected HTTP status {status}.")

    # Step 3: Parse JSON body and convert decode failures into CwaApiError
    try:
        data = response.json()
    except (ValueError, requests.exceptions.JSONDecodeError) as exc:
        raise CwaApiError("CWA API returned HTTP 200, but the response body was not valid JSON.") from exc

    # Step 4: Validate response structure
    validate_response_m1(data)

    return data
