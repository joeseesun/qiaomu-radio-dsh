import type { Station, TasteProfile } from "./types";

/** A fresh, empty taste profile. */
export const EMPTY_PROFILE: TasteProfile = {
  likedStationIds: [],
  dislikedStationIds: [],
  tagWeights: {},
  history: [],
  stationReliability: {},
  preferredCountryCode: null,
};

/** Success bonus minus a decayed penalty for recent consecutive failures. */
export function reliabilityScore(profile: TasteProfile, stationId: string, now: number): number {
  const reliability = profile.stationReliability[stationId];
  if (!reliability) return 0;
  const successBonus = Math.min(1.2, Math.log2(1 + reliability.successes) * 0.3);
  const failureAge = reliability.lastFailureAt ? now - Date.parse(reliability.lastFailureAt) : Number.POSITIVE_INFINITY;
  const decay =
    failureAge < 6 * 60 * 60 * 1000 ? 1 : failureAge < 24 * 60 * 60 * 1000 ? 0.35 : 0;
  return successBonus - Math.min(8, reliability.consecutiveFailures * 2.25) * decay;
}

/** Taste affinity + catalog quality + HTTPS + reliability + a little random. */
export function stationScore(
  station: Station,
  profile: TasteProfile,
  random: number = Math.random(),
  now: number = Date.now(),
): number {
  const affinity = station.tags.reduce((sum, tag) => sum + (profile.tagWeights[tag] || 0), 0);
  const quality =
    Math.log10(Math.max(1, station.clickCount)) * 0.12 + Math.log10(Math.max(1, station.votes)) * 0.08;
  const httpsBonus = station.streamUrl.startsWith("https://") ? 0.7 : 0;
  return affinity + quality + httpsBonus + reliabilityScore(profile, station.id, now) + random * 1.8;
}

/** Reject disliked stations and demote anything heard in the last eight sessions. */
export function rankStations(stations: Station[], profile: TasteProfile): Station[] {
  const rejected = new Set(profile.dislikedStationIds);
  const recent = new Set(profile.history.slice(0, 8).map((entry) => entry.station.id));
  return stations
    .filter((station) => !rejected.has(station.id))
    .map((station) => ({
      station,
      score: stationScore(station, profile) - (recent.has(station.id) ? 5 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ station }) => station);
}

/** Record a playback success or failure, keeping the 120 most recent entries. */
export function recordStationOutcome(
  profile: TasteProfile,
  stationId: string,
  outcome: "success" | "failure",
  now: Date = new Date(),
): TasteProfile {
  const previous =
    profile.stationReliability[stationId] || { successes: 0, failures: 0, consecutiveFailures: 0 };
  const next =
    outcome === "success"
      ? {
          ...previous,
          successes: previous.successes + 1,
          consecutiveFailures: 0,
          lastSuccessAt: now.toISOString(),
        }
      : {
          ...previous,
          failures: previous.failures + 1,
          consecutiveFailures: previous.consecutiveFailures + 1,
          lastFailureAt: now.toISOString(),
        };
  const entries = Object.entries({ ...profile.stationReliability, [stationId]: next })
    .sort(
      ([, left], [, right]) =>
        Date.parse(right.lastFailureAt || right.lastSuccessAt || "") -
        Date.parse(left.lastFailureAt || left.lastSuccessAt || ""),
    )
    .slice(0, 120);
  return { ...profile, stationReliability: Object.fromEntries(entries) };
}

/** Like raises the station's tag weights, dislike lowers and remembers the skip. */
export function applyFeedback(
  profile: TasteProfile,
  station: Station,
  value: "like" | "dislike",
): TasteProfile {
  const delta = value === "like" ? 1 : -1.5;
  const tagWeights = { ...profile.tagWeights };
  station.tags.slice(0, 6).forEach((tag) => {
    tagWeights[tag] = Math.max(-6, Math.min(8, (tagWeights[tag] || 0) + delta));
  });
  return {
    ...profile,
    likedStationIds:
      value === "like"
        ? Array.from(new Set([...profile.likedStationIds, station.id]))
        : profile.likedStationIds.filter((id) => id !== station.id),
    dislikedStationIds:
      value === "dislike"
        ? Array.from(new Set([...profile.dislikedStationIds, station.id]))
        : profile.dislikedStationIds.filter((id) => id !== station.id),
    tagWeights,
  };
}

/** Push a station to the front of history, keeping 24 entries. */
export function rememberStation(
  profile: TasteProfile,
  station: Station,
  listenedAt: string = new Date().toISOString(),
): TasteProfile {
  return {
    ...profile,
    history: [
      { station, listenedAt },
      ...profile.history.filter((entry) => entry.station.id !== station.id),
    ].slice(0, 24),
  };
}

/** Tolerate older or partial persisted profiles. */
export function normalizeProfile(input: unknown): TasteProfile {
  const parsed = (input ?? {}) as Partial<TasteProfile>;
  return {
    ...EMPTY_PROFILE,
    ...parsed,
    likedStationIds: Array.isArray(parsed.likedStationIds) ? parsed.likedStationIds : [],
    dislikedStationIds: Array.isArray(parsed.dislikedStationIds) ? parsed.dislikedStationIds : [],
    tagWeights: parsed.tagWeights && typeof parsed.tagWeights === "object" ? parsed.tagWeights : {},
    history: Array.isArray(parsed.history) ? parsed.history : [],
    stationReliability:
      parsed.stationReliability && typeof parsed.stationReliability === "object"
        ? parsed.stationReliability
        : {},
    preferredCountryCode: /^[A-Z]{2}$/.test(String(parsed.preferredCountryCode || ""))
      ? (parsed.preferredCountryCode as string)
      : null,
  };
}