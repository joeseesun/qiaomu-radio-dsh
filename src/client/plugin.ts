/**
 * Client half of `@qiaomu/dsh-radio` — the module behind `lib/client.js`.
 *
 * The harness composes `dsh.client` entries into `window.__DSH_BOOT__`, serves
 * each package's `./client` export as a CLASSIC script, and activates it with
 * the vendored cordis Loader. Two contracts follow from that, both enforced
 * here:
 *
 *  1. The bundle must register itself as
 *     `window.__ModuleLoader__.load({ id, factory })` (see
 *     `scripts/client-bundle.mjs`). A plain ESM bundle is rejected with
 *     "Cannot use import statement outside a module" and the entry never
 *     activates.
 *  2. `factory` is called **with `require` as its parameter**, and that argument
 *     is the only route to the harness module table (`react`, `react-dom`,
 *     `react-dom/client`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-ui-slots`,
 *     `@deepseek-ai/cordis`, …). Building the factory as an esbuild IIFE
 *     instead makes esbuild look for a *global* `require` and fail with
 *     `Dynamic require of "<spec>" is not supported` — a message that names the
 *     spec but is really about the envelope, which is how this plugin managed to
 *     ship a bundle that only worked while it imported nothing.
 *
 * This module stays free of `react-dom` by choice, not by platform limit: the
 * player is already a complete same-origin page, so the panel embeds it rather
 * than keeping a second React tree in the GUI (see `RadioPanel.ts`).
 *
 * This half's job is *reachability*: it registers the sidebar entry and the
 * panel that hosts the player, so the plugin is usable from inside the GUI
 * rather than only from a hand-typed URL.
 */

import type { ReactNode } from "react";

import { RadioPanel } from "./RadioPanel";
import { RadioSidebarEntry } from "./SidebarEntry";

/**
 * Panel id. The sidebar entry and the `main` slot page share it, which is how
 * the host knows which panel an entry selects.
 */
export const PANEL_ID = "qiaomu-radio";

/** Sidebar sort position, matching the neighbours of `dsh-plugin-qiaomu-rss`. */
const SIDEBAR_ORDER = 16;

/** Component shape the harness slot registry accepts. */
type SlotComponent = (props: never) => ReactNode;

/** Structural view of the harness `slots` service (`docs/CONTRACTS.md`). */
type SlotsLike = {
  inject(name: string, callback: () => unknown): void;
  register(options: Record<string, unknown>, component: SlotComponent): unknown;
};

type ClientContextLike = { slots: SlotsLike };

/** Services this client half needs: only the slot registry. */
export const inject: string[] = ["slots"];

/**
 * Client-half plugin body.
 *
 * Both registrations are deferred through `slots.inject` so they apply once the
 * host has published the slot — registering eagerly would race the sidebar and
 * silently drop the entry.
 */
export function apply(ctx: ClientContextLike): void {
  ctx.slots.inject("main", () =>
    ctx.slots.register({ name: "main", key: PANEL_ID }, RadioPanel as unknown as SlotComponent),
  );
  ctx.slots.inject("sidebar.panellist", () =>
    ctx.slots.register(
      { name: "sidebar.panellist", id: PANEL_ID, order: SIDEBAR_ORDER, label: "乔木电台" },
      RadioSidebarEntry as unknown as SlotComponent,
    ),
  );
}