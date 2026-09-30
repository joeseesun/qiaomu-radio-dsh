/**
 * Stream proxy: forwards an upstream radio stream (HLS playlist, HLS segment
 * or direct media) through the plugin's own route so the browser never needs
 * cross-origin access, and rewrites HLS playlists so every nested URI comes
 * back through the same proxy.
 *
 * Ported from `qiaomu-radio/hlsRelay.mjs` and the `/api/hls/*` routes of
 * `qiaomu-radio/server.mjs`, minus the server-side segment cache: the DSH host
 * streams bytes straight through and lets the media element's own buffer do
 * the work.
 */

import { MOUNT_PATH } from "../core/mount";
import { isHlsUrl } from "../core/playbackPolicy";
import type { ProxyRequest, ProxyResponse } from "./contract";

export { MOUNT_PATH };

/** Public route prefix every proxied stream and playlist URI lives under. */


export const STREAM_PROXY_PREFIX = `${MOUNT_PATH}/stream/`;

/** Backwards-compatible alias used by the host contract wording. */
export const PROXY_PATH_PREFIX = STREAM_PROXY_PREFIX;

/** Prefix `resolvePlay` hands to the player for HLS sources. */
export const PLAY_PROXY_PREFIX = STREAM_PROXY_PREFIX;

/** Absolute upstream URL → its proxy URL. */
export function proxyUrlFor(upstream: string): string {
  return `${PLAY_PROXY_PREFIX}${encodeURIComponent(upstream)}`;
}

/** Recover the upstream URL from the `<prefix><encoded-url>` route tail. */
export function decodeProxyTarget(rest: string): string | null {
  const value = rest.replace(/^\/+/, "").split(/[?#]/)[0] ?? "";
  if (!value) return null;
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  try {
    const url = new URL(decoded);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

const URI_ATTRIBUTE = /URI="([^"]*)"/gi;

/**
 * Rewrite every URI in an HLS playlist — bare segment lines and `URI="..."`
 * attributes on tags such as `#EXT-X-KEY` / `#EXT-X-MAP` — to run through the
 * proxy. URIs that are already proxied, and non-network URIs such as
 * `data:`/`skd:`, are left untouched.
 */
export function rewritePlaylist(
  text: string,
  playlistUrl: string,
  toProxy: (absoluteUrl: string) => string = proxyUrlFor,
): string {
  const resolve = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("skd:")) return null;
    if (trimmed.startsWith(STREAM_PROXY_PREFIX)) return trimmed;
    try {
      return toProxy(new URL(trimmed, playlistUrl).href);
    } catch {
      return null;
    }
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const value = line.trim();
      if (!value) return line;
      if (!value.startsWith("#")) {
        const rewritten = resolve(value);
        return rewritten ?? line;
      }
      return line.replace(URI_ATTRIBUTE, (match, uri: string) => {
        const rewritten = resolve(uri);
        return rewritten ? `URI="${rewritten}"` : match;
      });
    })
    .join("\n");
}

/** Options for `proxy`; the service injects its fetch/UA, tests their fakes. */
export type ProxyOptions = {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  toProxy?: (absoluteUrl: string) => string;
};

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== name) continue;
    const value = headers[key];
    return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function isPlaylist(contentType: string, upstream: string): boolean {
  return (
    /mpegurl|vnd\.apple|x-mpegurl|audio\/m3u|application\/m3u/i.test(contentType) || isHlsUrl(upstream)
  );
}

function fail(response: ProxyResponse, status: number, message: string): void {
  if (response.writableEnded) return;
  response.statusCode = status;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(message);
}

/**
 * Stream one upstream URL to the client. Successful upstream statuses pass
 * through (200/206/3xx); an unsubscribe upstream (network error or a non-2xx
 * status) becomes 502. Closing the client connection aborts the upstream fetch.
 */
export async function proxy(
  request: ProxyRequest,
  response: ProxyResponse,
  upstream: string,
  options: ProxyOptions = {},
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? (typeof fetch === "function" ? fetch : undefined);
  const toProxy = options.toProxy ?? proxyUrlFor;
  if (!fetchImpl) {
    fail(response, 502, "代理不可用：宿主缺少 fetch 实现。");
    return;
  }

  const controller = new AbortController();
  let clientGone = false;
  response.on("close", () => {
    clientGone = true;
    controller.abort();
  });

  const headers: Record<string, string> = {
    "User-Agent": options.userAgent ?? "QiaomuRadio/0.1 (+https://www.radio-browser.info/)",
    Accept: "*/*",
  };
  const range = headerValue(request.headers, "range");
  if (range) headers.Range = range;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchImpl(upstream, {
      method: request.method && request.method !== "HEAD" ? request.method : "GET",
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
  } catch {
    if (!clientGone) fail(response, 502, "上游电台暂时不可用。");
    return;
  }

  if (!upstreamResponse.ok) {
    fail(response, 502, `上游电台返回 ${upstreamResponse.status}。`);
    return;
  }
  if (clientGone || response.writableEnded) return;

  const contentType = upstreamResponse.headers.get("content-type") ?? "";
  response.statusCode = upstreamResponse.status;

  if (isPlaylist(contentType, upstream)) {
    response.setHeader("content-type", contentType || "application/vnd.apple.mpegurl");
    response.setHeader("cache-control", "no-store");
    let text: string;
    try {
      text = await upstreamResponse.text();
    } catch {
      if (!clientGone) fail(response, 502, "上游播放列表暂时不可用。");
      return;
    }
    const playlist = rewritePlaylist(text, upstream, toProxy);
    if (!clientGone && !response.writableEnded) response.end(playlist);
    return;
  }

  response.setHeader("content-type", contentType || "application/octet-stream");
  const icy = upstreamResponse.headers.get("icy-metaint");
  if (icy) response.setHeader("icy-metaint", icy);
  const acceptRanges = upstreamResponse.headers.get("accept-ranges");
  if (acceptRanges) response.setHeader("accept-ranges", acceptRanges);
  const cacheControl = upstreamResponse.headers.get("cache-control");
  if (cacheControl) response.setHeader("cache-control", cacheControl);
  const contentLength = upstreamResponse.headers.get("content-length");
  if (contentLength) response.setHeader("content-length", contentLength);

  const body = upstreamResponse.body;
  if (!body) {
    if (!clientGone && !response.writableEnded) response.end();
    return;
  }
  const reader = body.getReader();
  try {
    while (!clientGone) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && !clientGone) response.write(value);
    }
  } catch {
    if (!clientGone && !response.writableEnded) response.end();
    return;
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* the upstream is already gone */
    }
  }
  if (!clientGone && !response.writableEnded) response.end();
}