/**
 * The radio state container (docs/CONTRACTS.md §3).
 *
 * One hook owns every piece of client state: the catalog (with race
 * cancellation), the playback sequence (with a five-station failover budget),
 * taste memory, the in-device page navigation, the media session and the
 * keyboard shortcuts. Skins and pages are pure views over this controller.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { message, useI18n, type Locale, type MessageKey } from "../core/i18n";
import {
  MAX_AUTOPLAY_ATTEMPTS,
  PREFETCH_STATION_COUNT,
  STALL_RECOVERY_MS,
  STREAM_URL_CACHE_MS,
} from "../core/playbackPolicy";
import {
  EMPTY_PROFILE,
  applyFeedback,
  normalizeProfile,
  rankStations,
  recordStationOutcome,
  rememberStation,
} from "../core/recommendation";
import { RADIO_REGIONS } from "../core/regions";
import { MOODS, RADIO_THEMES, getTheme, type RadioTheme } from "../core/themes";
import type {
  CatalogRequest,
  MoodId,
  NowPlaying,
  PlayTarget,
  Station,
  StationSource,
  TasteProfile,
  ThemeId,
} from "../core/types";
import type { RadioHost, RadioMountOptions } from "./api";
import { rowsForPage } from "./pages";
import { isListPage, type PageRow, type RadioPage } from "./pages/types";
import { RadioPlayer, isBlockedError, isCancelledError, isHlsUnavailableError, type PlayerEvent } from "./player";

const DEFAULT_THEME: ThemeId = "rams";
const NOTICE_MS = 3_200;
const TRACK_POLL_MS = 25_000;

export type RadioMoodOption = { id: MoodId; label: string; note: string; accent: string };

export type RadioLifecycleState = "playing" | "loading" | "paused" | "error";

export type RadioController = {
  // ---- contract state (docs/CONTRACTS.md §3) ----
  themeId: ThemeId;
  theme: RadioTheme;
  mood: MoodId;
  source: StationSource;
  stations: Station[];
  queue: Station[];
  current: Station | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: string;
  notice: string;
  volume: number;
  liked: boolean;
  profile: TasteProfile;
  locale: Locale;
  // ---- contract actions ----
  toggle(): void;
  next(): void;
  previous(): void;
  play(station: Station): void;
  like(): void;
  dislike(): void;
  /** `autoplay: false` browses the channel's list instead of starting it. */
  chooseMood(mood: MoodId, autoplay?: boolean): void;
  chooseTheme(themeId: ThemeId): void;
  chooseSource(source: StationSource, autoplay?: boolean): void;
  chooseRegion(code: string | null, autoplay?: boolean): void;
  search(query: string): void;
  setVolume(value: number): void;
  retry(): void;
  close(): void;

  // ---- extras the skins and pages share ----
  /** Playback is audibly buffering or reconnecting. */
  buffering: boolean;
  /** A failover attempt is in flight; `toggle()` cancels it. */
  starting: boolean;
  muted: boolean;
  /** `data-state` for `.radio-root`. */
  state: RadioLifecycleState;
  /** SomaFM track metadata, when the host could scrape it. */
  track: NowPlaying | null;
  /** Last submitted search term. */
  query: string;
  /** Live text of the search field. */
  searchDraft: string;
  setSearchDraft(value: string): void;
  moods: RadioMoodOption[];
  t(key: MessageKey): string;
  setLocale(locale: Locale): void;
  toggleMute(): void;
  /** In-device screen navigation. */
  page: RadioPage;
  rows: PageRow[];
  selection: number;
  openPage(page: RadioPage): void;
  selectRow(index: number): void;
  moveSelection(delta: number): void;
  /** Reference `select()`: open a row, toggle playback, or return to now. */
  activateSelection(): void;
  back(): void;
  /** Resolve a plugin-host asset path (QR images, hls.js) for this surface. */
  asset(relativePath: string): string;
  /** Physical skins: the exploded assembly view. */
  exploded: boolean;
  toggleExplode(): void;
  /** Physical skins: return knobs, camera and speakers to the home view. */
  resetView(): void;
  /** Bumped by `resetView()` so a skin can react without extra subscriptions. */
  viewEpoch: number;
  /** The media element the engine drives (also handy in tests). */
  audio: HTMLAudioElement | null;
};

