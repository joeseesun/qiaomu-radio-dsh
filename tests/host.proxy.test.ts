import { describe, expect, it } from "vitest";

import type { ProxyRequest, ProxyResponse } from "../src/host/contract";
import { createRadioService } from "../src/host/catalog";
import {
  PLAY_PROXY_PREFIX,
  PROXY_PATH_PREFIX,
  STREAM_PROXY_PREFIX,
  decodeProxyTarget,
  proxy,
  rewritePlaylist,
} from "../src/host/proxy";

/* ------------------------------------------------------------------ helpers */

type FakeResponse = {
  response: ProxyResponse;
  headers: Record<string, string>;
  body: () => string;
  emitClose: () => void;
  writes: number;
};

function fakeResponse(): FakeResponse {
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  const closeListeners: Array<() => void> = [];
  const decoder = new TextDecoder();
  let ended = false;
  let writes = 0;
  const response: ProxyResponse = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    end(chunk?: Uint8Array | string) {
      if (chunk !== undefined) chunks.push(typeof chunk === "string" ? chunk : decoder.decode(chunk));
      ended = true;
    },
    write(chunk: Uint8Array) {
      writes += 1;
      chunks.push(decoder.decode(chunk));
    },
    on(event: "close", listener: () => void) {
      if (event === "close") closeListeners.push(listener);
    },
    get writableEnded() {
      return ended;
    },
  };
  return {
    response,
    headers,
    body: () => chunks.join(""),
    emitClose: () => closeListeners.forEach((listener) => listener()),
    get writes() {
      return writes;
    },
  };
}

function fakeRequest(
  headers: Record<string, string | string[] | undefined> = {},
  method = "GET",
): ProxyRequest {
  const request = {
    method,
    headers,
    on() {
      /* no request body in these tests */
    },
  };
  return request as unknown as ProxyRequest;
}

function textResponse(text: string, contentType: string, status = 200): Response {
  const bytes = new TextEncoder().encode(text);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
    text: async () => text,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  } as unknown as Response;
}

const asFetch = (impl: unknown): typeof fetch => impl as typeof fetch;

/* ------------------------------------------------------------ playlist rewrite */

describe("rewritePlaylist", () => {
  const toProxy = (absolute: string) => `/proxy?url=${encodeURIComponent(absolute)}`;
  const source = "https://cdn.example.com/live/hls/master.m3u8";

  it("rewrites relative and absolute URIs to the proxy path", () => {
    const playlist = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXTINF:4.000,",
      "seg1.ts",
      "https://other.example.net/live/seg2.aac?token=abc",
      "sub/playlist.m3u8",
      "",
    ].join("\n");

    const rewritten = rewritePlaylist(playlist, source, toProxy).split("\n");

    expect(rewritten[0]).toBe("#EXTM3U");
    expect(rewritten[1]).toBe("#EXT-X-VERSION:3");
    expect(rewritten[3]).toBe(`/proxy?url=${encodeURIComponent("https://cdn.example.com/live/hls/seg1.ts")}`);
    expect(rewritten[4]).toBe(
      `/proxy?url=${encodeURIComponent("https://other.example.net/live/seg2.aac?token=abc")}`,
    );
    expect(rewritten[5]).toBe(
      `/proxy?url=${encodeURIComponent("https://cdn.example.com/live/hls/sub/playlist.m3u8")}`,
    );
  });

  it("rewrites URI attributes inside tags and leaves comments alone", () => {
    const playlist = [
      "#EXTM3U",
      '#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x1',
      '#EXT-X-MAP:URI="https://keys.example.com/init.mp4"',
      "#EXT-X-ENDLIST",
    ].join("\n");

    const rewritten = rewritePlaylist(playlist, source, toProxy).split("\n");

    expect(rewritten[1]).toBe(
      `#EXT-X-KEY:METHOD=AES-128,URI="/proxy?url=${encodeURIComponent(
        "https://cdn.example.com/live/hls/key.bin",
      )}",IV=0x1`,
    );
    expect(rewritten[2]).toBe(
      `#EXT-X-MAP:URI="/proxy?url=${encodeURIComponent("https://keys.example.com/init.mp4")}"`,
    );
    expect(rewritten[3]).toBe("#EXT-X-ENDLIST");
  });

  it("does not double-rewrite a URI that is already proxied", () => {
    const already = `${STREAM_PROXY_PREFIX}${encodeURIComponent("https://cdn.example.com/live/hls/seg1.ts")}`;
    const rewritten = rewritePlaylist(`#EXTM3U\n${already}\n`, source, toProxy);
    expect(rewritten.split("\n")[1]).toBe(already);
  });

  it("defaults to the plugin proxy prefix", () => {
    const rewritten = rewritePlaylist("#EXTM3U\nseg1.ts\n", source).split("\n");
    expect(rewritten[1]).toBe(`${PLAY_PROXY_PREFIX}${encodeURIComponent("https://cdn.example.com/live/hls/seg1.ts")}`);
    expect(PLAY_PROXY_PREFIX).toBe(STREAM_PROXY_PREFIX);
    expect(PROXY_PATH_PREFIX).toBe(STREAM_PROXY_PREFIX);
  });
});

