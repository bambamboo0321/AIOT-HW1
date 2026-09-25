/**
 * Background Asset Interface and Dynamic Weather Scenario Background System
 * Milestone M13.2 & M13.4.1: Time & Condition Aware Immersive Weather Background
 */

export interface WeatherBackgroundConfig {
  /** Relative URL or path to the WebP compressed background asset */
  readonly webpSrc: string;
  /** Relative URL or path to the fallback JPEG compressed background asset */
  readonly jpegSrc: string;
  /** Pure CSS gradient fallback in case images fail to load or are unsupported */
  readonly cssGradientFallback: string;
  /** Suggested placement directory inside the repository */
  readonly assetDirectory: string;
  /** Recommended aspect ratio and dimensions for production image replacements */
  readonly recommendedSpecs: {
    readonly width: number;
    readonly height: number;
    readonly aspectRatio: string;
    readonly format: "webp" | "avif" | "jpeg";
    readonly maxFileSizeKb: number;
  };
  /** Description and editorial context of the background imagery */
  readonly description: string;
}

export const WEATHER_BACKGROUND_CONFIG: WeatherBackgroundConfig = {
  webpSrc: "/images/weather-bg.webp",
  jpegSrc: "/images/weather-bg.jpg",
  cssGradientFallback:
    "linear-gradient(180deg, #091326 0%, #0d1e3d 40%, #070d1a 100%)",
  assetDirectory: "web/public/images/",
  recommendedSpecs: {
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    format: "webp",
    maxFileSizeKb: 250,
  },
  description:
    "Taiwan atmospheric sky and mountain landscape with soft cumulus clouds and gentle natural lighting",
};

/**
 * Milestone M13.4 Dynamic Weather Scenario Definitions
 */
export type WeatherScenarioKey =
  | "dawn"
  | "clear-day"
  | "cloudy-day"
  | "sunset"
  | "clear-night"
  | "cloudy-night"
  | "rain-day"
  | "rain-night"
  | "default";

export type TimeOfDay = "dawn" | "day" | "sunset" | "night";

export type WeatherCondition = "rain" | "cloudy" | "clear" | "unknown";

export interface ResolvedWeatherBackground {
  /** Scenario key identifier */
  readonly backgroundKey: WeatherScenarioKey;
  /** Alias for backgroundKey */
  readonly key: WeatherScenarioKey;
  /** Local static asset path under /images/weather/ (or /images/ for default) */
  readonly assetPath: string;
  /** Tailored CSS gradient fallback when image is missing or loading */
  readonly fallbackGradient: string;
  /** Human-readable scenario description label in Traditional Chinese */
  readonly readableLabel: string;
}

export interface ResolveWeatherBackgroundParams {
  /** ISO 8601 string or date representation of observation time */
  observedAt?: string | null;
  /**
   * 即時短時降雨量 (mm)，如 10 分鐘或 1 小時累積降雨量。
   * 數值 > 0 明確證明測站目前或近期正在降雨。
   */
  shortTermPrecipitation?: number | null;
  /**
   * 當日累積降水量 (mm)。
   * 重要語意限制：此欄位僅代表自午夜起的每日累積量。大於 0 僅代表今日稍早曾下過雨，不得作為「當前正在降雨」之依據。
   */
  dailyPrecipitation?: number | null;
  /**
   * 當前即時天氣現象/狀況（如測站當前天氣現況「晴」、「多雲」、「短暫陣雨」等）。
   * 若含「雨」、「雷雨」、「陣雨」則可作為即時降雨之可靠文字證據。
   */
  currentWeatherPhenomenon?: string | null;
  /**
   * 氣象警特報標題/內容（如「豪雨特報」）。
   * 僅作為輔助資訊，不能單獨證明測站目前正在降雨。
   */
  weatherAlertHeadline?: string | null;
  /**
   * 開發測試/預覽專用覆寫情境 (例如在開發環境手動預覽指定背景)。
   */
  overrideScenario?: WeatherScenarioKey | null;
  /**
   * @deprecated 請改用 shortTermPrecipitation，避免將日累積降水誤稱為 rainfall
   */
  rainfall?: number | null;
  /**
   * @deprecated 請改用 currentWeatherPhenomenon
   */
  weatherDescription?: string | null;
}

/**
 * Registry of all 8 dynamic weather scenarios plus default fallback
 */