/** Only ids that exist in the catalog count; `getTheme` silently falls back. */
function knownTheme(value: string | null | undefined): ThemeId | null {
  if (!value) return null;
  if (value === "editorial") return "rams";
  return RADIO_THEMES.some((theme) => theme.id === value) ? (value as ThemeId) : null;
}

/** `?theme=` is the shareable override (reference `loadTheme`). */
function themeFromLocation(): ThemeId | null {
  if (typeof window === "undefined" || !window.location) return null;
  try {
    return knownTheme(new URLSearchParams(window.location.search).get("theme"));
  } catch {
    return null;
  }
}

/**
 * Priority: `?theme=` → saved skin → mount preference → Braun.
 * The saved skin must beat `options.initialTheme`, otherwise a host that always
 * passes a default would reset the environment the user picked.
 */
function resolveThemeId(host: RadioHost, fallback?: string): ThemeId {
  return (
    themeFromLocation() ??
    knownTheme(host.storage.loadTheme()) ??
    knownTheme(fallback) ??
    DEFAULT_THEME
  );
}

/** `https://somafm.com/groovesalad.m3u` → `groovesalad`; everything else → null. */
function somaChannel(station: Station | null): string | null {
  if (!station) return null;
  try {
    const url = new URL(station.streamUrl);
    if (url.hostname !== "somafm.com" && !url.hostname.endsWith(".somafm.com")) return null;
    return url.pathname.match(/^\/([a-z0-9]+)(?:[-/]|$)/)?.[1] || null;
  } catch {
    return null;
  }
}

