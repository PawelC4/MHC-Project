/**
 * adventure.js
 * Core adventure generation logic for Subway Quest.
 *
 * Responsibilities:
 *  - Filter stations reachable within N minutes from a user's location
 *  - Pick a random weighted destination
 *  - Estimate travel time and intermediate stops
 *  - Generate contextual quest descriptions
 *  - Calculate XP rewards
 */

import { STATIONS } from './stations.js';

// ─── Constants ────────────────────────────────────────────

/** Average subway speed in km/h (including station dwell time) */
const AVG_SUBWAY_SPEED_KMH = 28;

/** Assumed overhead before train motion: walk to station + wait */
const BOARDING_OVERHEAD_MIN = 8;

/** Approximate distance between consecutive subway stops in km */
const AVG_STOP_SPACING_KM = 0.65;

/** Maximum minutes of travel to consider a station "reachable" */
const DEFAULT_MAX_MINUTES = 30;

/** Minimum minutes to avoid picking stations on top of the user */
const MIN_MINUTES = 8;

// ─── Haversine distance ───────────────────────────────────

/**
 * Calculate the great-circle distance between two GPS coordinates.
 * @param {number} lat1
 * @param {number} lng1
 * @param {number} lat2
 * @param {number} lng2
 * @returns {number} Distance in kilometres
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ─── Travel time estimation ───────────────────────────────

/**
 * Estimate subway travel time in minutes given straight-line distance.
 * This is a heuristic; real routing uses the Google Maps API (see map.js).
 *
 * @param {number} distanceKm
 * @returns {number} Estimated minutes (rounded)
 */
export function estimateTravelMinutes(distanceKm) {
  const trainMinutes = (distanceKm / AVG_SUBWAY_SPEED_KMH) * 60;
  return Math.round(BOARDING_OVERHEAD_MIN + trainMinutes);
}

/**
 * Estimate the number of intermediate stops along a route.
 * @param {number} distanceKm
 * @returns {number}
 */
export function estimateStopCount(distanceKm) {
  return Math.max(1, Math.round(distanceKm / AVG_STOP_SPACING_KM));
}

// ─── Station filtering ────────────────────────────────────

/**
 * Return all stations reachable within [minMinutes, maxMinutes] of travel.
 *
 * @param {number} userLat
 * @param {number} userLng
 * @param {number} [maxMinutes=30]
 * @returns {Array<{station: object, distanceKm: number, travelMinutes: number, stopCount: number}>}
 */
export function getReachableStations(userLat, userLng, maxMinutes = DEFAULT_MAX_MINUTES) {
  const results = [];

  for (const station of STATIONS) {
    const distanceKm = haversineKm(userLat, userLng, station.lat, station.lng);
    const travelMinutes = estimateTravelMinutes(distanceKm);
    const stopCount = estimateStopCount(distanceKm);

    if (travelMinutes >= MIN_MINUTES && travelMinutes <= maxMinutes) {
      results.push({ station, distanceKm, travelMinutes, stopCount });
    }
  }

  return results;
}

// ─── Weighted random selection ────────────────────────────

/**
 * Pick a random station from the reachable set, weighted so that
 * medium-distance stations (15–25 min) are slightly preferred over
 * both very close and very far ones.
 *
 * @param {Array<object>} reachable - Output of getReachableStations()
 * @returns {object} A single reachable station entry
 */
export function pickWeightedStation(reachable) {
  if (reachable.length === 0) return null;

  // Weight: peak at ~20 min, tapering off toward edges
  const weighted = reachable.map(entry => {
    const t = entry.travelMinutes;
    const weight = Math.exp(-((t - 20) ** 2) / (2 * 8 ** 2)); // Gaussian, σ=8
    return { ...entry, weight };
  });

  const totalWeight = weighted.reduce((sum, e) => sum + e.weight, 0);
  let rand = Math.random() * totalWeight;

  for (const entry of weighted) {
    rand -= entry.weight;
    if (rand <= 0) return entry;
  }

  return weighted[weighted.length - 1];
}

// ─── Intermediate stops list ──────────────────────────────

/**
 * Generate a plausible list of intermediate stop names for display.
 * In production this comes from the Google Maps Directions API (map.js).
 * Here we produce a generic placeholder list based on stop count.
 *
 * @param {object} destinationStation
 * @param {number} stopCount
 * @returns {string[]} Array of stop name strings
 */