export const WEATHER_SCENARIOS: Record<WeatherScenarioKey, ResolvedWeatherBackground> = {
  dawn: {
    backgroundKey: "dawn",
    key: "dawn",
    assetPath: "/images/weather/dawn.webp",
    // 淡紫粉與深藍
    fallbackGradient: "linear-gradient(180deg, #1c142c 0%, #362244 35%, #593153 70%, #d88373 100%)",
    readableLabel: "清晨曙光 (Dawn)",
  },
  "clear-day": {
    backgroundKey: "clear-day",
    key: "clear-day",
    assetPath: "/images/weather-bg.webp",
    // 天空藍
    fallbackGradient: "linear-gradient(180deg, #0d3b66 0%, #17568c 35%, #2578b8 70%, #68aadb 100%)",
    readableLabel: "晴朗白晝 (Clear Day)",
  },
  "cloudy-day": {
    backgroundKey: "cloudy-day",
    key: "cloudy-day",
    assetPath: "/images/weather/cloudy-day.webp",
    // 多雲陰天
    fallbackGradient: "linear-gradient(180deg, #18283b 0%, #293d56 40%, #41566f 75%, #6a7f96 100%)",
    readableLabel: "陰天多雲 (Cloudy Day)",
  },
  sunset: {
    backgroundKey: "sunset",
    key: "sunset",
    assetPath: "/images/weather/sunset.webp",
    // 橘紫
    fallbackGradient: "linear-gradient(180deg, #170d24 0%, #3a1c3e 35%, #7a2b4b 65%, #d96238 100%)",
    readableLabel: "暮色晚霞 (Sunset)",
  },
  "clear-night": {
    backgroundKey: "clear-night",
    key: "clear-night",
    assetPath: "/images/weather/clear-night.webp",
    // 深藍星夜
    fallbackGradient: "linear-gradient(180deg, #050811 0%, #0a1122 35%, #0f1c3a 70%, #172852 100%)",
    readableLabel: "晴朗夜空 (Clear Night)",
  },
  "cloudy-night": {
    backgroundKey: "cloudy-night",
    key: "cloudy-night",
    assetPath: "/images/weather/cloudy-night.webp",
    // 多雲暗夜
    fallbackGradient: "linear-gradient(180deg, #060910 0%, #0d1522 35%, #141f30 70%, #1f2c42 100%)",
    readableLabel: "多雲暗夜 (Cloudy Night)",
  },
  "rain-day": {
    backgroundKey: "rain-day",
    key: "rain-day",
    assetPath: "/images/weather/rain-day.webp",
    // 低飽和灰藍日間降雨
    fallbackGradient: "linear-gradient(180deg, #16202c 0%, #223244 40%, #32475e 75%, #4e637a 100%)",
    readableLabel: "日間雨景 (Rain Day)",
  },
  "rain-night": {
    backgroundKey: "rain-night",
    key: "rain-night",
    assetPath: "/images/weather/rain-night.webp",
    // 低飽和灰藍夜間降雨
    fallbackGradient: "linear-gradient(180deg, #080d14 0%, #111a26 40%, #1a283a 75%, #24354a 100%)",
    readableLabel: "夜間雨景 (Rain Night)",
  },
  default: {
    backgroundKey: "default",
    key: "default",
    assetPath: "/images/weather-bg.webp",
    fallbackGradient: "linear-gradient(180deg, #0d1e3d 0%, #172c54 40%, #0f1c33 100%)",
    readableLabel: "預設背景 (Default Fallback)",
  },
};

/**
 * Parse an ISO-8601 string, Date, or time-string into Asia/Taipei hour and minute.
 * Returns null if invalid or missing.
 */
export function parseTaipeiHourAndMinute(
  dateInput: string | Date | null | undefined
): { hour: number; minute: number } | null {
  if (!dateInput) return null;

  try {
    let date: Date;

    if (dateInput instanceof Date) {
      date = dateInput;
    } else if (typeof dateInput === "string") {
      const trimmed = dateInput.trim();
      if (!trimmed) return null;

      // Handle simple HH:mm format directly (treated as Asia/Taipei local time)
      const timeOnlyMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
      if (timeOnlyMatch) {
        const hour = parseInt(timeOnlyMatch[1], 10);
        const minute = parseInt(timeOnlyMatch[2], 10);
        if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
          return { hour, minute };
        }
        return null;
      }

      // Handle YYYY-MM-DD HH:mm:ss without timezone offset by assuming Asia/Taipei (+08:00)
      let normalized = trimmed;
      if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
        normalized = normalized.replace(" ", "T") + "+08:00";
      }

      date = new Date(normalized);
    } else {
      return null;
    }

    if (isNaN(date.getTime())) {
      return null;
    }

    // Explicitly convert to Asia/Taipei regardless of user device timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Taipei",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    let hour: number | null = null;
    let minute: number | null = null;

    for (const part of parts) {
      if (part.type === "hour") {
        hour = parseInt(part.value, 10);
        if (hour === 24) hour = 0; // Some engines return 24 for midnight with hour12: false
      } else if (part.type === "minute") {
        minute = parseInt(part.value, 10);
      }
    }

    if (hour === null || minute === null || isNaN(hour) || isNaN(minute)) {
      return null;
    }

    return { hour, minute };
  } catch {
    return null;
  }
}

/**
 * Determine the time-of-day category in Asia/Taipei
 * - 05:00～06:59: dawn
 * - 07:00～16:59: day
 * - 17:00～18:59: sunset
 * - 19:00～04:59: night
 */
