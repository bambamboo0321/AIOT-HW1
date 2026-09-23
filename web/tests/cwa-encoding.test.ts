import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeCwaForecast } from "@/lib/server/cwa-client";
import { GET, JSON_CONTENT_TYPE } from "@/app/api/weather/forecast/route";
import * as cwaClientModule from "@/lib/server/cwa-client";
import { ParseError } from "@/lib/server/errors";

// All 22 official administrative divisions in Taiwan
export const ALL_22_TAIWAN_REGIONS = [
  "基隆市", "臺北市", "新北市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
  "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "臺南市",
  "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣"
];

// Known mojibake artifacts from UTF-8 bytes being decoded as Big5/CP950
const KNOWN_MOJIBAKE_FRAGMENTS = [
  "摰𡏭嵰蝮",
  "梯𤧣蝮",
  "啁姘蝮",
  "敶啣",
  "瞉皝",
  "瘙蝮",
];

function generate22CountiesFixture() {
  return {
    success: "true",
    records: {
      Locations: [
        {
          DatasetDescription: "全臺灣各縣市未來1週天氣預報",
          LocationsName: "臺灣",
          Location: ALL_22_TAIWAN_REGIONS.map((regionName) => ({
            LocationName: regionName,
            WeatherElement: [
              {
                ElementName: "最低溫度",
                Time: [
                  {
                    StartTime: "2026-09-24T00:00:00+08:00",
                    EndTime: "2026-09-24T12:00:00+08:00",
                    ElementValue: [{ MinTemperature: "22" }],
                  },
                  {
                    StartTime: "2026-09-24T12:00:00+08:00",
                    EndTime: "2026-09-25T00:00:00+08:00",
                    ElementValue: [{ MinTemperature: "24" }],
                  },
                ],
              },
              {
                ElementName: "最高溫度",
                Time: [
                  {
                    StartTime: "2026-09-24T00:00:00+08:00",
                    EndTime: "2026-09-24T12:00:00+08:00",
                    ElementValue: [{ MaxTemperature: "28" }],
                  },
                  {
                    StartTime: "2026-09-24T12:00:00+08:00",
                    EndTime: "2026-09-25T00:00:00+08:00",
                    ElementValue: [{ MaxTemperature: "31" }],
                  },
                ],
              },
            ],
          })),
        },
      ],
    },
  };
}

