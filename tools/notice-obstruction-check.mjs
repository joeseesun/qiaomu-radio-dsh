/**
 * Browser-driven obstruction check for `.radio-notice`.
 *
 * Why this is not a vitest test: happy-dom has no layout engine, so geometry
 * assertions in `tests/ui.*.test.ts` cannot see a notice covering a control —
 * `getBoundingClientRect()` is always 0 there. This probe supplies the browser
 * path instead.
 *
 * What it establishes, per viewport:
 *
 *   1. NEGATIVE — on the rendered page the notice covers no *page* control. The
 *      alert variant's own 「重试」 button sits inside the notice and is
 *      legitimately covered by it; it is reported separately (`own`), not as an
 *      obstruction.
 *   2. POSITIVE CONTROL — a real, visible control is appended inside the notice
 *      *before* the checker runs, and the checker must report it. Without this a
 *      `page: []` result is indistinguishable from a checker that never fires.
 *
 * Visibility is clip-aware: an element's rect is intersected with every
 * `overflow != visible` ancestor. A plain rect test counts playlist rows
 * scrolled out of `.playlist-scroll` as "covered" when they are really clipped
 * (reproduced: deck at wide reports 2 false hits without this).
 *
 * The viewport matters and is set explicitly. The harness's default headless
 * window is ~756x469, in which the notice renders *below the fold* (y=709) and
 * a correct checker rightly skips it as off-screen — an "obstruction" measured
 * there would be meaningless. Both a wide and a narrow viewport are checked.
 *
 * The checker is *byte-extracted* from `tools/capture-skins.mjs` between the
 * `@obstruction-check:start/end` markers, so this exercises the shipped logic
 * rather than a re-typed copy that could drift from it.
 *
 * Usage: node tools/notice-obstruction-check.mjs <cdp-port> <player-url>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const [port, url] = process.argv.slice(2);
if (!port || !url) {
  console.error("usage: node tools/notice-obstruction-check.mjs <cdp-port> <player-url>");
  process.exit(1);
}

const VIEWPORTS = [
  { id: "wide", width: 1280, height: 860, mobile: false },
  { id: "narrow", width: 420, height: 900, mobile: true },
];

const root = join(fileURLToPath(import.meta.url), "..", "..");
const tool = readFileSync(join(root, "tools/capture-skins.mjs"), "utf8");
const start = tool.indexOf("/* @obstruction-check:start");
const end = tool.indexOf("/* @obstruction-check:end */");
if (start < 0 || end < 0) throw new Error("obstruction-check markers not found in tools/capture-skins.mjs");
const CHECKER = tool.slice(tool.indexOf("\n", start) + 1, end).trim();

const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.on("message", (d) => {
  const m = JSON.parse(String(d));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise((r) => ws.once("open", r));
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const value = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Runtime.enable");

const PREAMBLE = "const document = globalThis.document, getComputedStyle = globalThis.getComputedStyle, window = globalThis.window;";

/** Click the skin picker until a notice is on screen (status or alert). */
const ensureNotice = async () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await value("!!document.querySelector('.radio-notice')")) return true;
    await value("document.querySelector('[aria-label=\"切换主题\"]')?.click()");
    await wait(500);
    await value("[...document.querySelectorAll('.theme-picker button')].find((b) => (b.textContent || '').includes('极简'))?.click()");
    await wait(1500);
  }
  return !!(await value("!!document.querySelector('.radio-notice')"));
};

const results = [];
for (const viewport of VIEWPORTS) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 2,
    mobile: viewport.mobile,
  });
  await wait(1400);

  if (!(await ensureNotice())) {
    results.push({ viewport: viewport.id, ok: false, reason: "no .radio-notice appeared" });
    continue;
  }

  /* Variant and measurement come from ONE evaluation: the alert is not stable
   * (the autoplay retry sequence clears it), so reading them separately races. */
  const asRendered = await value(`(() => {
    ${PREAMBLE}
    ${CHECKER}
    const el = document.querySelector('.radio-notice');
    const rect = clippedRect(el);
    return {
      ...JSON.parse(JSON.stringify(obstruction)),
      variant: el.classList.contains('has-error') ? 'alert' : 'status',
      noticeBox: [Math.round(rect.left), Math.round(rect.top), Math.round(rect.right), Math.round(rect.bottom)],
      onScreen: rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0,
      viewport: [window.innerWidth, window.innerHeight],
    };
  })()`);

  /* The probe control is appended BEFORE the checker expression so the checker's
   * IIFE (which snapshots the control list at its own definition) can see it.
   * Fixed positioning taken from the notice's own rect lands inside it by
   * construction; "absolute" would resolve against a distant ancestor instead. */
  const positive = await value(`(() => {
    ${PREAMBLE}
    const notice = document.querySelector('.radio-notice');
    const r = notice.getBoundingClientRect();
    const probe = document.createElement('button');
    probe.type = 'button';
    probe.setAttribute('aria-label', 'PROBE-CONTROL');
    probe.textContent = 'PROBE-CONTROL';
    probe.style.cssText = 'position:fixed;left:' + (r.left + 4) + 'px;top:' + (r.top + 4) + 'px;width:60px;height:20px;opacity:0.01;';
    notice.appendChild(probe);
    ${CHECKER}
    const result = JSON.parse(JSON.stringify(obstruction));
    probe.remove();
    return { ...result, probeSeen: result.own.includes('PROBE-CONTROL') || result.page.includes('PROBE-CONTROL') };
  })()`);

  const noPageHit = (asRendered?.page?.length ?? -1) === 0;
  const sawControls = (asRendered?.controls ?? 0) > 0;
  const controlFires = positive?.probeSeen === true;
  const onScreen = asRendered?.onScreen === true;
  results.push({
    viewport: viewport.id,
    ok: noPageHit && sawControls && controlFires && onScreen,
    variant: asRendered?.variant,
    checks: { onScreen, sawControls, noPageHit, controlFires },
    asRendered,
    positiveControl: positive,
  });
}

const ok = results.every((entry) => entry.ok);
console.log(JSON.stringify({
  ok,
  results,
  verdict: ok
    ? "checker fires on a real overlap, and the rendered notice covers no page control (wide + narrow)"
    : "NOT PROVEN — see the per-viewport checks",
}, null, 1));

ws.close();
await fetch(`http://127.0.0.1:${port}/json/close/${created.id}`);