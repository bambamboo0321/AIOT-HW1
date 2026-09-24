/**
 * Server-only CWA Weather Alerts Client and Normalizer
 *
 * Canonical Source: W-C0033-002 (天氣特報－各別天氣警特報之內容及所影響之區域)
 * Upstream URL: https://opendata.cwa.gov.tw/api/v1/rest/datastore/W-C0033-002
 *
 * Security & Design Rules:
 * - Server-only execution check
 * - Authorization key ONLY placed in request header, NEVER in URL query
 * - Safe error handling: redaction of secret tokens and upstream URLs
 * - De-duplicates alerts within snapshot and removes expired/cancelled bulletins
 * - Returns empty alert list if no active warnings (not an error, HTTP 200)
 * - Single upstream request: strictly queries W-C0033-002 only
 */

import { getCwaApiKey } from "./env";
import { safeGetJson } from "./http-client";
import { NormalizedAlertsData, WeatherAlert } from "../contracts/alerts";
import {
  parseWC0033Record,
  isAlertActive,
  deduplicateAlerts,
  sortAlerts,
} from "../transformations/alerts";

if (typeof window !== "undefined") {
  throw new Error("Security Error: cwa-alert-client cannot be imported in client-side code.");
}

export const CWA_ALERT_DATASET_ID = "W-C0033-002";
export const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore";

export interface CwaAlertFetchOptions {
  apiKey?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  now?: Date;
}

/**
 * Normalizes raw W-C0033-002 datastore response into NormalizedAlertsData.
 */
export function normalizeCwaAlertPayload(
  data: unknown,
  now: Date = new Date()
): NormalizedAlertsData {
  const collectedAlerts: WeatherAlert[] = [];

  if (data && typeof data === "object") {
    const root = data as Record<string, unknown>;
    const records = root.records as Record<string, unknown> | undefined;

    if (records && Array.isArray(records.record)) {
      for (const rec of records.record) {
        if (!rec || typeof rec !== "object") continue;
        const parsed = parseWC0033Record(rec as Record<string, unknown>, CWA_ALERT_DATASET_ID);
        if (parsed && isAlertActive(parsed, now)) {
          collectedAlerts.push(parsed);
        }
      }
    }
  }

  const deduplicated = deduplicateAlerts(collectedAlerts);
  const sorted = sortAlerts(deduplicated);

  return {
    datasetId: CWA_ALERT_DATASET_ID,
    fetchedAt: now.toISOString(),
    alertCount: sorted.length,
    alerts: sorted,
  };
}

/**
 * Fetches current CWA weather warnings and alerts strictly from canonical dataset W-C0033-002.
 */
export async function fetchCwaAlerts(options?: CwaAlertFetchOptions): Promise<NormalizedAlertsData> {
  const apiKey = options?.apiKey ?? getCwaApiKey();
  const fetchFn = options?.fetchFn ?? fetch;
  const timeoutMs = options?.timeoutMs ?? 10000;
  const now = options?.now ?? new Date();

  const url = `${CWA_API_BASE_URL}/${CWA_ALERT_DATASET_ID}`;

  const data = await safeGetJson<unknown>(url, {
    headers: {
      Authorization: apiKey,
      Accept: "application/json; charset=utf-8",
    },
    timeoutMs,
    fetchFn,
  });

  return normalizeCwaAlertPayload(data, now);
}