export function getTimeOfDayInTaipei(hour: number, minute: number): TimeOfDay {
  const totalMinutes = hour * 60 + minute;
  const dawnStart = 5 * 60;     // 05:00 (300)
  const dayStart = 7 * 60;      // 07:00 (420)
  const sunsetStart = 17 * 60;  // 17:00 (1020)
  const nightStart = 19 * 60;   // 19:00 (1140)

  if (totalMinutes >= dawnStart && totalMinutes < dayStart) {
    return "dawn";
  }
  if (totalMinutes >= dayStart && totalMinutes < sunsetStart) {
    return "day";
  }
  if (totalMinutes >= sunsetStart && totalMinutes < nightStart) {
    return "sunset";
  }
  return "night";
}

/**
 * Determine weather condition with strict semantic rules (Milestone M13.4.1):
 *
 * 1. 即時短時降雨量 > 0 (10 分鐘或 1 小時降雨量) -> rain
 * 2. 可靠當前天氣現象含雨、雷雨、陣雨 -> rain
 * 3. dailyPrecipitation > 0 僅代表今日稍早曾下雨，不得作為當前下雨證據（絕不判定 rain）
 * 4. 警特報僅為輔助資訊，不能單獨作為測站當前降雨證據（絕不判定 rain）
 * 5. 缺乏可靠即時天氣資訊時，回傳 "unknown" 以使用該時間段之中性背景
 */
export function getWeatherCondition(
  arg1?: ResolveWeatherBackgroundParams | number | null,
  arg2?: string | null
): WeatherCondition {
  let shortTermPrecip: number | null | undefined;
  let phenomenon: string | null | undefined;

  if (typeof arg1 === "object" && arg1 !== null) {
    shortTermPrecip = arg1.shortTermPrecipitation ?? arg1.rainfall;
    phenomenon = arg1.currentWeatherPhenomenon ?? arg1.weatherDescription;
  } else {
    shortTermPrecip = arg1;
    phenomenon = arg2;
  }

  // 1. Instant / short-term precipitation > 0 proves current rain
  if (typeof shortTermPrecip === "number" && !isNaN(shortTermPrecip) && shortTermPrecip > 0) {
    return "rain";
  }

  // 2. Real-time weather phenomenon keywords
  if (phenomenon && typeof phenomenon === "string") {
    const desc = phenomenon.trim();
    if (desc.includes("雨") || desc.includes("雷雨") || desc.includes("陣雨")) {
      return "rain";
    }
    // "無雲" indicates cloudless / clear skies
    if (desc.includes("無雲")) {
      return "clear";
    }
    if (desc.includes("晴") && !desc.includes("多雲") && !desc.includes("陰")) {
      return "clear";
    }
    if (desc.includes("陰") || desc.includes("多雲") || desc.includes("雲")) {
      return "cloudy";
    }
    if (desc.includes("晴")) {
      return "clear";
    }
  }

  // Notice: dailyPrecipitation > 0 or weatherAlertHeadline do NOT trigger rain here.
  return "unknown";
}

/**
 * Pure function resolving weather background scenario based on Taipei time and observation.
 *
 * Rules:
 * - When time is missing or invalid: safe fallback to `default`
 * - When shortTermPrecipitation > 0 or current phenomenon contains rain: `rain-day` / `rain-night`
 * - When no reliable current weather data exists: switch purely on time using neutral background
 *   - dawn -> `dawn`
 *   - day -> `clear-day`
 *   - sunset -> `sunset`
 *   - night -> `clear-night`
 */
export function resolveWeatherBackground(
  params?: ResolveWeatherBackgroundParams
): ResolvedWeatherBackground {
  // Development preview override support
  if (params?.overrideScenario && params.overrideScenario in WEATHER_SCENARIOS) {
    return WEATHER_SCENARIOS[params.overrideScenario];
  }

  if (!params || !params.observedAt) {
    return WEATHER_SCENARIOS["default"];
  }

  const timeParsed = parseTaipeiHourAndMinute(params.observedAt);
  if (!timeParsed) {
    return WEATHER_SCENARIOS["default"];
  }

  const timeOfDay = getTimeOfDayInTaipei(timeParsed.hour, timeParsed.minute);
  const condition = getWeatherCondition(params);

  // If rain is proven by short-term precipitation or real-time phenomenon:
  if (condition === "rain") {
    if (timeOfDay === "day" || timeOfDay === "dawn") {
      return WEATHER_SCENARIOS["rain-day"];
    }
    return WEATHER_SCENARIOS["rain-night"];
  }

  // Dawn & Sunset prioritize dawn/sunset over clear/cloudy when not raining
  if (timeOfDay === "dawn") {
    return WEATHER_SCENARIOS["dawn"];
  }

  if (timeOfDay === "sunset") {
    return WEATHER_SCENARIOS["sunset"];
  }

  // Daytime (07:00 ~ 16:59)
  if (timeOfDay === "day") {
    if (condition === "cloudy") {
      return WEATHER_SCENARIOS["cloudy-day"];
    }
    // Neutral day background (clear-day) when clear or unknown
    return WEATHER_SCENARIOS["clear-day"];
  }

  // Nighttime (19:00 ~ 04:59)
  if (condition === "cloudy") {
    return WEATHER_SCENARIOS["cloudy-night"];
  }
  // Neutral night background (clear-night) when clear or unknown
  return WEATHER_SCENARIOS["clear-night"];
}
