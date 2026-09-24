/**
 * Weather Alerts & Warnings Pure Transformations & Normalization
 *
 * Exclusively handles CWA Canonical Weather Warnings (Dataset W-C0033-002:
 * 氣象特報－各別天氣警特報之內容及所影響之區域).
 *
 * Implements:
 * - Real W-C0033-002 record parsing
 * - Official valid time & expiration checking
 * - County normalization & county-level filtering (including nationwide alerts)
 * - Snapshot deduplication without cross-source heuristics
 * - Deterministic sorting
 */

import { WeatherAlert } from "../contracts/alerts";

export const ALL_TAIWAN_COUNTIES = [
  "基隆市", "臺北市", "新北市", "桃園市", "新竹市", "新竹縣",
  "苗栗縣", "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義市",
  "嘉義縣", "臺南市", "高雄市", "屏東縣", "宜蘭縣", "花蓮縣",
  "臺東縣", "澎湖縣", "金門縣", "連江縣",
] as const;

/**
 * Normalizes county name to official standard (replacing colloquial "台" with "臺").
 */
export function normalizeCountyName(name: string): string {
  if (!name) return "";
  return name.trim().replace(/^台/, "臺");
}

/**
 * Extracts and normalizes affected county names from W-C0033-002 locationName string or objects.
 */
export function extractAffectedAreas(rawArea: unknown): {
  affectedAreas: string[];
  isNationwide: boolean;
} {
  if (!rawArea) {
    return { affectedAreas: [], isNationwide: false };
  }

  const countiesSet = new Set<string>();
  let hasNationwideKeyword = false;

  const processAreaString = (text: string) => {
    if (!text) return;
    const trimmed = text.trim();
    if (
      trimmed.includes("全臺") ||
      trimmed.includes("全國") ||
      trimmed.includes("全島") ||
      trimmed.includes("臺灣各地")
    ) {
      hasNationwideKeyword = true;
    }
    for (const county of ALL_TAIWAN_COUNTIES) {
      const alias = county.replace(/^臺/, "台");
      if (trimmed.includes(county) || trimmed.includes(alias)) {
        countiesSet.add(county);
      }
    }
  };

  if (Array.isArray(rawArea)) {
    for (const item of rawArea) {
      if (!item) continue;
      if (typeof item === "string") {
        processAreaString(item);
      } else if (typeof item === "object") {
        const areaDesc =
          (item as Record<string, unknown>).locationName ??
          (item as Record<string, unknown>).areaDesc;
        if (typeof areaDesc === "string") {
          processAreaString(areaDesc);
        }
      }
    }
  } else if (typeof rawArea === "string") {
    processAreaString(rawArea);
  }

  const affectedAreas = Array.from(countiesSet).sort((a, b) => a.localeCompare(b, "zh-TW"));
  const isNationwide = hasNationwideKeyword || affectedAreas.length >= 22;

  return { affectedAreas, isNationwide };
}

/**
 * Normalizes a raw W-C0033-002 record entry into WeatherAlert.
 *
 * Real Fields in W-C0033-002:
 * - datasetDescription: string
 * - issueTime: ISO-8601 string
 * - startTime: ISO-8601 string
 * - endTime: ISO-8601 string
 * - update: ISO-8601 string
 * - contentText: string (detailed alert text)
 * - phenomena: string (e.g. "大雨", "低溫", "陸上強風")
 * - significance: string (e.g. "特報", "警報")
 * - locationName: string (e.g. "基隆市、新北市、臺北市")
 *
 * Note: W-C0033-002 does NOT include CAP severity, urgency, or instruction fields;
 * these are explicitly kept as null/undefined without fabrication.
 */
