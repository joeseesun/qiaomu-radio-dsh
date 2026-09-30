import { describe, expect, it } from "vitest";

import {
  EMPTY_PROFILE,
  applyFeedback,
  normalizeProfile,
  rankStations,
  recordStationOutcome,
  reliabilityScore,
  rememberStation,
  stationScore,
} from "../src/core/recommendation";
import type { Station, TasteProfile } from "../src/core/types";

const station = (id: string, tags: string[] = ["jazz"], overrides: Partial<Station> = {}): Station => ({
  id,
  name: `Station ${id}`,
  streamUrl: `https://${id}.example/stream`,
  homepage: "",
  favicon: "",
  tags,
  country: "Germany",
  countryCode: "DE",
  language: "Deutsch",
  codec: "MP3",
  bitrate: 128,
  votes: 10,
  clickCount: 100,
  source: "radio-browser",
  ...overrides,
});

const profile = (overrides: Partial<TasteProfile> = {}): TasteProfile => ({ ...EMPTY_PROFILE, ...overrides });

describe("stationScore", () => {
  it("rewards HTTPS, tag affinity and reliability", () => {
    const base = station("a");
    const insecure = station("a", ["jazz"], { streamUrl: "http://a.example/stream" });

    expect(stationScore(base, profile(), 0, 0) - stationScore(insecure, profile(), 0, 0)).toBeCloseTo(0.7, 6);

    const liked = stationScore(base, profile({ tagWeights: { jazz: 4 } }), 0, 0);
    const neutral = stationScore(base, profile(), 0, 0);
    expect(liked - neutral).toBeCloseTo(4, 6);

    const reliable = profile({
      stationReliability: { a: { successes: 8, failures: 0, consecutiveFailures: 0 } },
    });
    expect(stationScore(base, reliable, 0, 0)).toBeGreaterThan(stationScore(base, profile(), 0, 0));
  });

  it("includes the injected random component so callers can make it deterministic", () => {
    const value = stationScore(station("a"), profile(), 1, 0);
    const zero = stationScore(station("a"), profile(), 0, 0);
    expect(value - zero).toBeCloseTo(1.8, 6);
  });
});

describe("reliabilityScore", () => {
  const now = Date.parse("2024-05-01T12:00:00.000Z");

  it("is zero without history and grows with successes", () => {
    expect(reliabilityScore(profile(), "a", now)).toBe(0);
    const score = reliabilityScore(
      profile({ stationReliability: { a: { successes: 8, failures: 0, consecutiveFailures: 0 } } }),
      "a",
      now,
    );
    expect(score).toBeCloseTo(Math.min(1.2, Math.log2(9) * 0.3), 6);
  });

  it("decays recent consecutive failures", () => {
    const recent = profile({
      stationReliability: {
        a: {
          successes: 0,
          failures: 2,
          consecutiveFailures: 2,
          lastFailureAt: new Date(now - 1_000).toISOString(),
        },
      },
    });
    expect(reliabilityScore(recent, "a", now)).toBeCloseTo(-4.5, 6);

    const halfDay = profile({
      stationReliability: {
        a: {
          successes: 0,
          failures: 2,
          consecutiveFailures: 2,
          lastFailureAt: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
        },
      },
    });
    expect(reliabilityScore(halfDay, "a", now)).toBeCloseTo(-4.5 * 0.35, 6);

    const old = profile({
      stationReliability: {
        a: {
          successes: 0,
          failures: 2,
          consecutiveFailures: 2,
          lastFailureAt: new Date(now - 30 * 60 * 60 * 1000).toISOString(),
        },
      },
    });
    expect(reliabilityScore(old, "a", now)).toBeCloseTo(0, 6);
  });

  it("caps the failure penalty at eight", () => {
    const chronic = profile({
      stationReliability: {
        a: {
          successes: 0,
          failures: 9,
          consecutiveFailures: 9,
          lastFailureAt: new Date(now - 1_000).toISOString(),
        },
      },
    });
    expect(reliabilityScore(chronic, "a", now)).toBeCloseTo(-8, 6);
  });
});

describe("rankStations", () => {
  it("filters disliked stations and promotes tag affinity", () => {
    const liked = station("liked", ["jazz"]);
    const neutral = station("neutral", ["rock"]);
    const disliked = station("disliked", ["jazz"]);

    const ranked = rankStations(
      [neutral, disliked, liked],
      profile({ tagWeights: { jazz: 6 }, dislikedStationIds: ["disliked"] }),
    );

    expect(ranked.map((item) => item.id)).toEqual(["liked", "neutral"]);
  });

  it("demotes a station heard in the last eight sessions", () => {
    const heard = station("heard");
    const fresh = station("fresh");
    const ranked = rankStations([heard, fresh], profile({ history: [{ station: heard, listenedAt: "2024-05-01T00:00:00.000Z" }] }));

    expect(ranked.map((item) => item.id)).toEqual(["fresh", "heard"]);
  });

  it("only demotes the eight most recent history entries", () => {
    const target = station("target");
    const recent = Array.from({ length: 8 }, (_, index) => station(`recent-${index}`));
    // `target` is the ninth entry, so it sits outside the eight-session window.
    const history = [...recent, target].map((item) => ({
      station: item,
      listenedAt: "2024-05-01T00:00:00.000Z",
    }));
    const ranked = rankStations([recent[0] as Station, target], profile({ history }));
    expect(ranked.map((item) => item.id)).toEqual(["target", "recent-0"]);
  });
});

