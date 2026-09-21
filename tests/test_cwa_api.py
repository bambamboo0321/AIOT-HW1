"""Unit tests for CWA API communication module (M1).

All tests run in isolation using unittest.mock and never make real network calls.
"""

from unittest.mock import MagicMock, PropertyMock, patch
import pytest
import requests
import streamlit.errors

from src.cwa_api import (
    CwaApiError,
    CwaAuthError,
    CwaConnectionError,
    CwaRateLimitError,
    CwaServerError,
    fetch_forecast_raw,
    get_cwa_api_key,
    validate_response_m1,
)


def _make_valid_m1_payload():
    """Helper to create a minimal valid CWA F-D0047-091 payload."""
    return {
        "success": "true",
        "result": {"resource_id": "F-D0047-091"},
        "records": {
            "Locations": [
                {
                    "Location": [
                        {"LocationName": "臺北市"},
                        {"LocationName": "新北市"},
                    ]
                }
            ]
        },
    }


class TestGetCwaApiKey:
    """Test suite for get_cwa_api_key()."""

    def test_get_key_from_streamlit_secrets(self):
        """Verify priority reading from st.secrets."""
        fake_secrets = {"CWA_API_KEY": "test-key-from-secrets"}
        with patch("src.cwa_api.st.secrets", fake_secrets):
            key = get_cwa_api_key()
            assert key == "test-key-from-secrets"

    def test_get_key_fallback_to_environment(self, monkeypatch):
        """Verify fallback to os.environ when st.secrets is unavailable."""
        monkeypatch.setenv("CWA_API_KEY", "test-key-from-env")
        mock_secrets = MagicMock()
        mock_secrets.get.side_effect = streamlit.errors.StreamlitSecretNotFoundError("Not found")
        with patch("src.cwa_api.st.secrets", mock_secrets):
            key = get_cwa_api_key()
            assert key == "test-key-from-env"

    def test_missing_key_raises_auth_error(self, monkeypatch):
        """Verify CwaAuthError is raised when neither source provides a key."""
        monkeypatch.delenv("CWA_API_KEY", raising=False)
        mock_secrets = MagicMock()
        mock_secrets.get.side_effect = FileNotFoundError("No secrets")
        with patch("src.cwa_api.st.secrets", mock_secrets):
            with pytest.raises(CwaAuthError) as exc_info:
                get_cwa_api_key()
            assert "CWA_API_KEY is not configured" in str(exc_info.value)


class TestValidateResponseM1:
    """Test suite for validate_response_m1()."""

    def test_valid_payload_returns_summary(self):
        """Verify valid payload returns location_count and sample_location without dataset_id."""
        payload = _make_valid_m1_payload()
        summary = validate_response_m1(payload)
        assert summary == {
            "location_count": 2,
            "sample_location": "臺北市",
        }
        assert "dataset_id" not in summary

    def test_not_a_dict_raises_error(self):
        with pytest.raises(CwaApiError, match="Invalid response format"):
            validate_response_m1(["not", "a", "dict"])

    def test_success_missing_or_false_raises_error(self):
        """Verify missing or non-true success field triggers CwaApiError."""
        payload = _make_valid_m1_payload()
        payload["success"] = "false"
        with pytest.raises(CwaApiError, match="unsuccessful response flag"):
            validate_response_m1(payload)

        payload.pop("success")
        with pytest.raises(CwaApiError, match="unsuccessful response flag"):
            validate_response_m1(payload)

    def test_missing_records_raises_error(self):
        """Verify missing records object triggers CwaApiError."""
        payload = {"success": "true"}
        with pytest.raises(CwaApiError, match="missing 'records' object"):
            validate_response_m1(payload)

    def test_empty_locations_list_raises_error(self):
        """Verify empty Locations list triggers CwaApiError."""
        payload = {"success": "true", "records": {"Locations": []}}
        with pytest.raises(CwaApiError, match="'records.Locations' is empty"):
            validate_response_m1(payload)

    def test_empty_location_list_raises_error(self):
        """Verify empty inner Location list triggers CwaApiError."""
        payload = {
            "success": "true",
            "records": {"Locations": [{"Location": []}]},
        }
        with pytest.raises(CwaApiError, match="'Location' list is empty"):
            validate_response_m1(payload)

    def test_missing_location_name_raises_error(self):
        """Verify location without LocationName triggers CwaApiError."""
        payload = {
            "success": "true",
            "records": {"Locations": [{"Location": [{"WeatherElement": []}]}]},
        }
        with pytest.raises(CwaApiError, match="missing a valid 'LocationName'"):
            validate_response_m1(payload)


