import { describe, it, expect } from "vitest";
import {
  normalizeCwaObservations,
  parseTemperature,
  parseRelativeHumidity,
  parseWindSpeed,
  parseWindDirection,
  parseElevation,
  parsePrecipitation,
} from "@/lib/server/cwa-observation-client";
import {
  getWind8Direction,
  formatWindDirection,
} from "@/lib/transformations/wind";
import {
  formatPrecipitation,
  getPrecipitationDescription,
} from "@/lib/transformations/precipitation";
import {
  haversineDistanceKm,
  filterStationsByCounty,
  findClosestStation,
} from "@/lib/transformations/stations";
import { NormalizedStationObservation } from "@/lib/contracts/observations";

describe("Milestone M10: Observation Normalization & Element Semantics", () => {
  // Test 1: Real structure fixture correctly parses dailyPrecipitation and station info
  it("parses realistic CWA O-A0003-001 JSON fixture into normalized station structure with dailyPrecipitation", () => {
    const rawFixture = {
      success: "true",
      records: {
        Station: [
          {
            StationId: "466940",
            StationName: "基隆",
            ObsTime: {
              DateTime: "2026-09-23T22:30:00+08:00",
            },
            GeoInfo: {
              Coordinates: [
                {
                  CoordinateName: "TWD67",
                  StationLatitude: "25.135104",
                  StationLongitude: "121.732242",
                },
                {
                  CoordinateName: "WGS84",
                  CoordinateFormat: "decimal degrees",
                  StationLatitude: "25.133314",
                  StationLongitude: "121.740475",
                },
              ],
              StationAltitude: "26.7",
              CountyName: "基隆市",
              TownName: "仁愛區",
            },
            WeatherElement: {
              AirTemperature: "25.8",
              RelativeHumidity: "78",
              WindSpeed: "1.2",
              WindDirection: "135.0",
              Now: {
                Precipitation: "15.5",
              },
            },
          },
        ],
      },
    };

    const normalized = normalizeCwaObservations(rawFixture, "2026-09-23T14:30:00.000Z");
    expect(normalized.datasetId).toBe("O-A0003-001");
    expect(normalized.fetchedAt).toBe("2026-09-23T14:30:00.000Z");
    expect(normalized.stations).toHaveLength(1);

    const s = normalized.stations[0];
    expect(s.stationId).toBe("466940");
    expect(s.stationName).toBe("基隆");
    expect(s.county).toBe("基隆市");
    expect(s.town).toBe("仁愛區");
    expect(s.latitude).toBeCloseTo(25.133314, 5); // WGS84
    expect(s.longitude).toBeCloseTo(121.740475, 5); // WGS84
    expect(s.elevation).toBe(26.7);
    expect(s.observedAt).toBe("2026-09-23T22:30:00+08:00");
    expect(s.temperature).toBe(25.8);
    expect(s.relativeHumidity).toBe(78);
    expect(s.windSpeed).toBe(1.2);
    expect(s.windDirection).toBe(135.0);
    expect(s.dailyPrecipitation).toBe(15.5);
    expect(s.precipitationStatus).toBe("normal");
  });

  // Test 2: Precipitation special value parsing: normal, 0.0, T, -98, -99, X
  it("accurately handles precipitation special values: normal, legitimate 0, T (雨跡), -98 (連續6小時無降水), -99 (缺測), X (故障)", () => {
    // Normal positive
    const normal = parsePrecipitation("12.5");
    expect(normal.value).toBe(12.5);
    expect(normal.status).toBe("normal");
    expect(formatPrecipitation(normal.value, normal.status)).toBe("12.5 mm");

    // Legitimate 0 mm
    const zero = parsePrecipitation("0.0");
    expect(zero.value).toBe(0.0);
    expect(zero.status).toBe("normal");
    expect(formatPrecipitation(zero.value, zero.status)).toBe("0.0 mm");

    // 'T' (雨跡)
    const trace = parsePrecipitation("T");
    expect(trace.value).toBeNull();
    expect(trace.status).toBe("trace");
    expect(formatPrecipitation(trace.value, trace.status)).toBe("雨跡");
    expect(getPrecipitationDescription(trace.value, trace.status)).toContain("微量降水");

    // '-98' (連續 6 小時無降水)
    const none6hr = parsePrecipitation("-98");
    expect(none6hr.value).toBeNull();
    expect(none6hr.status).toBe("none_6hr");
    expect(formatPrecipitation(none6hr.value, none6hr.status)).toBe("連續6小時無降水");
    expect(getPrecipitationDescription(none6hr.value, none6hr.status)).toContain("6 小時");

    // '-99' (缺測)
    const missing = parsePrecipitation("-99");
    expect(missing.value).toBeNull();
    expect(missing.status).toBe("missing");
    expect(formatPrecipitation(missing.value, missing.status)).toBe("—");

    // 'X' (故障)
    const fault = parsePrecipitation("X");
    expect(fault.value).toBeNull();
    expect(fault.status).toBe("fault");
    expect(formatPrecipitation(fault.value, fault.status)).toBe("儀器故障");
  });

  // Test 3: Wind direction special values: 0° (北), 990 (風向不定), -99 / X (缺測/故障)
  it("accurately handles wind direction: 0° (北), 990 (風向不定), -99/X as null", () => {
    // 0° North
    expect(parseWindDirection("0")).toBe(0);
    expect(parseWindDirection("0.0")).toBe(0);
    expect(formatWindDirection(0)).toBe("北 (0°)");

    // 990 Variable wind direction
    expect(parseWindDirection("990")).toBe(990);
    expect(parseWindDirection(990)).toBe(990);
    expect(formatWindDirection(990)).toBe("風向不定");
    expect(getWind8Direction(990)).toBeNull(); // 990 does not map to a fixed 8-point compass

    // -99, X, out-of-range -> null
    expect(parseWindDirection("-99")).toBeNull();
    expect(parseWindDirection("X")).toBeNull();
    expect(parseWindDirection("400")).toBeNull();
    expect(formatWindDirection(null)).toBe("—");
  });

  // Test 4: Element-specific range validations without blunt <= -90 rule
  it("uses individual domain-specific parsers instead of a generic <= -90 filter", () => {
    // Temperature: allows sub-zero temperatures (e.g. -5.0°C on Yushan), rejects -99, X, or impossible values (< -50 or > 60)
    expect(parseTemperature("-5.2")).toBe(-5.2);
    expect(parseTemperature("0.0")).toBe(0.0);
    expect(parseTemperature("38.5")).toBe(38.5);
    expect(parseTemperature("-99")).toBeNull();
    expect(parseTemperature("X")).toBeNull();
    expect(parseTemperature("-60")).toBeNull();

    // Relative humidity: 0 to 100%, preserves 0%, rejects -99, X, > 100
    expect(parseRelativeHumidity("0")).toBe(0);
    expect(parseRelativeHumidity("85")).toBe(85);
    expect(parseRelativeHumidity("100")).toBe(100);
    expect(parseRelativeHumidity("-99")).toBeNull();
    expect(parseRelativeHumidity("150")).toBeNull();

    // Wind speed: >= 0, preserves 0.0 m/s (calm), rejects -99, X
    expect(parseWindSpeed("0.0")).toBe(0.0);
    expect(parseWindSpeed("15.2")).toBe(15.2);
    expect(parseWindSpeed("-99")).toBeNull();
    expect(parseWindSpeed("X")).toBeNull();

    // Elevation: allows below sea level down to -50m up to 4500m, rejects -99
    expect(parseElevation("25.0")).toBe(25.0);
    expect(parseElevation("-2.0")).toBe(-2.0);
    expect(parseElevation("-99")).toBeNull();
  });

  // Test 5: Traditional Chinese station and county names have no mojibake
  it("preserves Traditional Chinese characters without mojibake", () => {
    const rawChinese = {
      success: "true",
      records: {
        Station: [
          {
            StationId: "C0E750",
            StationName: "大湖",
            ObsTime: { DateTime: "2026-09-23T22:30:00+08:00" },
            GeoInfo: {
              Coordinates: [{ CoordinateName: "WGS84", StationLatitude: "24.4", StationLongitude: "120.8" }],
              CountyName: "苗栗縣",
              TownName: "大湖鄉",
            },
            WeatherElement: {
              AirTemperature: "24.2",
            },
          },
        ],
      },
    };

    const result = normalizeCwaObservations(rawChinese);
    expect(result.stations[0].stationName).toBe("大湖");
    expect(result.stations[0].county).toBe("苗栗縣");
    expect(result.stations[0].town).toBe("大湖鄉");
  });

  // Test 6: County filtering accurately selects stations
  it("accurately filters stations by county", () => {
    const mockStations: NormalizedStationObservation[] = [
      {
        stationId: "1",
        stationName: "臺北測站",
        county: "臺北市",
        town: "中正區",
        latitude: 25.03,
        longitude: 121.51,
        elevation: 10,
        observedAt: "2026-09-23T22:00:00+08:00",
        temperature: 26,
        relativeHumidity: 70,
        windSpeed: 2,
        windDirection: 90,
        dailyPrecipitation: 0,
        precipitationStatus: "normal",
      },
      {
        stationId: "2",
        stationName: "板橋測站",
        county: "新北市",
        town: "板橋區",
        latitude: 25.01,
        longitude: 121.46,
        elevation: 15,
        observedAt: "2026-09-23T22:00:00+08:00",
        temperature: 25.5,
        relativeHumidity: 72,
        windSpeed: 1.5,
        windDirection: 100,
        dailyPrecipitation: 0,
        precipitationStatus: "normal",
      },
      {
        stationId: "3",
        stationName: "苗栗測站",
        county: "苗栗縣",
        town: "苗栗市",
        latitude: 24.56,
        longitude: 120.82,
        elevation: 35,
        observedAt: "2026-09-23T22:00:00+08:00",
        temperature: 24,
        relativeHumidity: 80,
        windSpeed: 1,
        windDirection: 180,
        dailyPrecipitation: 0,
        precipitationStatus: "normal",
      },
    ];

    const taipei = filterStationsByCounty(mockStations, "臺北市");
    expect(taipei).toHaveLength(1);
    expect(taipei[0].stationName).toBe("臺北測站");

    const miaoli = filterStationsByCounty(mockStations, "苗栗縣");
    expect(miaoli).toHaveLength(1);
    expect(miaoli[0].stationName).toBe("苗栗測站");

    const unknown = filterStationsByCounty(mockStations, "未知縣市");
    expect(unknown).toHaveLength(0);
  });

  // Test 7: Closest station selection uses Haversine distance
  it("determines the closest station to the county seat using Haversine distance", () => {
    const dist = haversineDistanceKm(25.0478, 121.517, 25.0143, 121.4637);
    expect(dist).toBeGreaterThan(6.0);
    expect(dist).toBeLessThan(7.5);

    const candidates: NormalizedStationObservation[] = [
      {
        stationId: "A1",
        stationName: "大湖站",
        county: "苗栗縣",
        town: "大湖鄉",
        latitude: 24.42,
        longitude: 120.86,
        elevation: 200,
        observedAt: "2026-09-23T22:00:00+08:00",
        temperature: 23,
        relativeHumidity: 85,
        windSpeed: 1,
        windDirection: 100,
        dailyPrecipitation: 0,
        precipitationStatus: "normal",
      },
      {
        stationId: "A2",
        stationName: "苗栗市站",
        county: "苗栗縣",
        town: "苗栗市",
        latitude: 24.561,
        longitude: 120.821,
        elevation: 40,
        observedAt: "2026-09-23T22:00:00+08:00",
        temperature: 24.5,
        relativeHumidity: 78,
        windSpeed: 1.2,
        windDirection: 120,
        dailyPrecipitation: 0,
        precipitationStatus: "normal",
      },
    ];

    const closest = findClosestStation(candidates, 24.56, 120.82);
    expect(closest).not.toBeNull();
    expect(closest?.stationId).toBe("A2");
    expect(closest?.stationName).toBe("苗栗市站");
  });
});
