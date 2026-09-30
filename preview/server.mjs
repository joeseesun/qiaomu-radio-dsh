/**
 * Development preview server.
 *
 * Serves the same player page the host half serves inside the harness, backed by
 * the real host radio service, so the interface can be verified in a browser
 * before the plugin is installed. `--api-only` skips the page and only mirrors
 * the radio routes, which is what the harness embedding path needs.
 *
 *   npm run preview            http://127.0.0.1:4180
 *   npm run preview -- --port 4181
 */

import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createRadioService } from "../src/host/catalog";
import { createMemoryTasteStore } from "../src/host/taste";
import { decodeProxyTarget } from "../src/host/proxy";
import { RADIO_ROUTES } from "../src/client/transport";
import { renderPlayerPage } from "../src/dsh/page";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const portFlag = args.indexOf("--port");
const port = Number(portFlag >= 0 ? args[portFlag + 1] : process.env.PORT || 4180);
const apiOnly = args.includes("--api-only");
const dist = join(root, "preview-dist");

const service = createRadioService({
  taste: createMemoryTasteStore(),
  catalogTtlMs: 5 * 60 * 1000,
});

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

function json(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body ?? null));
}

async function readBody(request) {
  const chunks = [];
  await new Promise((settle, fail) => {
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => settle());
    request.on("error", fail);
  });
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

function sendFile(response, path) {
  const stat = statSync(path);
  response.statusCode = 200;
  response.setHeader("content-type", MIME[extname(path)] ?? "application/octet-stream");
  response.setHeader("content-length", String(stat.size));
  response.setHeader("cache-control", "no-store");
  response.end(readFileSync(path));
}

async function handleApi(request, response, pathname) {
  if (pathname === RADIO_ROUTES.catalog) {
    const url = new URL(request.url ?? "/", "http://localhost");
    const body = request.method === "POST" ? await readBody(request) : null;
    const input = body ?? Object.fromEntries(url.searchParams.entries());
    const result = await service.catalog({
      mood: String(input.mood ?? "focus") ,
      source: String(input.source ?? "radio-browser") ,
      countryCode: input.countryCode ? String(input.countryCode) : null,
      query: input.query ? String(input.query) : undefined,
    });
    json(response, 200, result);
    return true;
  }
  if (pathname === RADIO_ROUTES.resolvePlay) {
    const station = await readBody(request);
    if (!station) {
      json(response, 400, { error: "station is required" });
      return true;
    }
    json(response, 200, await service.resolvePlay(station ));
    return true;
  }
  if (pathname === RADIO_ROUTES.nowPlaying) {
    const station = await readBody(request);
    json(response, 200, station ? await service.nowPlaying(station ) : null);
    return true;
  }
  return false;
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  // The host half hands out paths under its own plugin prefix; accept both that
  // form and the bare `/stream/...` form so the preview matches production.
  const pathname = url.pathname.replace(/^\/plugins\/@qiaomu\/dsh-radio/, "") || "/";

  void (async () => {
    try {
      if (await handleApi(request, response, pathname)) return;

      if (pathname.startsWith("/stream/")) {
        const target = decodeProxyTarget(pathname.slice("/stream/".length));
        if (!target) {
          json(response, 400, { error: "invalid stream target" });
          return;
        }
        await service.proxy(request, response , target);
        return;
      }

      if (pathname === "/" || pathname === "/index.html") {
        if (apiOnly) {
          json(response, 200, { ok: true, page: "api-only" });
          return;
        }
        const html = renderPlayerPage({ baseUrl: "", presentation: "page" });
        response.statusCode = 200;
        response.setHeader("content-type", MIME[".html"]);
        response.setHeader("cache-control", "no-store");
        response.end(html);
        return;
      }

      if (pathname === "/hls.js") {
        const source = join(root, "node_modules/hls.js/dist/hls.light.min.js");
        const fallback = join(root, "node_modules/hls.js/dist/hls.min.js");
        sendFile(response, existsSync(source) ? source : fallback);
        return;
      }

      const asset = join(dist, pathname.replace(/^\/+/, ""));
      if (asset.startsWith(dist) && existsSync(asset) && statSync(asset).isFile()) {
        sendFile(response, asset);
        return;
      }

      json(response, 404, { error: `not found: ${pathname}` });
    } catch (error) {
      json(response, 502, { error: error instanceof Error ? error.message : String(error) });
    }
  })();
});

server.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`乔木电台预览：${url}${apiOnly ? " (api only)" : ""}`);
  console.log(`  目录接口 ${url}api/radio/catalog?mood=focus&source=radio-browser`);
});