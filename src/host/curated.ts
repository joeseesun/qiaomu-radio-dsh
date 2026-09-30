/**
 * Curated station lists and small catalog-policy helpers.
 *
 * Ported from the reference web player (`qiaomu-radio/serverPolicy.mjs` for the
 * global list, `qiaomu-radio/server.mjs` for the China list and the Radio
 * Browser mirror/mood policy). Kept free of Node APIs so the host half can be
 * unit-tested with injected fetch implementations.
 */

import type { Station } from "../core/types";

/** Radio Browser mirrors, tried in order. */
export const RADIO_BROWSER_MIRRORS = [
  "https://de1.api.radio-browser.info",
  "https://nl1.api.radio-browser.info",
  "https://at1.api.radio-browser.info",
];

/** User agent advertised to Radio Browser and upstream streams. */
export const RADIO_USER_AGENT = "QiaomuRadio/0.1 (+https://www.radio-browser.info/)";

/** Broadcaster-owned, HTTPS-only Chinese streams (checked at release time). */
export const CHINA_STATIONS: Station[] = [
  {
    id: "cn-cnr-voice-of-china",
    name: "央广中国之声",
    streamUrl: "https://ngcdn001.cnr.cn/live/zgzs/index.m3u8",
    homepage: "https://www.cnr.cn/",
    favicon: "",
    tags: ["新闻", "综合", "央广"],
    country: "中国",
    countryCode: "CN",
    language: "普通话",
    codec: "HLS",
    bitrate: 0,
    votes: 100,
    clickCount: 100,
    source: "china-curated",
  },
  {
    id: "cn-cnr-economy",
    name: "央广经济之声",
    streamUrl: "https://ngcdn002.cnr.cn/live/jjzs/index.m3u8",
    homepage: "https://www.cnr.cn/",
    favicon: "",
    tags: ["财经", "新闻", "央广"],
    country: "中国",
    countryCode: "CN",
    language: "普通话",
    codec: "HLS",
    bitrate: 0,
    votes: 90,
    clickCount: 90,
    source: "china-curated",
  },
  {
    id: "cn-brtv-music",
    name: "北京音乐广播 FM97.4",
    streamUrl: "https://brtv-radiolive.rbc.cn/alive/fm974.m3u8",
    homepage: "https://www.brtv.org.cn/",
    favicon: "",
    tags: ["音乐", "流行", "北京"],
    country: "中国",
    countryCode: "CN",
    language: "普通话",
    codec: "HLS",
    bitrate: 0,
    votes: 86,
    clickCount: 86,
    source: "china-curated",
  },
  {
    id: "cn-brtv-traffic",
    name: "北京交通广播 FM103.9",
    streamUrl: "https://brtv-radiolive.rbc.cn/alive/fm1039.m3u8",
    homepage: "https://www.brtv.org.cn/",
    favicon: "",
    tags: ["交通", "城市", "北京"],
    country: "中国",
    countryCode: "CN",
    language: "普通话",
    codec: "HLS",
    bitrate: 0,
    votes: 82,
    clickCount: 82,
    source: "china-curated",
  },
  {
    id: "cn-cri-south-sea",
    name: "CRI 南海之声",
    streamUrl: "https://sk.cri.cn/nhzs.m3u8",
    homepage: "https://news.cri.cn/",
    favicon: "",
    tags: ["国际", "资讯", "华语"],
    country: "中国",
    countryCode: "CN",
    language: "普通话",
    codec: "HLS",
    bitrate: 0,
    votes: 78,
    clickCount: 78,
    source: "china-curated",
  },
  {
    id: "cn-hebei-youth-music",
    name: "河北青年音乐广播",
    streamUrl: "https://radio.pull.hebtv.com/live/hebqcyy.m3u8",
    homepage: "https://www.hebtv.com/",
    favicon: "",
    tags: ["音乐", "青年", "河北"],
    country: "中国",
    countryCode: "CN",
    language: "普通话",
    codec: "HLS",
    bitrate: 0,
    votes: 74,
    clickCount: 74,
    source: "china-curated",
  },
  {
    id: "cn-rthk-radio-3",
    name: "香港电台第三台",
    streamUrl: "https://rthkradio3-live.akamaized.net/hls/live/2040079/radio3/master.m3u8",
    homepage: "https://www.rthk.hk/",
    favicon: "",
    tags: ["香港", "英语", "综合"],
    country: "中国香港",
    countryCode: "HK",
    language: "英语",
    codec: "HLS",
    bitrate: 0,
    votes: 70,
    clickCount: 70,
    source: "china-curated",
  },
];

