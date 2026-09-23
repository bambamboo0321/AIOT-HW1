import { describe, it, expect } from "vitest";
import {
  TAIWAN_COUNTY_COORDINATES,
  EXPECTED_TAIWAN_REGIONS,
} from "@/lib/data/county-coordinates";
import {
  getTemperatureColorStyle,
  prepareCountyMapMarkers,
  getDefaultMapDate,
  COLOR_MAP,
} from "@/lib/map/marker-helpers";
import { NormalizedForecastData } from "@/lib/contracts/weather";

describe("Taiwan Map Data & Markers (marker-helpers.ts & county-coordinates.ts)", () => {
  it("contains coordinates for all 22 official Taiwan divisions matching EXPECTED_TAIWAN_REGIONS", () => {
    expect(EXPECTED_TAIWAN_REGIONS).toHaveLength(22);
    expect(Object.keys(TAIWAN_COUNTY_COORDINATES)).toHaveLength(22);
    expect(COLOR_MAP.blue.hex).toBe("#3b82f6");

    for (const region of EXPECTED_TAIWAN_REGIONS) {
      expect(TAIWAN_COUNTY_COORDINATES[region]).toBeDefined();
      expect(TAIWAN_COUNTY_COORDINATES[region].region).toBe(region);
      expect(TAIWAN_COUNTY_COORDINATES[region].seatName).toBeTruthy();
    }
  });

  it("verifies all 22 coordinate pairs are within reasonable Taiwan geographic bounds", () => {
    // Taiwan bounding box (including offshore Kinmen, Matsu, Penghu):
    // Latitude roughly 21.5°N to 26.5°N
    // Longitude roughly 118.0°E to 122.5°E
    for (const coord of Object.values(TAIWAN_COUNTY_COORDINATES)) {
      expect(coord.latitude).toBeGreaterThanOrEqual(21.0);
      expect(coord.latitude).toBeLessThanOrEqual(27.0);
      expect(coord.longitude).toBeGreaterThanOrEqual(118.0);
      expect(coord.longitude).toBeLessThanOrEqual(123.0);
    }
  });

  it("classifies temperature colors with fixed thresholds (<20, 20-25, 25-30, >=30, null)", () => {
    // maxTemp < 20: blue
    expect(getTemperatureColorStyle(19.9).category).toBe("blue");
    expect(getTemperatureColorStyle(10.0).category).toBe("blue");
    expect(getTemperatureColorStyle(-2.0).category).toBe("blue");

    // 20 <= maxTemp < 25: green
    expect(getTemperatureColorStyle(20.0).category).toBe("green");
    expect(getTemperatureColorStyle(24.9).category).toBe("green");

    // 25 <= maxTemp < 30: orange
    expect(getTemperatureColorStyle(25.0).category).toBe("orange");
    expect(getTemperatureColorStyle(29.9).category).toBe("orange");

    // maxTemp >= 30: red
    expect(getTemperatureColorStyle(30.0).category).toBe("red");
    expect(getTemperatureColorStyle(35.5).category).toBe("red");

    // null, undefined, NaN: gray
    expect(getTemperatureColorStyle(null).category).toBe("gray");
    expect(getTemperatureColorStyle(undefined).category).toBe("gray");
    expect(getTemperatureColorStyle(NaN).category).toBe("gray");
  });

  it("prepares markers matching target date correctly across all 22 regions", () => {
    const mockData: NormalizedForecastData = {
      datasetId: "F-D0047-091",
      fetchedAt: "2026-09-24T00:00:00.000Z",
      regions: EXPECTED_TAIWAN_REGIONS.map((regionName) => ({
        region: regionName,
        intervals: [
          {
            startTime: "2026-09-24T06:00:00+08:00",
            endTime: "2026-09-24T18:00:00+08:00",
            minTemp: 23,
            maxTemp: regionName === "臺北市" ? 32 : 27,
          },
          {
            startTime: "2026-09-24T18:00:00+08:00",
            endTime: "2026-09-25T06:00:00+08:00",
            minTemp: 21,
            maxTemp: 25,
          },
        ],
      })),
    };

    const markers = prepareCountyMapMarkers(mockData, "2026-09-24");
    expect(markers).toHaveLength(22);

    const taipeiMarker = markers.find((m) => m.region === "臺北市");
    expect(taipeiMarker).toBeDefined();
    expect(taipeiMarker?.maxTemp).toBe(32);
    expect(taipeiMarker?.minTemp).toBe(21);
    expect(taipeiMarker?.colorStyle.category).toBe("red");
    expect(taipeiMarker?.intervalCount).toBe(2);
    expect(taipeiMarker?.isPartial).toBe(false);
  });

  it("safely handles missing regions for a target date without throwing", () => {
    // Only 1 region present
    const incompleteData: NormalizedForecastData = {
      datasetId: "F-D0047-091",
      fetchedAt: "2026-09-24T00:00:00.000Z",
      regions: [
        {
          region: "臺北市",
          intervals: [
            {
              startTime: "2026-09-24T06:00:00+08:00",
              endTime: "2026-09-24T18:00:00+08:00",
              minTemp: 22,
              maxTemp: 28,
            },
          ],
        },
      ],
    };

    const markers = prepareCountyMapMarkers(incompleteData, "2026-09-24");
    // Should still produce 22 entries so the map renders every county gracefully
    expect(markers).toHaveLength(22);

    const missingMarker = markers.find((m) => m.region === "高雄市");
    expect(missingMarker).toBeDefined();
    expect(missingMarker?.maxTemp).toBeNull();
    expect(missingMarker?.minTemp).toBeNull();
    expect(missingMarker?.colorStyle.category).toBe("gray");
    expect(missingMarker?.intervalCount).toBe(0);
    expect(missingMarker?.isPartial).toBe(true);
  });

  it("determines default map date prioritizing earliest complete date over partial dates", () => {
    const dataWithPartialFirstDay: NormalizedForecastData = {
      datasetId: "F-D0047-091",
      fetchedAt: "2026-09-24T00:00:00.000Z",
      regions: EXPECTED_TAIWAN_REGIONS.map((regionName) => ({
        region: regionName,
        intervals: [
          // 2026-09-24 has only 1 interval (partial)
          {
            startTime: "2026-09-24T18:00:00+08:00",
            endTime: "2026-09-25T06:00:00+08:00",
            minTemp: 20,
            maxTemp: 25,
          },
          // 2026-09-25 has 2 intervals (complete)
          {
            startTime: "2026-09-25T06:00:00+08:00",
            endTime: "2026-09-25T18:00:00+08:00",
            minTemp: 21,
            maxTemp: 29,
          },
          {
            startTime: "2026-09-25T18:00:00+08:00",
            endTime: "2026-09-26T06:00:00+08:00",
            minTemp: 22,
            maxTemp: 26,
          },
        ],
      })),
    };

    const defaultDate = getDefaultMapDate(dataWithPartialFirstDay);
    // Should pick 2026-09-25 because it is the earliest complete date!
    expect(defaultDate).toBe("2026-09-25");
  });
});