export function parseWC0033Record(
  recordEntry: Record<string, unknown>,
  datasetId: "W-C0033-002" = "W-C0033-002"
): WeatherAlert | null {
  if (!recordEntry || typeof recordEntry !== "object") return null;

  const phenomena = String(recordEntry.phenomena ?? "").trim();
  const significance = recordEntry.significance ? String(recordEntry.significance).trim() : null;
  const event = phenomena || "天氣警特報";
  const headline = `${phenomena}${significance ?? ""}`.trim() || event;
  const description = String(recordEntry.contentText ?? headline).trim();
  const effective = String(recordEntry.startTime ?? recordEntry.issueTime ?? "").trim();
  const expires = String(recordEntry.endTime ?? "").trim();
  const issueTime = recordEntry.issueTime ? String(recordEntry.issueTime).trim() : null;

  if (!expires) {
    return null;
  }

  const { affectedAreas, isNationwide } = extractAffectedAreas(recordEntry.locationName);

  // Stable identifier incorporating datasetId, phenomena, timeKey, and areaKey
  const timeKey = String(recordEntry.issueTime ?? recordEntry.startTime ?? recordEntry.update ?? effective).trim();
  const areaKey = affectedAreas.slice().sort().join("-");
  const identifier = recordEntry.identifier
    ? String(recordEntry.identifier).trim()
    : `${datasetId}_${phenomena}_${timeKey}_${areaKey}`;

  return {
    identifier,
    datasetId,
    event,
    headline,
    description,
    significance,
    severity: null,
    severityNameZh: null,
    urgency: null,
    certainty: null,
    effective: effective || new Date().toISOString(),
    expires,
    issueTime,
    affectedAreas,
    instruction: null,
    isNationwide,
    web: null,
  };
}

/**
 * Determines whether an alert is currently active and in effect.
 *
 * Rules:
 * 1. Expiration check: if expires time has passed (`expires <= now`), it is expired.
 * 2. Future-effective check: if effective time is in the future (`effective > now`), not yet active.
 * 3. Defensive headline check: if headline announces cancellation ("解除...", "取消...").
 *    CRITICAL: Does NOT filter based on description text (general descriptions mentioning "解除" must remain active).
 */
export function isAlertActive(alert: WeatherAlert, now: Date = new Date()): boolean {
  if (!alert.headline || !alert.expires) {
    return false;
  }

  const expiresMs = Date.parse(alert.expires);
  if (!isNaN(expiresMs) && expiresMs <= now.getTime()) {
    return false;
  }

  if (alert.effective) {
    const effectiveMs = Date.parse(alert.effective);
    if (!isNaN(effectiveMs) && effectiveMs > now.getTime()) {
      return false; // Future alert, not yet effective
    }
  }

  const hl = alert.headline.trim();
  if (
    hl.startsWith("解除") ||
    hl.startsWith("取消") ||
    hl.includes("解除特報") ||
    hl.includes("解除警報") ||
    hl.includes("取消特報")
  ) {
    return false;
  }

  return true;
}

/**
 * Pure function to deduplicate weather alerts within the same snapshot.
 */
export function deduplicateAlerts(alerts: WeatherAlert[]): WeatherAlert[] {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const results: WeatherAlert[] = [];

  for (const alert of alerts) {
    if (!alert || !alert.identifier) continue;
    if (seenIds.has(alert.identifier)) continue;

    const snapshotKey = `${alert.event}__${alert.effective}__${alert.affectedAreas.slice().sort().join(",")}`;
    if (seenKeys.has(snapshotKey)) continue;

    seenIds.add(alert.identifier);
    seenKeys.add(snapshotKey);
    results.push(alert);
  }

  return results;
}

/**
 * Pure function to sort weather alerts stably.
 * Chronological order: newest effective time first, then deterministic identifier.
 */
export function sortAlerts(alerts: WeatherAlert[]): WeatherAlert[] {
  return [...alerts].sort((a, b) => {
    const timeA = Date.parse(a.effective) || 0;
    const timeB = Date.parse(b.effective) || 0;
    if (timeB !== timeA) return timeB - timeA;

    return a.identifier.localeCompare(b.identifier);
  });
}

/**
 * Filters a list of alerts for a specific county or city.
 * Returns alerts that are either marked nationwide or specifically include the specified county.
 */
export function filterAlertsByCounty(
  alerts: readonly WeatherAlert[],
  county: string
): WeatherAlert[] {
  if (!alerts || alerts.length === 0) return [];
  const normalizedCounty = normalizeCountyName(county);

  return alerts.filter((alert) => {
    if (alert.isNationwide) return true;
    return alert.affectedAreas.includes(normalizedCounty);
  });
}
