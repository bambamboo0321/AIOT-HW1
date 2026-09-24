import { describe, it, expect } from "vitest";
import {
  normalizeMoenvAirQuality,
  parseAirQualityNumber,
  normalizePublishTime,
} from "@/lib/server/moenv-client";
import {
  normalizeCountyName,
  getAqiCategory,
  computeCountyAqiSummary,
  filterAirQualityStationsByCounty,
} from "@/lib/transformations/air-quality";
import { NormalizedStationAirQuality } from "@/lib/contracts/air-quality";

describe("Milestone M11: Air Quality Normalization & Transformations", () => {
  // Test 1: Real structure desensitized fixture parsing
  it("parses realistic MOENV AQX_P_432 fixture into normalized air quality station structure", () => {
    const rawFixture = [
      {
        siteid: "2",
        sitename: "汐止",
        county: "新北市",
        aqi: "48",
        status: "良好",
        pollutant: "",
        so2: "0.7",
        co: "0.15",
        o3: "30.0",
        pm10: "18",
        "pm2.5": "11",
        no2: "7.0",
        publishtime: "2026/09/24 09:00:00",
        longitude: "121.64081",
        latitude: "25.06624",
      },
      {
        siteid: "1",
        sitename: "基隆",
        county: "基隆市",
        aqi: "55",
        status: "普通",
        pollutant: "細懸浮微粒",
        so2: "1.2",
        co: "0.22",
        o3: "42.0",
        pm10: "25",
        "pm2.5": "16",
        no2: "12.0",
        publishtime: "2026/09/24 09:00:00",
        longitude: "121.760056",
        latitude: "25.129167",
      },
    ];

    const normalized = normalizeMoenvAirQuality(rawFixture, "2026-09-24T01:00:00.000Z");
    expect(normalized.datasetId).toBe("AQX_P_432");
    expect(normalized.fetchedAt).toBe("2026-09-24T01:00:00.000Z");
    expect(normalized.stations).toHaveLength(2);

    const s1 = normalized.stations.find((s) => s.stationId === "2");
    expect(s1).toBeDefined();
    expect(s1?.stationName).toBe("汐止");
    expect(s1?.county).toBe("新北市");
    expect(s1?.aqi).toBe(48);
    expect(s1?.status).toBe("良好");
    expect(s1?.primaryPollutant).toBeNull();
    expect(s1?.pm25).toBe(11);
    expect(s1?.pm10).toBe(18);
    expect(s1?.ozone).toBe(30.0);
    expect(s1?.carbonMonoxide).toBe(0.15);
    expect(s1?.sulfurDioxide).toBe(0.7);
    expect(s1?.nitrogenDioxide).toBe(7.0);
    expect(s1?.publishedAt).toBe("2026-09-24T09:00:00+08:00");
    expect(s1?.latitude).toBeCloseTo(25.06624, 4);
    expect(s1?.longitude).toBeCloseTo(121.64081, 4);
  });

  // Test 2: Handles object envelope with records array as well
  it("parses object envelope with records array { records: [...] }", () => {
    const rawEnvelope = {
      records: [
        {
          siteid: "11",
          sitename: "中山",
          county: "臺北市",
          aqi: "35",
          status: "良好",
          "pm2.5": "8",
          pm10: "15",
          publishtime: "2026-09-24 09:00:00",
          longitude: "121.526556",
          latitude: "25.062222",
        },
      ],
    };

    const normalized = normalizeMoenvAirQuality(rawEnvelope);
    expect(normalized.stations).toHaveLength(1);
    expect(normalized.stations[0].stationName).toBe("中山");
    expect(normalized.stations[0].county).toBe("臺北市");
  });

  // Test 3: AQI, PM2.5, PM10 & pollutant parsing with legitimate 0 preserved
  it("strictly preserves legitimate 0 values for AQI and pollutants", () => {
    expect(parseAirQualityNumber("0")).toBe(0);
    expect(parseAirQualityNumber("0.0")).toBe(0);
    expect(parseAirQualityNumber(0)).toBe(0);

    const rawWithZeros = [
      {
        siteid: "99",
        sitename: "零值測試站",
        county: "臺北市",
        aqi: "0",
        status: "良好",
        "pm2.5": "0.0",
        pm10: "0",
        co: "0.0",
        so2: "0.0",
        no2: "0.0",
        o3: "0.0",
        publishtime: "2026/09/24 09:00:00",
        latitude: "25.0",
        longitude: "121.5",
      },
    ];

    const result = normalizeMoenvAirQuality(rawWithZeros);
    const st = result.stations[0];
    expect(st.aqi).toBe(0);
    expect(st.pm25).toBe(0);
    expect(st.pm10).toBe(0);
    expect(st.carbonMonoxide).toBe(0);
    expect(st.sulfurDioxide).toBe(0);
    expect(st.nitrogenDioxide).toBe(0);
    expect(st.ozone).toBe(0);
  });

  // Test 4: Empty string and official missing codes ('-', 'ND', 'N/A', '-99') convert to null
  it("converts empty string, '-', 'ND', 'N/A', and '-99' to null (never forged to 0)", () => {
    expect(parseAirQualityNumber("")).toBeNull();
    expect(parseAirQualityNumber("   ")).toBeNull();
    expect(parseAirQualityNumber("-")).toBeNull();
    expect(parseAirQualityNumber("ND")).toBeNull();
    expect(parseAirQualityNumber("N/A")).toBeNull();
    expect(parseAirQualityNumber("NAN")).toBeNull();
    expect(parseAirQualityNumber("-99")).toBeNull();
    expect(parseAirQualityNumber("-99.0")).toBeNull();
    expect(parseAirQualityNumber("X")).toBeNull();
    expect(parseAirQualityNumber(null)).toBeNull();
    expect(parseAirQualityNumber(undefined)).toBeNull();

    const rawMissing = [
      {
        siteid: "100",
        sitename: "缺測站",
        county: "臺南市",
        aqi: "-",
        status: "",
        pollutant: "-",
        "pm2.5": "ND",
        pm10: "",
        co: "-99",
        publishtime: "2026/09/24 09:00:00",
        latitude: "23.0",
        longitude: "120.2",
      },
    ];

    const result = normalizeMoenvAirQuality(rawMissing);
    const st = result.stations[0];
    expect(st.aqi).toBeNull();
    expect(st.status).toBeNull();
    expect(st.primaryPollutant).toBeNull();
    expect(st.pm25).toBeNull();
    expect(st.pm10).toBeNull();
    expect(st.carbonMonoxide).toBeNull();
  });

  // Test 5: "台" <-> "臺" county normalization
  it("normalizes county names from '台' to '臺'", () => {
    expect(normalizeCountyName("台北市")).toBe("臺北市");
    expect(normalizeCountyName("台中市")).toBe("臺中市");
    expect(normalizeCountyName("台南市")).toBe("臺南市");
    expect(normalizeCountyName("台東縣")).toBe("臺東縣");
    expect(normalizeCountyName("新北市")).toBe("新北市");

    const stations: NormalizedStationAirQuality[] = [
      {
        stationId: "1",
        stationName: "測站A",
        county: "臺北市",
        latitude: 25.0,
        longitude: 121.5,
        publishedAt: "2026-09-24T09:00:00+08:00",
        aqi: 45,
        status: "良好",
        primaryPollutant: null,
        pm25: 10,
        pm10: 20,
        ozone: 30,
        carbonMonoxide: 0.2,
        sulfurDioxide: 1,
        nitrogenDioxide: 5,
      },
    ];

    // Filter using "台北市" should match station with "臺北市"
    const filtered = filterAirQualityStationsByCounty(stations, "台北市");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].county).toBe("臺北市");
  });

  // Test 6: County maximum AQI selection rule (worst air quality)
  it("selects the maximum AQI in the county as county summary (representing worst air quality)", () => {
    const stations: NormalizedStationAirQuality[] = [
      {
        stationId: "A1",
        stationName: "淡水",
        county: "新北市",
        latitude: 25.1,
        longitude: 121.4,
        publishedAt: "2026-09-24T09:00:00+08:00",
        aqi: 42,
        status: "良好",
        primaryPollutant: null,
        pm25: 10,
        pm10: 20,
        ozone: 35,
        carbonMonoxide: 0.1,
        sulfurDioxide: 1,
        nitrogenDioxide: 6,
      },
      {
        stationId: "A2",
        stationName: "三重",
        county: "新北市",
        latitude: 25.07,
        longitude: 121.49,
        publishedAt: "2026-09-24T09:00:00+08:00",
        aqi: 88, // Highest AQI
        status: "普通",
        primaryPollutant: "細懸浮微粒",
        pm25: 28,
        pm10: 45,
        ozone: 20,
        carbonMonoxide: 0.4,
        sulfurDioxide: 2,
        nitrogenDioxide: 18,
      },
      {
        stationId: "A3",
        stationName: "新店",
        county: "新北市",
        latitude: 24.97,
        longitude: 121.53,
        publishedAt: "2026-09-24T09:00:00+08:00",
        aqi: 56,
        status: "普通",
        primaryPollutant: "細懸浮微粒",
        pm25: 16,
        pm10: 25,
        ozone: 25,
        carbonMonoxide: 0.2,
        sulfurDioxide: 1,
        nitrogenDioxide: 10,
      },
    ];

    const summary = computeCountyAqiSummary(stations, "新北市");
    expect(summary.maxAqi).toBe(88);
    expect(summary.sourceStationId).toBe("A2");
    expect(summary.sourceStationName).toBe("三重");
    expect(summary.status).toBe("普通");
    expect(summary.primaryPollutant).toBe("細懸浮微粒");
    expect(summary.pm25).toBe(28);
    expect(summary.pm10).toBe(45);
  });

  // Test 7: All stations missing in a county yields maxAqi: null (never 0)
  it("returns maxAqi: null (never 0) when all stations in the county have missing AQI", () => {
    const stations: NormalizedStationAirQuality[] = [
      {
        stationId: "M1",
        stationName: "南投A",
        county: "南投縣",
        latitude: 23.9,
        longitude: 120.6,
        publishedAt: "2026-09-24T09:00:00+08:00",
        aqi: null,
        status: null,
        primaryPollutant: null,
        pm25: null,
        pm10: null,
        ozone: null,
        carbonMonoxide: null,
        sulfurDioxide: null,
        nitrogenDioxide: null,
      },
    ];

    const summary = computeCountyAqiSummary(stations, "南投縣");
    expect(summary.maxAqi).toBeNull();
    expect(summary.sourceStationId).toBeNull();
    expect(summary.sourceStationName).toBeNull();
  });

  // Test 8: Deterministic tie-breaking on stationId when AQIs are equal
  it("uses deterministic tie-breaker on stationId when two stations share the same maximum AQI", () => {
    const stations: NormalizedStationAirQuality[] = [
      {
        stationId: "ST-02",
        stationName: "測站二",
        county: "桃園市",
        latitude: 24.9,
        longitude: 121.2,
        publishedAt: "2026-09-24T09:00:00+08:00",
        aqi: 75,
        status: "普通",
        primaryPollutant: null,
        pm25: 22,
        pm10: 35,
        ozone: 20,
        carbonMonoxide: 0.2,
        sulfurDioxide: 1,
        nitrogenDioxide: 12,
      },
      {
        stationId: "ST-01",
        stationName: "測站一",
        county: "桃園市",
        latitude: 24.95,
        longitude: 121.25,
        publishedAt: "2026-09-24T09:00:00+08:00",
        aqi: 75, // Same AQI
        status: "普通",
        primaryPollutant: null,
        pm25: 22,
        pm10: 35,
        ozone: 20,
        carbonMonoxide: 0.2,
        sulfurDioxide: 1,
        nitrogenDioxide: 12,
      },
    ];

    // ST-01 should win over ST-02 due to localeCompare
    const summary = computeCountyAqiSummary(stations, "桃園市");
    expect(summary.maxAqi).toBe(75);
    expect(summary.sourceStationId).toBe("ST-01");
    expect(summary.sourceStationName).toBe("測站一");
  });

  // Test 9: Official MOENV AQI 6-tier classification & boundary values
  it("accurately classifies AQI across official 6-tier thresholds and colors", () => {
    // 0 - 50: 良好 (綠色)
    expect(getAqiCategory(0).level).toBe("良好");
    expect(getAqiCategory(0).officialColorName).toBe("綠色");
    expect(getAqiCategory(50).level).toBe("良好");
    expect(getAqiCategory(50).color).toBe("#10b981");

    // 51 - 100: 普通 (黃色)
    expect(getAqiCategory(51).level).toBe("普通");
    expect(getAqiCategory(51).officialColorName).toBe("黃色");
    expect(getAqiCategory(100).level).toBe("普通");
    expect(getAqiCategory(100).color).toBe("#eab308");

    // 101 - 150: 對敏感族群不健康 (橘色)
    expect(getAqiCategory(101).level).toBe("對敏感族群不健康");
    expect(getAqiCategory(101).officialColorName).toBe("橘色");
    expect(getAqiCategory(150).level).toBe("對敏感族群不健康");
    expect(getAqiCategory(150).color).toBe("#f97316");

    // 151 - 200: 對所有族群不健康 (紅色)
    expect(getAqiCategory(151).level).toBe("對所有族群不健康");
    expect(getAqiCategory(151).officialColorName).toBe("紅色");
    expect(getAqiCategory(200).level).toBe("對所有族群不健康");
    expect(getAqiCategory(200).color).toBe("#ef4444");

    // 201 - 300: 非常不健康 (紫色)
    expect(getAqiCategory(201).level).toBe("非常不健康");
    expect(getAqiCategory(201).officialColorName).toBe("紫色");
    expect(getAqiCategory(300).level).toBe("非常不健康");
    expect(getAqiCategory(300).color).toBe("#a855f7");

    // 301 - 500: 危害 (褐紅色)
    expect(getAqiCategory(301).level).toBe("危害");
    expect(getAqiCategory(301).officialColorName).toBe("褐紅色");
    expect(getAqiCategory(500).level).toBe("危害");
    expect(getAqiCategory(500).color).toBe("#b91c1c");

    // Null or invalid -> 無資料 (灰色)
    expect(getAqiCategory(null).level).toBe("無資料");
    expect(getAqiCategory(undefined).level).toBe("無資料");
    expect(getAqiCategory(-5).level).toBe("無資料");
  });

  // Test 10: Publish time format normalization
  it("normalizes publish time to ISO-8601 with +08:00 offset", () => {
    expect(normalizePublishTime("2026/09/24 09:00:00")).toBe("2026-09-24T09:00:00+08:00");
    expect(normalizePublishTime("2026-09-24 10:30:00")).toBe("2026-09-24T10:30:00+08:00");
    expect(normalizePublishTime("")).toBe("");
  });

  // Test 11: Verifies county summary NEVER crosses county boundaries
  it("strictly ensures county summaries never reference stations from other counties", () => {
    const multiCountyStations: NormalizedStationAirQuality[] = [
      // Taipei City stations
      {
        stationId: "TP-01",
        stationName: "萬華",
        county: "臺北市",
        latitude: 25.03,
        longitude: 121.5,
        publishedAt: "2026-09-24T09:00:00+08:00",
        aqi: 95, // High AQI in Taipei City
        status: "普通",
        primaryPollutant: "細懸浮微粒",
        pm25: 35,
        pm10: 50,
        ozone: 20,
        carbonMonoxide: 0.3,
        sulfurDioxide: 1,
        nitrogenDioxide: 15,
      },
      // New Taipei City stations
      {
        stationId: "NTP-01",
        stationName: "三重",
        county: "新北市",
        latitude: 25.07,
        longitude: 121.49,
        publishedAt: "2026-09-24T09:00:00+08:00",
        aqi: 60,
        status: "普通",
        primaryPollutant: "細懸浮微粒",
        pm25: 20,
        pm10: 30,
        ozone: 25,
        carbonMonoxide: 0.2,
        sulfurDioxide: 1,
        nitrogenDioxide: 10,
      },
      {
        stationId: "NTP-02",
        stationName: "汐止",
        county: "新北市",
        latitude: 25.06,
        longitude: 121.64,
        publishedAt: "2026-09-24T09:00:00+08:00",
        aqi: 45,
        status: "良好",
        primaryPollutant: null,
        pm25: 12,
        pm10: 18,
        ozone: 30,
        carbonMonoxide: 0.1,
        sulfurDioxide: 0.8,
        nitrogenDioxide: 8,
      },
    ];

    // Compute summary for New Taipei City
    const ntpSummary = computeCountyAqiSummary(multiCountyStations, "新北市");
    expect(ntpSummary.county).toBe("新北市");
    expect(ntpSummary.maxAqi).toBe(60); // Must be Sanchong (60), NEVER Wanhua (95)
    expect(ntpSummary.sourceStationId).toBe("NTP-01");
    expect(ntpSummary.sourceStationName).toBe("三重");
    expect(ntpSummary.sourceStationCounty).toBe("新北市");
    expect(ntpSummary.sourceStationCounty).not.toBe("臺北市");

    // Compute summary for Taipei City
    const tpSummary = computeCountyAqiSummary(multiCountyStations, "臺北市");
    expect(tpSummary.county).toBe("臺北市");
    expect(tpSummary.maxAqi).toBe(95);
    expect(tpSummary.sourceStationId).toBe("TP-01");
    expect(tpSummary.sourceStationName).toBe("萬華");
    expect(tpSummary.sourceStationCounty).toBe("臺北市");
  });
});
