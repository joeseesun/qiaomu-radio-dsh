import { describe, expect, it } from "vitest";

import { MOOD_TAGS } from "../src/core/fallback";
import { EMPTY_PROFILE } from "../src/core/recommendation";
import type { Station, TasteProfile } from "../src/core/types";
import { createRadioService } from "../src/host/catalog";
import {
  CHINA_STATIONS,
  GLOBAL_CURATED_STATIONS,
  clientIp,
  countryCode,
  selectPopularMusic,
  type RawCatalogStation,
} from "../src/host/curated";
import { PLAY_PROXY_PREFIX } from "../src/host/proxy";
import { createMemoryTasteStore, createTasteStore } from "../src/host/taste";

/* ------------------------------------------------------------------ helpers */

const asFetch = (impl: unknown): typeof fetch => impl as typeof fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body),
    body: null,
  } as unknown as Response;
}

const raw = (input: Partial<RawCatalogStation> & { stationuuid: string }): RawCatalogStation => ({
  name: `Station ${input.stationuuid}`,
  url_resolved: `https://${input.stationuuid}.example/stream`,
  tags: "music",
  country: "Germany",
  countrycode: "de",
  language: "Deutsch",
  clickcount: 10,
  votes: 5,
  lastcheckok: 1,
  ...input,
});

const rawAmbient = raw({
  stationuuid: "a",
  name: " Focus One ",
  url_resolved: "https://a.example/stream",
  tags: "Ambient, Downtempo",
  country: "Germany",
  countrycode: "de",
  clickcount: 500,
  votes: 10,
});
const rawPop = raw({
  stationuuid: "b",
  name: "Pop Two",
  url_resolved: "https://b.example/stream",
  tags: "pop",
  country: "United States",
  countrycode: "us",
  clickcount: 900,
  votes: 20,
});
const rawInsecure: RawCatalogStation = {
  stationuuid: "c",
  name: "Insecure",
  url: "http://c.example/stream",
  tags: "pop",
  countrycode: "us",
  clickcount: 9999,
  lastcheckok: 1,
};
const rawDuplicateId = raw({ stationuuid: "a", name: "Duplicate id", url_resolved: "https://a2.example/stream", clickcount: 10 });
const rawDuplicateUrl = raw({ stationuuid: "d", name: "Duplicate url", url_resolved: "https://b.example/stream", clickcount: 700 });
const rawNoId = raw({ stationuuid: "", name: "No id", url_resolved: "https://e.example/stream" });
const rawNoUrl: RawCatalogStation = { stationuuid: "f", name: "No url" };

/* ------------------------------------------------------------------ catalog */

