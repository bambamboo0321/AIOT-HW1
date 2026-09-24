/**
 * Station Spatial & Filtering Operations
 *
 * Rules:
 * - Filter stations by county name
 * - Calculate geodesic distance using Haversine formula (km)
 * - Find the closest station to a given coordinate (e.g. county representative seat)
 * - Deterministic tie-breaking by stationId ascending
 * - Never average values between stations
 */

import { NormalizedStationObservation } from "../contracts/observations";

/**
 * Calculates the great-circle distance between two points on the Earth
 * using the Haversine formula.
 *
 * @param lat1 Latitude of point 1 in decimal degrees
 * @param lon1 Longitude of point 1 in decimal degrees
 * @param lat2 Latitude of point 2 in decimal degrees
 * @param lon2 Longitude of point 2 in decimal degrees
 * @returns Distance in kilometers
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lon1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lon2)
  ) {
    return Infinity;
  }

  const R = 6371.0088; // Mean Earth radius in km
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) *
      Math.cos(lat2 * toRad) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Filters a list of stations belonging to a specific county.
 */
export function filterStationsByCounty(
  stations: readonly NormalizedStationObservation[],
  county: string
): NormalizedStationObservation[] {
  if (!stations || !county) return [];
  return stations.filter((s) => s.county === county);
}

/**
 * Selects the single closest representative station from a candidate list
 * to the target reference coordinate (such as the county administrative seat).
 *
 * If multiple stations have identical distance, breaks ties deterministically
 * by stationId ascending.
 */
export function findClosestStation(
  stations: readonly NormalizedStationObservation[],
  targetLat: number,
  targetLon: number
): NormalizedStationObservation | null {
  if (!stations || stations.length === 0) {
    return null;
  }

  let closest: NormalizedStationObservation | null = null;
  let minDistance = Infinity;

  for (const station of stations) {
    const dist = haversineDistanceKm(
      targetLat,
      targetLon,
      station.latitude,
      station.longitude
    );

    if (dist < minDistance) {
      minDistance = dist;
      closest = station;
    } else if (dist === minDistance && closest !== null) {
      // Deterministic tie-breaker
      if (station.stationId < closest.stationId) {
        closest = station;
      }
    }
  }

  return closest;
}
