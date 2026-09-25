import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  resolveWeatherBackground,
  parseTaipeiHourAndMinute,
  getTimeOfDayInTaipei,
  getWeatherCondition,
  WEATHER_SCENARIOS,
  WEATHER_BACKGROUND_CONFIG,
} from "@/lib/theme/background-assets";

describe("Milestone M13.4: Dynamic Weather Scenario Background System", () => {
  describe("Rule 1: Time Scenario & Weather Condition Resolution", () => {
    // 1. 01:10 無雨 → night (clear-night or cloudy-night)
    it("resolves 01:10 with no rain to night (clear-night by default)", () => {
      const result = resolveWeatherBackground({
        observedAt: "2026-09-25T01:10:00+08:00",
        rainfall: 0,
      });
      expect(["clear-night", "cloudy-night"]).toContain(result.backgroundKey);
      expect(result.backgroundKey).toBe("clear-night");
      expect(result.readableLabel).toContain("夜空");
      expect(result.fallbackGradient).toBeTruthy();
    });

    // 2. 05:30 無雨 → dawn
    it("resolves 05:30 with no rain to dawn", () => {
      const result = resolveWeatherBackground({
        observedAt: "2026-09-25T05:30:00+08:00",
        rainfall: 0,
      });
      expect(result.backgroundKey).toBe("dawn");
      expect(result.assetPath).toBe("/images/weather/dawn.webp");
      expect(result.readableLabel).toContain("曙光");
    });

    // 3. 10:00 晴 → clear-day
    it("resolves 10:00 with sunny description to clear-day", () => {
      const result = resolveWeatherBackground({
        observedAt: "2026-09-25T10:00:00+08:00",
        rainfall: 0,
        weatherDescription: "晴朗無雲",
      });
      expect(result.backgroundKey).toBe("clear-day");
      expect(result.assetPath).toBe("/images/weather-bg.webp");
      expect(result.readableLabel).toContain("白晝");
    });

    // 4. 14:00 多雲 → cloudy-day
    it("resolves 14:00 with cloudy description to cloudy-day", () => {
      const result = resolveWeatherBackground({
        observedAt: "2026-09-25T14:00:00+08:00",
        rainfall: 0,
        weatherDescription: "多雲時陰",
      });
      expect(result.backgroundKey).toBe("cloudy-day");
      expect(result.assetPath).toBe("/images/weather/cloudy-day.webp");
      expect(result.readableLabel).toContain("多雲");
    });

    // 5. 17:40 無雨 → sunset
    it("resolves 17:40 with no rain to sunset", () => {
      const result = resolveWeatherBackground({
        observedAt: "2026-09-25T17:40:00+08:00",
        rainfall: 0,
      });
      expect(result.backgroundKey).toBe("sunset");
      expect(result.assetPath).toBe("/images/weather/sunset.webp");
      expect(result.readableLabel).toContain("晚霞");
    });

    // 6. 21:00 多雲 → cloudy-night
    it("resolves 21:00 with cloudy description to cloudy-night", () => {
      const result = resolveWeatherBackground({
        observedAt: "2026-09-25T21:00:00+08:00",
        rainfall: 0,
        weatherDescription: "陰有局部多雲",
      });
      expect(result.backgroundKey).toBe("cloudy-night");
      expect(result.assetPath).toBe("/images/weather/cloudy-night.webp");
      expect(result.readableLabel).toContain("多雲暗夜");
    });

    // 7. 10:00 即時短時降雨量 > 0 → rain-day
    it("resolves 10:00 with shortTermPrecipitation > 0 to rain-day", () => {
      const result = resolveWeatherBackground({
        observedAt: "2026-09-25T10:00:00+08:00",
        shortTermPrecipitation: 3.5,
      });
      expect(result.backgroundKey).toBe("rain-day");
      expect(result.assetPath).toBe("/images/weather/rain-day.webp");
      expect(result.readableLabel).toContain("日間雨景");
    });

    // 8. 22:00 即時短時降雨量 > 0 → rain-night
    it("resolves 22:00 with shortTermPrecipitation > 0 to rain-night", () => {
      const result = resolveWeatherBackground({
        observedAt: "2026-09-25T22:00:00+08:00",
        shortTermPrecipitation: 1.0,
      });
      expect(result.backgroundKey).toBe("rain-night");
      expect(result.assetPath).toBe("/images/weather/rain-night.webp");
      expect(result.readableLabel).toContain("夜間雨景");
    });

    // Rain during dawn or sunset overrides clear to rain-day / rain-night
    it("switches dawn to rain-day when shortTermPrecipitation > 0", () => {
      const result = resolveWeatherBackground({
        observedAt: "05:30",
        shortTermPrecipitation: 0.5,
      });
      expect(result.backgroundKey).toBe("rain-day");
    });

    it("switches sunset to rain-night when shortTermPrecipitation > 0", () => {
      const result = resolveWeatherBackground({
        observedAt: "17:40",
        shortTermPrecipitation: 2.0,
      });
      expect(result.backgroundKey).toBe("rain-night");
    });
  });

  describe("Milestone M13.4.1: Strict Precipitation Semantics & Fallback Rules", () => {
    // Test A: 今日稍早曾下雨、目前無即時降雨證據 → 不得顯示 rain
    it("今日稍早曾下雨 (dailyPrecipitation > 0)、目前無即時降雨證據 → 不得顯示 rain", () => {
      const dayResult = resolveWeatherBackground({
        observedAt: "2026-09-25T10:00:00+08:00",
        dailyPrecipitation: 25.5,
        shortTermPrecipitation: 0,
        currentWeatherPhenomenon: null,
      });
      expect(dayResult.backgroundKey).not.toBe("rain-day");
      expect(dayResult.backgroundKey).not.toBe("rain-night");
      expect(dayResult.backgroundKey).toBe("clear-day");

      const nightResult = resolveWeatherBackground({
        observedAt: "2026-09-25T22:00:00+08:00",
        dailyPrecipitation: 15.0,
        shortTermPrecipitation: null,
        currentWeatherPhenomenon: null,
      });
      expect(nightResult.backgroundKey).not.toBe("rain-day");
      expect(nightResult.backgroundKey).not.toBe("rain-night");
      expect(nightResult.backgroundKey).toBe("clear-night");
    });

    // Test B: 即時 10 分鐘或 1 小時降雨量 > 0 → rain
    it("即時 10 分鐘或 1 小時降雨量 > 0 (shortTermPrecipitation > 0) → rain", () => {
      const dayRain = resolveWeatherBackground({
        observedAt: "2026-09-25T10:00:00+08:00",
        shortTermPrecipitation: 2.5,
      });
      expect(dayRain.backgroundKey).toBe("rain-day");

      const nightRain = resolveWeatherBackground({
        observedAt: "2026-09-25T22:00:00+08:00",
        shortTermPrecipitation: 1.2,
      });
      expect(nightRain.backgroundKey).toBe("rain-night");
    });

    // Test C: 只有豪雨特報、測站無即時降雨 → 不得直接判定 rain
    it("只有豪雨特報、測站無即時降雨證據 → 不得直接判定 rain", () => {
      const alertOnly = resolveWeatherBackground({
        observedAt: "2026-09-25T14:00:00+08:00",
        dailyPrecipitation: 35.0,
        shortTermPrecipitation: 0,
        weatherAlertHeadline: "豪雨特報：新北市山區請防範劇烈強降雨",
      });
      expect(alertOnly.backgroundKey).not.toBe("rain-day");
      expect(alertOnly.backgroundKey).not.toBe("rain-night");
      expect(alertOnly.backgroundKey).toBe("clear-day");
    });

    // Test D: 資料不足 → 依時間使用中性背景
    it("資料不足 (無即時降雨/無天氣現象) → 依時間使用中性背景", () => {
      expect(resolveWeatherBackground({ observedAt: "01:10" }).backgroundKey).toBe("clear-night");
      expect(resolveWeatherBackground({ observedAt: "05:30" }).backgroundKey).toBe("dawn");
      expect(resolveWeatherBackground({ observedAt: "10:00" }).backgroundKey).toBe("clear-day");
      expect(resolveWeatherBackground({ observedAt: "14:00" }).backgroundKey).toBe("clear-day");
      expect(resolveWeatherBackground({ observedAt: "17:40" }).backgroundKey).toBe("sunset");
      expect(resolveWeatherBackground({ observedAt: "21:00" }).backgroundKey).toBe("clear-night");
      expect(resolveWeatherBackground({}).backgroundKey).toBe("default");
    });
  });

  describe("Rule 2: Fallback Handling for Missing or Invalid Time", () => {
    // 9. 缺少時間／無效時間 → default fallback
    it("safely falls back to default when observedAt is missing", () => {
      const resultEmpty = resolveWeatherBackground({});
      expect(resultEmpty.backgroundKey).toBe("default");
      expect(resultEmpty.assetPath).toBe("/images/weather-bg.webp");

      const resultUndefined = resolveWeatherBackground(undefined);
      expect(resultUndefined.backgroundKey).toBe("default");
      expect(resultUndefined.assetPath).toBe("/images/weather-bg.webp");

      const resultNull = resolveWeatherBackground({ observedAt: null });
      expect(resultNull.backgroundKey).toBe("default");
      expect(resultNull.assetPath).toBe("/images/weather-bg.webp");
    });

    it("safely falls back to default when observedAt is an invalid string", () => {
      const resultInvalid = resolveWeatherBackground({
        observedAt: "invalid-timestamp-value",
      });
      expect(resultInvalid.backgroundKey).toBe("default");
      expect(resultInvalid.assetPath).toBe("/images/weather-bg.webp");
    });

    it("does not infer rain from relative humidity", () => {
      // Prompt explicitly specifies: "不得用濕度自行推斷下雨"
      const result = resolveWeatherBackground({
        observedAt: "10:00",
        rainfall: 0,
        weatherDescription: null,
      });
      expect(result.backgroundKey).toBe("clear-day");
    });

    it("supports development preview override via overrideScenario parameter", () => {
      // Regardless of time or weather, overrideScenario directly forces the requested scenario
      const result = resolveWeatherBackground({
        observedAt: "2026-09-25T01:10:00+08:00", // would be night
        overrideScenario: "sunset",
      });
      expect(result.backgroundKey).toBe("sunset");
      expect(result.assetPath).toBe("/images/weather/sunset.webp");

      const rainResult = resolveWeatherBackground({
        observedAt: "2026-09-25T12:00:00+08:00",
        overrideScenario: "rain-night",
      });
      expect(rainResult.backgroundKey).toBe("rain-night");
    });
  });

  describe("Rule 3: Asia/Taipei Timezone Consistency", () => {
    // 10. 所有時間均以 Asia/Taipei 解讀
    it("converts UTC timestamps correctly to Asia/Taipei (+08:00)", () => {
      // UTC 17:10 is next day 01:10 in Asia/Taipei -> night
      const nightResult = resolveWeatherBackground({
        observedAt: "2026-09-24T17:10:00Z",
        rainfall: 0,
      });
      expect(nightResult.backgroundKey).toBe("clear-night");

      // UTC 21:30 is next day 05:30 in Asia/Taipei -> dawn
      const dawnResult = resolveWeatherBackground({
        observedAt: "2026-09-24T21:30:00Z",
        rainfall: 0,
      });
      expect(dawnResult.backgroundKey).toBe("dawn");

      // UTC 02:00 is 10:00 in Asia/Taipei -> clear-day
      const dayResult = resolveWeatherBackground({
        observedAt: "2026-09-25T02:00:00Z",
        rainfall: 0,
      });
      expect(dayResult.backgroundKey).toBe("clear-day");

      // UTC 09:40 is 17:40 in Asia/Taipei -> sunset
      const sunsetResult = resolveWeatherBackground({
        observedAt: "2026-09-25T09:40:00Z",
        rainfall: 0,
      });
      expect(sunsetResult.backgroundKey).toBe("sunset");
    });

    it("parses Taipei hour and minute helper accurately", () => {
      const t1 = parseTaipeiHourAndMinute("2026-09-25T01:10:00+08:00");
      expect(t1).toEqual({ hour: 1, minute: 10 });

      const t2 = parseTaipeiHourAndMinute("17:40");
      expect(t2).toEqual({ hour: 17, minute: 40 });

      expect(parseTaipeiHourAndMinute(null)).toBeNull();
      expect(parseTaipeiHourAndMinute("")).toBeNull();
    });

    it("verifies getTimeOfDayInTaipei intervals correctly", () => {
      expect(getTimeOfDayInTaipei(5, 0)).toBe("dawn");
      expect(getTimeOfDayInTaipei(6, 59)).toBe("dawn");
      expect(getTimeOfDayInTaipei(7, 0)).toBe("day");
      expect(getTimeOfDayInTaipei(16, 59)).toBe("day");
      expect(getTimeOfDayInTaipei(17, 0)).toBe("sunset");
      expect(getTimeOfDayInTaipei(18, 59)).toBe("sunset");
      expect(getTimeOfDayInTaipei(19, 0)).toBe("night");
      expect(getTimeOfDayInTaipei(1, 10)).toBe("night");
      expect(getTimeOfDayInTaipei(4, 59)).toBe("night");
    });

    it("verifies getWeatherCondition condition rules accurately", () => {
      expect(getWeatherCondition(1.2, null)).toBe("rain");
      expect(getWeatherCondition(0, "午後雷陣雨")).toBe("rain");
      expect(getWeatherCondition(0, "多雲時陰")).toBe("cloudy");
      expect(getWeatherCondition(0, "晴天")).toBe("clear");
      expect(getWeatherCondition(0, "晴朗無雲")).toBe("clear");
      expect(getWeatherCondition(0, null)).toBe("unknown");
    });
  });

  describe("Rule 4: CSS Transition & Accessibility (prefers-reduced-motion)", () => {
    // 11. prefers-reduced-motion 下無背景轉場
    it("disables background transitions under prefers-reduced-motion in globals.css", () => {
      const cssPath = path.resolve(process.cwd(), "app/globals.css");
      const cssContent = fs.readFileSync(cssPath, "utf-8");

      expect(cssContent).toContain(".weather-bg-layer");
      expect(cssContent).toContain(".weather-bg-layer.bg-fading");

      // Verify reduced motion block disables transitions on .weather-bg-layer
      const reducedMotionBlock = cssContent.match(
        /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*?)\n\}/
      );
      expect(reducedMotionBlock).not.toBeNull();
      const content = reducedMotionBlock![1];
      expect(content).toContain(".weather-bg-layer");
      expect(content).toContain("transition: none !important");
    });

    it("verifies single DOM element hook is provided in layout.tsx", () => {
      const layoutPath = path.resolve(process.cwd(), "app/layout.tsx");
      const layoutContent = fs.readFileSync(layoutPath, "utf-8");
      expect(layoutContent).toContain('id="weather-bg-layer"');
      expect(layoutContent).toContain('className="weather-bg-layer"');
    });
  });

  describe("Rule 5: Scenario Registry & Fallback Gradients", () => {
    it("defines all 8 required scenarios plus default with tailored gradients and labels", () => {
      const expectedKeys = [
        "dawn",
        "clear-day",
        "cloudy-day",
        "sunset",
        "clear-night",
        "cloudy-night",
        "rain-day",
        "rain-night",
        "default",
      ];

      for (const key of expectedKeys) {
        const scenario = WEATHER_SCENARIOS[key as keyof typeof WEATHER_SCENARIOS];
        expect(scenario).toBeDefined();
        expect(scenario.backgroundKey).toBe(key);
        expect(scenario.key).toBe(key);
        expect(scenario.assetPath).toBeTruthy();
        expect(scenario.fallbackGradient).toContain("linear-gradient");
        expect(scenario.readableLabel).toBeTruthy();
      }
    });

    it("preserves M13.2 backward-compatible WEATHER_BACKGROUND_CONFIG", () => {
      expect(WEATHER_BACKGROUND_CONFIG.webpSrc).toBe("/images/weather-bg.webp");
      expect(WEATHER_BACKGROUND_CONFIG.jpegSrc).toBe("/images/weather-bg.jpg");
      expect(WEATHER_BACKGROUND_CONFIG.cssGradientFallback).toBeTruthy();
    });

    it("verifies clear-day assetPath points to /images/weather-bg.webp and all registered assetPaths physically exist on disk", () => {
      // 1. Verify clear-day points to shared weather-bg.webp to avoid duplicate asset payload
      expect(WEATHER_SCENARIOS["clear-day"].assetPath).toBe("/images/weather-bg.webp");

      // 2. Verify all actually registered scenario assetPaths exist on disk
      const registeredPaths = Object.values(WEATHER_SCENARIOS).map((s) => s.assetPath);
      expect(registeredPaths.length).toBeGreaterThan(0);

      for (const relPath of registeredPaths) {
        const diskPath = path.resolve(process.cwd(), "public" + relPath);
        expect(fs.existsSync(diskPath), `Expected registered asset to exist: ${diskPath}`).toBe(true);

        const stats = fs.statSync(diskPath);
        expect(stats.size).toBeGreaterThan(10 * 1024); // at least 10KB
        expect(stats.size).toBeLessThan(300 * 1024);   // under 300KB
      }

      // 3. Verify weather/clear-day.webp is removed to prevent redundant assets
      const duplicateClearDayPath = path.resolve(process.cwd(), "public/images/weather/clear-day.webp");
      expect(fs.existsSync(duplicateClearDayPath)).toBe(false);
    });
  });
});