describe("createRadioService catalog", () => {
  it("fails over between mirrors, keeps HTTPS only, dedupes and ranks by clicks", async () => {
    let clock = 1_000_000;
    const calls: string[] = [];
    const fetchImpl = async (input: unknown) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("de1.")) throw new Error("de1 down");
      if (url.includes("nl1.")) {
        return jsonResponse([
          rawAmbient,
          rawPop,
          rawInsecure,
          rawDuplicateId,
          rawDuplicateUrl,
          rawNoId,
          rawNoUrl,
        ]);
      }
      throw new Error(`unexpected mirror ${url}`);
    };
    const service = createRadioService({
      mirrors: ["https://de1.api.radio-browser.info", "https://nl1.api.radio-browser.info"],
      fetchImpl: asFetch(fetchImpl),
      now: () => clock,
    });

    const result = await service.catalog({ mood: "focus", source: "radio-browser" });

    expect(result.source).toBe("radio-browser");
    expect(result.warning).toBeUndefined();
    expect(result.cached).toBe(false);
    expect(result.stations.map((station) => station.id)).toEqual(["b", "a"]);

    const focus = result.stations.find((station) => station.id === "a") as Station;
    expect(focus.name).toBe("Focus One");
    expect(focus.countryCode).toBe("DE");
    expect(focus.tags).toEqual(["ambient", "downtempo"]);
    expect(focus.streamUrl).toBe("https://a.example/stream");
    expect(focus.source).toBe("radio-browser");

    const tagCalls = calls.filter((url) => url.includes("nl1.") && url.includes("tag="));
    expect(tagCalls).toHaveLength(MOOD_TAGS.focus.length);
    for (const call of tagCalls) {
      expect(call).toContain("order=clickcount");
      expect(call).toContain("reverse=true");
      expect(call).toContain("hidebroken=true");
      expect(call).toContain("limit=60");
      expect(new URL(call).hostname).toBe("nl1.api.radio-browser.info");
    }
    expect(calls[0]).toContain("de1.api.radio-browser.info");
    expect(calls.filter((url) => url.includes("de1.") && url.includes("tag="))).toHaveLength(MOOD_TAGS.focus.length);
    expect(tagCalls.some((url) => url.includes("tag=ambient"))).toBe(true);
  });

  it("searches by name when a query is given", async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: unknown) => {
      calls.push(String(input));
      return jsonResponse([rawAmbient]);
    };
    const service = createRadioService({ fetchImpl: asFetch(fetchImpl) });

    const result = await service.catalog({ mood: "jazz", source: "radio-browser", query: "Jazz FM" });

    expect(result.stations.map((station) => station.id)).toEqual(["a"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("name=jazz+fm");
    expect(calls[0]).toContain("order=clickcount");
    expect(calls[0]).toContain("limit=60");
  });

  it("falls back to the Chinese curated list with a Chinese warning when every mirror fails", async () => {
    const fetchImpl = async () => {
      throw new Error("all mirrors down");
    };
    const service = createRadioService({ fetchImpl: asFetch(fetchImpl) });

    const result = await service.catalog({ mood: "energy", source: "radio-browser" });

    expect(result.source).toBe("china-curated");
    expect(result.cached).toBe(true);
    expect(result.stations).toHaveLength(CHINA_STATIONS.length);
    expect(result.warning).toBeTruthy();
    expect(result.warning).toMatch(/[\u4e00-\u9fa5]/);
  });

  it("serves the curated China list without touching the network", async () => {
    let calls = 0;
    const service = createRadioService({
      fetchImpl: asFetch(async () => {
        calls += 1;
        return jsonResponse([]);
      }),
    });

    const all = await service.catalog({ mood: "focus", source: "china-curated" });
    expect(all.stations).toHaveLength(7);

    const filtered = await service.catalog({ mood: "focus", source: "china-curated", query: "音乐" });
    expect(filtered.stations.map((station) => station.id).sort()).toEqual(["cn-brtv-music", "cn-hebei-youth-music"]);
    expect(calls).toBe(0);
  });

  it("queries Radio Browser by country code for regional requests", async () => {
    const calls: string[] = [];
    const usStations = Array.from({ length: 6 }, (_, index) =>
      raw({
        stationuuid: `us-${index}`,
        name: `US ${index}`,
        url_resolved: `https://us${index}.example/stream`,
        tags: "music, pop",
        country: "United States",
        countrycode: "us",
        clickcount: 100 - index,
      }),
    );
    const fetchImpl = async (input: unknown) => {
      calls.push(String(input));
      return jsonResponse(usStations);
    };
    const service = createRadioService({ fetchImpl: asFetch(fetchImpl) });

    const result = await service.catalog({ mood: "focus", source: "regional", countryCode: "us" });

    expect(result.source).toBe("regional");
    expect(result.countryCode).toBe("US");
    expect(result.stations).toHaveLength(6);
    expect(calls[0]).toContain("countrycode=US");
    expect(calls[0]).toContain("hidebroken=true");
    expect(calls[0]).toContain("limit=80");
    expect(calls[0]).toContain("order=votes");
  });

  it("falls back to global-curated when no country code is known", async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: unknown) => {
      calls.push(String(input));
      return jsonResponse([rawPop]);
    };
    const service = createRadioService({ fetchImpl: asFetch(fetchImpl) });

    const result = await service.catalog({ mood: "focus", source: "regional", countryCode: null });

    expect(result.source).toBe("global-curated");
    expect(result.stations).toHaveLength(GLOBAL_CURATED_STATIONS.length);
    expect(calls[0]).toContain("/json/stations/topvote/200");
    expect(calls[0]).toContain("hidebroken=true");

    const xx = await service.catalog({ mood: "focus", source: "regional", countryCode: "XX" });
    expect(xx.source).toBe("global-curated");
  });

  it("serves Chinese regions from the curated broadcaster list", async () => {
    let calls = 0;
    const service = createRadioService({
      fetchImpl: asFetch(async () => {
        calls += 1;
        return jsonResponse([]);
      }),
    });

    const result = await service.catalog({ mood: "focus", source: "regional", countryCode: "CN" });

    expect(result.source).toBe("china-curated");
    expect(result.countryCode).toBe("CN");
    expect(result.stations).toHaveLength(7);
    expect(calls).toBe(0);
  });

  it("keeps the last good regional list when the mirror goes down", async () => {
    let clock = 1_000_000;
    let mode: "ok" | "fail" = "ok";
    const jpStations = Array.from({ length: 6 }, (_, index) =>
      raw({
        stationuuid: `jp-${index}`,
        name: `JP ${index}`,
        url_resolved: `https://jp${index}.example/stream`,
        tags: "jazz",
        country: "Japan",
        countrycode: "jp",
        clickcount: 50 - index,
      }),
    );
    const fetchImpl = async () => {
      if (mode === "fail") throw new Error("mirror down");
      return jsonResponse(jpStations);
    };
    const service = createRadioService({ fetchImpl: asFetch(fetchImpl), now: () => clock, catalogTtlMs: 1_000 });

    const first = await service.catalog({ mood: "jazz", source: "regional", countryCode: "JP" });
    expect(first.cached).toBe(false);

    clock += 2_000;
    mode = "fail";
    const stale = await service.catalog({ mood: "jazz", source: "regional", countryCode: "JP" });

    expect(stale.cached).toBe(true);
    expect(stale.stations).toEqual(first.stations);
    expect(stale.warning).toMatch(/[\u4e00-\u9fa5]/);
  });

  it("caches catalog responses by TTL and drops them on clear()", async () => {
    let clock = 1_000_000;
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return jsonResponse([rawAmbient]);
    };
    const service = createRadioService({
      fetchImpl: asFetch(fetchImpl),
      now: () => clock,
      catalogTtlMs: 1_000,
    });

    const first = await service.catalog({ mood: "focus", source: "radio-browser" });
    expect(first.cached).toBe(false);
    const perRefresh = calls;
    expect(perRefresh).toBe(MOOD_TAGS.focus.length);

    const cached = await service.catalog({ mood: "focus", source: "radio-browser" });
    expect(cached.cached).toBe(true);
    expect(calls).toBe(perRefresh);

    clock += 1_001;
    const refreshed = await service.catalog({ mood: "focus", source: "radio-browser" });
    expect(refreshed.cached).toBe(false);
    expect(calls).toBe(perRefresh * 2);

    service.clear();
    const afterClear = await service.catalog({ mood: "focus", source: "radio-browser" });
    expect(afterClear.cached).toBe(false);
    expect(calls).toBe(perRefresh * 3);
  });

  it("mixes popular music stations into the global curated list when Radio Browser has enough", async () => {
    const popular = Array.from({ length: 12 }, (_, index) =>
      raw({
        stationuuid: `pop-${index}`,
        name: `Pop ${index}`,
        url_resolved: `https://pop${index}.example/stream`,
        tags: "music, pop",
        countrycode: index % 2 === 0 ? "us" : "gb",
        clickcount: 900 - index,
      }),
    );
    const fetchImpl = async () => jsonResponse(popular);
    const service = createRadioService({ fetchImpl: asFetch(fetchImpl) });

    const result = await service.catalog({ mood: "focus", source: "global-curated" });

    expect(result.source).toBe("global-curated");
    expect(result.stations).toHaveLength(20);
    expect(new Set(result.stations.map((station) => station.streamUrl)).size).toBe(20);
    expect(result.stations.filter((station) => station.id.startsWith("pop-"))).toHaveLength(12);
    expect(result.stations[0]?.clickCount).toBeGreaterThanOrEqual(100);

    const cached = await service.catalog({ mood: "focus", source: "global-curated" });
    expect(cached.cached).toBe(true);
  });

  it("falls back to the curated global list with a warning when global-curated mirrors fail", async () => {
    const fetchImpl = async () => {
      throw new Error("down");
    };
    const service = createRadioService({ fetchImpl: asFetch(fetchImpl) });

    const result = await service.catalog({ mood: "focus", source: "global-curated" });

    expect(result.source).toBe("global-curated");
    expect(result.stations).toHaveLength(GLOBAL_CURATED_STATIONS.length);
    expect(result.warning).toMatch(/[\u4e00-\u9fa5]/);
  });
});

