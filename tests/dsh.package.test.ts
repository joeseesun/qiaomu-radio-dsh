/**
 * Guards the *shipped* package metadata, which no runtime test touches.
 *
 * Two defects this locks out, both of which had actually landed in the tree:
 *
 *  1. `dsh-plugin.json` still advertised the old `/plugins/@qiaomu/dsh-radio/…`
 *     routes after the plugin moved to `/qiaomu-radio` — a manifest that lies
 *     about where the plugin lives is worse than no manifest, and it was in
 *     `files`, so it shipped.
 *  2. A plugin whose host half imports nothing but Node builtins must not carry
 *     `hls.js` / `ws` as runtime dependencies: the profile install would try to
 *     fetch them for no reason. They are build- and tool-time only.
 *
 * The bundle-patch assertions matter because a plugin is only *reachable* after
 * startup if the profile lists it in `dsh.profile.bundles` AND the package
 * declares the patch that inserts it — the harness will not discover a bare
 * dependency on its own.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ROUTE_PREFIX } from "../src/dsh/routes";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  name: string;
  files: string[];
  dependencies?: Record<string, string>;
  dsh?: { bundle?: { patch?: string } };
};
const manifest = JSON.parse(readFileSync(join(root, "dsh-plugin.json"), "utf8")) as {
  id: string;
  routes: Array<{ method: string; path: string; purpose: string }>;
};

describe("shipped package metadata", () => {
  it("advertises the routes the plugin actually registers", () => {
    expect(manifest.id).toBe(pkg.name);
    expect(manifest.routes.length).toBeGreaterThan(0);
    for (const route of manifest.routes) {
      expect(route.path, `route ${route.path} must live under the mount point`).toMatch(
        new RegExp(`^${ROUTE_PREFIX}(/|$)`),
      );
      expect(route.purpose.trim().length).toBeGreaterThan(0);
    }
  });

  it("declares the bundle patch that makes the plugin reachable", () => {
    expect(pkg.dsh?.bundle?.patch).toBe("./cordis.patch.yml");
    const patchPath = join(root, pkg.dsh!.bundle!.patch!);
    expect(existsSync(patchPath)).toBe(true);
    const patch = readFileSync(patchPath, "utf8");
    expect(patch).toContain("insert:");
    expect(patch).toContain(pkg.name);
    expect(pkg.files, "the patch must ship, or the profile cannot apply it").toContain(
      pkg.dsh!.bundle!.patch!.replace("./", ""),
    );
  });

  it("keeps build- and tool-only libraries out of runtime dependencies", () => {
    const runtime = Object.keys(pkg.dependencies ?? {});
    expect(runtime).not.toContain("hls.js");
    expect(runtime).not.toContain("ws");
  });
});