class TestFetchForecastRaw:
    """Test suite for fetch_forecast_raw()."""

    @patch("src.cwa_api.requests.get")
    def test_fetch_success_200(self, mock_get):
        """Verify HTTP 200 with valid JSON returns data."""
        payload = _make_valid_m1_payload()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = payload
        mock_get.return_value = mock_resp

        data = fetch_forecast_raw("F-D0047-091", api_key="test-secret-key")
        assert data == payload
        mock_get.assert_called_once()
        # Verify authorization, accept, user-agent headers and default timeout
        headers = mock_get.call_args[1]["headers"]
        assert headers == {
            "Authorization": "test-secret-key",
            "Accept": "application/json",
            "User-Agent": "AIOT-HW1-Weather-Dashboard/1.0",
        }
        assert mock_get.call_args[1]["timeout"] == (10.0, 60.0)


    @patch("src.cwa_api.requests.get")
    def test_fetch_200_with_invalid_json_raises_api_error(self, mock_get):
        """Verify HTTP 200 with invalid JSON body raises safe CwaApiError."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.side_effect = ValueError("Expecting value: line 1 column 1")
        mock_get.return_value = mock_resp

        with pytest.raises(CwaApiError, match="not valid JSON"):
            fetch_forecast_raw("F-D0047-091", api_key="dummy-key")

    @patch("src.cwa_api.requests.get")
    def test_fetch_401_raises_auth_error(self, mock_get):
        """Verify HTTP 401 Unauthorized raises CwaAuthError."""
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_get.return_value = mock_resp

        with pytest.raises(CwaAuthError, match="Authentication failed \\(HTTP 401\\)"):
            fetch_forecast_raw("F-D0047-091", api_key="secret-token-12345")

    @patch("src.cwa_api.requests.get")
    def test_fetch_403_raises_auth_error(self, mock_get):
        """Verify HTTP 403 Forbidden raises CwaAuthError."""
        mock_resp = MagicMock()
        mock_resp.status_code = 403
        mock_get.return_value = mock_resp

        with pytest.raises(CwaAuthError, match="Authentication failed \\(HTTP 403\\)"):
            fetch_forecast_raw("F-D0047-091", api_key="secret-token-12345")

    @patch("src.cwa_api.requests.get")
    def test_fetch_404_raises_api_error(self, mock_get):
        """Verify HTTP 404 Not Found raises CwaApiError."""
        mock_resp = MagicMock()
        mock_resp.status_code = 404
        mock_get.return_value = mock_resp

        with pytest.raises(CwaApiError, match="Dataset 'unknown-id' not found"):
            fetch_forecast_raw("unknown-id", api_key="dummy-key")

    @patch("src.cwa_api.requests.get")
    def test_fetch_429_raises_rate_limit_error(self, mock_get):
        """Verify HTTP 429 Rate Limit raises CwaRateLimitError."""
        mock_resp = MagicMock()
        mock_resp.status_code = 429
        mock_get.return_value = mock_resp

        with pytest.raises(CwaRateLimitError, match="rate limit exceeded"):
            fetch_forecast_raw("F-D0047-091", api_key="dummy-key")

    @patch("src.cwa_api.requests.get")
    def test_fetch_500_raises_server_error(self, mock_get):
        """Verify HTTP 500 Server Error raises CwaServerError."""
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_get.return_value = mock_resp

        with pytest.raises(CwaServerError, match="server error \\(HTTP 500\\)"):
            fetch_forecast_raw("F-D0047-091", api_key="dummy-key")

    @patch("src.cwa_api.requests.get")
    def test_fetch_int_and_float_timeout_compatibility(self, mock_get):
        """Verify int and float timeout parameters are accepted and passed to requests.get."""
        payload = _make_valid_m1_payload()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = payload
        mock_get.return_value = mock_resp

        # Test int timeout
        fetch_forecast_raw("F-D0047-091", timeout=15, api_key="test-key")
        assert mock_get.call_args[1]["timeout"] == 15

        # Test float timeout
        fetch_forecast_raw("F-D0047-091", timeout=5.5, api_key="test-key")
        assert mock_get.call_args[1]["timeout"] == 5.5

    @patch("src.cwa_api.requests.get")
    def test_fetch_connect_timeout_raises_connection_error(self, mock_get):
        """Verify ConnectTimeout raises CwaConnectionError with connect timeout message."""
        mock_get.side_effect = requests.exceptions.ConnectTimeout("Connect timed out")

        with pytest.raises(
            CwaConnectionError,
            match="Timed out while connecting to the CWA API server",
        ):
            fetch_forecast_raw("F-D0047-091", api_key="dummy-key")

    @patch("src.cwa_api.requests.get")
    def test_fetch_read_timeout_raises_connection_error(self, mock_get):
        """Verify ReadTimeout raises CwaConnectionError with read timeout message."""
        mock_get.side_effect = requests.exceptions.ReadTimeout("Read timed out")

        with pytest.raises(
            CwaConnectionError,
            match="Connected to CWA, but the forecast response timed out while downloading",
        ):
            fetch_forecast_raw("F-D0047-091", api_key="dummy-key")

    @patch("src.cwa_api.requests.get")
    def test_fetch_ssl_error_raises_connection_error(self, mock_get):
        """Verify SSLError raises CwaConnectionError with SSL verification message."""
        mock_get.side_effect = requests.exceptions.SSLError("Certificate verify failed")

        with pytest.raises(
            CwaConnectionError,
            match="SSL verification failed while connecting to the CWA API server",
        ):
            fetch_forecast_raw("F-D0047-091", api_key="dummy-key")

    @patch("src.cwa_api.requests.get")
    def test_fetch_proxy_error_raises_connection_error(self, mock_get):
        """Verify ProxyError raises CwaConnectionError with proxy message."""
        mock_get.side_effect = requests.exceptions.ProxyError("Proxy unreachable")

        with pytest.raises(
            CwaConnectionError,
            match="The deployment network proxy could not reach the CWA API server",
        ):
            fetch_forecast_raw("F-D0047-091", api_key="dummy-key")

    @patch("src.cwa_api.requests.get")
    def test_fetch_connection_error_raises_connection_error(self, mock_get):
        """Verify generic ConnectionError raises CwaConnectionError with network failure message."""
        mock_get.side_effect = requests.exceptions.ConnectionError("DNS lookup failed")

        with pytest.raises(
            CwaConnectionError,
            match="Network connection to the CWA API server failed",
        ):
            fetch_forecast_raw("F-D0047-091", api_key="dummy-key")

    @patch("src.cwa_api.requests.get")
    def test_fetch_generic_timeout_raises_connection_error(self, mock_get):
        """Verify generic Timeout raises CwaConnectionError with generic timeout message."""
        mock_get.side_effect = requests.exceptions.Timeout("Generic timeout")

        with pytest.raises(
            CwaConnectionError,
            match="Request to CWA API timed out",
        ):
            fetch_forecast_raw("F-D0047-091", api_key="dummy-key")

    @patch("src.cwa_api.requests.get")
    def test_error_message_never_leaks_key(self, mock_get):
        """Verify that error messages never contain the secret key string across all errors."""
        secret_key = "TOP_SECRET_CWA_KEY_VALUE_XYZ"

        # HTTP error
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_get.return_value = mock_resp
        mock_get.side_effect = None
        with pytest.raises(CwaAuthError) as exc_info:
            fetch_forecast_raw("F-D0047-091", api_key=secret_key)
        assert secret_key not in str(exc_info.value)

        # ConnectTimeout
        mock_get.side_effect = requests.exceptions.ConnectTimeout("Connect timed out")
        with pytest.raises(CwaConnectionError) as exc_info:
            fetch_forecast_raw("F-D0047-091", api_key=secret_key)
        assert secret_key not in str(exc_info.value)

        # ReadTimeout
        mock_get.side_effect = requests.exceptions.ReadTimeout("Read timed out")
        with pytest.raises(CwaConnectionError) as exc_info:
            fetch_forecast_raw("F-D0047-091", api_key=secret_key)
        assert secret_key not in str(exc_info.value)

        # SSLError
        mock_get.side_effect = requests.exceptions.SSLError("SSL failed")
        with pytest.raises(CwaConnectionError) as exc_info:
            fetch_forecast_raw("F-D0047-091", api_key=secret_key)
        assert secret_key not in str(exc_info.value)

        # ProxyError
        mock_get.side_effect = requests.exceptions.ProxyError("Proxy failed")
        with pytest.raises(CwaConnectionError) as exc_info:
            fetch_forecast_raw("F-D0047-091", api_key=secret_key)
        assert secret_key not in str(exc_info.value)

        # ConnectionError
        mock_get.side_effect = requests.exceptions.ConnectionError("Network failed")
        with pytest.raises(CwaConnectionError) as exc_info:
            fetch_forecast_raw("F-D0047-091", api_key=secret_key)
        assert secret_key not in str(exc_info.value)
