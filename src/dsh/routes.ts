/**
 * The plugin's HTTP surface, built on the documented `ctx.webServer` service.
 *
 * Routes are registered by path so the browser half never needs the DSH Remote
 * codegen: the page talks to the host over plain same-origin HTTP, which keeps
 * the player usable from its own tab as well as embedded in the harness window.
 *
 *   GET  /qiaomu-radio/                 player page
 *   GET  /qiaomu-radio/assets/<file>    built client bundle and CSS
 *   GET  /qiaomu-radio/hls.js           lazy hls.js build
 *   GET  /qiaomu-radio/api/radio/<op>   catalog / resolve-play / now-playing
 *   GET  /qiaomu-radio/stream/<url>     HLS playlist and segment proxy
 *
 * The mount path must stay OUT of the harness's `/plugins` namespace: the
 * client module system registers a catch-all PREFIX route there and answers
 * every non-bundle sub-path with its own 404, which silently shadows a carrier
 * mounted underneath it.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve as resolvePath } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { RadioService } from "../host/contract";
import { MOUNT_PATH, decodeProxyTarget } from "../host/proxy";
import { renderPlayerPage } from "./page";

export const PLUGIN_ID = "@qiaomu/dsh-radio";
export const ROUTE_PREFIX = MOUNT_PATH;

/**
 * Cache-busting token for the player page's script and stylesheet.
 *
 * Both are served with `max-age=3600`, and the filename never changes between
 * plugin versions, so without a token the browser keeps running the previous
 * bundle for up to an hour after an upgrade — a user who restarts the app can
 * still be looking at the old UI. Deriving the token from the built files'
 * mtimes and sizes makes it change exactly when a rebuild changes them.
 */
function assetVersion(assetDir: string): string {
  const stamps: string[] = [];
  for (const name of ["app.js", "styles.css"]) {
    try {
      const info = statSync(join(assetDir, name));
      stamps.push(`${Math.round(info.mtimeMs)}-${info.size}`);
    } catch {
      stamps.push("missing");
    }
  }
  return stamps.join("_").replace(/[^a-zA-Z0-9_-]/g, "");
}

/** The subset of `ctx.webServer` this plugin depends on. */
export type WebServerLike = {
  register(route: { kind: "exact" | "prefix"; path: string; handler: RouteHandler }): () => void;
  /** Present on the harness carrier; optional so unit tests can omit it. */
  port?: number;
  host?: string;
};

export type RouteHandler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;

export type RouteOptions = {
  service: RadioService;
  /** Directory that holds the built player (`lib/player` by default). */
  assetDir: string;
  /** Host route prefix for destructive operations such as clearing caches. */
  assetPrefix: string;
  /** Origin the page is served from, used for absolute asset URLs. */
  origin?: string;
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".glb": "model/gltf-binary",
};

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body ?? null);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(text);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  await new Promise<void>((settle, fail) => {
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => settle());
    request.on("error", (error: Error) => fail(error));
  });
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

/** Built bundles are versioned by the build, so long-lived caching is safe. */
function cacheSecondsFor(relative: string): number {
  return /\.(?:js|css|woff2|png|webp|svg|glb)$/i.test(relative) ? 3600 : 0;
}

/**
 * Serve one built file. The player bundle is a few hundred kilobytes, so it is
 * read and answered in one shot rather than piped: that also keeps the handler
 * usable with the minimal response contract the host tests inject.
 */
async function sendFile(response: ServerResponse, path: string, cacheSeconds: number): Promise<void> {
  const body = readFileSync(path);
  response.statusCode = 200;
  response.setHeader("content-type", MIME[extname(path)] ?? "application/octet-stream");
  response.setHeader("content-length", String(body.byteLength));
  response.setHeader("cache-control", cacheSeconds > 0 ? `public, max-age=${cacheSeconds}` : "no-store");
  response.setHeader("access-control-allow-origin", "*");
  response.end(body);
}