describe("recordStationOutcome", () => {
  it("tracks successes, failures and consecutive failures", () => {
    const failed = recordStationOutcome(profile(), "a", "failure", new Date("2024-05-01T10:00:00.000Z"));
    expect(failed.stationReliability.a).toMatchObject({ failures: 1, successes: 0, consecutiveFailures: 1 });
    expect(failed.stationReliability.a?.lastFailureAt).toBe("2024-05-01T10:00:00.000Z");

    const failedAgain = recordStationOutcome(failed, "a", "failure", new Date("2024-05-01T11:00:00.000Z"));
    expect(failedAgain.stationReliability.a?.consecutiveFailures).toBe(2);

    const recovered = recordStationOutcome(failedAgain, "a", "success", new Date("2024-05-01T12:00:00.000Z"));
    expect(recovered.stationReliability.a).toMatchObject({
      successes: 1,
      failures: 2,
      consecutiveFailures: 0,
    });
    expect(recovered.stationReliability.a?.lastSuccessAt).toBe("2024-05-01T12:00:00.000Z");
  });

  it("keeps only the 120 most recent stations", () => {
    let current = profile();
    for (let index = 0; index < 125; index += 1) {
      current = recordStationOutcome(current, `s-${index}`, "success", new Date(2024, 4, 1, 0, index));
    }
    expect(Object.keys(current.stationReliability)).toHaveLength(120);
    expect(current.stationReliability["s-124"]).toBeDefined();
    expect(current.stationReliability["s-0"]).toBeUndefined();
  });
});

describe("applyFeedback", () => {
  it("raises tag weights on like and remembers the station", () => {
    const target = station("a", ["t1", "t2", "t3", "t4", "t5", "t6", "t7"]);
    const liked = applyFeedback(profile(), target, "like");

    expect(liked.likedStationIds).toEqual(["a"]);
    expect(liked.dislikedStationIds).toEqual([]);
    expect(liked.tagWeights.t1).toBe(1);
    expect(liked.tagWeights.t6).toBe(1);
    expect(liked.tagWeights.t7).toBeUndefined();
  });

  it("lowers tag weights on dislike and forgets a previous like", () => {
    const target = station("a", ["t1"]);
    const liked = applyFeedback(profile(), target, "like");
    const disliked = applyFeedback(liked, target, "dislike");

    expect(disliked.likedStationIds).toEqual([]);
    expect(disliked.dislikedStationIds).toEqual(["a"]);
    expect(disliked.tagWeights.t1).toBeCloseTo(-0.5, 6);
  });

  it("clamps tag weights to [-6, 8]", () => {
    const target = station("a", ["t1"]);
    let high = profile({ tagWeights: { t1: 8 } });
    high = applyFeedback(high, target, "like");
    expect(high.tagWeights.t1).toBe(8);

    let low = profile();
    for (let index = 0; index < 5; index += 1) low = applyFeedback(low, target, "dislike");
    expect(low.tagWeights.t1).toBe(-6);
  });
});

describe("rememberStation", () => {
  it("pushes to the front, dedupes and caps at 24", () => {
    let current = profile();
    for (let index = 0; index < 25; index += 1) {
      current = rememberStation(current, station(`s-${index}`), "2024-05-01T00:00:00.000Z");
    }
    expect(current.history).toHaveLength(24);
    expect(current.history[0]?.station.id).toBe("s-24");
    expect(current.history.some((entry) => entry.station.id === "s-0")).toBe(false);

    const revisited = rememberStation(current, station("s-5"), "2024-05-02T00:00:00.000Z");
    expect(revisited.history).toHaveLength(24);
    expect(revisited.history[0]?.station.id).toBe("s-5");
    expect(revisited.history.filter((entry) => entry.station.id === "s-5")).toHaveLength(1);
  });
});

describe("normalizeProfile", () => {
  it("returns an empty profile for missing or broken input", () => {
    expect(normalizeProfile(null)).toEqual(EMPTY_PROFILE);
    expect(normalizeProfile(undefined)).toEqual(EMPTY_PROFILE);
    expect(normalizeProfile(42)).toEqual(EMPTY_PROFILE);
    expect(normalizeProfile({ likedStationIds: "nope", history: null, tagWeights: 7 })).toEqual(EMPTY_PROFILE);
  });

  it("keeps valid fields and normalizes the country code", () => {
    const result = normalizeProfile({
      likedStationIds: ["a"],
      tagWeights: { jazz: 2 },
      preferredCountryCode: "jp",
    });
    expect(result.likedStationIds).toEqual(["a"]);
    expect(result.tagWeights).toEqual({ jazz: 2 });
    expect(result.preferredCountryCode).toBeNull();

    expect(normalizeProfile({ preferredCountryCode: "JP" }).preferredCountryCode).toBe("JP");
    expect(normalizeProfile({ preferredCountryCode: "USA" }).preferredCountryCode).toBeNull();
  });
});