/* --------------------------------------------------------------- play targets */

describe("resolvePlay / prefetch", () => {
  it("routes HLS through the proxy and plays direct streams as-is", async () => {
    let clock = 5_000_000;
    const service = createRadioService({ now: () => clock, streamUrlTtlMs: 500 });
    const hlsStation = CHINA_STATIONS[0] as Station;

    const hls = await service.resolvePlay(hlsStation);
    expect(hls.kind).toBe("hls");
    expect(hls.url).toBe(`${PLAY_PROXY_PREFIX}${encodeURIComponent(hlsStation.streamUrl)}`);
    expect(hls.source).toBe("china-curated");
    expect(hls.cached).toBe(false);

    const cached = await service.resolvePlay(hlsStation);
    expect(cached.cached).toBe(true);
    expect(cached.url).toBe(hls.url);

    clock += 501;
    const expired = await service.resolvePlay(hlsStation);
    expect(expired.cached).toBe(false);

    const mediaStation = GLOBAL_CURATED_STATIONS[0] as Station;
    const media = await service.resolvePlay(mediaStation);
    expect(media.kind).toBe("media");
    expect(media.url).toBe(mediaStation.streamUrl);
    expect(media.source).toBe("global-curated");
  });

  it("prefetch warms the play cache without blocking", async () => {
    const service = createRadioService({ now: () => 1_000 });
    const station = GLOBAL_CURATED_STATIONS[1] as Station;

    service.prefetch([station]);
    const target = await service.resolvePlay(station);

    expect(target.cached).toBe(true);
    expect(target.url).toBe(station.streamUrl);
  });

  it("does not call the network while resolving play targets", async () => {
    let calls = 0;
    const service = createRadioService({
      fetchImpl: asFetch(async () => {
        calls += 1;
        return jsonResponse([]);
      }),
    });
    await service.resolvePlay(CHINA_STATIONS[1] as Station);
    await service.resolvePlay(GLOBAL_CURATED_STATIONS[2] as Station);
    expect(calls).toBe(0);
  });
});

