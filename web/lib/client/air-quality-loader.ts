/**
 * Client Air Quality Data Loader
 *
 * Fetches normalized air quality observations strictly from the same-origin
 * Next.js Route Handler endpoint (/api/air-quality).
 * Never directly accesses MOENV or exposes MOENV credentials to client bundle.
 */

import { NormalizedAirQualityData } from "../contracts/air-quality";

export function validateAirQualityApiResponse(raw: unknown): NormalizedAirQualityData {
  if (!raw || typeof raw !== "object") {
    throw new Error("無效的空氣品質資料回應：格式錯誤。");
  }

  const envelope = raw as Record<string, unknown>;
  if (envelope.ok !== true) {
    const errorObj = envelope.error as Record<string, unknown> | undefined;
    const msg =
      errorObj?.message && typeof errorObj.message === "string"
        ? errorObj.message
        : "無法取得即時空氣品質資料。";
    throw new Error(msg);
  }

  const data = envelope.data as Record<string, unknown> | undefined;
  if (
    !data ||
    data.datasetId !== "AQX_P_432" ||
    !Array.isArray(data.stations)
  ) {
    throw new Error("無效的空氣品質資料結構：缺少必要欄位。");
  }

  return data as unknown as NormalizedAirQualityData;
}

/**
 * Fetches air quality data from /api/air-quality and validates response structure.
 *
 * @param customFetch Optional fetch implementation for testing
 */
export async function loadAirQuality(
  customFetch: typeof fetch = fetch
): Promise<NormalizedAirQualityData> {
  const response = await customFetch("/api/air-quality", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorMessage = `載入空氣品質失敗 (HTTP ${response.status})`;
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
  return validateAirQualityApiResponse(rawJson);
}