/** Register every radio route; the returned disposer removes them all. */
export function registerRadioRoutes(webServer: WebServerLike, options: RouteOptions): () => void {
  const disposers: Array<() => void> = [];
  const assetDir = resolvePath(options.assetDir);

  const asset = (request: IncomingMessage, response: ServerResponse, rest: string): void => {
    void request;
    const relative = rest.replace(/^\/+/, "");
    if (relative === "" || relative.includes("..")) {
      sendJson(response, 400, { error: "invalid asset path" });
      return;
    }
    const path = join(assetDir, normalize(relative));
    if (!existsSync(path) || !statSync(path).isFile()) {
      sendJson(response, 404, { error: "asset not found" });
      return;
    }
    void sendFile(response, path, cacheSecondsFor(relative));
  };

  // Player page, then the bare-prefix redirect, then everything below it.
  disposers.push(
    webServer.register({
      kind: "exact",
      path: `${ROUTE_PREFIX}/`,
      handler: (_request, response) => {
        const html = renderPlayerPage({
          baseUrl: options.assetPrefix,
          presentation: "page",
          version: assetVersion(assetDir),
        });
        response.statusCode = 200;
        response.setHeader("content-type", MIME[".html"] as string);
        response.setHeader("cache-control", "no-store");
        response.end(html);
      },
    }),
  );

  disposers.push(
    webServer.register({
      kind: "exact",
      path: ROUTE_PREFIX,
      handler: (_request, response) => {
        response.statusCode = 302;
        response.setHeader("location", `${ROUTE_PREFIX}/`);
        response.end();
      },
    }),
  );

  // Player page and assets. The prefix MUST NOT carry a trailing slash: the
  // harness matcher tests `pathname.startsWith(\`${prefix}/\`)`, so a prefix of
  // "/qiaomu-radio/" would only match "/qiaomu-radio//..." and every real
  // sub-path would fall through to the SPA fallback's bare 404.
  disposers.push(
    webServer.register({
      kind: "prefix",
      path: ROUTE_PREFIX,
      handler: (request, response) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        const rest = pathname.slice(`${ROUTE_PREFIX}/`.length);
        if (rest.startsWith("api/radio/")) {
          void handleApi(request, response, rest.slice("api/radio/".length), options.service);
          return;
        }
        if (rest.startsWith("stream/")) {
          const target = decodeProxyTarget(rest.slice("stream/".length));
          if (!target) {
            sendJson(response, 400, { error: "invalid stream target" });
            return;
          }
          // `proxy` adapts itself to the Node response; the cast keeps the
          // host contract free of node:http types.
          void options.service.proxy(request, response as never, target);
          return;
        }
        asset(request, response, rest);
      },
    }),
  );

  return () => {
    for (const dispose of disposers.splice(0)) {
      try {
        dispose();
      } catch {
        /* already removed */
      }
    }
  };
}

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  operation: string,
  service: RadioService,
): Promise<void> {
  try {
    const method = request.method ?? "GET";
    const url = new URL(request.url ?? "/", "http://localhost");
    if (operation === "catalog") {
      const input =
        method === "POST"
          ? ((await readJsonBody(request)) as Record<string, unknown> | null)
          : Object.fromEntries(url.searchParams.entries());
      const mood = String(input?.mood ?? "focus");
      const source = String(input?.source ?? "radio-browser");
      const countryCode = input?.countryCode ? String(input.countryCode) : null;
      const query = input?.query ? String(input.query) : undefined;
      const result = await service.catalog({
        mood: mood as never,
        source: source as never,
        countryCode,
        query,
      });
      sendJson(response, 200, result);
      return;
    }
    if (operation === "resolve-play") {
      const input = method === "POST" ? await readJsonBody(request) : null;
      const station = input as Record<string, unknown> | null;
      if (!station || typeof station.streamUrl !== "string") {
        sendJson(response, 400, { error: "station is required" });
        return;
      }
      const target = await service.resolvePlay(station as never);
      sendJson(response, 200, target);
      return;
    }
    if (operation === "now-playing") {
      const input = method === "POST" ? await readJsonBody(request) : null;
      const station = input as Record<string, unknown> | null;
      if (!station) {
        sendJson(response, 400, { error: "station is required" });
        return;
      }
      sendJson(response, 200, await service.nowPlaying(station as never));
      return;
    }
    if (operation === "prefetch") {
      const input = method === "POST" ? await readJsonBody(request) : null;
      const stations = Array.isArray(input) ? (input as never[]) : [];
      service.prefetch(stations);
      sendJson(response, 200, { ok: true });
      return;
    }
    sendJson(response, 404, { error: `unknown radio operation "${operation}"` });
  } catch (error) {
    sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) });
  }
}

export const ROUTES = {
  page: `${ROUTE_PREFIX}/`,
} as const;