describe("decodeProxyTarget", () => {
  it("decodes an encoded upstream URL", () => {
    const upstream = "https://cdn.example.com/live/master.m3u8?token=1";
    expect(decodeProxyTarget(encodeURIComponent(upstream))).toBe(upstream);
  });

  it("tolerates a leading slash and rejects junk", () => {
    expect(decodeProxyTarget("/" + encodeURIComponent("https://a.example/x.ts"))).toBe("https://a.example/x.ts");
    expect(decodeProxyTarget("not-a-url")).toBeNull();
    expect(decodeProxyTarget("")).toBeNull();
    expect(decodeProxyTarget(encodeURIComponent("file:///etc/passwd"))).toBeNull();
  });
});

/* -------------------------------------------------------------------- proxy */

describe("proxy", () => {
  it("streams bytes, passes the status through and forwards range/icy headers", async () => {
    const sink = fakeResponse();
    let captured: { url: string; init?: RequestInit } | undefined;
    const fetchImpl = async (input: unknown, init?: RequestInit) => {
      captured = { url: String(input), init };
      const bytes = new TextEncoder().encode("radio-bytes");
      return {
        ok: true,
        status: 206,
        headers: new Headers({
          "content-type": "audio/mpeg",
          "icy-metaint": "16000",
          "accept-ranges": "bytes",
        }),
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
      } as unknown as Response;
    };

    await proxy(
      fakeRequest({ range: "bytes=0-1023", "icy-metadata": "1" }),
      sink.response,
      "https://up.example/live.mp3",
      { fetchImpl: asFetch(fetchImpl) },
    );

    expect(captured?.url).toBe("https://up.example/live.mp3");
    expect((captured?.init?.headers as Record<string, string>).Range).toBe("bytes=0-1023");
    expect(sink.response.statusCode).toBe(206);
    expect(sink.headers["content-type"]).toBe("audio/mpeg");
    expect(sink.headers["icy-metaint"]).toBe("16000");
    expect(sink.headers["accept-ranges"]).toBe("bytes");
    expect(sink.body()).toBe("radio-bytes");
  });

  it("rewrites an HLS playlist response through the proxy", async () => {
    const sink = fakeResponse();
    const fetchImpl = async () =>
      textResponse("#EXTM3U\n#EXTINF:4,\nseg1.ts\n", "application/vnd.apple.mpegurl");

    await proxy(fakeRequest(), sink.response, "https://cdn.example.com/live/master.m3u8", {
      fetchImpl: asFetch(fetchImpl),
    });

    expect(sink.headers["content-type"]).toBe("application/vnd.apple.mpegurl");
    expect(sink.headers["cache-control"]).toBe("no-store");
    expect(sink.body()).toContain(
      `${STREAM_PROXY_PREFIX}${encodeURIComponent("https://cdn.example.com/live/seg1.ts")}`,
    );
  });

  it("maps a failing upstream status to 502", async () => {
    const sink = fakeResponse();
    const fetchImpl = async () => textResponse("gone", "text/plain", 503);
    await proxy(fakeRequest(), sink.response, "https://up.example/dead", { fetchImpl: asFetch(fetchImpl) });
    expect(sink.response.statusCode).toBe(502);
    expect(sink.body()).toContain("503");
  });

  it("maps a transport error to 502", async () => {
    const sink = fakeResponse();
    const fetchImpl = async () => {
      throw new Error("ECONNREFUSED");
    };
    await proxy(fakeRequest(), sink.response, "https://up.example/down", { fetchImpl: asFetch(fetchImpl) });
    expect(sink.response.statusCode).toBe(502);
    expect(sink.body()).toMatch(/[\u4e00-\u9fa5]/);
  });

  it("aborts the upstream fetch when the client disconnects", async () => {
    const sink = fakeResponse();
    let captured: RequestInit | undefined;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = async (_input: unknown, init?: RequestInit) => {
      captured = init;
      await gate;
      return textResponse("late", "audio/mpeg");
    };

    const running = proxy(fakeRequest(), sink.response, "https://up.example/live.mp3", {
      fetchImpl: asFetch(fetchImpl),
    });
    await Promise.resolve();
    sink.emitClose();
    release();
    await running;

    expect(captured?.signal?.aborted).toBe(true);
    expect(sink.writes).toBe(0);
    expect(sink.body()).toBe("");
  });
});

describe("RadioService.proxy", () => {
  it("uses the service's injected fetch and the shared proxy prefix", async () => {
    const sink = fakeResponse();
    const fetchImpl = async () => textResponse("#EXTM3U\nseg1.ts\n", "application/vnd.apple.mpegurl");
    const service = createRadioService({ fetchImpl: asFetch(fetchImpl) });

    await service.proxy(fakeRequest(), sink.response, "https://cdn.example.com/live/master.m3u8");

    expect(sink.body()).toContain(
      `${STREAM_PROXY_PREFIX}${encodeURIComponent("https://cdn.example.com/live/seg1.ts")}`,
    );
  });
});