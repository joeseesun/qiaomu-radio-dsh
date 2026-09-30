/**
 * Bundle the preview player into `preview-dist/`, which `preview/server.mjs`
 * serves. Uses the same entry the standalone page uses, so what the preview
 * verifies is exactly what the plugin ships.
 */

import { build } from "esbuild";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dev = !process.argv.includes("--release");

async function collectCss() {
  const directory = join(root, "styles");
  if (!existsSync(directory)) return "/* styles/ is empty */\n";
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

await rm(join(root, "preview-dist"), { recursive: true, force: true });
await mkdir(join(root, "preview-dist"), { recursive: true });

await build({
  entryPoints: [join(root, "preview/player/main.ts")],
  outfile: join(root, "preview-dist/app.js"),
  bundle: true,
  format: "esm",
  target: ["es2022"],
  platform: "browser",
  minify: !dev,
  sourcemap: dev,
  legalComments: "none",
  define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
});

await writeFile(join(root, "preview-dist/styles.css"), await collectCss(), "utf8");

const hls = join(root, "node_modules/hls.js/dist/hls.light.min.js");
if (existsSync(hls)) await cp(hls, join(root, "preview-dist/hls.js"));

// The preview server imports the real host modules, which are TypeScript, so it
// is bundled too. It resolves everything relative to `preview-dist`.
await build({
  entryPoints: [join(root, "preview/server.mjs")],
  outfile: join(root, "preview-dist/server.mjs"),
  bundle: true,
  format: "esm",
  target: ["node20"],
  platform: "node",
  packages: "external",
  minify: false,
  sourcemap: dev,
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
});

console.log(`preview bundle ready (${dev ? "dev" : "release"})`);