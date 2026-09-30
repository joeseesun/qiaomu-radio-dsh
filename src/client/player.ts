/**
 * Playback engine for the live radio streams.
 *
 * Two transports behind one promise:
 *  - plain progressive / native HLS audio through the element itself;
 *  - `hls.js` for `.m3u8` sources the browser cannot play natively. The runtime
 *    is never bundled: it is loaded lazily from the host's own asset route on
 *    first use, and *any* failure to obtain it degrades to the native element.
 *
 * Nothing here touches `host`, React or storage: the engine only owns an
 * `<audio>` element and reports through `emit`.
 */

import { HLS_RADIO_CONFIG, PLAYBACK_TIMEOUT_MS } from "../core/playbackPolicy";
import type { PlayTarget } from "../core/types";

export type PlayerEvent =
  | { type: "playing" }
  | { type: "paused" }
  | { type: "buffering"; buffering: boolean }
  /** A fatal mid-stream failure once the stream had already gone live. */
  | { type: "error"; message: string };

export type PlaybackErrorCode = "cancelled" | "blocked" | "timeout" | "unavailable";

export class PlaybackError extends Error {
  readonly code: PlaybackErrorCode;
  /** Set when the station needed hls.js and the runtime could not be loaded. */
  readonly hlsUnavailable: boolean;

  constructor(code: PlaybackErrorCode, message: string, hlsUnavailable = false) {
    super(message);
    this.code = code;
    this.hlsUnavailable = hlsUnavailable;
    this.name = code === "cancelled" ? "AbortError" : "PlaybackError";
  }
}

/** A stream needed hls.js and the runtime never arrived. */
export function isHlsUnavailableError(reason: unknown): boolean {
  return reason instanceof PlaybackError && reason.hlsUnavailable;
}

/** Did the browser refuse to autoplay without a fresh user gesture? */
export function isBlockedError(reason: unknown): boolean {
  if (reason instanceof PlaybackError) return reason.code === "blocked";
  return (
    typeof DOMException !== "undefined" &&
    reason instanceof DOMException &&
    reason.name === "NotAllowedError"
  );
}

/** Did the engine itself cancel this attempt (skin switch, unmount)? */
export function isCancelledError(reason: unknown): boolean {
  if (reason instanceof PlaybackError) return reason.code === "cancelled";
  return (
    typeof DOMException !== "undefined" &&
    reason instanceof DOMException &&
    reason.name === "AbortError"
  );
}

type HlsErrorData = { fatal?: boolean; type?: string };

type HlsInstance = {
  loadSource(url: string): void;
  attachMedia(media: HTMLMediaElement): void;
  on(event: string, handler: (event: unknown, data: HlsErrorData) => void): void;
  startLoad(): void;
  recoverMediaError(): void;
  destroy(): void;
};

type HlsConstructor = (new (config: Record<string, unknown>) => HlsInstance) & {
  isSupported?: () => boolean;
  Events?: Record<string, string>;
  ErrorTypes?: Record<string, string>;
};

/** The slice of the hls.js API the engine actually calls. */
export type HlsRuntime = {
  Runtime: new (config: Record<string, unknown>) => HlsInstance;
  Events: { ERROR: string; MANIFEST_PARSED: string };
  ErrorTypes: { NETWORK_ERROR: string; MEDIA_ERROR: string };
  isSupported(): boolean;
};

function normalizeRuntime(candidate: unknown): HlsRuntime | null {
  if (typeof candidate !== "function") return null;
  const ctor = candidate as HlsConstructor;
  const events = ctor.Events;
  const errorTypes = ctor.ErrorTypes;
  const supported = ctor.isSupported;
  if (!events || !errorTypes || typeof supported !== "function") return null;
  if (!events.ERROR || !events.MANIFEST_PARSED) return null;
  return {
    Runtime: ctor,
    Events: { ERROR: events.ERROR, MANIFEST_PARSED: events.MANIFEST_PARSED },
    ErrorTypes: {
      NETWORK_ERROR: errorTypes.NETWORK_ERROR || "networkError",
      MEDIA_ERROR: errorTypes.MEDIA_ERROR || "mediaError",
    },
    isSupported: () => supported.call(ctor),
  };
}

