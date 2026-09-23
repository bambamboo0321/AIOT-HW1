import { describe, it, expect } from "vitest";
import {
  aggregateDailyForecasts,
  filterDailyForecasts,
  computeSummaryKpis,
  getTaipeiDateString,
  getTaipeiWeekday,
} from "@/lib/transformations/daily";
import { ForecastInterval } from "@/lib/contracts/weather";

describe("Daily Weather Transformation (daily.ts)", () => {
  it("merges two 12-hour intervals belonging to the same calendar day into one daily record", () => {
    const intervals: ForecastInterval[] = [
      {
        startTime: "2026-09-24T06:00:00+08:00",
        endTime: "2026-09-24T18:00:00+08:00",
        minTemp: 24.5,
        maxTemp: 31.0,
      },
      {
        startTime: "2026-09-24T18:00:00+08:00",
        endTime: "2026-09-25T06:00:00+08:00",
        minTemp: 22.0,
        maxTemp: 26.5,
      },
    ];

    const result = aggregateDailyForecasts(intervals);
    expect(result).toHaveLength(1);

    const day = result[0];
    expect(day.forecastDate).toBe("2026-09-24");
    expect(day.minTemp).toBe(22.0); // Minimum of 24.5 and 22.0
    expect(day.maxTemp).toBe(31.0); // Maximum of 31.0 and 26.5
    expect(day.intervalCount).toBe(2);
    expect(day.isPartial).toBe(false);
  });

  it("assigns overnight interval solely to the calendar date of its startTime in Asia/Taipei", () => {
    // 2026-09-24 18:00 to 2026-09-25 06:00
    const intervals: ForecastInterval[] = [
      {
        startTime: "2026-09-24T18:00:00+08:00",
        endTime: "2026-09-25T06:00:00+08:00",
        minTemp: 21.0,
        maxTemp: 25.0,
      },
    ];

    const result = aggregateDailyForecasts(intervals);
    expect(result).toHaveLength(1);
    expect(result[0].forecastDate).toBe("2026-09-24");
    expect(result[0].isPartial).toBe(true);
    expect(result[0].intervalCount).toBe(1);
  });

  it("flags days with fewer than 2 intervals as isPartial === true", () => {
    const intervals: ForecastInterval[] = [
      {
        startTime: "2026-09-24T06:00:00+08:00",
        endTime: "2026-09-24T18:00:00+08:00",
        minTemp: 25.0,
        maxTemp: 32.0,
      },
      // 2026-09-25 has 2 intervals
      {
        startTime: "2026-09-25T06:00:00+08:00",
        endTime: "2026-09-25T18:00:00+08:00",
        minTemp: 24.0,
        maxTemp: 30.0,
      },
      {
        startTime: "2026-09-25T18:00:00+08:00",
        endTime: "2026-09-26T06:00:00+08:00",
        minTemp: 22.0,
        maxTemp: 25.0,
      },
    ];

    const result = aggregateDailyForecasts(intervals);
    expect(result).toHaveLength(2);
    expect(result[0].forecastDate).toBe("2026-09-24");
    expect(result[0].isPartial).toBe(true);
    expect(result[1].forecastDate).toBe("2026-09-25");
    expect(result[1].isPartial).toBe(false);
  });

  it("handles null temperatures correctly without defaulting to 0", () => {
    const intervals: ForecastInterval[] = [
      {
        startTime: "2026-09-24T06:00:00+08:00",
        endTime: "2026-09-24T18:00:00+08:00",
        minTemp: null,
        maxTemp: 28.0,
      },
      {
        startTime: "2026-09-24T18:00:00+08:00",
        endTime: "2026-09-25T06:00:00+08:00",
        minTemp: null,
        maxTemp: null,
      },
    ];

    const result = aggregateDailyForecasts(intervals);
    expect(result).toHaveLength(1);
    expect(result[0].minTemp).toBeNull(); // All min temperatures null -> null
    expect(result[0].maxTemp).toBe(28.0); // Only valid max temperature -> 28.0
  });

  it("sorts daily records chronologically in ascending order regardless of input interval order", () => {
    const intervals: ForecastInterval[] = [
      {
        startTime: "2026-09-26T06:00:00+08:00",
        endTime: "2026-09-26T18:00:00+08:00",
        minTemp: 20,
        maxTemp: 26,
      },
      {
        startTime: "2026-09-24T06:00:00+08:00",
        endTime: "2026-09-24T18:00:00+08:00",
        minTemp: 22,
        maxTemp: 28,
      },
      {
        startTime: "2026-09-25T06:00:00+08:00",
        endTime: "2026-09-25T18:00:00+08:00",
        minTemp: 21,
        maxTemp: 27,
      },
    ];

    const result = aggregateDailyForecasts(intervals);
    expect(result.map((r) => r.forecastDate)).toEqual([
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
    ]);
  });

  it("filters daily forecasts inclusively by date range", () => {
    const intervals: ForecastInterval[] = [
      { startTime: "2026-09-24T06:00:00+08:00", endTime: "2026-09-24T18:00:00+08:00", minTemp: 20, maxTemp: 30 },
      { startTime: "2026-09-25T06:00:00+08:00", endTime: "2026-09-25T18:00:00+08:00", minTemp: 21, maxTemp: 31 },
      { startTime: "2026-09-26T06:00:00+08:00", endTime: "2026-09-26T18:00:00+08:00", minTemp: 22, maxTemp: 32 },
      { startTime: "2026-09-27T06:00:00+08:00", endTime: "2026-09-27T18:00:00+08:00", minTemp: 23, maxTemp: 33 },
    ];

    const daily = aggregateDailyForecasts(intervals);

    // Inclusive range 2026-09-25 to 2026-09-26
    const filtered = filterDailyForecasts(daily, "2026-09-25", "2026-09-26");
    expect(filtered.map((d) => d.forecastDate)).toEqual(["2026-09-25", "2026-09-26"]);

    // No bounds
    expect(filterDailyForecasts(daily)).toHaveLength(4);

    // Only start date
    expect(filterDailyForecasts(daily, "2026-09-26")).toHaveLength(2);

    // Only end date
    expect(filterDailyForecasts(daily, undefined, "2026-09-25")).toHaveLength(2);
  });

  it("does not mutate the input intervals array or objects", () => {
    const originalInterval: ForecastInterval = {
      startTime: "2026-09-24T06:00:00+08:00",
      endTime: "2026-09-24T18:00:00+08:00",
      minTemp: 22,
      maxTemp: 28,
    };
    const cloned = { ...originalInterval };
    const list = [originalInterval];

    aggregateDailyForecasts(list);

    expect(list).toHaveLength(1);
    expect(originalInterval).toEqual(cloned);
  });

  it("computes summary KPIs accurately", () => {
    const intervals: ForecastInterval[] = [
      { startTime: "2026-09-24T06:00:00+08:00", endTime: "2026-09-24T18:00:00+08:00", minTemp: 23, maxTemp: 30 },
      { startTime: "2026-09-25T06:00:00+08:00", endTime: "2026-09-25T18:00:00+08:00", minTemp: 19, maxTemp: 28 },
      { startTime: "2026-09-26T06:00:00+08:00", endTime: "2026-09-26T18:00:00+08:00", minTemp: 21, maxTemp: 34 },
    ];

    const daily = aggregateDailyForecasts(intervals);
    const kpis = computeSummaryKpis(daily);

    expect(kpis.daysCount).toBe(3);
    expect(kpis.periodMin).toBe(19);
    expect(kpis.periodMax).toBe(34);
  });

  it("formats weekdays and dates in Asia/Taipei accurately", () => {
    // 2026-09-24 is a Thursday (週四)
    expect(getTaipeiWeekday("2026-09-24")).toMatch(/四/);
    expect(getTaipeiDateString("2026-09-24T00:00:00+08:00")).toBe("2026-09-24");
  });
});
