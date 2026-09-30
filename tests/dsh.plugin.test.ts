import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { apply, inject, name, playerUrl, resolveAssetDirectory } from "../src/dsh/index";
import { ROUTE_PREFIX, type WebServerLike } from "../src/dsh/routes";

/** A Cordis-like context recording what the plugin claims and disposes. */
function fakeContext() {
  const routes: Array<{ kind: string; path: string }> = [];
  const logs: string[] = [];
  const warnings: string[] = [];
  const effects: Array<() => void> = [];
  let disposed = false;
  const ctx = {
    webServer: {
      host: "127.0.0.1",
      port: 4321,
      register(route: { kind: "exact" | "prefix"; path: string }) {
        routes.push({ kind: route.kind, path: route.path });
        return () => {
          const at = routes.findIndex((item) => item.path === route.path && item.kind === route.kind);
          if (at >= 0) routes.splice(at, 1);
        };
      },
    } as unknown as WebServerLike,
    logger: {
      info: (message: string) => logs.push(message),
      warn: (message: string) => warnings.push(message),
    },
    effect(callback: () => void | (() => void)) {
      const cleanup = callback();
      if (typeof cleanup === "function") effects.push(cleanup);
      return () => {
        disposed = true;
        cleanup?.();
      };
    },
  };
  return {
    ctx,
    routes,
    logs,
    warnings,
    effects,
    get disposed() {
      return disposed;
    },
  };
}

describe("dsh plugin entry", () => {
  it("declares the web carrier and its own name", () => {
    expect(name).toBe("@qiaomu/dsh-radio");
    expect(inject).toContain("webServer");
  });

  it("claims the player routes and logs the player URL", () => {
    const harness = fakeContext();
    const directory = mkdtempSync(join(tmpdir(), "radio-plugin-"));
    writeFileSync(join(directory, "app.js"), "export {};\n", "utf8");
    apply(harness.ctx as never, { assetDir: directory });

    expect(harness.routes.map((route) => `${route.kind}:${route.path}`).sort()).toEqual(
      [`exact:${ROUTE_PREFIX}`, `exact:${ROUTE_PREFIX}/`, `prefix:${ROUTE_PREFIX}`].sort(),
    );
    expect(harness.logs.join(" ")).toContain(`http://127.0.0.1:4321${ROUTE_PREFIX}/`);
    expect(harness.warnings).toHaveLength(0);
  });

  it("mounts outside the harness's reserved /plugins namespace", () => {
    // dsh-client-modules owns a PREFIX route on /plugins and 404s every
    // non-bundle sub-path, silently shadowing any carrier mounted below it.
    expect(ROUTE_PREFIX.startsWith("/plugins")).toBe(false);
    expect(ROUTE_PREFIX).toMatch(/^\/[a-z0-9-]+$/);
  });

  it("releases every route when its effect is disposed", () => {
    const harness = fakeContext();
    apply(harness.ctx as never, { assetDir: join(tmpdir(), "radio-plugin-none") });
    expect(harness.routes).toHaveLength(3);
    harness.effects.forEach((cleanup) => cleanup());
    expect(harness.routes).toHaveLength(0);
  });

  it("warns instead of throwing when the composition has no web carrier", () => {
    const logs: string[] = [];
    const warnings: string[] = [];
    const ctx = {
      logger: { info: (message: string) => logs.push(message), warn: (message: string) => warnings.push(message) },
    };
    expect(() => apply(ctx as never, {})).not.toThrow();
    expect(warnings.join(" ")).toContain("no web carrier");
    expect(logs).toHaveLength(0);
  });

  it("registers the routes only once even when apply runs twice for different contexts", () => {
    const first = fakeContext();
    const second = fakeContext();
    apply(first.ctx as never, { assetDir: join(tmpdir(), "radio-a") });
    apply(second.ctx as never, { assetDir: join(tmpdir(), "radio-b") });
    expect(first.routes).toHaveLength(3);
    expect(second.routes).toHaveLength(3);
  });
});

describe("plugin helpers", () => {
  it("finds the built player bundle and honours an explicit override", () => {
    // From source the build output is two levels up; from `lib/index.js` it is a sibling.
    expect(resolveAssetDirectory()).toMatch(/(?:lib[\\/]player|src[\\/]dsh[\\/]player)$/);
    expect(resolveAssetDirectory("/tmp/custom")).toBe("/tmp/custom");
  });

  it("builds a loopback URL and never exposes 0.0.0.0", () => {
    expect(playerUrl({ host: "127.0.0.1", port: 5000 })).toBe(`http://127.0.0.1:5000${ROUTE_PREFIX}/`);
    expect(playerUrl({ host: "0.0.0.0", port: 5000 })).toBe(`http://127.0.0.1:5000${ROUTE_PREFIX}/`);
    expect(playerUrl()).toBe(`${ROUTE_PREFIX}/`);
  });
});

describe("plugin wiring smoke", () => {
  it("never touches the network while activating", () => {
    const doFetch = vi.fn(() => {
      throw new Error("activation must not fetch");
    });
    const original = globalThis.fetch;
    globalThis.fetch = doFetch as never;
    try {
      const harness = fakeContext();
      apply(harness.ctx as never, { assetDir: join(tmpdir(), "radio-plugin-none") });
      expect(doFetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });
});