/**
 * Resolve the hls.js runtime, or `null` when it cannot be reached.
 *
 * A host page that already loaded hls.js wins. Otherwise the runtime is fetched
 * with a real `<script>` tag: the shipped `hls.light.min.js` is a UMD/IIFE
 * bundle, so `import(url)` would resolve without ever defining a constructor.
 * The global is read back after `load`, which is what actually proves the
 * runtime arrived.
 */
export async function loadHlsRuntime(url: string | null): Promise<HlsRuntime | null> {
  const fromGlobal = normalizeRuntime((globalThis as { Hls?: unknown }).Hls);
  if (fromGlobal) return fromGlobal;
  if (!url) return null;
  if (typeof document === "undefined") return null;
  try {
    await new Promise<void>((resolve, reject) => {
      const element = document.createElement("script");
      element.src = url;
      element.async = true;
      element.dataset.hlsRuntime = "1";
      element.onload = () => resolve();
      element.onerror = () => reject(new Error("hls.js failed to load"));
      document.head.appendChild(element);
    });
  } catch {
    return null;
  }
  return normalizeRuntime((globalThis as { Hls?: unknown }).Hls);
}

export type RadioPlayerOptions = {
  audio: HTMLAudioElement;
  /** Absolute URL of the host's `hls.js` asset, or `null` when unknown. */
  hlsRuntimeUrl: string | null;
  emit(event: PlayerEvent): void;
};

/** Owns one `<audio>` element and the optional hls.js attachment. */
export class RadioPlayer {
  private readonly audio: HTMLAudioElement;
  private readonly hlsRuntimeUrl: string | null;
  private readonly emit: (event: PlayerEvent) => void;
  private hls: HlsInstance | null = null;
  private cancelPending: (() => void) | null = null;
  private volume = 1;
  private starting = false;
  private source = "";

  constructor(options: RadioPlayerOptions) {
    this.audio = options.audio;
    this.hlsRuntimeUrl = options.hlsRuntimeUrl;
    this.emit = options.emit;
    this.audio.preload = "auto";
  }

  /** True while `start()` has not settled yet. */
  get isStarting(): boolean {
    return this.starting;
  }

  /** True when the element still holds a playable source (used by toggle). */
  get hasSource(): boolean {
    return Boolean(this.audio.currentSrc || this.audio.getAttribute("src"));
  }

  setVolume(value: number): void {
    const next = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    this.volume = next;
    this.audio.volume = next;
  }

