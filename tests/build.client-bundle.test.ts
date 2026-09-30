/**
 * Locks the two client-bundle contracts discovered by activating this plugin in
 * a real harness GUI:
 *
 *  1. The harness serves `./client` as a CLASSIC script and evaluates it, so the
 *     bundle must register itself through `window.__ModuleLoader__.load({id,
 *     factory})`. A plain ESM bundle fails with "Cannot use import statement
 *     outside a module" and the entry never activates.
 *  2. The factory is called with `require` as its parameter, and only that
 *     argument reaches the harness module table. An esbuild IIFE body instead
 *     resolves a global `require` and dies with `Dynamic require of "react" is
 *     not supported` — the failure mode this plugin actually shipped until the
 *     client half started importing something.
 *
 * The bundle is also asserted to stay `react`-only, which is this repository's
 * own constraint (AGENTS.md), not a limitation of the platform.
 *
 * The bundle is rebuilt here through the same helper the release build uses, so
 * this test cannot pass against a stale `lib/client.js`.
 */

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain ESM build helper, no declarations needed here
import { bundleClientHalf, wrapClientBundle } from "../scripts/client-bundle.mjs";

const root = join(fileURLToPath(import.meta.url), "..", "..");

describe("client bundle format", () => {
  it("registers itself with the harness module loader", async () => {
    const bundle = await bundleClientHalf({ root, minify: false, write: false });
    expect(bundle).toBeTypeOf("string");
    expect(bundle).toContain("window.__ModuleLoader__.load(");
    expect(bundle).toContain('id: "@qiaomu/dsh-radio"');
    expect(bundle).toContain("factory:");
    expect(bundle).not.toMatch(/^\s*import\s/m);
  });

  it("exports the cordis activation contract", async () => {
    const bundle = (await bundleClientHalf({ root, minify: false, write: false })) as string;
    expect(bundle).toContain("apply:");
    expect(bundle).toContain("inject:");
  });

  it("stays react-only, which is this repository's own rule", async () => {
    const bundle = (await bundleClientHalf({ root, minify: false, write: false })) as string;
    expect(bundle).not.toContain("react-dom");
    expect(bundle).not.toMatch(/import\s*\(/);
  });

  it("hands the factory the module table as its require parameter", async () => {
    const bundle = (await bundleClientHalf({ root, minify: false, write: false })) as string;
    /* The bug this locks out: an `iife` body makes esbuild resolve a *global*
     * require and every import dies with `Dynamic require of "<spec>" is not
     * supported`. The factory must take require as its parameter and return a
     * CommonJS exports object. */
    expect(bundle).toMatch(/factory:\s*\(require\)\s*=>/);
    expect(bundle).toContain("var module = { exports: {} };");
    expect(bundle).toContain("return module.exports;");
    expect(bundle).toMatch(/require\(["']react["']\)/);
  });

  it("uses the same envelope for any entry id", () => {
    const wrapped = wrapClientBundle("module.exports = { ok: true };", "example/pkg");
    expect(wrapped).toContain('id: "example/pkg"');
    expect(wrapped).toContain("factory: (require) => {");
    expect(wrapped).toContain("return module.exports;");
  });
});
