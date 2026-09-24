import { describe, it, expect } from "vitest";
import {
  normalizeCountyName,
  extractAffectedAreas,
  isAlertActive,
  sortAlerts,
  deduplicateAlerts,
  filterAlertsByCounty,
  parseWC0033Record,
} from "@/lib/transformations/alerts";
import { normalizeCwaAlertPayload } from "@/lib/server/cwa-alert-client";
import { WeatherAlert } from "@/lib/contracts/alerts";

describe("Milestone M12: Weather Alerts Transformations & Normalization (Canonical W-C0033-002)", () => {
  describe("County Name Normalization & Area Extraction", () => {
    it("normalizes colloquial 台 to official 臺", () => {
      expect(normalizeCountyName("台北市")).toBe("臺北市");
      expect(normalizeCountyName("台中市")).toBe("臺中市");
      expect(normalizeCountyName("台南市")).toBe("臺南市");
      expect(normalizeCountyName("台東縣")).toBe("臺東縣");
      expect(normalizeCountyName("宜蘭縣")).toBe("宜蘭縣");
    });

    it("extracts affected counties from W-C0033-002 comma/頓號-separated string", () => {
      const locationString = "基隆市、新北市、臺北市";
      const result = extractAffectedAreas(locationString);
      expect(result.affectedAreas).toEqual(["基隆市", "新北市", "臺北市"]);
      expect(result.isNationwide).toBe(false);
    });

    it("detects nationwide scope when keyword 全臺 or 全國 is present", () => {
      const result1 = extractAffectedAreas("全臺各地應嚴加防範");
      expect(result1.isNationwide).toBe(true);

      const result2 = extractAffectedAreas("全國各沿海地區");
      expect(result2.isNationwide).toBe(true);
    });

    it("detects nationwide scope when all 22 counties are affected", () => {
      const allCountiesArea = [
        "基隆市", "臺北市", "新北市", "桃園市", "新竹市", "新竹縣",
        "苗栗縣", "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義市",
        "嘉義縣", "臺南市", "高雄市", "屏東縣", "宜蘭縣", "花蓮縣",
        "臺東縣", "澎湖縣", "金門縣", "連江縣",
      ].join("、");

      const result = extractAffectedAreas(allCountiesArea);
      expect(result.isNationwide).toBe(true);
      expect(result.affectedAreas).toHaveLength(22);
    });
  });

  describe("Alert Validity & Expiration Filtering", () => {
    const fixedNow = new Date("2026-09-24T12:00:00+08:00");

    it("retains alert when effective <= now < expires", () => {
      const activeAlert: WeatherAlert = {
        identifier: "alert-1",
        datasetId: "W-C0033-002",
        event: "大雨",
        headline: "大雨特報",
        description: "受東北季風影響，有局部大雨發生的機率。",
        significance: "特報",
        effective: "2026-09-24T08:00:00+08:00",
        expires: "2026-09-24T20:00:00+08:00",
        affectedAreas: ["新北市", "臺北市"],
        isNationwide: false,
      };

      expect(isAlertActive(activeAlert, fixedNow)).toBe(true);
    });

    it("filters out expired alerts where expires <= now", () => {
      const expiredAlert: WeatherAlert = {
        identifier: "alert-expired",
        datasetId: "W-C0033-002",
        event: "大雨",
        headline: "大雨特報",
        description: "雨勢趨緩",
        significance: "特報",
        effective: "2026-09-23T08:00:00+08:00",
        expires: "2026-09-24T10:00:00+08:00", // Expired at 10:00, now is 12:00
        affectedAreas: ["臺北市"],
        isNationwide: false,
      };

      expect(isAlertActive(expiredAlert, fixedNow)).toBe(false);
    });

    it("filters out future alerts where effective > now", () => {
      const futureAlert: WeatherAlert = {
        identifier: "alert-future",
        datasetId: "W-C0033-002",
        event: "豪雨",
        headline: "豪雨特報",
        description: "明早起防範大雨",
        significance: "特報",
        effective: "2026-09-25T06:00:00+08:00", // Starts tomorrow
        expires: "2026-09-25T18:00:00+08:00",
        affectedAreas: ["臺北市"],
        isNationwide: false,
      };

      expect(isAlertActive(futureAlert, fixedNow)).toBe(false);
    });

    it("filters out cancellation notices containing 解除 or 取消 in headline", () => {
      const cancelAlert: WeatherAlert = {
        identifier: "alert-cancel",
        datasetId: "W-C0033-002",
        event: "大雨",
        headline: "解除大雨特報",
        description: "降雨趨緩，故解除大雨特報",
        significance: "特報",
        effective: "2026-09-24T08:00:00+08:00",
        expires: "2026-09-24T18:00:00+08:00",
        affectedAreas: ["臺北市"],
        isNationwide: false,
      };

      expect(isAlertActive(cancelAlert, fixedNow)).toBe(false);
    });

    it("does NOT mistakenly filter out active alerts whose general description mentions '解除'", () => {
      const activeAlertWithMention: WeatherAlert = {
        identifier: "alert-active-with-mention",
        datasetId: "W-C0033-002",
        event: "大雨",
        headline: "大雨特報",
        description: "受東北季風影響，北部山區有局部大雨，預計明晨雨勢趨緩後適時解除管制，請民眾注意防範落石。",
        significance: "特報",
        effective: "2026-09-24T08:00:00+08:00",
        expires: "2026-09-24T20:00:00+08:00",
        affectedAreas: ["新北市", "臺北市"],
        isNationwide: false,
      };

      // Headline is "大雨特報", NOT a cancellation headline, so it MUST remain active
      expect(isAlertActive(activeAlertWithMention, fixedNow)).toBe(true);
    });
  });

  describe("Snapshot Deduplication, Sorting & County Filtering", () => {
    const alertA: WeatherAlert = {
      identifier: "A",
      datasetId: "W-C0033-002",
      event: "大雨",
      headline: "大雨特報",
      description: "基隆新北局部大雨",
      significance: "特報",
      effective: "2026-09-24T08:00:00+08:00",
      expires: "2026-09-24T20:00:00+08:00",
      affectedAreas: ["基隆市", "新北市"],
      isNationwide: false,
    };

    const alertB: WeatherAlert = {
      identifier: "B",
      datasetId: "W-C0033-002",
      event: "颱風",
      headline: "陸上颱風警報",
      description: "強烈颱風接近",
      significance: "警報",
      effective: "2026-09-24T10:00:00+08:00",
      expires: "2026-09-25T18:00:00+08:00",
      affectedAreas: ["全臺"],
      isNationwide: true,
    };

    const alertC: WeatherAlert = {
      identifier: "C",
      datasetId: "W-C0033-002",
      event: "低溫",
      headline: "低溫特報",
      description: "受大陸冷氣團影響",
      significance: "特報",
      effective: "2026-09-24T06:00:00+08:00",
      expires: "2026-09-24T17:00:00+08:00",
      affectedAreas: ["南投縣", "彰化縣"],
      isNationwide: false,
    };

    it("sorts alerts by effective time descending, then identifier", () => {
      const sorted = sortAlerts([alertA, alertB, alertC]);
      expect(sorted[0].identifier).toBe("B"); // 10:00
      expect(sorted[1].identifier).toBe("A"); // 08:00
      expect(sorted[2].identifier).toBe("C"); // 06:00
    });

    it("deduplicates alerts with identical identifiers or identical event+time+areas within snapshot", () => {
      const duplicateIdentical = { ...alertA };
      const duplicateSameContent = { ...alertA, identifier: "A-DIFF" };

      const deduplicated = deduplicateAlerts([alertA, duplicateIdentical, duplicateSameContent, alertB]);
      expect(deduplicated).toHaveLength(2);
      expect(deduplicated.map((d) => d.identifier)).toEqual(["A", "B"]);
    });

    it("filters alerts by county correctly and includes nationwide alerts", () => {
      // 臺北市: alertB (nationwide) applies, alertA (only 基隆, 新北) does not, alertC (南投, 彰化) does not
      const taipeiAlerts = filterAlertsByCounty([alertA, alertB, alertC], "臺北市");
      expect(taipeiAlerts).toHaveLength(1);
      expect(taipeiAlerts[0].identifier).toBe("B");

      // 新北市: alertA and alertB apply
      const newTaipeiAlerts = filterAlertsByCounty([alertA, alertB, alertC], "新北市");
      expect(newTaipeiAlerts).toHaveLength(2);
      expect(newTaipeiAlerts.map((a) => a.identifier)).toEqual(["A", "B"]);

      // 彰化縣: alertB and alertC apply
      const changhuaAlerts = filterAlertsByCounty([alertA, alertB, alertC], "彰化縣");
      expect(changhuaAlerts).toHaveLength(2);
      expect(changhuaAlerts.map((a) => a.identifier)).toEqual(["B", "C"]);
    });
  });

  describe("Real W-C0033-002 Parsing & Payload Normalization", () => {
    it("parses realistic W-C0033-002 record without fabricating CAP severity", () => {
      const wc0033Fixture = {
        datasetDescription: "天氣特報－各別天氣警特報之內容及所影響之區域",
        issueTime: "2026-09-24T08:00:00+08:00",
        startTime: "2026-09-24T08:00:00+08:00",
        endTime: "2026-09-24T20:00:00+08:00",
        contentText: "東北季風增強，各地空曠地區有9至11級強陣風。",
        phenomena: "陸上強風",
        significance: "特報",
        locationName: "基隆市、新北市、桃園市",
      };

      const parsed = parseWC0033Record(wc0033Fixture, "W-C0033-002");
      expect(parsed).not.toBeNull();
      expect(parsed?.datasetId).toBe("W-C0033-002");
      expect(parsed?.event).toBe("陸上強風");
      expect(parsed?.headline).toBe("陸上強風特報");
      expect(parsed?.significance).toBe("特報");
      expect(parsed?.description).toBe("東北季風增強，各地空曠地區有9至11級強陣風。");
      expect(parsed?.effective).toBe("2026-09-24T08:00:00+08:00");
      expect(parsed?.expires).toBe("2026-09-24T20:00:00+08:00");
      expect(parsed?.affectedAreas.slice().sort()).toEqual(["基隆市", "新北市", "桃園市"].sort());

      // W-C0033-002 does NOT include CAP severity or instruction; must be null without fabrication
      expect(parsed?.severity).toBeNull();
      expect(parsed?.severityNameZh).toBeNull();
      expect(parsed?.urgency).toBeNull();
      expect(parsed?.instruction).toBeNull();
    });

    it("produces distinct identifiers for records with different issue times or affected areas", () => {
      const recMorning = {
        phenomena: "大雨",
        significance: "特報",
        issueTime: "2026-09-24T06:00:00+08:00",
        endTime: "2026-09-24T14:00:00+08:00",
        locationName: "基隆市、新北市",
      };

      const recAfternoon = {
        phenomena: "大雨",
        significance: "特報",
        issueTime: "2026-09-24T15:00:00+08:00",
        endTime: "2026-09-24T23:00:00+08:00",
        locationName: "屏東縣、高雄市",
      };

      const alert1 = parseWC0033Record(recMorning);
      const alert2 = parseWC0033Record(recAfternoon);

      expect(alert1).not.toBeNull();
      expect(alert2).not.toBeNull();
      expect(alert1?.identifier).not.toBe(alert2?.identifier);

      const deduplicated = deduplicateAlerts([alert1!, alert2!]);
      expect(deduplicated).toHaveLength(2);
    });

    it("returns empty alert array and 0 count when W-C0033-002 has no active warnings", () => {
      const now = new Date("2026-09-24T12:00:00+08:00");
      const emptyPayload = {
        success: "true",
        result: { resource_id: "W-C0033-002" },
        records: {
          record: [],
        },
      };

      const normalized = normalizeCwaAlertPayload(emptyPayload, now);
      expect(normalized.datasetId).toBe("W-C0033-002");
      expect(normalized.alertCount).toBe(0);
      expect(normalized.alerts).toEqual([]);
    });

    it("normalizes active records and filters expired ones in W-C0033-002 payload", () => {
      const now = new Date("2026-09-24T12:00:00+08:00");
      const payload = {
        success: "true",
        records: {
          record: [
            {
              phenomena: "豪雨",
              significance: "特報",
              startTime: "2026-09-24T08:00:00+08:00",
              endTime: "2026-09-24T20:00:00+08:00", // Active
              contentText: "大臺北山區有局部豪雨。",
              locationName: "臺北市、新北市",
            },
            {
              phenomena: "大雨",
              significance: "特報",
              startTime: "2026-09-23T08:00:00+08:00",
              endTime: "2026-09-24T10:00:00+08:00", // Expired
              contentText: "已趨緩。",
              locationName: "基隆市",
            },
          ],
        },
      };

      const normalized = normalizeCwaAlertPayload(payload, now);
      expect(normalized.datasetId).toBe("W-C0033-002");
      expect(normalized.alertCount).toBe(1);
      expect(normalized.alerts[0].headline).toBe("豪雨特報");
      expect(normalized.alerts[0].affectedAreas).toEqual(["新北市", "臺北市"]);
    });
  });
});
