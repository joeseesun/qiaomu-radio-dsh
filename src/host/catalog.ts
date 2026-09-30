/**
 * The host-side radio service: Radio Browser mirror polling, mood/region/
 * curated catalog assembly, play-URL resolution, "now playing" lookup for
 * SomaFM, the stream proxy and taste storage.
 *
 * Behaviour is ported from the reference web server (`qiaomu-radio/server.mjs`,
 * `qiaomu-radio/serverPolicy.mjs`) but trimmed to what the DSH host half needs:
 * one service object, injected fetch and clock, no Express.
 */

import { MOOD_TAGS } from "../core/fallback";
import { isHlsUrl } from "../core/playbackPolicy";
import type { CatalogRequest, CatalogResult, NowPlaying, PlayTarget, Station } from "../core/types";
import type { ProxyRequest, ProxyResponse, RadioService, RadioServiceOptions, TasteStore } from "./contract";
import {
  CHINA_STATIONS,
  GLOBAL_CURATED_STATIONS,
  RADIO_BROWSER_MIRRORS,
  RADIO_USER_AGENT,
  countryCode,
  filterCuratedStations,
  selectPopularMusic,
  type RawCatalogStation,
} from "./curated";
import { PLAY_PROXY_PREFIX, proxy as proxyStream } from "./proxy";
import { createMemoryTasteStore } from "./taste";

/** How long a catalog response is reused. */
export const DEFAULT_CATALOG_TTL_MS = 15 * 60 * 1000;
/** How long a resolved play target is reused. */
export const DEFAULT_STREAM_URL_TTL_MS = 10 * 60 * 1000;
/** A stale regional list may still serve a request this long after the last success. */
const REGIONAL_STALE_MS = 24 * 60 * 60 * 1000;
/** "Now playing" lookups are cheap to cache for a few seconds. */
const NOW_PLAYING_CACHE_MS = 20 * 1000;
/** A SomaFM song older than this is considered stale metadata. */
const SOMA_FRESH_MS = 30 * 60 * 1000;

const WARNING_CATALOG_DOWN = "全球电台目录暂时不可用，已切换到中国公开电台。";
const WARNING_CURATED_DOWN = "全球电台目录暂时不可用，已切换到精选电台。";
const WARNING_REGIONAL_STALE = "地区目录暂时波动，已继续使用最近成功的电台列表。";

type CatalogEntry = { at: number; result: CatalogResult };
type RegionalEntry = { at: number; stations: Station[] };
type PlayEntry = { at: number; target: PlayTarget };
type SongEntry = { at: number; value: NowPlaying | null };

function asRawList(value: unknown): RawCatalogStation[] {
  return Array.isArray(value) ? (value as RawCatalogStation[]) : [];
}

/** Raw Radio Browser documents → clean HTTPS stations, deduped and ranked. */
function cleanStations(rawStations: readonly RawCatalogStation[]): Station[] {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const cleaned: Station[] = [];
  for (const raw of rawStations) {
    const station = cleanStation(raw);
    if (!station) continue;
    if (seenIds.has(station.id) || seenUrls.has(station.streamUrl)) continue;
    seenIds.add(station.id);
    seenUrls.add(station.streamUrl);
    cleaned.push(station);
  }
  return cleaned.sort((left, right) => right.clickCount - left.clickCount);
}

function cleanStation(raw: RawCatalogStation): Station | null {
  const id = String(raw.stationuuid ?? raw.id ?? "").trim();
  const streamUrl = String(raw.url_resolved || raw.url || raw.streamUrl || "").trim();
  if (!id || !streamUrl || !/^https:\/\//i.test(streamUrl)) return null;
  const name = String(raw.name || "").trim();
  return {
    id,
    name: name || "未命名电台",
    streamUrl,
    homepage: String(raw.homepage || ""),
    favicon: String(raw.favicon || ""),
    tags: String(raw.tags || "")
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12),
    country: String(raw.country || raw.countrycode || "未知地区"),
    countryCode: String(raw.countrycode || raw.countryCode || "").toUpperCase(),
    language: String(raw.language || "未知语言"),
    codec: String(raw.codec || ""),
    bitrate: Number(raw.bitrate || 0),
    votes: Number(raw.votes || 0),
    clickCount: Number(raw.clickcount ?? raw.clickCount ?? 0),
    source: "radio-browser",
  };
}

