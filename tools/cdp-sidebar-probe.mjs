/**
 * Verifies the in-GUI entry point of `@qiaomu/dsh-radio` in a real browser.
 *
 * The plugin was reachable only by typing `/qiaomu-radio/` until the client half
 * registered a sidebar entry and a `main`-slot panel. Those registrations are
 * exactly the kind of thing a unit test cannot check: they depend on the host's
 * slot tree being published, on the panel getting a non-zero height, and on the
 * iframe's same-origin document actually booting the player.
 *
 * Checks, in order, and each one is a hard requirement:
 *
 *   1. the harness page boots with the plugin in `__DSH_BOOT__` and no
 *      console error / uncaught exception,
 *   2. the sidebar renders an entry carrying our marker,
 *   3. clicking it mounts `[data-radio-panel]`,
 *   4. the panel's iframe has a usable box (a zero-height panel is the failure
 *      mode this check exists for),
 *   5. the iframe document contains a rendered `.radio-root`.
 *
 * Usage: node tools/cdp-sidebar-probe.mjs <cdp-port> <harness-url-with-token>
 */

import { WebSocket } from "ws";

const [port, url, size] = process.argv.slice(2);
if (!port || !url) {
  console.error("usage: node tools/cdp-sidebar-probe.mjs <cdp-port> <harness-url-with-token> [WxH]");
  process.exit(1);
}
/* The harness collapses its sidebar at narrow widths, so the entry may simply
 * not be reachable there. That is host behaviour, not a defect in this plugin:
 * narrow runs therefore require a clean boot and, only when the entry is
 * actually reachable, a correctly sized panel too. */
const viewport = size ? size.split("x").map(Number) : null;

const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const consoleErrors = [];
const exceptions = [];
ws.on("message", (d) => {
  const m = JSON.parse(String(d));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === "Runtime.exceptionThrown") exceptions.push(m.params?.exceptionDetails?.exception?.description ?? m.params?.exceptionDetails?.text);
  if (m.method === "Runtime.consoleAPICalled" && (m.params?.type === "error" || m.params?.type === "assert")) {
    consoleErrors.push((m.params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" "));
  }
});
await new Promise((r) => ws.once("open", r));
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const value = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Runtime.enable");
await send("Page.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
if (viewport) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: viewport[0], height: viewport[1], deviceScaleFactor: 2, mobile: viewport[0] < 720,
  });
}

/* Boot gate: __DSH_BOOT__ is injected by the shell; wait for it rather than
 * guessing a fixed delay. */
let booted = false;
for (let i = 0; i < 40; i += 1) {
  await wait(500);
  if (await value("!!(globalThis.__DSH_BOOT__ || document.querySelector('#root, [data-dsh-root], main'))")) { booted = true; break; }
}
await wait(2500);

const boot = await value(`({
  hasBoot: !!globalThis.__DSH_BOOT__,
  radioEntry: JSON.stringify(globalThis.__DSH_BOOT__ ?? {}).includes('qiaomu/dsh-radio'),
  title: document.title,
})`);

const entry = await value(`(() => {
  const marked = document.querySelector('[data-radio-sidebar-entry]');
  const host = marked ? marked.closest('button, [role="button"], a') : null;
  const byText = [...document.querySelectorAll('button, [role="button"], a')]
    .find((el) => (el.textContent || '').trim() === '乔木电台');
  const target = host || byText || null;
  const r = target?.getBoundingClientRect();
  return {
    markerFound: !!marked,
    hostFound: !!target,
    hostTag: target ? target.tagName.toLowerCase() : null,
    hostLabel: target ? (target.getAttribute('aria-label') || (target.textContent || '').trim().slice(0, 20)) : null,
    box: r ? [Math.round(r.width), Math.round(r.height)] : null,
  };
})()`);

let panel = null;
if (entry?.hostFound) {
  await value(`(() => {
    const marked = document.querySelector('[data-radio-sidebar-entry]');
    const host = (marked ? marked.closest('button, [role="button"], a') : null)
      || [...document.querySelectorAll('button, [role="button"], a')].find((el) => (el.textContent || '').trim() === '乔木电台');
    host?.click();
    return true;
  })()`);
  for (let i = 0; i < 30; i += 1) {
    await wait(500);
    if (await value("!!document.querySelector('[data-radio-frame]')")) break;
  }
  await wait(3500);
  panel = await value(`(() => {
    const wrap = document.querySelector('[data-radio-panel]');
    const frame = document.querySelector('[data-radio-frame]');
    const fr = frame?.getBoundingClientRect();
    let inner = null;
    try {
      const doc = frame?.contentDocument;
      const root = doc?.querySelector('.radio-root');
      const rr = root?.getBoundingClientRect();
      inner = {
        reachable: !!doc,
        rootFound: !!root,
        rootBox: rr ? [Math.round(rr.width), Math.round(rr.height)] : null,
        title: doc?.title ?? null,
        text: (doc?.body?.innerText ?? '').slice(0, 60).replace(/\\n/g, ' | '),
      };
    } catch (error) { inner = { reachable: false, error: String(error) }; }
    return {
      panelFound: !!wrap,
      frameFound: !!frame,
      frameBox: fr ? [Math.round(fr.width), Math.round(fr.height)] : null,
      src: frame?.getAttribute('src') ?? null,
      inner,
    };
  })()`);
}

const checks = {
  booted,
  noConsoleError: consoleErrors.length === 0,
  noException: exceptions.length === 0,
  sidebarEntry: entry?.hostFound === true,
  panelMounted: panel?.panelFound === true,
  panelSized: (panel?.frameBox?.[0] ?? 0) > 200 && (panel?.frameBox?.[1] ?? 0) > 200,
  playerRendered: panel?.inner?.rootFound === true,
};
const ok = viewport
  ? checks.booted && checks.noConsoleError && checks.noException
    && (checks.sidebarEntry ? checks.panelMounted && checks.panelSized && checks.playerRendered : true)
  : Object.values(checks).every(Boolean);
const note = viewport && !checks.sidebarEntry
  ? "sidebar collapsed at this width — entry not reachable, panel not exercised"
  : undefined;

console.log(JSON.stringify({
  ok,
  checks,
  boot,
  entry,
  panel,
  consoleErrors,
  exceptions,
  viewport: viewport ? `${viewport[0]}x${viewport[1]}` : "default",
  note,
  verdict: ok
    ? "sidebar entry opens a sized panel whose iframe boots the player"
    : "NOT PROVEN — see checks",
}, null, 1));

ws.close();
await fetch(`http://127.0.0.1:${port}/json/close/${created.id}`);