export function generateIntermediateStops(destinationStation, stopCount) {
  // Placeholder: return generic stop labels.
  // Replace with real stop names from Directions API response.
  if (stopCount <= 1) return [];

  const placeholders = [
    'Nearest local station',
    '2 stops in',
    '3 stops in',
    '4 stops in',
    '5 stops in',
    '6 stops in',
    '7 stops in',
    '8 stops in',
    '9 stops in',
  ];

  return placeholders.slice(0, Math.min(stopCount - 1, placeholders.length));
}

// ─── Quest generation ─────────────────────────────────────

const QUEST_TEMPLATES = [
  station => `Photograph the station's name sign with you in the frame at ${station.name}.`,
  station => `Find the station's tile art or mosaic and capture a close-up detail shot.`,
  station => `Step outside and photograph the most interesting building visible from the ${station.name} exit.`,
  station => `Find a street-level detail — a fire hydrant, manhole cover, or signpost — that feels uniquely NYC.`,
  station => `Locate the oldest-looking storefront near ${station.name} and document it.`,
  station => `Find something yellow near the station — a taxi, awning, or signage — and frame your shot around it.`,
  station => `Capture the busiest corner near ${station.name} at peak energy.`,
  station => `Find a piece of street art, sticker art, or graffiti within one block of ${station.name}.`,
  station => `Photograph the view looking directly up from the sidewalk near ${station.name}.`,
  station => `Find a local food cart or bodega and photograph something that represents the neighborhood.`,
];

/**
 * Return a random quest string for the given station.
 * @param {object} station
 * @returns {string}
 */
export function generateQuest(station) {
  const template = QUEST_TEMPLATES[Math.floor(Math.random() * QUEST_TEMPLATES.length)];
  return template(station);
}

// ─── XP calculation ───────────────────────────────────────

/**
 * Calculate XP reward for completing a quest.
 *
 * Breakdown:
 *  Base XP:         100
 *  Distance bonus:  +2 XP per km (encourages going farther)
 *  Borough bonus:   +25 XP for crossing into a new borough
 *  Line count bonus:+10 XP per transfer required (complex stations)
 *
 * @param {object} station
 * @param {number} distanceKm
 * @param {string} [userBorough] - User's current borough if known
 * @returns {number}
 */
export function calculateXP(station, distanceKm, userBorough = null) {
  const base = 100;
  const distanceBonus = Math.round(distanceKm * 2);
  const boroughBonus = userBorough && userBorough !== station.borough ? 25 : 0;
  const lineBonus = Math.max(0, (station.lines.length - 1)) * 10;

  return base + distanceBonus + boroughBonus + lineBonus;
}

// ─── Main entry point ─────────────────────────────────────

/**
 * Generate a complete adventure object from the user's GPS location.
 *
 * @param {number} userLat
 * @param {number} userLng
 * @param {object} [options]
 * @param {number} [options.maxMinutes=30]
 * @param {string} [options.userBorough]
 * @returns {{
 *   station: object,
 *   distanceKm: number,
 *   travelMinutes: number,
 *   stopCount: number,
 *   intermediateStops: string[],
 *   quest: string,
 *   xpReward: number,
 * } | null}
 */
export function generateAdventure(userLat, userLng, options = {}) {
  const { maxMinutes = DEFAULT_MAX_MINUTES, userBorough = null } = options;

  const reachable = getReachableStations(userLat, userLng, maxMinutes);

  if (reachable.length === 0) {
    // Fallback: if no stations found within time limit (e.g., user outside NYC),
    // widen the search to the full dataset and pick the nearest.
    const nearest = STATIONS
      .map(s => ({ station: s, distanceKm: haversineKm(userLat, userLng, s.lat, s.lng) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 5);

    const pick = nearest[Math.floor(Math.random() * nearest.length)];
    const travelMinutes = estimateTravelMinutes(pick.distanceKm);
    const stopCount = estimateStopCount(pick.distanceKm);

    return {
      station: pick.station,
      distanceKm: pick.distanceKm,
      travelMinutes,
      stopCount,
      intermediateStops: generateIntermediateStops(pick.station, stopCount),
      quest: generateQuest(pick.station),
      xpReward: calculateXP(pick.station, pick.distanceKm, userBorough),
    };
  }

  const pick = pickWeightedStation(reachable);

  return {
    station: pick.station,
    distanceKm: pick.distanceKm,
    travelMinutes: pick.travelMinutes,
    stopCount: pick.stopCount,
    intermediateStops: generateIntermediateStops(pick.station, pick.stopCount),
    quest: generateQuest(pick.station),
    xpReward: calculateXP(pick.station, pick.distanceKm, userBorough),
  };
}
