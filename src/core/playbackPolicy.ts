/**
 * Playback policy constants. Live radio trades a little latency for
 * continuity; hls.js keeps a rolling in-memory buffer and drops old audio.
 */
export const HLS_RADIO_CONFIG = {
  enableWorker: true,
  lowLatencyMode: false,
  startFragPrefetch: true,
  liveSyncDuration: 8,
  liveMaxLatencyDuration: 30,
  maxLiveSyncPlaybackRate: 1,
  maxBufferLength: 45,
  maxMaxBufferLength: 90,
  backBufferLength: 15,
  maxBufferHole: 0.8,
  highBufferWatchdogPeriod: 3,
  nudgeMaxRetry: 5,
  manifestLoadingMaxRetry: 4,
  levelLoadingMaxRetry: 6,
  fragLoadingMaxRetry: 8,
};

/** How many upcoming stations get their stream URL warmed. */
export const PREFETCH_STATION_COUNT = 3;

/** How long a resolved stream URL stays valid. */
export const STREAM_URL_CACHE_MS = 10 * 60 * 1000;

/** Automatic failover budget before giving up on a scene channel. */
export const MAX_AUTOPLAY_ATTEMPTS = 5;

/** A stream that never starts within this window is treated as dead. */
export const PLAYBACK_TIMEOUT_MS = 15_000;

/** An audible buffering stall beyond this window triggers recovery. */
export const STALL_RECOVERY_MS = 15_000;

/** Is this URL an HLS playlist? */
export function isHlsUrl(url: string): boolean {
  return /\.m3u8(?:$|\?)/i.test(url);
}

/** Does the current runtime need hls.js for this source? */
export function needsHlsRuntime(url: string, canPlayHlsNatively: boolean): boolean {
  return isHlsUrl(url) && !canPlayHlsNatively;
}