describe("Milestone M8.1: CWA Chinese Encoding and Mojibake Prevention", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("correctly normalizes all 22 counties without character corruption", () => {
    const fixture = generate22CountiesFixture();
    const result = normalizeCwaForecast(fixture, "2026-09-24T00:00:00.000Z");

    // 4. Validate regions count is 22
    expect(result.regions).toHaveLength(22);

    // 5. Validate unique regions count is 22
    const uniqueRegionNames = new Set(result.regions.map((r) => r.region));
    expect(uniqueRegionNames.size).toBe(22);

    // 2. Precisely verify output contains 臺北市, 新北市, 高雄市
    expect(uniqueRegionNames.has("臺北市")).toBe(true);
    expect(uniqueRegionNames.has("新北市")).toBe(true);
    expect(uniqueRegionNames.has("高雄市")).toBe(true);
    expect(uniqueRegionNames.has("宜蘭縣")).toBe(true);
    expect(uniqueRegionNames.has("花蓮縣")).toBe(true);

    for (const item of result.regions) {
      // 3. Verify region: non-empty string, no U+FFFD, no known mojibake
      expect(item.region).toBeTruthy();
      expect(typeof item.region).toBe("string");
      expect(item.region.trim().length).toBeGreaterThan(0);
      expect(item.region).not.toContain("\uFFFD");
      expect(item.region.includes("\uFFFD")).toBe(false);

      for (const mojibake of KNOWN_MOJIBAKE_FRAGMENTS) {
        expect(item.region).not.toContain(mojibake);
      }

      // 6. Verify each region retains valid forecast intervals
      expect(item.intervals).toBeInstanceOf(Array);
      expect(item.intervals.length).toBeGreaterThanOrEqual(1);
      for (const interval of item.intervals) {
        expect(interval.startTime).toBeTruthy();
        expect(interval.endTime).toBeTruthy();
        expect(interval.minTemp).not.toBeNaN();
        expect(interval.maxTemp).not.toBeNaN();
      }
    }
  });

  it("ensures GET /api/weather/forecast returns Content-Type: application/json; charset=utf-8", async () => {
    const fixture = generate22CountiesFixture();
    const mockData = normalizeCwaForecast(fixture, "2026-09-24T00:00:00.000Z");

    vi.spyOn(cwaClientModule, "fetchCwaForecast").mockResolvedValue(mockData);

    const response = await GET();
    expect(response.status).toBe(200);

    // 7. Verify Content-Type explicitly contains charset=utf-8
    const contentType = response.headers.get("Content-Type");
    expect(contentType).toBe(JSON_CONTENT_TYPE);
    expect(contentType).toBe("application/json; charset=utf-8");

    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.data.regions).toHaveLength(22);
    expect(json.data.regions.some((r: { region: string }) => r.region === "臺北市")).toBe(true);
    expect(json.data.regions.some((r: { region: string }) => r.region === "宜蘭縣")).toBe(true);
    expect(json.data.regions.some((r: { region: string }) => r.region === "花蓮縣")).toBe(true);
  });

  describe("UTF-8 Decoding Rigor & Error Safety", () => {
    it("correctly parses valid Traditional Chinese UTF-8 byte stream from standard Response", async () => {
      const fixture = generate22CountiesFixture();
      const utf8Bytes = new TextEncoder().encode(JSON.stringify(fixture));

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(utf8Bytes, {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        })
      );

      const result = await cwaClientModule.fetchCwaForecast({
        apiKey: "dummy-key",
        fetchFn: mockFetch,
      });

      expect(result.regions).toHaveLength(22);
      expect(result.regions.map((r) => r.region)).toContain("臺北市");
      expect(result.regions.map((r) => r.region)).toContain("花蓮縣");
      expect(result.regions.map((r) => r.region)).toContain("宜蘭縣");
    });

    it("throws ParseError when upstream returns invalid UTF-8 bytes and does NOT silently convert to U+FFFD", async () => {
      // Invalid UTF-8 byte sequence: [0xFF, 0xFE, 0xFD] are illegal UTF-8 bytes
      const invalidUtf8Bytes = new Uint8Array([
        0x7B, 0x22, 0x73, 0x65, 0x63, 0x72, 0x65, 0x74, 0x22, 0x3A, 0x22,
        0xFF, 0xFE, 0xFD,
        0x22, 0x7D,
      ]);

      // Direct proof: fatal: true rejects invalid bytes instead of producing \uFFFD
      const nonFatalDecoder = new TextDecoder("utf-8", { fatal: false });
      expect(nonFatalDecoder.decode(invalidUtf8Bytes)).toContain("\uFFFD");

      const fatalDecoder = new TextDecoder("utf-8", { fatal: true });
      expect(() => fatalDecoder.decode(invalidUtf8Bytes)).toThrow(TypeError);

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(invalidUtf8Bytes, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      // Must throw ParseError rather than silently returning \uFFFD
      await expect(
        cwaClientModule.fetchCwaForecast({
          apiKey: "dummy-key",
          fetchFn: mockFetch,
        })
      ).rejects.toThrow(ParseError);
    });

    it("ensures API route error response does not leak raw bytes, raw body, keys, or stack traces", async () => {
      // Upstream returns corrupted/invalid UTF-8 bytes with raw sensitive text
      const secretKey = "cwa-secret-key-xyz-789";
      const invalidCorruptedBytes = new Uint8Array([
        0x7B, 0x22, 0x65, 0x72, 0x72, 0x22, 0x3A, 0x22,
        0xFF, 0xFE, // invalid UTF-8 bytes
        0x22, 0x7D,
      ]);

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(invalidCorruptedBytes, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      // Trigger forecast fetching with this corrupt upstream response
      let caughtError: unknown;
      try {
        await cwaClientModule.fetchCwaForecast({
          apiKey: secretKey,
          fetchFn: mockFetch,
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ParseError);

      // Spy on fetchCwaForecast rejecting with this ParseError to test Route Handler output
      vi.spyOn(cwaClientModule, "fetchCwaForecast").mockRejectedValue(caughtError);

      const routeResponse = await GET();
      expect(routeResponse.status).toBe(502);

      // Verify Content-Type charset is still present on error
      expect(routeResponse.headers.get("Content-Type")).toBe(JSON_CONTENT_TYPE);

      const json = await routeResponse.json();
      expect(json.ok).toBe(false);
      expect(json.data).toBeNull();
      expect(json.error.code).toBe("PARSE_ERROR");
      expect(json.error.message).toBe("Invalid JSON response received from upstream service.");

      // Check serialization safety: NO raw bytes, NO keys, NO stack traces
      const rawSerialized = JSON.stringify(json);
      expect(rawSerialized).not.toContain(secretKey);
      expect(rawSerialized).not.toContain("255");
      expect(rawSerialized).not.toContain("254");
      expect(rawSerialized).not.toContain("0xFF");
      expect(rawSerialized).not.toContain("0xFE");
      expect(rawSerialized).not.toContain("\uFFFD");
      expect(rawSerialized).not.toContain("stack");
      expect(rawSerialized).not.toContain("at ");
    });
  });
});
