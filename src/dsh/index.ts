/**
 * DSH host half of the radio plugin.
 *
 * The package's Node entry is deliberately small: it builds the host-side radio
 * service, claims the plugin's HTTP routes on the web carrier, and exposes the
 * player URL to the harness. Everything else — catalog, stream proxying,
 * recommendation maths — lives in `src/host` and `src/core` and is unit-tested
 * without a harness.
 */

import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createRadioService } from "../host/catalog";
import { createMemoryTasteStore } from "../host/taste";
import { ROUTE_PREFIX, registerRadioRoutes, type WebServerLike } from "./routes";

/** Plugin config accepted from the profile patch layer. */
export type RadioPluginConfig = {
  /** Directory holding the built player. Defaults to `lib/player`. */
  assetDir?: string;
  /** Radio Browser mirrors to try, in order. */
  mirrors?: string[];
  /** Catalog cache lifetime in milliseconds. */
  catalogTtlMs?: number;
};

/** The slice of the Cordis context this plugin uses. */
export type RadioPluginContext = {
  webServer?: Partial<WebServerLike> & { register?: WebServerLike["register"] };
  logger?: { info(message: string): void; warn(message: string): void };
  effect?: (callback: () => void | (() => void), label?: string) => () => void;
};

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Where the built player bundle lives.
 *
 * The bundled entry is `lib/index.js` next to `lib/player`, but the same module
 * also runs straight from TypeScript source during development, where the
 * sibling is `src/dsh/player` and the build output sits two levels up. Both are
 * probed by existence rather than assumed.
 */
export function resolveAssetDirectory(configured?: string): string {
  if (configured) return configured;
  const candidates = [join(here, "player"), join(here, "..", "..", "lib", "player")];
  return candidates.find((candidate) => existsSync(candidate)) ?? join(here, "player");
}

/** Absolute URL of the player page inside the harness web server. */
export function playerUrl(webServer?: { host?: string; port?: number }): string {
  const host = webServer?.host === "0.0.0.0" ? "127.0.0.1" : webServer?.host || "127.0.0.1";
  const port = webServer?.port;
  const path = `${ROUTE_PREFIX}/`;
  return port ? `http://${host}:${port}${path}` : path;
}

/**
 * Cordis plugin entry. A host-only plugin: the browser surface is the player
 * page this half serves, so no `dsh.client` contribution is required.
 */
export function apply(ctx: RadioPluginContext, config: RadioPluginConfig = {}): void {
  const service = createRadioService({
    mirrors: config.mirrors,
    catalogTtlMs: config.catalogTtlMs,
    taste: createMemoryTasteStore(),
  });

  const webServer = ctx.webServer;
  if (webServer?.register) {
    const dispose = registerRadioRoutes(webServer as WebServerLike, {
      service,
      assetDir: resolveAssetDirectory(config.assetDir),
      assetPrefix: ROUTE_PREFIX,
    });
    ctx.effect?.(() => dispose, "qiaomu-radio routes");
    ctx.logger?.info(`qiaomu-radio: player served at ${playerUrl(webServer)}`);
    return;
  }

  ctx.logger?.warn(
    "qiaomu-radio: no web carrier in this composition; the player page is unavailable but catalog and taste keep working.",
  );
}

/** Cordis plugin metadata, mirroring the shipped package manifest. */
export const name = "@qiaomu/dsh-radio";
export const inject = ["webServer"];