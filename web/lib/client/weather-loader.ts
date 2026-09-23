/**
 * Client Weather Data Loader
 *
 * Fetches normalized weather forecasts strictly from the same-origin Next.js
 * Route Handler endpoint (/api/weather/forecast).
 * Never directly accesses CWA or exposes CWA credentials to client bundle.
 */

import { NormalizedForecastData } from "../contracts/weather";
import { validateWeatherApiResponse } from "./validator";

export interface WeatherFetchResult {
  data: NormalizedForecastData | null;
  error: string | null;
  isLoading: boolean;
}

/**
 * Fetches forecast data from /api/weather/forecast and validates response structure.
 *
 * @param customFetch Optional fetch implementation for testing
 */
export async function loadWeatherForecast(
  customFetch: typeof fetch = fetch
): Promise<NormalizedForecastData> {
  const response = await customFetch("/api/weather/forecast", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorMessage = `載入預報失敗 (HTTP ${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson && errJson.error && typeof errJson.error.message === "string") {
        errorMessage = errJson.error.message;
      }
    } catch {
      // Ignore JSON parse error on non-200 responses
    }
    throw new Error(errorMessage);
  }

  const rawJson = await response.json();
  return validateWeatherApiResponse(rawJson);
}
