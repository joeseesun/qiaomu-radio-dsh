/**
 * The client-facing radio API.
 *
 * One interface, three providers:
 *  - the standalone player page served by the plugin's own host routes
 *    (`/qiaomu-radio/...`), started either in its own browser tab
 *    or inside the DSH shell;
 *  - the DSH dynamic browser half, where the guarded runtime hides `fetch`, so
 *    every call goes through the injected `host.call(method, args)` RPC instead;
 *  - the standalone preview server, which mirrors the same HTTP routes.
 *
 * The UI never imports a DSH or Node API: it only ever sees this object, so the
 * identical player renders in every environment.
 */

import type { CatalogRequest, CatalogResult, NowPlaying, PlayTarget, Station, TasteProfile } from "../core/types";

/** How the UI is allowed to reach the host. */
export type RadioTransport =
  /** Plain HTTP: the player was loaded from the plugin's own routes. */
  | { kind: "http"; baseUrl: string; fetchImpl?: typeof fetch }
  /** DSH dynamic browser half: `host.call` is the only way out. */
  | { kind: "rpc"; call(method: string, args?: unknown): Promise<unknown> };

export type RadioApi = {
  /** Station list for one scene channel / search / region. */
  catalog(request: CatalogRequest): Promise<CatalogResult>;
  /** Same request, but never rejects: falls back to the curated list. */
  catalogSafe(request: CatalogRequest): Promise<CatalogResult>;
  /** Playable URL plus playback kind for one station. */
  resolvePlay(station: Station): Promise<PlayTarget>;
  /** Best-effort "now playing" lookup; resolves null when unavailable. */
  nowPlaying(station: Station): Promise<NowPlaying | null>;
  /** Warm the host-side cache for the next stations without waiting. */
  prefetch(stations: Station[]): void;
};

/** Local, per-device persistence for taste memory and the chosen skin. */
export type RadioStorage = {
  loadProfile(): TasteProfile;
  saveProfile(profile: TasteProfile): void;
  loadTheme(): string | null;
  saveTheme(themeId: string): void;
};

/** Everything the player needs from its embedding surface. */
export type RadioHost = {
  api: RadioApi;
  storage: RadioStorage;
  /** Absolute URL of the plugin's host routes, when the surface can reach them. */
  baseUrl: string;
  /** Absolute URL of a package-served asset, when the surface can reach one. */
  assetUrl?(relativePath: string): string | null;
  /** Injected clock, so tests never wait on real timers. */
  now?: () => number;
};

/** How the player is presented: full page or floated over the conversation. */
export type RadioPresentation = "page" | "float" | "inline";

export type RadioMountOptions = {
  host: RadioHost;
  /** Element the player renders into; defaults to a full-page root. */
  container?: HTMLElement;
  presentation?: RadioPresentation;
  /** Preferred skin when nothing is persisted yet. */
  initialTheme?: string;
  /** Called when the host should take the surface down again. */
  onClose?: () => void;
};