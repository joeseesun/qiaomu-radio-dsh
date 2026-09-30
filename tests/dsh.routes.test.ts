import { describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ROUTE_PREFIX, registerRadioRoutes, type WebServerLike } from "../src/dsh/routes";
import { renderPlayerPage } from "../src/dsh/page";
import { createMemoryTasteStore } from "../src/host/taste";
import type { RadioService } from "../src/host/contract";
import type { CatalogRequest } from "../src/core/types";

/** A web carrier stand-in that records route registrations and lets tests invoke them. */
function fakeWebServer() {
  const routes: Array<{ kind: string; path: string; handler: (...args: unknown[]) => unknown }> = [];
  const server: WebServerLike = {
    port: 4599,
    host: "127.0.0.1",
    register(route) {
      routes.push(route as never);
      return () => {
        const at = routes.findIndex((item) => item.path === route.path && item.kind === route.kind);
        if (at >= 0) routes.splice(at, 1);
      };
    },
  };
  const find = (path: string) => {
    const exact = routes.find((route) => route.kind === "exact" && route.path === path);
    if (exact) return exact;
    const prefixes = routes
      .filter((route) => route.kind === "prefix" && path.startsWith(route.path))
      .sort((left, right) => right.path.length - left.path.length);
    return prefixes[0];
  };
  return { server, routes, find };
}

/** Minimal response recorder matching node:http's surface. */
function fakeResponse() {
  const state = {
    status: 0,
    headers: {} as Record<string, string>,
    chunks: [] as Uint8Array[],
    ended: false,
    location: "",
  };
  const response = {
    set statusCode(value: number) {
      state.status = value;
    },
    get statusCode() {
      return state.status;
    },
    setHeader(name: string, value: string) {
      const key = name.toLowerCase();
      state.headers[key] = value;
      if (key === "location") state.location = value;
    },
    end(chunk?: string | Uint8Array) {
      state.ended = true;
      (response as unknown as { writableEnded: boolean }).writableEnded = true;
      if (typeof chunk === "string") state.chunks.push(Buffer.from(chunk));
      else if (chunk) state.chunks.push(Buffer.from(chunk));
    },
    writableEnded: false,
    write(chunk?: Uint8Array) {
      if (chunk) state.chunks.push(Buffer.from(chunk));
      return true;
    },
    once() {},
    on() {},
  };
  return {
    response: response as unknown as ServerResponse,
    state,
    body(): string {
      return Buffer.concat(state.chunks).toString("utf8");
    },
  };
}

function fakeRequest(url: string, method = "GET", body?: string) {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const request = {
    url,
    method,
    headers: {},
    on(event: string, listener: (...args: unknown[]) => void) {
      (listeners[event] ??= []).push(listener);
      if (event === "end") queueMicrotask(() => listener());
      if (event === "data" && body) queueMicrotask(() => listener(Buffer.from(body)));
      return request;
    },
  } as unknown as IncomingMessage;
  return request;
}

function stubService(): RadioService {
  return {
    catalog: vi.fn(async (request: CatalogRequest) => ({
      stations: [
        {
          id: "s1",
          name: "Test FM",
          streamUrl: "https://example.test/live.mp3",
          homepage: "",
          favicon: "",
          tags: ["jazz"],
          country: "France",
          countryCode: "FR",
          language: "Français",
          codec: "MP3",
          bitrate: 128,
          votes: 10,
          clickCount: 20,
          source: "radio-browser" as const,
        },
      ],
      source: request.source,
      cached: false,
    })),
    resolvePlay: vi.fn(async () => ({ url: "https://example.test/live.mp3", kind: "media" as const, source: "radio-browser" as const, cached: false })),
    nowPlaying: vi.fn(async () => null),
    prefetch: vi.fn(),
    proxy: vi.fn(async () => undefined),
    clear: vi.fn(),
    taste: createMemoryTasteStore(),
  };
}

