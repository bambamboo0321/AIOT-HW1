import { describe, it, expect } from "vitest";
import {
  validateWeatherApiResponse,
  isValidForecastInterval,
  isValidRegionForecast,
  isValidNormalizedForecastData,
  ValidationError,
} from "@/lib/client/validator";

function createValidPayload() {
  return {
    ok: true,
    data: {
      datasetId: "F-D0047-091",
      fetchedAt: "2026-09-24T12:00:00.000Z",
      regions: [
        {
          region: "臺北市",
          intervals: [
            {
              startTime: "2026-09-24T12:00:00+08:00",
              endTime: "2026-09-25T00:00:00+08:00",
              minTemp: 23.5,
              maxTemp: 29.0,
            },
            {
              startTime: "2026-09-25T00:00:00+08:00",
              endTime: "2026-09-25T12:00:00+08:00",
              minTemp: null,
              maxTemp: 31.2,
            },
          ],
        },
      ],
    },
    error: null,
  };
}

describe("Client Boundary Validator (validator.ts)", () => {
  it("successfully validates a valid M8 API response", () => {
    const validPayload = createValidPayload();
    const result = validateWeatherApiResponse(validPayload);

    expect(result.datasetId).toBe("F-D0047-091");
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0].region).toBe("臺北市");
    expect(isValidNormalizedForecastData(result)).toBe(true);
  });

  it("rejects non-object or null payloads", () => {
    expect(() => validateWeatherApiResponse(null)).toThrow(ValidationError);
    expect(() => validateWeatherApiResponse("")).toThrow(ValidationError);
    expect(() => validateWeatherApiResponse(12345)).toThrow(ValidationError);
  });

  it("rejects response envelope where ok is not true", () => {
    const payload = {
      ok: false,
      data: null,
      error: { code: "UPSTREAM_ERROR", message: "Error" },
    };
    expect(() => validateWeatherApiResponse(payload)).toThrow(ValidationError);
  });

  it("rejects response missing data object or invalid datasetId", () => {
    expect(() => validateWeatherApiResponse({ ok: true, data: null })).toThrow(ValidationError);
    expect(() =>
      validateWeatherApiResponse({
        ok: true,
        data: { datasetId: "", fetchedAt: "2026-09-24T00:00:00Z", regions: [] },
      })
    ).toThrow(ValidationError);
  });

  it("rejects response with empty or non-array regions", () => {
    const payload1 = {
      ok: true,
      data: {
        datasetId: "F-D0047-091",
        fetchedAt: "2026-09-24T00:00:00Z",
        regions: [],
      },
    };
    expect(() => validateWeatherApiResponse(payload1)).toThrow(ValidationError);

    const payload2 = {
      ok: true,
      data: {
        datasetId: "F-D0047-091",
        fetchedAt: "2026-09-24T00:00:00Z",
        regions: "not-an-array",
      },
    };
    expect(() => validateWeatherApiResponse(payload2)).toThrow(ValidationError);
  });

  it("rejects response with invalid or unparseable timestamps in fetchedAt or intervals", () => {
    const payload = createValidPayload();
    payload.data.fetchedAt = "not-a-timestamp";
    expect(() => validateWeatherApiResponse(payload)).toThrow(ValidationError);

    const payloadInterval = createValidPayload();
    payloadInterval.data.regions[0].intervals[0].startTime = "invalid-date";
    expect(() => validateWeatherApiResponse(payloadInterval)).toThrow(ValidationError);
  });

  it("rejects response with invalid temperature types (e.g. string, object, NaN)", () => {
    expect(
      isValidForecastInterval({
        startTime: "2026-09-24T00:00:00Z",
        endTime: "2026-09-24T12:00:00Z",
        minTemp: "25" as unknown as number, // string not permitted
        maxTemp: 30,
      })
    ).toBe(false);

    expect(
      isValidForecastInterval({
        startTime: "2026-09-24T00:00:00Z",
        endTime: "2026-09-24T12:00:00Z",
        minTemp: NaN, // NaN not permitted
        maxTemp: 30,
      })
    ).toBe(false);

    expect(
      isValidForecastInterval({
        startTime: "2026-09-24T00:00:00Z",
        endTime: "2026-09-24T12:00:00Z",
        minTemp: 22,
        maxTemp: null, // null is valid
      })
    ).toBe(true);
  });

  it("rejects region names containing corrupted U+FFFD characters", () => {
    const corruptRegionPayload = createValidPayload();
    corruptRegionPayload.data.regions[0].region = "臺北\uFFFD";

    expect(isValidRegionForecast(corruptRegionPayload.data.regions[0])).toBe(false);
    expect(() => validateWeatherApiResponse(corruptRegionPayload)).toThrow(ValidationError);
    expect(() => validateWeatherApiResponse(corruptRegionPayload)).toThrow(/U\+FFFD/);
  });

  it("rejects blank or empty region names", () => {
    const emptyRegionPayload = createValidPayload();
    emptyRegionPayload.data.regions[0].region = "   ";
    expect(isValidRegionForecast(emptyRegionPayload.data.regions[0])).toBe(false);
    expect(() => validateWeatherApiResponse(emptyRegionPayload)).toThrow(ValidationError);
  });
});
