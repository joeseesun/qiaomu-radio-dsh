import type { CatalogRequest, CatalogResult, NowPlaying, PlayTarget, Station } from "../core/types";
import { fallbackStationsFor } from "../core/fallback";
import type { RadioApi, RadioTransport } from "./api";

/**
 * HTTP method names served by the plugin's own routes and by the preview
 * server. Both ends speak exactly this table.
 */
export const RADIO_ROUTES = {
  catalog: "/api/radio/catalog",
  resolvePlay: "/api/radio/resolve-play",
  nowPlaying: "/api/radio/now-playing",
} as const;

/** `fetch` may be hidden inside the DSH guarded runtime, so it is injectable. */
function resolveFetch(transport: Extract<RadioTransport, { kind: "http" }>): typeof fetch {
  const impl = transport.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);
  if (!impl) throw new Error("radio: no fetch available for the http transport");
  return impl;
}

async function httpJson<T>(
  transport: Extract<RadioTransport, { kind: "http" }>,
  path: string,
  body?: unknown,
): Promise<T> {
  const doFetch = resolveFetch(transport);
  const response = await doFetch(`${transport.baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`radio ${path} failed with ${response.status}`);
  return (await response.json()) as T;
}

/** Build the one API object the UI consumes, over either transport. */
export function createRadioApi(transport: RadioTransport): RadioApi {
  const request = async <T>(method: string, path: string, args?: unknown): Promise<T> => {
    if (transport.kind === "http") return httpJson<T>(transport, path, args);
    return (await transport.call(method, args ?? null)) as T;
  };

  return {
    async catalog(input: CatalogRequest): Promise<CatalogResult> {
      return request<CatalogResult>("radio/catalog", RADIO_ROUTES.catalog, input);
    },

    async catalogSafe(input: CatalogRequest): Promise<CatalogResult> {
      try {
        const result = await this.catalog(input);
        if (Array.isArray(result?.stations) && result.stations.length > 0) return result;
      } catch {
        /* fall through to the offline list */
      }
      return {
        stations: fallbackStationsFor(input.mood),
        source: input.source,
        cached: false,
        countryCode: input.countryCode ?? null,
        warning: "无法连接电台目录，正在使用内置备用台单。",
      };
    },

    async resolvePlay(station: Station): Promise<PlayTarget> {
      return request<PlayTarget>("radio/resolvePlay", RADIO_ROUTES.resolvePlay, station);
    },

    async nowPlaying(station: Station): Promise<NowPlaying | null> {
      try {
        return await request<NowPlaying | null>("radio/nowPlaying", RADIO_ROUTES.nowPlaying, station);
      } catch {
        return null;
      }
    },

    prefetch(stations: Station[]): void {
      const warm = stations.slice(0, 3);
      for (const station of warm) {
        void this.resolvePlay(station).catch(() => undefined);
      }
    },
  };
}