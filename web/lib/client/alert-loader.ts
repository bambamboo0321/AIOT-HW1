/**
 * Client Weather Alerts Data Loader
 *
 * Fetches normalized weather warnings strictly from the same-origin
 * Next.js Route Handler endpoint (/api/weather/alerts).
 * Never directly accesses CWA or exposes credentials to client bundle.
 */

import { NormalizedAlertsData } from "../contracts/alerts";

export function validateAlertsApiResponse(raw: unknown): NormalizedAlertsData {
  if (!raw || typeof raw !== "object") {
    throw new Error("無效的天氣警特報資料回應：格式錯誤。");
  }

  const envelope = raw as Record<string, unknown>;
  if (envelope.ok !== true) {
    const errorObj = envelope.error as Record<string, unknown> | undefined;
    const msg =
      errorObj?.message && typeof errorObj.message === "string"
        ? errorObj.message
        : "無法取得即時天氣警特報資料。";
    throw new Error(msg);
  }

  const data = envelope.data as Record<string, unknown> | undefined;
  if (!data || !Array.isArray(data.alerts)) {
    throw new Error("無效的天氣警特報資料結構：缺少必要欄位。");
  }

  return data as unknown as NormalizedAlertsData;
}

/**
 * Fetches weather alerts from /api/weather/alerts and validates response structure.
 *
 * @param customFetch Optional fetch implementation for testing
 */
export async function loadWeatherAlerts(
  customFetch: typeof fetch = fetch
): Promise<NormalizedAlertsData> {
  const response = await customFetch("/api/weather/alerts", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorMessage = `載入天氣警特報失敗 (HTTP ${response.status})`;
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
  return validateAlertsApiResponse(rawJson);
}
