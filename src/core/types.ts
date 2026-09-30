/**
 * Data contract shared by every half of the DSH radio plugin.
 *
 * These types intentionally mirror the reference web player
 * (`qiaomu-radio/src/types.ts`) so the two surfaces describe the same
 * station catalog, taste memory and themes.
 */

/** Scene channel used to seed a station search. */
export type MoodId = "unwind" | "focus" | "jazz" | "classical" | "energy" | "world";

/** Player environment (skin) id. */
export type ThemeId = "editorial" | "pocket" | "deck" | "console" | "rams" | "fantasy";

/** Where a station list came from. */
export type StationSource = "radio-browser" | "china-curated" | "regional" | "global-curated";

/** One live radio station. */
export type Station = {
  id: string;
  name: string;
  /** Upstream stream URL as advertised by the catalog. */
  streamUrl: string;
  homepage: string;
  favicon: string;
  tags: string[];
  country: string;
  countryCode: string;
  language: string;
  codec: string;
  bitrate: number;
  votes: number;
  clickCount: number;
  source?: StationSource;
};

/** Per-station playback outcome counters kept in taste memory. */
export type StationReliability = {
  successes: number;
  failures: number;
  consecutiveFailures: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
};

/** Local taste memory. Never leaves the device. */
export type TasteProfile = {
  likedStationIds: string[];
  dislikedStationIds: string[];
  tagWeights: Record<string, number>;
  history: Array<{ station: Station; listenedAt: string }>;
  stationReliability: Record<string, StationReliability>;
  preferredCountryCode: string | null;
};

/** A station list request. */
export type CatalogRequest = {
  mood: MoodId;
  query?: string;
  source: StationSource;
  countryCode?: string | null;
};

/** A station list response. */
export type CatalogResult = {
  stations: Station[];
  source: StationSource;
  cached: boolean;
  countryCode?: string | null;
  warning?: string;
};

/** Track metadata scraped for a SomaFM channel. */
export type NowPlaying = { title: string; artist: string; album: string; updatedAt: number };

/** A playable URL plus how it must be played. */
export type PlayTarget = {
  /** URL to hand to the media element (never a bare upstream HLS playlist). */
  url: string;
  /** `hls` needs the hls.js runtime; `media` plays natively. */
  kind: "media" | "hls";
  source: StationSource;
  cached: boolean;
};