import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  parseUVIndex,
  classifyUV,
  buildUVForecastItem,
} from "@/lib/transformations/uv";
import { aggregateDailyForecasts } from "@/lib/transformations/daily";
import { normalizeCwaForecast } from "@/lib/server/cwa-client";
import { UVCard } from "@/components/weather/UVCard";

describe("Milestone M12: UV Index Pure Transformations & Classifications", () => {
  describe("UV Parsing Boundaries & Value Sanitization", () => {
    it("preserves valid 0 and positive numeric UV indices", () => {
      expect(parseUVIndex(0)).toBe(0);
      expect(parseUVIndex("0")).toBe(0);
      expect(parseUVIndex(5)).toBe(5);
      expect(parseUVIndex("7.2")).toBe(7.2);
      expect(parseUVIndex(11)).toBe(11);
      expect(parseUVIndex("14")).toBe(14);
    });

    it("converts blanks, N/A, NaN, and negative values to null", () => {
      expect(parseUVIndex(null)).toBeNull();
      expect(parseUVIndex(undefined)).toBeNull();
      expect(parseUVIndex("")).toBeNull();
      expect(parseUVIndex("   ")).toBeNull();
      expect(parseUVIndex("N/A")).toBeNull();
      expect(parseUVIndex("NaN")).toBeNull();
      expect(parseUVIndex("invalid")).toBeNull();
      expect(parseUVIndex(-1)).toBeNull();
      expect(parseUVIndex("-5")).toBeNull();
    });
  });

  describe("CWA & WHO Official 5-Tier Level Boundaries", () => {
    it("classifies 0, 1, 2 as 低量級", () => {
      const cat0 = classifyUV(0);
      expect(cat0.level).toBe("低量級");
      expect(cat0.displayValue).toBe("0");
      expect(cat0.officialColorName).toBe("綠色");
      expect(cat0.protectionAdvice).toContain("一般戶外活動");

      const cat2 = classifyUV(2);
      expect(cat2.level).toBe("低量級");
      expect(cat2.displayValue).toBe("2");
    });

    it("classifies 3, 4, 5 as 中量級", () => {
      const cat3 = classifyUV(3);
      expect(cat3.level).toBe("中量級");
      expect(cat3.displayValue).toBe("3");
      expect(cat3.officialColorName).toBe("黃色");
      expect(cat3.protectionAdvice).toContain("防曬乳、帽子");

      const cat5 = classifyUV(5);
      expect(cat5.level).toBe("中量級");
      expect(cat5.displayValue).toBe("5");
    });

    it("classifies 6, 7 as 高量級", () => {
      const cat6 = classifyUV(6);
      expect(cat6.level).toBe("高量級");
      expect(cat6.displayValue).toBe("6");
      expect(cat6.officialColorName).toBe("橘色");
      expect(cat6.protectionAdvice).toContain("加強防曬");
      expect(cat6.protectionAdvice).toContain("減少中午時段");

      const cat7 = classifyUV(7);
      expect(cat7.level).toBe("高量級");
      expect(cat7.displayValue).toBe("7");
    });

    it("classifies 8, 9, 10 strictly as 過量級 (NEVER called 危險級)", () => {
      const cat8 = classifyUV(8);
      expect(cat8.level).toBe("過量級");
      expect(cat8.level).not.toBe("危險級");
      expect(cat8.displayValue).toBe("8");
      expect(cat8.officialColorName).toBe("紅色");
      expect(cat8.protectionAdvice).toContain("優先待在陰影處");

      const cat10 = classifyUV(10);
      expect(cat10.level).toBe("過量級");
      expect(cat10.level).not.toBe("危險級");
      expect(cat10.displayValue).toBe("10");
    });

    it("classifies 11 and above as 危險級 with 11+ display format", () => {
      const cat11 = classifyUV(11);
      expect(cat11.level).toBe("危險級");
      expect(cat11.displayValue).toBe("11+");
      expect(cat11.officialColorName).toBe("紫色");
      expect(cat11.protectionAdvice).toContain("儘量避免戶外曝曬");

      const cat15 = classifyUV(15);
      expect(cat15.level).toBe("危險級");
      expect(cat15.displayValue).toBe("15+");
      expect(cat15.protectionAdvice).toContain("儘量避免戶外曝曬");
    });

    it("classifies null and invalid numbers as 無資料", () => {
      const catNull = classifyUV(null);
      expect(catNull.level).toBe("無資料");
      expect(catNull.displayValue).toBe("N/A");
      expect(catNull.protectionAdvice).toContain("目前無紫外線資料");
    });
  });

  describe("UV Item Construction & Daily Aggregation", () => {
    it("builds UVForecastItem with daytime data meaning", () => {
      const item = buildUVForecastItem({
        datasetId: "F-D0047-091",
        fetchedAt: "2026-09-24T09:00:00Z",
        county: "臺北市",
        forecastDate: "2026-09-24",
        startTime: "2026-09-24T06:00:00+08:00",
        endTime: "2026-09-24T18:00:00+08:00",
        uvIndex: 7,
      });

      expect(item.county).toBe("臺北市");
      expect(item.forecastDate).toBe("2026-09-24");
      expect(item.uvIndex).toBe(7);
      expect(item.level).toBe("高量級");
      expect(item.displayValue).toBe("7");
      expect(item.dataMeaning).toBe("forecast_daytime");
    });

    it("maps UV items into DailyForecast in aggregateDailyForecasts", () => {
      const intervals = [
        {
          startTime: "2026-09-24T06:00:00+08:00",
          endTime: "2026-09-24T18:00:00+08:00",
          minTemp: 24,
          maxTemp: 31,
        },
        {
          startTime: "2026-09-24T18:00:00+08:00",
          endTime: "2026-09-25T06:00:00+08:00",
          minTemp: 23,
          maxTemp: 26,
        },
      ];

      const uvForecasts = [
        buildUVForecastItem({
          datasetId: "F-D0047-091",
          fetchedAt: "2026-09-24T00:00:00Z",
          county: "臺北市",
          forecastDate: "2026-09-24",
          uvIndex: 6,
        }),
      ];

      const daily = aggregateDailyForecasts(intervals, uvForecasts);
      expect(daily).toHaveLength(1);
      expect(daily[0].forecastDate).toBe("2026-09-24");
      expect(daily[0].uv).not.toBeNull();
      expect(daily[0].uv?.level).toBe("高量級");
      expect(daily[0].uv?.uvIndex).toBe(6);
    });
  });

  describe("Optional-safe CWA Forecast Normalizer", () => {
    it("successfully parses forecast even when 紫外線指數 is completely absent", () => {
      const rawPayloadWithoutUV = {
        success: "true",
        records: {
          Locations: [
            {
              Location: [
                {
                  LocationName: "臺北市",
                  WeatherElement: [
                    {
                      ElementName: "最低溫度",
                      Time: [
                        {
                          StartTime: "2026-09-24T06:00:00+08:00",
                          EndTime: "2026-09-24T18:00:00+08:00",
                          ElementValue: [{ MinTemperature: "22" }],
                        },
                      ],
                    },
                    {
                      ElementName: "最高溫度",
                      Time: [
                        {
                          StartTime: "2026-09-24T06:00:00+08:00",
                          EndTime: "2026-09-24T18:00:00+08:00",
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

      const normalized = normalizeCwaForecast(rawPayloadWithoutUV);
      expect(normalized.regions).toHaveLength(1);
      expect(normalized.regions[0].region).toBe("臺北市");
      expect(normalized.regions[0].intervals).toHaveLength(1);
      expect(normalized.regions[0].uvForecasts).toBeUndefined();
    });

    it("parses 紫外線指數 when present in F-D0047-091", () => {
      const rawPayloadWithUV = {
        success: "true",
        records: {
          Locations: [
            {
              Location: [
                {
                  LocationName: "臺北市",
                  WeatherElement: [
                    {
                      ElementName: "最低溫度",
                      Time: [
                        {
                          StartTime: "2026-09-24T06:00:00+08:00",
                          EndTime: "2026-09-24T18:00:00+08:00",
                          ElementValue: [{ MinTemperature: "22" }],
                        },
                      ],
                    },
                    {
                      ElementName: "最高溫度",
                      Time: [
                        {
                          StartTime: "2026-09-24T06:00:00+08:00",
                          EndTime: "2026-09-24T18:00:00+08:00",
                          ElementValue: [{ MaxTemperature: "30" }],
                        },
                      ],
                    },
                    {
                      ElementName: "紫外線指數",
                      Time: [
                        {
                          StartTime: "2026-09-24T06:00:00+08:00",
                          EndTime: "2026-09-24T18:00:00+08:00",
                          ElementValue: [{ UVIndex: "11", UVExposureLevel: "危險級" }],
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

      const normalized = normalizeCwaForecast(rawPayloadWithUV);
      expect(normalized.regions[0].uvForecasts).toBeDefined();
      expect(normalized.regions[0].uvForecasts).toHaveLength(1);
      expect(normalized.regions[0].uvForecasts![0].uvIndex).toBe(11);
      expect(normalized.regions[0].uvForecasts![0].level).toBe("危險級");
      expect(normalized.regions[0].uvForecasts![0].displayValue).toBe("11+");
      expect(normalized.regions[0].uvForecasts![0].dataMeaning).toBe("forecast_daytime");
    });
  });

  describe("UVCard Component Rendering", () => {
    it("renders UV card with official level, advice, and time period", () => {
      const uvItem = buildUVForecastItem({
        datasetId: "F-D0047-091",
        fetchedAt: "2026-09-24T09:00:00Z",
        county: "臺北市",
        forecastDate: "2026-09-24",
        uvIndex: 7,
      });

      const html = renderToStaticMarkup(
        <UVCard region="臺北市" selectedDate="2026-09-24" uvItem={uvItem} />
      );

      expect(html).toContain("紫外線指數預報");
      expect(html).toContain("白天 UV 預報");
      expect(html).toContain("高量級");
      expect(html).toContain("7");
      expect(html).toContain("一般防護建議");
      expect(html).toContain("減少中午時段");
      expect(html).toContain("06:00 ～ 18:00");
    });

    it("renders empty state when date has no UV data", () => {
      const html = renderToStaticMarkup(
        <UVCard region="臺北市" selectedDate="2026-10-15" uvItem={null} />
      );

      expect(html).toContain("該日期無紫外線資料");
      expect(html).toContain("7 天內白天時段");
    });

    it("renders loading state", () => {
      const html = renderToStaticMarkup(
        <UVCard region="臺北市" isLoading={true} />
      );

      expect(html).toContain("正在讀取 臺北市 紫外線預報");
    });
  });
});
