import type { MoodId, Station } from "./types";

/**
 * Last-resort station list. The host catalog normally answers from Radio
 * Browser; when every mirror is unreachable the host degrades to its curated
 * list, and if even the plugin's own routes cannot be reached (offline page,
 * host half not loaded) the client falls back to this small broadcaster-owned
 * set so the player still has something real to play.
 *
 * Only direct HTTPS streams that broadcasters publish themselves; no
 * aggregator scraping.
 */
const station = (
  id: string,
  name: string,
  streamUrl: string,
  country: string,
  countryCode: string,
  language: string,
  tags: string[],
  codec = "MP3",
  bitrate = 128,
): Station => ({
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

export const FALLBACK_STATIONS: Station[] = [
  station("global-fip", "FIP", "https://icecast.radiofrance.fr/fip-hifi.aac", "France", "FR", "Français", ["eclectic", "jazz", "world"], "AAC", 192),
  station("global-classic-fm", "Classic FM", "https://media-ice.musicradio.com/ClassicFMMP3", "United Kingdom", "GB", "English", ["classical"]),
  station("global-radio-swiss-jazz", "Radio Swiss Jazz", "https://stream.srg-ssr.ch/m/rsj/mp3_128", "Switzerland", "CH", "Deutsch", ["jazz", "soul"]),
  station("global-ambient-sleeping-pill", "Ambient Sleeping Pill", "https://radio.stereoscenic.com/asp-h", "United States", "US", "English", ["ambient", "relax"]),
  station("global-dance-wave", "Dance Wave!", "https://dancewave.online/dance.mp3", "Hungary", "HU", "Magyar", ["dance", "electronic", "house"]),
  station("global-kexp", "KEXP 90.3 FM", "https://kexp-mp3-128.streamguys1.com/kexp128.mp3", "United States", "US", "English", ["indie", "alternative"]),
  station("global-radio-paradise", "Radio Paradise Main Mix", "https://stream.radioparadise.com/aac-320", "United States", "US", "English", ["eclectic", "rock"], "AAC", 320),
  station("cn-cnr-voice-of-china", "央广中国之声", "https://ngcdn001.cnr.cn/live/zgzs/index.m3u8", "中国", "CN", "普通话", ["新闻", "综合", "央广"], "HLS", 0),
  station("cn-brtv-music", "北京音乐广播 FM97.4", "https://brtv-radiolive.rbc.cn/alive/fm974.m3u8", "中国", "CN", "普通话", ["音乐", "流行", "北京"], "HLS", 0),
];

/** Tags each mood channel searches for, used by the fallback filter. */
export const MOOD_TAGS: Record<MoodId, string[]> = {
  unwind: ["chillout", "lounge", "easy listening", "ambient", "relax", "mellow"],
  focus: ["ambient", "downtempo", "instrumental", "electronic"],
  jazz: ["jazz", "smooth jazz", "soul", "blues"],
  classical: ["classical", "baroque", "opera"],
  energy: ["rock", "indie", "alternative", "dance", "electronic"],
  world: ["world", "folk", "latin", "eclectic"],
};

/** Filter the fallback list down to one mood, never returning an empty list. */
export function fallbackStationsFor(mood: MoodId, limit = 12): Station[] {
  const tags = MOOD_TAGS[mood];
  const matched = FALLBACK_STATIONS.filter((item) =>
    item.tags.some((tag) => tags.some((wanted) => tag.toLowerCase().includes(wanted))),
  );
  return (matched.length > 0 ? matched : FALLBACK_STATIONS).slice(0, limit);
}