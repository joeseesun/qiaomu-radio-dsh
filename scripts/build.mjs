/** Artifact set produced by this script (see also `README.md`). */
/**
 * One build entry for every artifact:
 *
 *   lib/index.js              host half (ESM, Node 20+)
 *   lib/client.js             client half, wrapped in the harness's lazy-CJS
 *                             `window.__ModuleLoader__.load({ id, factory })`
 *                             registration (see `wrapClientBundle`)
 *   lib/player/app.js         standalone player page bundle
 *   lib/player/styles.css     player stylesheet
 *   lib/player/hls.js         lazy hls.js runtime
 *   lib/types/**              declarations for the host half
 *
 * `--dev` additionally emits an unminified bundle so `npm run preview` iterates
 * quickly.
 */

import { build } from "esbuild";
import { bundleClientHalf as buildClientHalf } from "./client-bundle.mjs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dev = process.argv.includes("--dev");

/** Concatenate every stylesheet the UI team ships, in a stable order. */
async function collectCss() {
  const { readdir } = await import("node:fs/promises");
  const directory = join(root, "styles");
  if (!existsSync(directory)) return "";
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".css"))
    .sort((left, right) => {
      const order = (name) => (name === "index.css" ? 0 : name === "tokens.css" ? 1 : 2);
      return order(left) - order(right) || left.localeCompare(right);
    });
  const parts = [];
  for (const name of names) {
    parts.push(`/* ${name} */\n${await readFile(join(directory, name), "utf8")}`);
  }
  return parts.join("\n");
}

async function bundlePlayer() {
  // The standalone page entry doubles as the preview entry: same code path, so
  // what the preview verifies is exactly what ships.
  const entry = join(root, "preview/player/main.ts");
  if (!existsSync(entry)) {
    console.warn("player entry missing, skipping standalone bundle");
    return;
  }
  await build({
    entryPoints: [entry],
    outfile: join(root, "lib/player/app.js"),
    bundle: true,
    format: "esm",
    target: ["es2022"],
    platform: "browser",
    minify: !dev,
    sourcemap: dev,
    legalComments: "none",
    define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
  });
}

async function bundleHls() {
  const entry = join(root, "node_modules/hls.js/dist/hls.light.min.js");
  const fallback = join(root, "node_modules/hls.js/dist/hls.min.js");
  const source = existsSync(entry) ? entry : fallback;
  if (!existsSync(source)) return;
  await cp(source, join(root, "lib/player/hls.js"));
}

/**
 * Ship the 3D assets (the fantasy GLB plus the loading rune) under the plugin's
 * own asset prefix.
 *
 * `assets/` is the source of truth; only the copy under `lib/player/` is served,
 * and `lib/player/**` is what `files` publishes. `.glb` / `.png` already have MIME
 * entries and a cache policy in `src/dsh/routes.ts`.
 */
async function bundleAssets() {
  const source = join(root, "assets");
  if (!existsSync(source)) return;
  await cp(source, join(root, "lib/player"), { recursive: true });
}

async function bundleHostHalf() {
  await build({
    entryPoints: [join(root, "src/dsh/index.ts")],
    outfile: join(root, "lib/index.js"),
    bundle: true,
    format: "esm",
    target: ["node20"],
    platform: "node",
    minify: false,
    sourcemap: dev,
    external: ["@deepseek-ai/cordis"],
  });
}

async function emitStyles() {
  const css = await collectCss();
  await writeFile(join(root, "lib/player/styles.css"), css || "/* no styles yet */\n", "utf8");
}

async function emitTypes() {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const run = promisify(execFile);
  const tsc = join(root, "node_modules/typescript/bin/tsc");
  if (!existsSync(tsc)) return;
  await run(process.execPath, [
    tsc,
    "-p",
    join(root, "tsconfig.host.json"),
    "--outDir",
    join(root, "lib/types"),
    "--declaration",
    "--noEmit",
    "false",
  ]);
}

async function main() {
  await rm(join(root, "lib"), { recursive: true, force: true });
  await mkdir(join(root, "lib/player"), { recursive: true });
  await emitStyles();
  await bundleHostHalf();
  await bundlePlayer();
  await bundleHls();
  await bundleAssets();
  await buildClientHalf({ root, minify: !dev });
  await emitTypes();
  console.log(`built ${dev ? "dev" : "release"} artifacts into lib/`);
}

await main();