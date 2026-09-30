/**
 * Guards the *reachability* half of the client bundle.
 *
 * The plugin used to be a no-op client half with no harness entry point, so the
 * only way to reach the player was to type `/qiaomu-radio/` by hand. That is
 * indistinguishable from "not installed" to anyone using the GUI, so the
 * sidebar entry and the panel registration are now part of the contract.
 *
 * Asserts against a freshly built bundle (not `lib/client.js`), so it cannot
 * pass against a stale artifact, and re-asserts the repository's rule that the
 * client bundle depends on `react` only.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// @ts-expect-error -- plain ESM build helper, no declarations needed here
import { bundleClientHalf } from "../scripts/client-bundle.mjs";

import { PLAYER_PATH } from "../src/core/mount";
import { ROUTE_PREFIX } from "../src/dsh/routes";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const bundle = (await bundleClientHalf({ root, minify: false, write: false })) as string;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dsh?: { client?: { inject?: string[] } };
};

describe("client half reachability", () => {
  it("registers both the panel and the sidebar entry", () => {
    expect(bundle).toContain("sidebar.panellist");
    expect(bundle).toContain('"main"');
    expect(bundle).toContain("qiaomu-radio");
    /* esbuild emits non-ASCII as \uXXXX escapes, so the label is asserted in
     * its emitted form — the literal "乔木电台" never appears in the bundle. */
    expect(bundle).toContain("\\u4E54\\u6728\\u7535\\u53F0");
    expect(bundle).toContain("label:");
  });

  it("declares the client package that owns the sidebar slot", () => {
    expect(pkg.dsh?.client?.inject).toContain("@deepseek-ai/dsh-client-ui-sidebar");
  });

  it("embeds the player page at the host's actual mount point", () => {
    /* The path stays a template string in the bundle, so assert the pieces:
     * the mount literal, the join, and that the iframe reads it. */
    expect(bundle).toContain('"/qiaomu-radio"');
    expect(bundle).toContain("PLAYER_PATH");
    expect(bundle).toContain('"iframe"');
    expect(bundle).toContain("autoplay");
    expect(PLAYER_PATH).toBe(`${ROUTE_PREFIX}/`);
  });

  it("still never reaches for react-dom", () => {
    expect(bundle).not.toContain("react-dom");
    expect(bundle).not.toMatch(/require\(["'](?!react["'])[^"']+["']\)/);
  });
});