type CuratedStation = Omit<Station, "source"> & { source: "global-curated" };

const curated = (
  id: string,
  name: string,
  streamUrl: string,
  country: string,
  countryCode: string,
  language: string,
  tags: string[],
  codec = "MP3",
  bitrate = 128,
): CuratedStation => ({
  id,
  name,
  streamUrl,
  homepage: "",
  favicon: "",
  tags,
  country,
  countryCode,
  language,
  codec,
  bitrate,
  votes: 100,
  clickCount: 100,
  source: "global-curated",
});

/**
 * Cold-start fallback: broadcaster/direct HTTPS streams checked at release
 * time. Runtime Radio Browser rankings stay preferred because stream URLs
 * change.
 */
export const GLOBAL_CURATED_STATIONS: Station[] = [
  curated("global-mangoradio", "MANGORADIO", "https://mangoradio.stream.laut.fm/mangoradio", "Germany", "DE", "Deutsch", ["music", "variety"]),
  curated("global-dance-wave", "Dance Wave!", "https://dancewave.online/dance.mp3", "Hungary", "HU", "Magyar", ["dance", "electronic", "house"]),
  curated("global-reyfm", "REYFM Original", "https://listen.reyfm.de/original_192kbps.mp3", "Germany", "DE", "Deutsch", ["pop", "electronic"], "MP3", 192),
  curated("global-jazz-radio-blues", "Jazz Radio Blues", "https://jazzblues.ice.infomaniak.ch/jazzblues-high.mp3", "France", "FR", "Français", ["jazz", "blues"]),
  curated("global-rmf-fm", "RMF FM", "https://rs6-krk2.rmfstream.pl/rmf_fm", "Poland", "PL", "Polski", ["pop", "hits"]),
  curated("global-classic-fm", "Classic FM", "https://media-ice.musicradio.com/ClassicFMMP3", "United Kingdom", "GB", "English", ["classical"]),
  curated("global-dance-wave-retro", "Dance Wave Retro!", "https://dancewave.online/retrodance.mp3", "Hungary", "HU", "Magyar", ["dance", "90s"]),
  curated("global-ambient-sleeping-pill", "Ambient Sleeping Pill", "https://radio.stereoscenic.com/asp-h", "United States", "US", "English", ["ambient", "relax"]),
  curated("global-frisky", "Frisky Radio", "https://stream2.friskyradio.com/frisky_mp3_hi", "United States", "US", "English", ["electronic", "progressive"]),
  curated("global-fip", "FIP", "https://icecast.radiofrance.fr/fip-hifi.aac", "France", "FR", "Français", ["eclectic", "jazz", "world"], "AAC", 192),
  curated("global-radio-paradise", "Radio Paradise Main Mix", "https://stream.radioparadise.com/aac-320", "United States", "US", "English", ["eclectic", "rock"], "AAC", 320),
  curated("global-kexp", "KEXP 90.3 FM", "https://kexp-mp3-128.streamguys1.com/kexp128.mp3", "United States", "US", "English", ["indie", "alternative"]),
  curated("global-nts-1", "NTS Radio 1", "https://stream-relay-geo.ntslive.net/stream", "United Kingdom", "GB", "English", ["underground", "electronic"]),
  curated("global-radio-swiss-jazz", "Radio Swiss Jazz", "https://stream.srg-ssr.ch/m/rsj/mp3_128", "Switzerland", "CH", "Deutsch", ["jazz", "soul"]),
  curated("global-fluxfm", "FluxFM", "https://streams.fluxfm.de/live/mp3-320/streams.fluxfm.de/", "Germany", "DE", "Deutsch", ["indie", "alternative"], "MP3", 320),
  curated("global-radio-paradise-mellow", "Radio Paradise Mellow Mix", "https://stream.radioparadise.com/mellow-320", "United States", "US", "English", ["mellow", "eclectic"], "AAC", 320),
  curated("global-radio-paradise-rock", "Radio Paradise Rock Mix", "https://stream.radioparadise.com/rock-320", "United States", "US", "English", ["rock", "alternative"], "AAC", 320),
  curated("global-wqxr", "WQXR", "https://stream.wqxr.org/wqxr", "United States", "US", "English", ["classical"]),
  curated("global-nts-2", "NTS Radio 2", "https://stream-relay-geo.ntslive.net/stream2", "United Kingdom", "GB", "English", ["experimental", "electronic"]),
  curated("global-bbc-6music", "BBC Radio 6 Music", "https://stream.live.vc.bbcmedia.co.uk/bbc_6music", "United Kingdom", "GB", "English", ["alternative", "indie"]),
];