  /** Resolve and go live, or reject with a classified `PlaybackError`. */
  async start(target: PlayTarget): Promise<void> {
    const audio = this.audio;
    this.stop();
    audio.volume = this.volume;
    this.starting = true;

    /*
     * Chrome answers `canPlayType("application/vnd.apple.mpegurl")` with
     * "maybe" while being unable to decode HLS at all, so only an affirmative
     * "probably" (Safari) is trusted as native support. Everywhere else hls.js
     * is tried first, and an empty answer means there is no native fallback.
     */
    const nativeClaim =
      typeof audio.canPlayType === "function"
        ? audio.canPlayType("application/vnd.apple.mpegurl")
        : "";
    const nativeHls = nativeClaim === "probably";
    const runtime =
      target.kind === "hls" && !nativeHls
        ? await loadHlsRuntime(this.hlsRuntimeUrl)
        : null;
    const useHls = Boolean(runtime && runtime.isSupported());

    // HLS is required, nothing can decode it and hls.js never arrived: say so
    // instead of failing later with an opaque decode error.
    if (target.kind === "hls" && !useHls && !nativeHls && nativeClaim === "") {
      this.starting = false;
      throw new PlaybackError(
        "unavailable",
        this.hlsRuntimeUrl
          ? "这个电台需要 HLS 支持，hls.js 加载失败。"
          : "这个电台需要 HLS 支持，但宿主没有提供 hls.js。",
        true,
      );
    }

    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const onPlaying = () => finish();
        const onPlayable = () => {
          if (!audio.paused && audio.readyState >= 2) finish();
        };
        const onAudioError = () =>
          finish(new PlaybackError("unavailable", "直播流无法解码或已经离线。"));
        const detach = () => {
          audio.removeEventListener("playing", onPlaying);
          audio.removeEventListener("canplay", onPlayable);
          audio.removeEventListener("timeupdate", onPlayable);
          audio.removeEventListener("error", onAudioError);
        };
        const finish = (reason?: Error) => {
          if (settled) return;
          settled = true;
          this.cancelPending = null;
          if (timer !== null) clearTimeout(timer);
          detach();
          if (reason) reject(reason);
          else resolve();
        };
        const play = () => {
          void audio.play().then(
            () => finish(),
            (reason: unknown) => {
              if (typeof reason === "object" && reason !== null && (reason as Error).name === "NotAllowedError") {
                finish(new PlaybackError("blocked", "浏览器需要你再点一次播放才能发声。"));
                return;
              }
              finish(reason instanceof Error ? reason : new PlaybackError("unavailable", "浏览器阻止了自动播放。"));
            },
          );
        };

        this.cancelPending = () => finish(new PlaybackError("cancelled", "Playback cancelled"));
        this.emit({ type: "buffering", buffering: true });
        timer = setTimeout(
          () => finish(new PlaybackError("timeout", "连接直播超过 15 秒。")),
          PLAYBACK_TIMEOUT_MS,
        );
        audio.addEventListener("playing", onPlaying, { once: true });
        audio.addEventListener("canplay", onPlayable);
        audio.addEventListener("timeupdate", onPlayable);
        audio.addEventListener("error", onAudioError, { once: true });

        if (runtime && useHls) {
          let recoveryAttempts = 0;
          const hls = new runtime.Runtime(HLS_RADIO_CONFIG as unknown as Record<string, unknown>);
          this.hls = hls;
          hls.on(runtime.Events.ERROR, (_event, data) => {
            if (!data || !data.fatal) return;
            if (!settled) {
              finish(new PlaybackError("unavailable", "HLS 直播源连接失败。"));
              return;
            }
            if (recoveryAttempts < 2 && data.type === runtime.ErrorTypes.NETWORK_ERROR) {
              recoveryAttempts += 1;
              hls.startLoad();
              return;
            }
            if (recoveryAttempts < 2 && data.type === runtime.ErrorTypes.MEDIA_ERROR) {
              recoveryAttempts += 1;
              hls.recoverMediaError();
              return;
            }
            this.emit({ type: "error", message: "HLS 直播流中断了。" });
          });
          hls.on(runtime.Events.MANIFEST_PARSED, play);
          hls.loadSource(target.url);
          hls.attachMedia(audio);
        } else {
          audio.src = target.url;
          play();
        }
      });
      this.source = target.url;
      this.emit({ type: "playing" });
    } finally {
      this.starting = false;
      this.emit({ type: "buffering", buffering: false });
    }
  }

  pause(): void {
    try {
      this.audio.pause();
    } catch {
      /* element already detached */
    }
    this.emit({ type: "paused" });
  }

  /** Resume the current element without re-resolving the station. */
  async resume(): Promise<void> {
    if (!this.hasSource) throw new PlaybackError("unavailable", "没有可继续播放的直播流。");
    try {
      await this.audio.play();
      this.emit({ type: "playing" });
    } catch (reason) {
      if (isBlockedError(reason)) throw new PlaybackError("blocked", "浏览器需要你再点一次播放才能发声。");
      throw reason instanceof Error ? reason : new PlaybackError("unavailable", "无法继续播放。");
    }
  }

  /** Tear the current source down. Any in-flight `start()` rejects as cancelled. */
  stop(): void {
    const cancel = this.cancelPending;
    this.cancelPending = null;
    this.hls?.destroy();
    this.hls = null;
    try {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
    } catch {
      /* element already detached */
    }
    this.source = "";
    cancel?.();
  }

  /** Current stream URL, empty when stopped. */
  get currentUrl(): string {
    return this.source;
  }

  destroy(): void {
    this.stop();
  }
}