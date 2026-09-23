import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseTemperature,
  normalizeCwaForecast,
  fetchCwaForecast,
  CWA_FORECAST_DATASET_ID,
  CWA_API_BASE_URL,
} from "@/lib/server/cwa-client";
import {
  ConfigError,
  TimeoutError,
  UpstreamError,
  ParseError,
} from "@/lib/server/errors";

describe("CWA Client & Normalizer", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.CWA_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("parseTemperature", () => {
    it("correctly parses valid numeric strings and numbers", () => {
      expect(parseTemperature("23")).toBe(23);
      expect(parseTemperature("28.5")).toBe(28.5);
      expect(parseTemperature(15)).toBe(15);
      expect(parseTemperature("0")).toBe(0);
      expect(parseTemperature(0)).toBe(0);
      expect(parseTemperature("-3")).toBe(-3);
    });

    it("converts invalid or missing temperature values to null without defaulting to 0", () => {
      expect(parseTemperature("")).toBeNull();
      expect(parseTemperature("   ")).toBeNull();
      expect(parseTemperature("N/A")).toBeNull();
      expect(parseTemperature("n/a")).toBeNull();
      expect(parseTemperature("NaN")).toBeNull();
      expect(parseTemperature("invalid")).toBeNull();
      expect(parseTemperature(null)).toBeNull();
      expect(parseTemperature(undefined)).toBeNull();
    });
  });

  describe("normalizeCwaForecast", () => {
    const validSamplePayload = {
      success: "true",
      result: { resource_id: "F-D0047-091" },
      records: {
        Locations: [
          {
            DatasetDescription: "全臺灣各縣市未來1週天氣預報",
            LocationsName: "臺灣",
            Location: [
              {
                LocationName: "臺北市",
                WeatherElement: [
                  {
                    ElementName: "最高溫度",
                    Time: [
                      {
                        StartTime: "2026-09-20T18:00:00+08:00",
                        EndTime: "2026-09-21T06:00:00+08:00",
                        ElementValue: [{ MaxTemperature: "28" }],
                      },
                      {
                        StartTime: "2026-09-21T06:00:00+08:00",
                        EndTime: "2026-09-21T18:00:00+08:00",
                        ElementValue: [{ MaxTemperature: "32" }],
                      },
                    ],
                  },
                  {
                    ElementName: "最低溫度",
                    Time: [
                      // Inverted time order relative to 最高溫度
                      {
                        StartTime: "2026-09-21T06:00:00+08:00",
                        EndTime: "2026-09-21T18:00:00+08:00",
                        ElementValue: [{ MinTemperature: "25" }],
                      },
                      {
                        StartTime: "2026-09-20T18:00:00+08:00",
                        EndTime: "2026-09-21T06:00:00+08:00",
                        ElementValue: [{ MinTemperature: "23" }],
                      },
                    ],
                  },
                ],
              },
              {
                LocationName: "新北市",
                WeatherElement: [
                  // Inverted element order: 最低溫度 first
                  {
                    ElementName: "最低溫度",
                    Time: [
                      {
                        StartTime: "2026-09-21T06:00:00+08:00",
                        EndTime: "2026-09-21T18:00:00+08:00",
                        ElementValue: [{ MinTemperature: "24" }],
                      },
                      {
                        StartTime: "2026-09-20T18:00:00+08:00",
                        EndTime: "2026-09-21T06:00:00+08:00",
                        ElementValue: [{ MinTemperature: "N/A" }], // test invalid value
                      },
                    ],
                  },
                  {
                    ElementName: "最高溫度",
                    Time: [
                      {
                        StartTime: "2026-09-20T18:00:00+08:00",
                        EndTime: "2026-09-21T06:00:00+08:00",
                        ElementValue: [{ MaxTemperature: "27" }],
                      },
                      {
                        StartTime: "2026-09-21T06:00:00+08:00",
                        EndTime: "2026-09-21T18:00:00+08:00",
                        ElementValue: [{ MaxTemperature: "31" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    it("correctly normalizes 2 regions and 2 intervals with mixed element/time order", () => {
      const fixedFetchedAt = "2026-09-23T12:00:00.000Z";
      const result = normalizeCwaForecast(validSamplePayload, fixedFetchedAt);

      expect(result.datasetId).toBe("F-D0047-091");
      expect(result.fetchedAt).toBe(fixedFetchedAt);
      expect(result.regions).toHaveLength(2);

      // Verify regions are sorted deterministically
      const regionNames = result.regions.map((r) => r.region);
      expect(regionNames).toEqual(["新北市", "臺北市"]);

      // Verify Taipei intervals are paired and sorted chronologically
      const taipei = result.regions.find((r) => r.region === "臺北市")!;
      expect(taipei.intervals).toHaveLength(2);
      expect(taipei.intervals[0]).toEqual({
        startTime: "2026-09-20T18:00:00+08:00",
        endTime: "2026-09-21T06:00:00+08:00",
        minTemp: 23,
        maxTemp: 28,
      });
      expect(taipei.intervals[1]).toEqual({
        startTime: "2026-09-21T06:00:00+08:00",
        endTime: "2026-09-21T18:00:00+08:00",
        minTemp: 25,
        maxTemp: 32,
      });

      // Verify New Taipei intervals: invalid "N/A" converted to null without 0 defaulting
      const newTaipei = result.regions.find((r) => r.region === "新北市")!;
      expect(newTaipei.intervals).toHaveLength(2);
      expect(newTaipei.intervals[0]).toEqual({
        startTime: "2026-09-20T18:00:00+08:00",
        endTime: "2026-09-21T06:00:00+08:00",
        minTemp: null,
        maxTemp: 27,
      });
      expect(newTaipei.intervals[1]).toEqual({
        startTime: "2026-09-21T06:00:00+08:00",
        endTime: "2026-09-21T18:00:00+08:00",
        minTemp: 24,
        maxTemp: 31,
      });
    });

    it("throws ParseError when records or Locations structure is missing or malformed", () => {
      expect(() => normalizeCwaForecast(null)).toThrow(ParseError);
      expect(() => normalizeCwaForecast({})).toThrow(ParseError);
      expect(() => normalizeCwaForecast({ records: {} })).toThrow(ParseError);
      expect(() => normalizeCwaForecast({ records: { Locations: [] } })).toThrow(ParseError);
      expect(() => normalizeCwaForecast({ records: { Locations: [{ Location: [] }] } })).toThrow(ParseError);
    });

    it("throws ParseError when no valid forecast intervals can be produced", () => {
      const emptyLocationPayload = {
        records: {
          Locations: [
            {
              Location: [
                {
                  LocationName: "無效站",
                  WeatherElement: [],
                },
              ],
            },
          ],
        },
      };
      expect(() => normalizeCwaForecast(emptyLocationPayload)).toThrow(ParseError);
    });

    it("throws UpstreamError when payload contains success=false", () => {
      expect(() =>
        normalizeCwaForecast({ success: "false", records: {} })
      ).toThrow(UpstreamError);
    });
  });

  describe("fetchCwaForecast", () => {
    it("successfully calls CWA endpoint with Authorization header and returns normalized data", async () => {
      const mockCwaJson = {
        success: "true",
        records: {
          Locations: [
            {
              Location: [
                {
                  LocationName: "臺中市",
                  WeatherElement: [
                    {
                      ElementName: "最低溫度",
                      Time: [
                        {
                          StartTime: "2026-09-21T00:00:00+08:00",
                          EndTime: "2026-09-21T12:00:00+08:00",
                          ElementValue: [{ MinTemperature: "22" }],
                        },
                      ],
                    },
                    {
                      ElementName: "最高溫度",
                      Time: [
                        {
                          StartTime: "2026-09-21T00:00:00+08:00",
                          EndTime: "2026-09-21T12:00:00+08:00",
                          ElementValue: [{ MaxTemperature: "30" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockCwaJson,
      } as unknown as Response);

      const result = await fetchCwaForecast({
        apiKey: "test-valid-cwa-key",
        fetchFn: mockFetch,
      });

      expect(result.datasetId).toBe(CWA_FORECAST_DATASET_ID);
      expect(result.regions).toHaveLength(1);
      expect(result.regions[0].region).toBe("臺中市");

      // Verify request URL has NO Authorization query param
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toBe(`${CWA_API_BASE_URL}/${CWA_FORECAST_DATASET_ID}`);
      expect(calledUrl).not.toContain("Authorization");

      // Verify Authorization is in headers
      const calledOptions = mockFetch.mock.calls[0][1];
      expect(calledOptions.headers.Authorization).toBe("test-valid-cwa-key");
    });

    it("throws ConfigError when CWA_API_KEY is not configured", async () => {
      await expect(fetchCwaForecast()).rejects.toThrow(ConfigError);
    });

    it("throws TimeoutError on request timeout", async () => {
      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      });

      await expect(
        fetchCwaForecast({
          apiKey: "valid-key",
          timeoutMs: 20,
          fetchFn: mockFetch,
        })
      ).rejects.toThrow(TimeoutError);
    });

    it("throws UpstreamError on 401 without leaking API key in error message", async () => {
      const secretKey = "super-secret-cwa-key-9999";
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      } as unknown as Response);

      try {
        await fetchCwaForecast({
          apiKey: secretKey,
          fetchFn: mockFetch,
        });
        expect.unreachable();
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(UpstreamError);
        const upstreamErr = err as UpstreamError;
        expect(upstreamErr.code).toBe("UPSTREAM_ERROR");
        expect(upstreamErr.upstreamStatus).toBe(401);
        expect(upstreamErr.message).not.toContain(secretKey);
      }
    });

    it("throws UpstreamError on 429 rate limit and 500 server error", async () => {
      const mockFetch429 = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
      } as unknown as Response);

      await expect(
        fetchCwaForecast({ apiKey: "key", fetchFn: mockFetch429 })
      ).rejects.toThrow(UpstreamError);

      const mockFetch500 = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as unknown as Response);

      await expect(
        fetchCwaForecast({ apiKey: "key", fetchFn: mockFetch500 })
      ).rejects.toThrow(UpstreamError);
    });

    it("throws ParseError on invalid JSON response", async () => {
      const mockFetchInvalidJson = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON at position 0");
        },
      } as unknown as Response);

      await expect(
        fetchCwaForecast({ apiKey: "key", fetchFn: mockFetchInvalidJson })
      ).rejects.toThrow(ParseError);
    });
  });
});