describe("radio plugin routes", () => {
  it("registers the page, asset and api routes exactly once each", () => {
    const { server, routes } = fakeWebServer();
    const dispose = registerRadioRoutes(server, {
      service: stubService(),
      assetDir: join(tmpdir(), "radio-missing-assets"),
      assetPrefix: ROUTE_PREFIX,
    });
    const paths = routes.map((route) => `${route.kind}:${route.path}`).sort();
    expect(paths).toEqual(
      [`exact:${ROUTE_PREFIX}`, `exact:${ROUTE_PREFIX}/`, `prefix:${ROUTE_PREFIX}`].sort(),
    );
    dispose();
    expect(routes).toHaveLength(0);
  });

  /**
   * The harness web server matches a prefix route with
   * `pathname.startsWith(\`${prefix}/\`)` (longest prefix wins). A prefix
   * registered with its own trailing slash therefore only matches
   * "/qiaomu-radio//app.js" and every real sub-path falls through to the SPA
   * fallback, which answers a bare 404. This mirrors that matcher so the
   * regression cannot come back unnoticed.
   */
  it("keeps its prefix route reachable for real sub-paths", () => {
    const { server, routes } = fakeWebServer();
    registerRadioRoutes(server, {
      service: stubService(),
      assetDir: join(tmpdir(), "radio-missing-assets"),
      assetPrefix: ROUTE_PREFIX,
    });
    const harnessMatch = (pathname: string) => {
      const exact = routes.find((route) => route.kind === "exact" && route.path === pathname);
      if (exact) return exact;
      return routes
        .filter((route) => route.kind === "prefix" && pathname.startsWith(`${route.path}/`))
        .sort((left, right) => right.path.length - left.path.length)[0];
    };
    for (const pathname of [
      `${ROUTE_PREFIX}/app.js`,
      `${ROUTE_PREFIX}/styles.css`,
      `${ROUTE_PREFIX}/api/radio/catalog`,
      `${ROUTE_PREFIX}/stream/${encodeURIComponent("https://example.test/live.m3u8")}`,
    ]) {
      expect(harnessMatch(pathname)?.kind).toBe("prefix");
    }
    expect(harnessMatch(`${ROUTE_PREFIX}/`)?.kind).toBe("exact");
    expect(harnessMatch(ROUTE_PREFIX)?.kind).toBe("exact");
  });

  it("serves the player page with the API base and the module script", async () => {
    const { server, find } = fakeWebServer();
    registerRadioRoutes(server, {
      service: stubService(),
      assetDir: join(tmpdir(), "radio-missing-assets"),
      assetPrefix: ROUTE_PREFIX,
    });
    const { response, state, body } = fakeResponse();
    await find(`${ROUTE_PREFIX}/`)?.handler(fakeRequest(`${ROUTE_PREFIX}/`), response);
    expect(state.status).toBe(200);
    expect(state.headers["content-type"]).toContain("text/html");
    expect(body()).toContain(`"baseUrl":"${ROUTE_PREFIX}"`);
    // 资产带版本串：两个文件都以 `max-age=3600` 送出，没有版本串时升级后
    // 浏览器可能继续用缓存里的旧界面（实测最长一小时）。
    expect(body()).toMatch(new RegExp(`src="${ROUTE_PREFIX}/app\\.js\\?v=[\\w-]+"`));
    expect(body()).toMatch(new RegExp(`href="${ROUTE_PREFIX}/styles\\.css\\?v=[\\w-]+"`));
    expect(body()).toContain("乔木电台");
  });

  it("re-versions the player assets when they change, so an upgrade cannot serve a stale UI", async () => {
    const assetDir = mkdtempSync(join(tmpdir(), "radio-assets-"));
    writeFileSync(join(assetDir, "app.js"), "console.log(1)");
    writeFileSync(join(assetDir, "styles.css"), "body{}");
    const { server, find } = fakeWebServer();
    registerRadioRoutes(server, { service: stubService(), assetDir, assetPrefix: ROUTE_PREFIX });

    const first = fakeResponse();
    await find(`${ROUTE_PREFIX}/`)?.handler(fakeRequest(`${ROUTE_PREFIX}/`), first.response);
    const firstToken = /app\.js\?v=([\w-]+)/.exec(first.body())?.[1];
    expect(firstToken).toBeTruthy();
    // 同一个目录算出一个版本串，样式表用同一个，页面里两处必须一致。
    expect(first.body()).toContain(`href="${ROUTE_PREFIX}/styles.css?v=${firstToken}"`);

    writeFileSync(join(assetDir, "app.js"), "console.log(2)".repeat(3));
    const second = fakeResponse();
    await find(`${ROUTE_PREFIX}/`)?.handler(fakeRequest(`${ROUTE_PREFIX}/`), second.response);
    const secondToken = /app\.js\?v=([\w-]+)/.exec(second.body())?.[1];
    expect(secondToken).not.toBe(firstToken);
  });

  it("redirects the bare prefix to the page", async () => {
    const { server, find } = fakeWebServer();
    registerRadioRoutes(server, {
      service: stubService(),
      assetDir: join(tmpdir(), "radio-missing-assets"),
      assetPrefix: ROUTE_PREFIX,
    });
    const { response, state, body } = fakeResponse();
    await find(ROUTE_PREFIX)?.handler(fakeRequest(ROUTE_PREFIX), response);
    expect(state.status).toBe(302);
    expect(state.location).toBe(`${ROUTE_PREFIX}/`);
  });

  it("answers the catalog api over GET query parameters", async () => {
    const { server, find } = fakeWebServer();
    const service = stubService();
    registerRadioRoutes(server, {
      service,
      assetDir: join(tmpdir(), "radio-missing-assets"),
      assetPrefix: ROUTE_PREFIX,
    });
    const { response, state, body } = fakeResponse();
    await find(`${ROUTE_PREFIX}/api/radio/catalog`)?.handler(
      fakeRequest(`${ROUTE_PREFIX}/api/radio/catalog?mood=jazz&source=radio-browser`),
      response,
    );
    expect(state.status).toBe(200);
    const payload = JSON.parse(body());
    expect(payload.stations).toHaveLength(1);
    expect(service.catalog).toHaveBeenCalledWith(
      expect.objectContaining({ mood: "jazz", source: "radio-browser", query: undefined }),
    );
  });

  it("rejects a resolve-play call without a station", async () => {
    const { server, find } = fakeWebServer();
    registerRadioRoutes(server, {
      service: stubService(),
      assetDir: join(tmpdir(), "radio-missing-assets"),
      assetPrefix: ROUTE_PREFIX,
    });
    const { response, state } = fakeResponse();
    const handler = find(`${ROUTE_PREFIX}/api/radio/resolve-play`)?.handler;
    await handler?.(fakeRequest(`${ROUTE_PREFIX}/api/radio/resolve-play`, "POST", "{}"), response);
    // `handleApi` is async and reads the body before answering.
    await new Promise((settle) => setTimeout(settle, 5));
    expect(state.status).toBe(400);
  });

  it("proxies a stream path through the host service", async () => {
    const { server, find } = fakeWebServer();
    const service = stubService();
    registerRadioRoutes(server, {
      service,
      assetDir: join(tmpdir(), "radio-missing-assets"),
      assetPrefix: ROUTE_PREFIX,
    });
    const { response } = fakeResponse();
    const upstream = "https://example.test/live/list.m3u8";
    const encoded = encodeURIComponent(upstream);
    await find(`${ROUTE_PREFIX}/stream/${encoded}`)?.handler(
      fakeRequest(`${ROUTE_PREFIX}/stream/${encoded}`),
      response,
    );
    expect(service.proxy).toHaveBeenCalledWith(expect.anything(), expect.anything(), upstream);
  });

  it("answers 404 for a missing asset and 400 for a traversal attempt", async () => {
    const { server, find } = fakeWebServer();
    registerRadioRoutes(server, {
      service: stubService(),
      assetDir: join(tmpdir(), "radio-missing-assets"),
      assetPrefix: ROUTE_PREFIX,
    });
    const missing = fakeResponse();
    await find(`${ROUTE_PREFIX}/nope.js`)?.handler(fakeRequest(`${ROUTE_PREFIX}/nope.js`), missing.response);
    expect(missing.state.status).toBe(404);

    const traversal = fakeResponse();
    find(`${ROUTE_PREFIX}/../../etc/passwd`)?.handler(
      fakeRequest(`${ROUTE_PREFIX}/../../etc/passwd`),
      traversal.response,
    );
    expect(traversal.state.status).toBe(400);
  });

  it("serves a real asset from the asset directory", async () => {
    const directory = mkdtempSync(join(tmpdir(), "radio-assets-"));
    writeFileSync(join(directory, "app.js"), "export const ok = true;\n", "utf8");
    const { server, find } = fakeWebServer();
    registerRadioRoutes(server, {
      service: stubService(),
      assetDir: directory,
      assetPrefix: ROUTE_PREFIX,
    });
    const { response, state, body } = fakeResponse();
    await find(`${ROUTE_PREFIX}/app.js`)?.handler(fakeRequest(`${ROUTE_PREFIX}/app.js`), response);
    expect(state.status).toBe(200);
    expect(state.headers["content-type"]).toContain("javascript");
    expect(state.headers["cache-control"]).toContain("max-age=3600");
    expect(body()).toContain("export const ok");
  });
});

describe("player page", () => {
  it("escapes the title and always emits a single root element", () => {
    const html = renderPlayerPage({ baseUrl: "/qiaomu-radio/", title: 'A "quoted" <title>' });
    expect(html).toContain("&quot;quoted&quot;");
    expect(html).not.toContain("<title> title>");
    expect(html.match(/id="radio-root"/g)).toHaveLength(1);
    expect(html).toContain("window.__DSH_RADIO__");
    // The player is a fixed-palette surface: it must not let the OS dark
    // appearance repaint the canvas or flip inherited text to white.
    expect(html).toContain('<meta name="color-scheme" content="light" />');
    expect(html).toContain("body.radio-page{margin:0");
    // The body sits behind the themed root, so it mirrors every theme value.
    for (const theme of ["editorial", "rams", "pocket", "deck", "console", "fantasy"]) {
      expect(html).toContain(`body.radio-page:has(main.radio-root[data-theme=${theme}])`);
    }
    expect(html).not.toContain("color-scheme: dark");
    expect(html).toContain('lang="zh-CN"');
  });
});