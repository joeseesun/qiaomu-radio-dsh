/**
 * Build the client half (`lib/client.js`) in the harness's module-loader format.
 *
 * The harness serves each `dsh.client` entry's `./client` bundle as a CLASSIC
 * script and evaluates it. Getting the envelope wrong is silent until the
 * bundle actually imports something, so the exact contract matters:
 *
 *   - A plain ESM bundle is rejected with "Cannot use import statement outside
 *     a module".
 *   - The factory is called **with `require` as its parameter**
 *     (`factory: (require) => {…}`); that argument is the only route to the
 *     harness's CommonJS module table. An esbuild IIFE body instead resolves a
 *     global `require` through esbuild's `__require` shim and dies with
 *     `Dynamic require of "react" is not supported`.
 *   - The body must therefore be esbuild **cjs** output, returned as
 *     `module.exports`.
 *
 * Verified against the shipped bundles of `dsh-plugin-qiaomu-rss` and
 * `dsh-qiaomu-home`, which use exactly this shape.
 *
 * Kept in its own module so the tests that lock these contracts build the
 * bundle exactly the way the release build does, instead of trusting a stale
 * `lib/client.js`.
 *
 * @param {{ root: string, entry?: string, minify?: boolean, write?: boolean }} options
 *   `root` is the package root; `write` (default true) writes `lib/client.js`,
 *   otherwise the wrapped source is returned.
 * @returns {Promise<string | undefined>} the wrapped bundle when `write` is false
 */

import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const CLIENT_PLUGIN_ID = "@qiaomu/dsh-radio";

/** Wrap an esbuild CJS body in the harness module-loader envelope. */
export function wrapClientBundle(body, id = CLIENT_PLUGIN_ID) {
  const indented = body.replace(/^/gm, "\t\t");
  return `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(id)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

${indented}
\t\treturn module.exports;
\t}
});
`;
}

export async function bundleClientHalf(options) {
  const { root, entry = join(root, "src/client/plugin.ts"), minify = true, write = true } = options;
  if (!existsSync(entry)) return undefined;

  const result = await build({
    entryPoints: [entry],
    bundle: true,
    // `cjs` (not `iife`): externals must become `require(spec)` calls, which the
    // harness answers through the factory's own `require` parameter.
    format: "cjs",
    target: ["es2022"],
    platform: "browser",
    minify,
    sourcemap: false,
    write: false,
    // Only specs the harness exposes through its CommonJS module table.
    external: ["react", "react/jsx-runtime"],
  });

  const wrapped = wrapClientBundle(result.outputFiles[0].text);
  if (write) await writeFile(join(root, "lib/client.js"), wrapped, "utf8");
  return wrapped;
}