export function useRadio(options: RadioMountOptions): RadioController {
  const host = options.host;
  const onClose = options.onClose;
  const { locale, setLocale, t } = useI18n();

  // ---------------------------------------------------------------- state ---
  const [themeId, setThemeId] = useState<ThemeId>(() => resolveThemeId(host, options.initialTheme));
  const theme = getTheme(themeId);
  const [profile, setProfile] = useState<TasteProfile>(() =>
    normalizeProfile(host.storage.loadProfile()),
  );
  const [mood, setMood] = useState<MoodId>(theme.mood);
  const [source, setSource] = useState<StationSource>(() => {
    if (profile.preferredCountryCode) return "regional";
    // Reference `loadInitialSource`: an explicitly chosen skin seeds its source,
    // a first visit starts from the viewer's region instead.
    const explicit = themeFromLocation() ?? knownTheme(host.storage.loadTheme()) ?? knownTheme(options.initialTheme);
    return explicit ? theme.source : "regional";
  });
  const [stations, setStations] = useState<Station[]>([]);
  const [current, setCurrent] = useState<Station | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [volume, setVolumeState] = useState(0.72);
  const [muted, setMuted] = useState(false);
  const [failedIds, setFailedIds] = useState<string[]>([]);
  const [page, setPage] = useState<RadioPage>("now");
  const [selection, setSelection] = useState(0);
  const [query, setQuery] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [trackEntry, setTrackEntry] = useState<{ id: string; track: NowPlaying } | null>(null);
  const [exploded, setExploded] = useState(false);
  const [viewEpoch, setViewEpoch] = useState(0);

  // ----------------------------------------------------------------- refs ---
  const [audio] = useState<HTMLAudioElement | null>(() =>
    typeof document === "undefined" ? null : document.createElement("audio"),
  );
  const hlsRuntimeUrl = useMemo(() => {
    const carrier = host as RadioHost & { assetUrl?: (relativePath: string) => string | null };
    if (typeof carrier.assetUrl === "function") {
      const direct = carrier.assetUrl("hls.js");
      if (direct) return direct;
    }
    const base = (host.baseUrl || "").replace(/\/+$/, "");
    return base ? `${base}/hls.js` : null;
  }, [host]);

  const playerRef = useRef<RadioPlayer | null>(null);
  const playbackRunRef = useRef(0);
  const catalogRunRef = useRef(0);
  const startingRef = useRef(false);
  const failoverRef = useRef<{ candidates: Station[]; index: number } | null>(null);
  const resolvedRef = useRef(new Map<string, { at: number; target: PlayTarget }>());
  const rememberedVolumeRef = useRef(0.72);
  const recoverRef = useRef<() => void>(() => {});
  const emitRef = useRef<(event: PlayerEvent) => void>(() => {});
  const rowsRef = useRef<PageRow[]>([]);

  const profileRef = useRef(profile);
  profileRef.current = profile;
  const currentRef = useRef<Station | null>(null);
  currentRef.current = current;
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;
  const stationsRef = useRef<Station[]>([]);
  stationsRef.current = stations;
  const moodRef = useRef(mood);
  moodRef.current = mood;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const pageRef = useRef(page);
  pageRef.current = page;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  const clock = useCallback(() => host.now?.() ?? Date.now(), [host]);

  const queue = useMemo(
    () =>
      rankStations(stations, profile).filter(
        (station) => station.id !== current?.id && !failedIds.includes(station.id),
      ),
    [stations, profile, current?.id, failedIds],
  );
  const queueRef = useRef<Station[]>([]);
  queueRef.current = queue;

  if (audio && !playerRef.current) {
    playerRef.current = new RadioPlayer({
      audio,
      hlsRuntimeUrl,
      emit: (event) => emitRef.current(event),
    });
    playerRef.current.setVolume(volume);
  }

  const stopStream = useCallback(() => {
    playerRef.current?.stop();
  }, []);

  const refreshTrack = useCallback(async () => {
    const station = currentRef.current;
    if (!station || !somaChannel(station)) {
      setTrackEntry(null);
      return;
    }
    try {
      const next = await host.api.nowPlaying(station);
      setTrackEntry(next ? { id: station.id, track: next } : null);
    } catch {
      setTrackEntry(null);
    }
  }, [host]);

  const resolveTarget = useCallback(
    async (station: Station): Promise<PlayTarget> => {
      const cached = resolvedRef.current.get(station.id);
      const at = clock();
      if (cached && at - cached.at < STREAM_URL_CACHE_MS) return cached.target;
      const target = await host.api.resolvePlay(station);
      resolvedRef.current.set(station.id, { at, target });
      return target;
    },
    [clock, host],
  );

  const fail = useCallback(
    (stationId: string) => {
      const at = new Date(clock());
      setProfile((previous) => recordStationOutcome(previous, stationId, "failure", at));
      setFailedIds((previous) => Array.from(new Set([...previous, stationId])));
    },
    [clock],
  );

  /** Walk the candidate list until one station actually goes live. */
  const startSequence = useCallback(
    async (candidates: Station[], startIndex = 0) => {
      const runId = ++playbackRunRef.current;
      stopStream();
      const player = playerRef.current;
      const limit = Math.min(candidates.length, startIndex + MAX_AUTOPLAY_ATTEMPTS);
      if (!player) {
        setError("播放器尚未就绪。");
        return;
      }
      if (!candidates.length || startIndex >= candidates.length) {
        setError("这个系列暂时没有可播放的电台，换一种风格试试。");
        return;
      }
      failoverRef.current = { candidates, index: startIndex };
      setError("");
      setBuffering(true);
      setIsPlaying(false);
      startingRef.current = true;

      for (let index = startIndex; index < limit; index += 1) {
        if (playbackRunRef.current !== runId) return;
        const station = candidates[index];
        failoverRef.current = { candidates, index };
        setCurrent(station);
        if (index > startIndex) {
          setNotice(`${candidates[index - 1].name} 无法播放，正在自动尝试下一家。`);
        }
        try {
          const target = await resolveTarget(station);
          if (playbackRunRef.current !== runId) return;
          await player.start(target);
          if (playbackRunRef.current !== runId) return;
          setIsPlaying(true);
          setBuffering(false);
          setError("");
          const at = new Date(clock());
          setProfile((previous) =>
            rememberStation(
              recordStationOutcome(previous, station.id, "success", at),
              station,
              at.toISOString(),
            ),
          );
          startingRef.current = false;
          return;
        } catch (reason) {
          if (playbackRunRef.current !== runId || isCancelledError(reason)) return;
          if (isBlockedError(reason)) {
            setBuffering(false);
            setError("风格已经切换。浏览器需要你再点一次播放才能发声。");
            startingRef.current = false;
            return;
          }
          if (isHlsUnavailableError(reason)) {
            // Readable, actionable copy instead of a generic decode failure.
            setNotice(`${station.name} 需要 HLS 支持，hls.js 没有加载成功，正在自动尝试下一家。`);
          }
          fail(station.id);
        }
      }
      if (playbackRunRef.current === runId) {
        stopStream();
        setBuffering(false);
        setIsPlaying(false);
        setError(`这个系列暂时没有可播放的电台，已自动尝试 ${limit - startIndex} 家。`);
        startingRef.current = false;
      }
    },
    [clock, fail, resolveTarget, stopStream],
  );

  const fetchStations = useCallback(
    async (
      nextMood: MoodId,
      nextQuery = "",
      nextSource: StationSource = "radio-browser",
      autoplay = false,
      countryCode: string | null = nextSource === "regional"
        ? profileRef.current.preferredCountryCode
        : null,
    ) => {
      const run = ++catalogRunRef.current;
      setCatalogLoading(true);
      setError("");
      setStations([]);
      setFailedIds([]);
      try {
        const request: CatalogRequest = { mood: nextMood, source: nextSource };
        if (nextQuery) request.query = nextQuery;
        if (countryCode) request.countryCode = countryCode;
        const result = await host.api.catalogSafe(request);
        if (run !== catalogRunRef.current) return;
        if (result.warning) setNotice(result.warning);
        setStations(result.stations);
        setFailedIds([]);
        if (!result.stations.length) {
          setError("没有找到合适的直播电台，试试更宽泛的关键词。");
        } else if (autoplay) {
          await startSequence(rankStations(result.stations, profileRef.current));
        }
      } catch (reason) {
        if (run !== catalogRunRef.current) return;
        setError(reason instanceof Error ? reason.message : "电台目录暂时不可用。");
      } finally {
        if (run === catalogRunRef.current) setCatalogLoading(false);
      }
    },
    [host, startSequence],
  );

  // -------------------------------------------------------------- actions ---
  const next = useCallback(() => {
    const list = queueRef.current;
    const rest = stationsRef.current.filter(
      (station) =>
        station.id !== currentRef.current?.id && !list.some((queued) => queued.id === station.id),
    );
    const candidates = [...list, ...rest];
    if (candidates.length) void startSequence(candidates);
    else setError("这一频道暂时没有更多可播电台，换个心情试试。");
  }, [startSequence]);

  const previous = useCallback(() => {
    const entry = profileRef.current.history.find(
      (item) => item.station.id !== currentRef.current?.id,
    );
    if (entry) void startSequence([entry.station, ...queueRef.current]);
  }, [startSequence]);

  const play = useCallback(
    (station: Station) => {
      void startSequence([
        station,
        ...queueRef.current.filter((queued) => queued.id !== station.id),
      ]);
    },
    [startSequence],
  );

  const toggle = useCallback(() => {
    if (startingRef.current) {
      playbackRunRef.current += 1;
      stopStream();
      startingRef.current = false;
      setBuffering(false);
      setIsPlaying(false);
      return;
    }
    const player = playerRef.current;
    if (!player) return;
    if (!currentRef.current) {
      next();
      return;
    }
    if (isPlayingRef.current) {
      player.pause();
      return;
    }
    if (player.hasSource) {
      void player.resume().catch(() => setError("浏览器暂时阻止了播放，请再点一次播放。"));
      return;
    }
    void startSequence([currentRef.current, ...queueRef.current]);
  }, [next, startSequence, stopStream]);

  const like = useCallback(() => {
    const station = currentRef.current;
    if (!station) return;
    setProfile((previous) => applyFeedback(previous, station, "like"));
  }, []);

  const dislike = useCallback(() => {
    const station = currentRef.current;
    if (!station) return;
    setProfile((previous) => applyFeedback(previous, station, "dislike"));
    setTimeout(() => next(), 120);
  }, [next]);

  const chooseMood = useCallback(
    (nextMood: MoodId, autoplay = true) => {
      playbackRunRef.current += 1;
      stopStream();
      setMood(nextMood);
      setSource("radio-browser");
      setQuery("");
      setCurrent(null);
      setIsPlaying(false);
      if (autoplay) setPage("now");
      void fetchStations(nextMood, "", "radio-browser", autoplay);
    },
    [fetchStations, stopStream],
  );

  const chooseSource = useCallback(
    (nextSource: StationSource, autoplay = true) => {
      playbackRunRef.current += 1;
      stopStream();
      setSource(nextSource);
      setQuery("");
      setCurrent(null);
      setIsPlaying(false);
      if (autoplay) setPage("now");
      void fetchStations(moodRef.current, "", nextSource, autoplay);
    },
    [fetchStations, stopStream],
  );

  const chooseRegion = useCallback(
    (countryCode: string | null, autoplay = true) => {
      playbackRunRef.current += 1;
      stopStream();
      setProfile((previous) => ({ ...previous, preferredCountryCode: countryCode }));
      setSource("regional");
      setQuery("");
      setCurrent(null);
      setIsPlaying(false);
      if (autoplay) setPage("now");
      void fetchStations(moodRef.current, "", "regional", autoplay, countryCode);
    },
    [fetchStations, stopStream],
  );

  const search = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      setQuery(trimmed);
      void fetchStations(moodRef.current, trimmed, sourceRef.current, true);
    },
    [fetchStations],
  );

  const chooseTheme = useCallback(
    (nextThemeId: ThemeId) => {
      setThemeId(getTheme(nextThemeId).id);
    },
    [],
  );

  const retry = useCallback(() => {
    void fetchStations(moodRef.current, query, sourceRef.current, true);
  }, [fetchStations, query]);

  const setVolume = useCallback((value: number) => {
    const nextValue = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    if (nextValue > 0) rememberedVolumeRef.current = nextValue;
    setVolumeState(nextValue);
    setMuted(nextValue === 0);
    playerRef.current?.setVolume(nextValue);
  }, []);

  const toggleMute = useCallback(() => {
    if (volumeRef.current > 0) setVolume(0);
    else setVolume(rememberedVolumeRef.current || 0.6);
  }, [setVolume]);

  const close = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const asset = useCallback(
    (relativePath: string) => {
      const clean = relativePath.replace(/^\/+/, "");
      const carrier = host as RadioHost & { assetUrl?: (path: string) => string | null };
      if (typeof carrier.assetUrl === "function") {
        const direct = carrier.assetUrl(clean);
        if (direct) return direct;
      }
      const base = (host.baseUrl || "").replace(/\/+$/, "");
      return base ? `${base}/${clean}` : `/${clean}`;
    },
    [host],
  );

  const toggleExplode = useCallback(() => {
    setExploded((value) => !value);
  }, []);

  const resetView = useCallback(() => {
    setExploded(false);
    setViewEpoch((value) => value + 1);
  }, []);

  // ------------------------------------------------------- page navigation ---
  const preferredRegionIndex = useCallback(() => {
    const code = profileRef.current.preferredCountryCode;
    if (!code) return 0;
    return Math.max(0, RADIO_REGIONS.findIndex((item) => item === code) + 1);
  }, []);

  const openPage = useCallback(
    (nextPage: RadioPage) => {
      setPage(nextPage);
      setSelection(nextPage === "regions" ? preferredRegionIndex() : 0);
    },
    [preferredRegionIndex],
  );

  const back = useCallback(() => {
    const active = pageRef.current;
    openPage(active === "now" ? "menu" : active === "menu" ? "now" : "menu");
  }, [openPage]);

  const selectRow = useCallback((index: number) => {
    setSelection(index);
  }, []);

  const moveSelection = useCallback((delta: number) => {
    const size = rowsRef.current.length;
    if (!size) return;
    setSelection((value) => Math.max(0, Math.min(size - 1, value + delta)));
  }, []);

  const activateSelection = useCallback(() => {
    const active = pageRef.current;
    if (isListPage(active)) {
      rowsRef.current[selectionRef.current]?.action();
      return;
    }
    if (active === "now") {
      toggle();
      return;
    }
    openPage("now");
  }, [openPage, toggle]);

  const moods = useMemo<RadioMoodOption[]>(
    () =>
      MOODS.map((item) => ({
        ...item,
        label: message(locale, `mood.${item.id}` as MessageKey),
      })),
    [locale],
  );

  // ------------------------------------------------------------- effects ---
  useEffect(() => {
    host.storage.saveProfile(profile);
  }, [host, profile]);

  useEffect(() => {
    host.storage.saveTheme(themeId);
  }, [host, themeId]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    return () => {
      playbackRunRef.current += 1;
      playerRef.current?.destroy();
    };
  }, []);

  // The first catalog load is quiet: only a deliberate playback/channel action plays.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void fetchStations(theme.mood, "", source, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  useEffect(() => {
    const candidates = [current, ...queue]
      .filter((station): station is Station => Boolean(station))
      .slice(0, PREFETCH_STATION_COUNT);
    if (candidates.length) host.api.prefetch(candidates);
  }, [current, host, queue]);

  useEffect(() => {
    void refreshTrack();
    const timer = setInterval(() => void refreshTrack(), TRACK_POLL_MS);
    return () => clearInterval(timer);
  }, [current?.id, refreshTrack]);

  // Reconnect when an audible stream stalls for too long.
  const recover = useCallback(() => {
    if (startingRef.current) return;
    const station = currentRef.current;
    if (!station) return;
    fail(station.id);
    setIsPlaying(false);
    const failover = failoverRef.current;
    if (failover && failover.index + 1 < failover.candidates.length) {
      setNotice(`${station.name} 的直播中断了，正在自动切到下一家。`);
      void startSequence(failover.candidates, failover.index + 1);
      return;
    }
    stopStream();
    setBuffering(false);
    setError(`${station.name} 的直播流中断了，请重新寻找电台。`);
  }, [fail, startSequence, stopStream]);
  recoverRef.current = recover;

  useEffect(() => {
    if (!buffering || startingRef.current) return;
    const timer = setTimeout(() => recoverRef.current(), STALL_RECOVERY_MS);
    return () => clearTimeout(timer);
  }, [buffering]);

  emitRef.current = (event: PlayerEvent) => {
    if (event.type === "playing") {
      setIsPlaying(true);
      setBuffering(false);
      setError("");
      return;
    }
    if (event.type === "paused") {
      setIsPlaying(false);
      return;
    }
    if (event.type === "buffering") {
      if (!startingRef.current) setBuffering(event.buffering);
      return;
    }
    recoverRef.current();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, button, a, select, textarea, [contenteditable='true']")
      ) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        toggle();
        return;
      }
      if (event.key.toLowerCase() === "n") next();
      if (event.key === "ArrowLeft") previous();
      if (event.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [next, previous, toggle]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const session = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession;
    if (!session) return;
    try {
      session.playbackState = isPlaying ? "playing" : "paused";
      session.metadata =
        current && typeof MediaMetadata !== "undefined"
          ? new MediaMetadata({
              title: current.name,
              artist: current.country || "Qiaomu Radio",
              album: "Qiaomu Radio",
              artwork: current.favicon?.startsWith("https://")
                ? [{ src: current.favicon }]
                : undefined,
            })
          : null;
    } catch {
      /* metadata is best effort */
    }
    const actions: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
      ["play", () => toggle()],
      ["pause", () => toggle()],
      ["previoustrack", () => previous()],
      ["nexttrack", () => next()],
    ];
    for (const [action, handler] of actions) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        /* unsupported action in this browser */
      }
    }
    return () => {
      for (const [action] of actions) {
        try {
          session.setActionHandler(action, null);
        } catch {
          /* unsupported action in this browser */
        }
      }
    };
  }, [current, isPlaying, next, previous, toggle]);

  // -------------------------------------------------------------- return ---
  const isLoading = catalogLoading || buffering;
  const state: RadioLifecycleState = error
    ? "error"
    : isLoading
      ? "loading"
      : isPlaying
        ? "playing"
        : "paused";
  const liked = Boolean(current && profile.likedStationIds.includes(current.id));
  const track = trackEntry && current && trackEntry.id === current.id ? trackEntry.track : null;

  const base: Omit<RadioController, "rows"> = {
    themeId,
    theme,
    mood,
    source,
    stations,
    queue,
    current,
    isPlaying,
    isLoading,
    error,
    notice,
    volume,
    liked,
    profile,
    locale,
    toggle,
    next,
    previous,
    play,
    like,
    dislike,
    chooseMood,
    chooseTheme,
    chooseSource,
    chooseRegion,
    search,
    setVolume,
    retry,
    close,
    buffering,
    starting: startingRef.current,
    muted,
    state,
    track,
    query,
    searchDraft,
    setSearchDraft,
    moods,
    t,
    setLocale,
    toggleMute,
    page,
    selection,
    openPage,
    selectRow,
    moveSelection,
    activateSelection,
    back,
    asset,
    exploded,
    toggleExplode,
    resetView,
    viewEpoch,
    audio,
  };

  const rows = rowsForPage({ ...base, rows: [] });
  rowsRef.current = rows;

  return { ...base, rows };
}

/** Re-exported so the preview harness can seed an empty profile. */
export { EMPTY_PROFILE };
export type { ThemeId };