/** One raw Radio Browser station document (only the fields we consume). */
export type RawCatalogStation = {
  stationuuid?: string;
  id?: string;
  name?: string;
  url?: string;
  url_resolved?: string;
  streamUrl?: string;
  homepage?: string;
  favicon?: string;
  tags?: string;
  country?: string;
  countrycode?: string;
  countryCode?: string;
  language?: string;
  codec?: string;
  bitrate?: number | string;
  votes?: number | string;
  clickcount?: number | string;
  clickCount?: number | string;
  lastcheckok?: number | string;
};

const MUSIC = /music|jazz|rock|pop|classical|dance|electronic|ambient|indie|soul|blues|folk|latin|hits/i;
const NON_MUSIC = /news|talk|sport|religion|politic|weather|traffic/i;

/**
 * Pick music stations from a Radio Browser list: HTTPS, not broken, music
 * tags, no news/talk, at most two per country before the leftovers are used.
 */
export function selectPopularMusic(rawStations: readonly RawCatalogStation[], limit = 20): RawCatalogStation[] {
  const eligible = rawStations.filter((item) => {
    const tags = String(item.tags || "");
    const url = item.url_resolved || item.url || item.streamUrl || "";
    return /^https:\/\//.test(url) && Number(item.lastcheckok ?? 1) === 1 && MUSIC.test(tags) && !NON_MUSIC.test(tags);
  });
  const result: RawCatalogStation[] = [];
  const deferred: RawCatalogStation[] = [];
  const countries = new Map<string, number>();
  for (const item of eligible) {
    const country = String(item.countrycode || item.countryCode || "").toUpperCase();
    if ((countries.get(country) || 0) >= 2) deferred.push(item);
    else {
      result.push(item);
      countries.set(country, (countries.get(country) || 0) + 1);
    }
    if (result.length === limit) return result;
  }
  for (const item of deferred) {
    result.push(item);
    if (result.length === limit) break;
  }
  return result;
}

/** Normalize a two-letter country code, rejecting empty and `XX`. */
export function countryCode(value: unknown): string | null {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) && code !== "XX" ? code : null;
}

/** The minimal request shape `clientIp` needs. */
export type IpRequestLike = {
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
};

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

/** Best-effort public client IP; private/loopback addresses resolve to null. */
export function clientIp(request: IpRequestLike): string | null {
  const forwardedHeader = request.headers?.["x-forwarded-for"];
  const forwardedRaw = Array.isArray(forwardedHeader) ? forwardedHeader[0] : forwardedHeader;
  const forwarded = String(forwardedRaw || "").split(",")[0]?.trim() || "";
  const raw = forwarded || request.socket?.remoteAddress || "";
  const value = raw.replace(/^::ffff:/, "");
  if (!IPV4.test(value) && !IPV6.test(value)) return null;
  if (
    value === "::1" ||
    value === "::" ||
    value.startsWith("127.") ||
    value.startsWith("10.") ||
    value.startsWith("192.168.") ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(value) ||
    value.startsWith("169.254.") ||
    /^f[cd]/i.test(value) ||
    /^fe80/i.test(value)
  ) {
    return null;
  }
  return value;
}

/** Case-insensitive curated search over name, country, language and tags. */
export function filterCuratedStations(stations: readonly Station[], query: string): Station[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...stations];
  return stations.filter((station) =>
    [station.name, station.country, station.language, ...station.tags].join(" ").toLowerCase().includes(needle),
  );
}