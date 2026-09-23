/**
 * Taiwan County/City Administrative Seat Representative Coordinates
 *
 * Provenance & Notice:
 * -------------------
 * Ported from src/map_data.py (Milestone M6).
 * These coordinates represent the primary administrative seats (City Hall or County
 * Government headquarters) for the 22 administrative divisions of Taiwan.
 *
 * CRITICAL NOTE:
 * These coordinates serve solely as user-interface presentation metadata for
 * rendering regional map markers and do NOT represent specific meteorological
 * observation stations.
 *
 * Datum: WGS84 (EPSG:4326)
 */

export interface CountyCoordinate {
  region: string;
  latitude: number;
  longitude: number;
  seatName: string;
}

export const EXPECTED_TAIWAN_REGIONS: readonly string[] = [
  "基隆市",
  "臺北市",
  "新北市",
  "桃園市",
  "新竹市",
  "新竹縣",
  "苗栗縣",
  "臺中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義市",
  "嘉義縣",
  "臺南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "臺東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
] as const;

export const TAIWAN_COUNTY_COORDINATES: Record<string, CountyCoordinate> = {
  "基隆市": {
    region: "基隆市",
    latitude: 25.1323,
    longitude: 121.7404,
    seatName: "基隆市政府",
  },
  "臺北市": {
    region: "臺北市",
    latitude: 25.0375,
    longitude: 121.5637,
    seatName: "臺北市政府",
  },
  "新北市": {
    region: "新北市",
    latitude: 25.0118,
    longitude: 121.4658,
    seatName: "新北市政府",
  },
  "桃園市": {
    region: "桃園市",
    latitude: 24.9936,
    longitude: 121.301,
    seatName: "桃園市政府",
  },
  "新竹市": {
    region: "新竹市",
    latitude: 24.8066,
    longitude: 120.9687,
    seatName: "新竹市政府",
  },
  "新竹縣": {
    region: "新竹縣",
    latitude: 24.8387,
    longitude: 121.0177,
    seatName: "新竹縣政府",
  },
  "苗栗縣": {
    region: "苗栗縣",
    latitude: 24.5602,
    longitude: 120.8214,
    seatName: "苗栗縣政府",
  },
  "臺中市": {
    region: "臺中市",
    latitude: 24.1618,
    longitude: 120.6469,
    seatName: "臺中市政府",
  },
  "彰化縣": {
    region: "彰化縣",
    latitude: 24.0754,
    longitude: 120.5447,
    seatName: "彰化縣政府",
  },
  "南投縣": {
    region: "南投縣",
    latitude: 23.91,
    longitude: 120.686,
    seatName: "南投縣政府",
  },
  "雲林縣": {
    region: "雲林縣",
    latitude: 23.7092,
    longitude: 120.5434,
    seatName: "雲林縣政府",
  },
  "嘉義市": {
    region: "嘉義市",
    latitude: 23.4801,
    longitude: 120.4491,
    seatName: "嘉義市政府",
  },
  "嘉義縣": {
    region: "嘉義縣",
    latitude: 23.4518,
    longitude: 120.293,
    seatName: "嘉義縣政府",
  },
  "臺南市": {
    region: "臺南市",
    latitude: 22.9908,
    longitude: 120.1856,
    seatName: "臺南市政府",
  },
  "高雄市": {
    region: "高雄市",
    latitude: 22.6273,
    longitude: 120.3014,
    seatName: "高雄市政府",
  },
  "屏東縣": {
    region: "屏東縣",
    latitude: 22.6761,
    longitude: 120.4885,
    seatName: "屏東縣政府",
  },
  "宜蘭縣": {
    region: "宜蘭縣",
    latitude: 24.7308,
    longitude: 121.7634,
    seatName: "宜蘭縣政府",
  },
  "花蓮縣": {
    region: "花蓮縣",
    latitude: 23.9872,
    longitude: 121.6016,
    seatName: "花蓮縣政府",
  },
  "臺東縣": {
    region: "臺東縣",
    latitude: 22.7583,
    longitude: 121.1444,
    seatName: "臺東縣政府",
  },
  "澎湖縣": {
    region: "澎湖縣",
    latitude: 23.5712,
    longitude: 119.5793,
    seatName: "澎湖縣政府",
  },
  "金門縣": {
    region: "金門縣",
    latitude: 24.4327,
    longitude: 118.3226,
    seatName: "金門縣政府",
  },
  "連江縣": {
    region: "連江縣",
    latitude: 26.1558,
    longitude: 119.9519,
    seatName: "連江縣政府",
  },
};