/* --------------------------------------------------------------- now playing */

describe("nowPlaying", () => {
  const soma = (): Station => ({
    ...(GLOBAL_CURATED_STATIONS[0] as Station),
    id: "soma-groovesalad",
    streamUrl: "https://ice2.somafm.com/groovesalad-128-mp3",
  });

  it("reads a fresh SomaFM song and skips lookups for other stations", async () => {
    const clock = 1_800_000_000_000;
    const calls: string[] = [];
    const fetchImpl = async (input: unknown) => {
      calls.push(String(input));
      return jsonResponse({
        songs: [{ title: "Track A", artist: "Artist A", album: "Album A", date: String((clock - 10_000) / 1000) }],
      });
    };
    const service = createRadioService({ fetchImpl: asFetch(fetchImpl), now: () => clock });

    const track = await service.nowPlaying(soma());

    expect(calls).toEqual(["https://somafm.com/songs/groovesalad.json"]);
    expect(track).toEqual({
      title: "Track A",
      artist: "Artist A",
      album: "Album A",
      updatedAt: clock - 10_000,
    });

    const other = await service.nowPlaying(GLOBAL_CURATED_STATIONS[1] as Station);
    expect(other).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("returns null for stale metadata, failing upstreams and bad payloads", async () => {
    const clock = 1_800_000_000_000;
    const responses: Array<() => Promise<Response> | Response> = [
      () => jsonResponse({ songs: [{ title: "Old", date: String((clock - 60 * 60 * 1000) / 1000) }] }),
      () => jsonResponse({ songs: [{ title: "Future", date: String((clock + 10 * 60 * 1000) / 1000) }] }),
      () => jsonResponse({ songs: [] }),
      () => {
        throw new Error("network down");
      },
      () => jsonResponse({ error: "nope" }, 500),
    ];
    for (const respond of responses) {
      const service = createRadioService({ fetchImpl: asFetch(async () => respond()), now: () => clock });
      await expect(service.nowPlaying(soma())).resolves.toBeNull();
    }
  });
});

/* ------------------------------------------------------------- taste storage */

describe("taste store", () => {
  it("exposes the injected store and defaults to an in-memory one", () => {
    const injected = createMemoryTasteStore();
    const withInjected = createRadioService({ taste: injected });
    expect(withInjected.taste).toBe(injected);

    const profile: TasteProfile = { ...EMPTY_PROFILE, likedStationIds: ["cn-brtv-music"] };
    const service = createRadioService();
    service.taste.write(profile);
    expect(service.taste.read().likedStationIds).toEqual(["cn-brtv-music"]);
  });

  it("round-trips through an adapter and degrades corrupt data to an empty profile", () => {
    let disk: string | null = null;
    const store = createTasteStore({
      read: () => disk,
      write: (text) => {
        disk = text;
      },
    });

    expect(store.read()).toEqual(EMPTY_PROFILE);

    store.write({ ...EMPTY_PROFILE, likedStationIds: ["a"], preferredCountryCode: "CN", tagWeights: { jazz: 2 } });
    const loaded = store.read();
    expect(loaded.likedStationIds).toEqual(["a"]);
    expect(loaded.preferredCountryCode).toBe("CN");
    expect(loaded.tagWeights).toEqual({ jazz: 2 });

    disk = "{ this is not json";
    expect(store.read().likedStationIds).toEqual([]);
    disk = JSON.stringify({ likedStationIds: "nope", preferredCountryCode: "cn" });
    const partial = store.read();
    expect(partial.likedStationIds).toEqual([]);
    expect(partial.preferredCountryCode).toBeNull();
    disk = null;
    expect(store.read().likedStationIds).toEqual([]);
  });
});

/* -------------------------------------------------------------- small policy */

describe("curated policy helpers", () => {
  it("keeps two stations per country before using the leftovers", () => {
    const rawStations = [
      raw({ stationuuid: "1", tags: "jazz", countrycode: "de" }),
      raw({ stationuuid: "2", tags: "jazz", countrycode: "de" }),
      raw({ stationuuid: "3", tags: "jazz", countrycode: "de" }),
      raw({ stationuuid: "4", tags: "news, talk", countrycode: "us" }),
      raw({ stationuuid: "5", tags: "pop", url_resolved: "http://5.example/stream", countrycode: "us" }),
      raw({ stationuuid: "6", tags: "pop", countrycode: "us" }),
    ];

    const picked = selectPopularMusic(rawStations, 3);

    expect(picked.map((station) => station.stationuuid)).toEqual(["1", "2", "6"]);
  });

  it("normalizes country codes and rejects XX", () => {
    expect(countryCode(" de ")).toBe("DE");
    expect(countryCode("xx")).toBeNull();
    expect(countryCode("")).toBeNull();
    expect(countryCode(undefined)).toBeNull();
  });

  it("resolves a public client IP and ignores private ones", () => {
    expect(clientIp({ headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } })).toBe("203.0.113.9");
    expect(clientIp({ socket: { remoteAddress: "::ffff:198.51.100.7" } })).toBe("198.51.100.7");
    expect(clientIp({ socket: { remoteAddress: "127.0.0.1" } })).toBeNull();
    expect(clientIp({ socket: { remoteAddress: "192.168.1.4" } })).toBeNull();
    expect(clientIp({ headers: {} })).toBeNull();
  });
});