/** SomaFM channel slug, e.g. `https://ice2.somafm.com/groovesalad-128-mp3` → `groovesalad`. */
function somaChannel(streamUrl: string): string | null {
  try {
    const url = new URL(streamUrl);
    if (url.hostname !== "somafm.com" && !url.hostname.endsWith(".somafm.com")) return null;
    return url.pathname.match(/^\/([a-z0-9]+)(?:[-/]|$)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Create the host radio service. Every dependency is injectable. */
export function createRadioService(options: RadioServiceOptions = {}): RadioService {
  const mirrors = options.mirrors?.length ? options.mirrors : RADIO_BROWSER_MIRRORS;
  const fetchImpl: typeof fetch | undefined =
    options.fetchImpl ?? (typeof fetch === "function" ? fetch.bind(globalThis) : undefined);
  const now = options.now ?? (() => Date.now());
  const catalogTtlMs = options.catalogTtlMs ?? DEFAULT_CATALOG_TTL_MS;
  const streamUrlTtlMs = options.streamUrlTtlMs ?? DEFAULT_STREAM_URL_TTL_MS;
  const userAgent = options.userAgent ?? RADIO_USER_AGENT;
  const taste: TasteStore = options.taste ?? createMemoryTasteStore();

  const catalogCache = new Map<string, CatalogEntry>();
  const regionalCache = new Map<string, RegionalEntry>();
  const playCache = new Map<string, PlayEntry>();
  const songCache = new Map<string, SongEntry>();

  function timeoutSignal(ms: number): AbortSignal | undefined {
    return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(ms)
      : undefined;
  }

  /** Walk the mirror list until one answers with JSON. */
  async function requestJson(pathname: string): Promise<unknown> {
    if (!fetchImpl) throw new Error("宿主缺少 fetch 实现");
    let lastError: unknown;
    for (const mirror of mirrors) {
      try {
        const response = await fetchImpl(`${mirror.replace(/\/+$/, "")}${pathname}`, {
          headers: { "User-Agent": userAgent, Accept: "application/json" },
          signal: timeoutSignal(6500),
        });
        if (!response.ok) throw new Error(`Radio Browser 返回 ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Radio Browser 暂时不可用");
  }

  function remember(key: string, result: CatalogResult): CatalogResult {
    catalogCache.set(key, { at: now(), result });
    if (catalogCache.size > 120) {
      const oldest = catalogCache.keys().next().value;
      if (oldest !== undefined) catalogCache.delete(oldest);
    }
    return result;
  }

  /** Curated global list, optionally topped up with popular Radio Browser music. */
  async function globalCurated(country?: string | null): Promise<CatalogResult> {
    const key = "global-curated";
    const cached = catalogCache.get(key);
    if (cached && now() - cached.at < catalogTtlMs) {
      return { ...cached.result, cached: true, countryCode: country ?? cached.result.countryCode ?? null };
    }
    try {
      const raw = await requestJson("/json/stations/topvote/200?hidebroken=true");
      const selected = cleanStations(selectPopularMusic(asRawList(raw), 20));
      let stations: Station[];
      if (selected.length < 12) {
        stations = [...GLOBAL_CURATED_STATIONS];
      } else {
        const chosenUrls = new Set(selected.map((station) => station.streamUrl));
        stations = [
          ...selected,
          ...GLOBAL_CURATED_STATIONS.filter((station) => !chosenUrls.has(station.streamUrl)),
        ].slice(0, 20);
      }
      const result = remember(key, {
        stations,
        source: "global-curated",
        cached: false,
        countryCode: country ?? null,
      });
      return result;
    } catch {
      return {
        stations: [...GLOBAL_CURATED_STATIONS],
        source: "global-curated",
        cached: false,
        countryCode: country ?? null,
        warning: WARNING_CURATED_DOWN,
      };
    }
  }

  /** Region list from Radio Browser, with stale and curated fallbacks. */
  async function regionalStations(code: string): Promise<CatalogResult> {
    const key = `regional:${code}`;
    const cached = regionalCache.get(key);
    if (cached && now() - cached.at < catalogTtlMs) {
      return { stations: cached.stations, source: "regional", cached: true, countryCode: code };
    }
    try {
      const params = new URLSearchParams({
        countrycode: code,
        hidebroken: "true",
        limit: "80",
        order: "votes",
        reverse: "true",
      });
      const raw = await requestJson(`/json/stations/search?${params}`);
      const music = cleanStations(selectPopularMusic(asRawList(raw), 20));
      if (music.length >= 5) {
        regionalCache.set(key, { at: now(), stations: music });
        if (regionalCache.size > 80) {
          const oldest = regionalCache.keys().next().value;
          if (oldest !== undefined) regionalCache.delete(oldest);
        }
        return { stations: music, source: "regional", cached: false, countryCode: code };
      }
    } catch {
      /* fall through to the stale/curated fallbacks */
    }
    if (cached && now() - cached.at < REGIONAL_STALE_MS) {
      return {
        stations: cached.stations,
        source: "regional",
        cached: true,
        countryCode: code,
        warning: WARNING_REGIONAL_STALE,
      };
    }
    return globalCurated(code);
  }

  /** Radio Browser search: one mood tag query per tag, merged and deduped. */
  async function searchStations(mood: CatalogRequest["mood"], query: string): Promise<CatalogResult> {
    const key = `radio-browser:${mood}:${query}`;
    const cached = catalogCache.get(key);
    if (cached && now() - cached.at < catalogTtlMs) return { ...cached.result, cached: true };

    try {
      const base = new URLSearchParams({
        hidebroken: "true",
        limit: "60",
        order: "clickcount",
        reverse: "true",
      });
      let raw: RawCatalogStation[];
      if (query) {
        base.set("name", query);
        raw = asRawList(await requestJson(`/json/stations/search?${base}`));
      } else {
        const tags = MOOD_TAGS[mood] ?? MOOD_TAGS.focus;
        const pages = await Promise.all(
          tags.map((tag) => {
            const params = new URLSearchParams(base);
            params.set("tag", tag);
            params.set("tagExact", "false");
            return requestJson(`/json/stations/search?${params}`);
          }),
        );
        const merged = new Map<string, RawCatalogStation>();
        for (const station of pages.flatMap(asRawList)) {
          const id = String(station.stationuuid ?? station.id ?? "");
          if (id && !merged.has(id)) merged.set(id, station);
        }
        raw = [...merged.values()];
      }
      return remember(key, {
        stations: cleanStations(raw),
        source: "radio-browser",
        cached: false,
      });
    } catch {
      const fallback = filterCuratedStations(CHINA_STATIONS, query);
      return {
        stations: fallback.length > 0 ? fallback : [...CHINA_STATIONS],
        source: "china-curated",
        cached: true,
        warning: WARNING_CATALOG_DOWN,
      };
    }
  }

  const service: RadioService = {
    async catalog(request: CatalogRequest): Promise<CatalogResult> {
      const query = String(request.query ?? "").trim().slice(0, 80).toLowerCase();

      if (request.source === "china-curated") {
        return {
          stations: filterCuratedStations(CHINA_STATIONS, query),
          source: "china-curated",
          cached: true,
          countryCode: countryCode(request.countryCode) ?? null,
        };
      }
      if (request.source === "global-curated") {
        return globalCurated(countryCode(request.countryCode));
      }
      if (request.source === "regional") {
        const code = countryCode(request.countryCode);
        if (!code) return globalCurated(null);
        // A Chinese region request is served by the broadcaster-owned list.
        if (code === "CN") {
          return { stations: [...CHINA_STATIONS], source: "china-curated", cached: true, countryCode: code };
        }
        return regionalStations(code);
      }
      return searchStations(request.mood, query);
    },

    async resolvePlay(station: Station): Promise<PlayTarget> {
      const key = station.id || station.streamUrl;
      const cached = playCache.get(key);
      if (cached && now() - cached.at < streamUrlTtlMs) return { ...cached.target, cached: true };
      const hls = isHlsUrl(station.streamUrl);
      const target: PlayTarget = {
        url: hls ? `${PLAY_PROXY_PREFIX}${encodeURIComponent(station.streamUrl)}` : station.streamUrl,
        kind: hls ? "hls" : "media",
        source: station.source ?? "radio-browser",
        cached: false,
      };
      playCache.set(key, { at: now(), target });
      if (playCache.size > 500) {
        const oldest = playCache.keys().next().value;
        if (oldest !== undefined) playCache.delete(oldest);
      }
      return target;
    },

    async nowPlaying(station: Station): Promise<NowPlaying | null> {
      const channel = somaChannel(station.streamUrl);
      if (!channel || !fetchImpl) return null;
      const cached = songCache.get(channel);
      if (cached && now() - cached.at < NOW_PLAYING_CACHE_MS) return cached.value;
      try {
        const response = await fetchImpl(`https://somafm.com/songs/${channel}.json`, {
          headers: { "User-Agent": userAgent, Accept: "application/json" },
          signal: timeoutSignal(6000),
        });
        if (!response.ok) {
          songCache.set(channel, { at: now(), value: null });
          return null;
        }
        const data = (await response.json()) as {
          songs?: Array<{ title?: string; artist?: string; album?: string; date?: string | number }>;
        };
        const song = data?.songs?.[0];
        const updatedAt = Number(song?.date) * 1000;
        const fresh =
          Number.isFinite(updatedAt) &&
          updatedAt > 0 &&
          now() - updatedAt < SOMA_FRESH_MS &&
          updatedAt <= now() + 60_000;
        const value: NowPlaying | null =
          fresh && song?.title
            ? {
                title: String(song.title),
                artist: String(song.artist || ""),
                album: String(song.album || ""),
                updatedAt,
              }
            : null;
        songCache.set(channel, { at: now(), value });
        if (songCache.size > 100) {
          const oldest = songCache.keys().next().value;
          if (oldest !== undefined) songCache.delete(oldest);
        }
        return value;
      } catch {
        return null;
      }
    },

    prefetch(stations: Station[]): void {
      for (const station of stations) {
        const key = station.id || station.streamUrl;
        const cached = playCache.get(key);
        if (cached && now() - cached.at < streamUrlTtlMs) continue;
        void service.resolvePlay(station).catch(() => undefined);
      }
    },

    async proxy(request: ProxyRequest, response: ProxyResponse, upstream: string): Promise<void> {
      await proxyStream(request, response, upstream, {
        fetchImpl,
        userAgent,
      });
    },

    clear(): void {
      catalogCache.clear();
      regionalCache.clear();
      playCache.clear();
      songCache.clear();
    },

    taste,
  };

  return service;
}