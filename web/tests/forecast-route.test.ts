import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, FORECAST_CACHE_CONTROL, ERROR_CACHE_CONTROL } from "@/app/api/weather/forecast/route";
import * as cwaClientModule from "@/lib/server/cwa-client";
import { ConfigError, UpstreamError, TimeoutError, ParseError } from "@/lib/server/errors";

describe("GET /api/weather/forecast Route Handler", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.CWA_API_KEY = "test-cwa-key";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns HTTP 200 with standard success envelope and Cache-Control header", async () => {
    const mockNormalizedData = {
      datasetId: "F-D0047-091",
      fetchedAt: "2026-09-23T12:00:00.000Z",
      regions: [
        {
          region: "臺北市",
          intervals: [
            {
              startTime: "2026-09-23T12:00:00+08:00",
              endTime: "2026-09-24T00:00:00+08:00",
              minTemp: 22,
              maxTemp: 29,
            },
          ],
        },
      ],
    };

    vi.spyOn(cwaClientModule, "fetchCwaForecast").mockResolvedValue(mockNormalizedData);

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(FORECAST_CACHE_CONTROL);

    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      data: mockNormalizedData,
      error: null,
    });
  });

  it("returns HTTP 500 with CONFIG_ERROR and no-store header when CWA_API_KEY is missing", async () => {
    vi.spyOn(cwaClientModule, "fetchCwaForecast").mockRejectedValue(
      new ConfigError("CWA_API_KEY")
    );

    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe(ERROR_CACHE_CONTROL);

    const body = await response.json();
    expect(body).toEqual({
      ok: false,
      data: null,
      error: {
        code: "CONFIG_ERROR",
        message: "Server configuration error: required credential 'CWA_API_KEY' is missing.",
      },
    });
  });

  it("returns HTTP 502 with UPSTREAM_ERROR on upstream 401/403/429/500", async () => {
    vi.spyOn(cwaClientModule, "fetchCwaForecast").mockRejectedValue(
      new UpstreamError(401)
    );

    const response = await GET();
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe(ERROR_CACHE_CONTROL);

    const body = await response.json();
    expect(body).toEqual({
      ok: false,
      data: null,
      error: {
        code: "UPSTREAM_ERROR",
        message: "Upstream service returned error status 401.",
      },
    });
  });

  it("returns HTTP 504 with TIMEOUT_ERROR on request timeout", async () => {
    vi.spyOn(cwaClientModule, "fetchCwaForecast").mockRejectedValue(
      new TimeoutError()
    );

    const response = await GET();
    expect(response.status).toBe(504);
    expect(response.headers.get("Cache-Control")).toBe(ERROR_CACHE_CONTROL);

    const body = await response.json();
    expect(body).toEqual({
      ok: false,
      data: null,
      error: {
        code: "TIMEOUT_ERROR",
        message: "Upstream request timed out.",
      },
    });
  });

  it("returns HTTP 502 with PARSE_ERROR on invalid upstream structure or JSON", async () => {
    vi.spyOn(cwaClientModule, "fetchCwaForecast").mockRejectedValue(
      new ParseError("Malformed CWA dataset structure: records.Locations[0].Location is missing or empty.")
    );

    const response = await GET();
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe(ERROR_CACHE_CONTROL);

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("PARSE_ERROR");
  });

  it("returns HTTP 500 with generic INTERNAL_ERROR when an unknown error occurs", async () => {
    vi.spyOn(cwaClientModule, "fetchCwaForecast").mockRejectedValue(
      new Error("Unexpected low-level failure")
    );

    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe(ERROR_CACHE_CONTROL);

    const body = await response.json();
    expect(body).toEqual({
      ok: false,
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected server error occurred.",
      },
    });
    // Ensure raw error message and stack trace are NOT in the body
    expect(JSON.stringify(body)).not.toContain("Unexpected low-level failure");
  });
});
