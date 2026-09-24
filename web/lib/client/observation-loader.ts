/**
 * Client Weather Observation Data Loader
 *
 * Fetches normalized weather station observations strictly from the same-origin
 * Next.js Route Handler endpoint (/api/weather/observations).
 * Never directly accesses CWA or exposes CWA credentials to client bundle.
 */

import { NormalizedObservationData } from "../contracts/observations";

export function validateObservationApiResponse(raw: unknown): NormalizedObservationData {
  if (!raw || typeof raw !== "object") {
    throw new Error("無效的觀測資料回應：格式錯誤。");
  }

  const envelope = raw as Record<string, unknown>;
  if (envelope.ok !== true) {
    const errorObj = envelope.error as Record<string, unknown> | undefined;
    const msg =
      errorObj?.message && typeof errorObj.message === "string"
        ? errorObj.message
        : "無法取得即時觀測資料。";
    throw new Error(msg);
  }

  const data = envelope.data as Record<string, unknown> | undefined;
  if (
    !data ||
    data.datasetId !== "O-A0003-001" ||
    !Array.isArray(data.stations)
  ) {
    throw new Error("無效的觀測資料結構：缺少必要欄位。");
  }

  return data as unknown as NormalizedObservationData;
}

/**
 * Fetches observation data from /api/weather/observations and validates response structure.
 *
 * @param customFetch Optional fetch implementation for testing
 */
export async function loadWeatherObservations(
  customFetch: typeof fetch = fetch
): Promise<NormalizedObservationData> {
  const response = await customFetch("/api/weather/observations", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let errorMessage = `載入觀測失敗 (HTTP ${response.status})`;
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
  return validateObservationApiResponse(rawJson);
}
