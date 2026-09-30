/**
 * The host half's contract, kept free of DSH and Node types so the catalog,
 * taste and stream-proxy logic stay unit-testable.
 */

import type { CatalogRequest, CatalogResult, NowPlaying, PlayTarget, Station, TasteProfile } from "../core/types";

/** Minimal HTTP response surface the stream proxy needs. */
export type ProxyResponse = {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: Uint8Array | string): void;
  write(chunk: Uint8Array): void;
  on(event: "close", listener: () => void): void;
  readonly writableEnded: boolean;
};

/** Minimal HTTP request surface the stream proxy needs. */
export type ProxyRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: "data", listener: (chunk: Uint8Array) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
};

/** Options accepted by `createRadioService`. */
export type RadioServiceOptions = {
  /** Override the Radio Browser mirror list (tests, offline runs). */
  mirrors?: string[];
  /** Injected fetch so tests never touch the network. */
  fetchImpl?: typeof fetch;
  /** Clock injection for cache tests. */
  now?: () => number;
  /** Cache lifetimes in milliseconds. */
  catalogTtlMs?: number;
  streamUrlTtlMs?: number;
  /** User agent sent to catalog mirrors. */
  userAgent?: string;
  /** Taste store to expose; defaults to a volatile in-process store. */
  taste?: TasteStore;
};

/** The host-facing service the DSH half wraps. */
export type RadioService = {
  catalog(request: CatalogRequest): Promise<CatalogResult>;
  resolvePlay(station: Station): Promise<PlayTarget>;
  nowPlaying(station: Station): Promise<NowPlaying | null>;
  prefetch(stations: Station[]): void;
  /** Proxy one upstream radio URL (HLS playlist or media) to the browser. */
  proxy(request: ProxyRequest, response: ProxyResponse, upstream: string): Promise<void>;
  /** Drop every cached entry (tests, settings change). */
  clear(): void;
  /** Taste memory persisted next to the plugin data. */
  readonly taste: TasteStore;
};

/** Taste persistence owned by the host half. */
export type TasteStore = {
  read(): TasteProfile;
  write(profile: TasteProfile): void;
};