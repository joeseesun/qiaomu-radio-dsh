import { WebSocket } from "ws";
const port = process.argv[2] ?? "9226";
const url = process.argv[3];
const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.on("message", (d) => { const m = JSON.parse(String(d)); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
await new Promise((r) => ws.once("open", r));
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 2, mobile: false });
await evaluate(`localStorage.clear()`); await new Promise((r) => setTimeout(r, 2500));
await evaluate(`document.querySelectorAll('button[aria-label="打开菜单"]')[0]?.click()`); await new Promise((r) => setTimeout(r, 300));
await evaluate(`[...document.querySelectorAll('.skin-screen button')].find(b=>/频道/.test(b.textContent))?.click()`); await new Promise((r) => setTimeout(r, 300));
await evaluate(`[...document.querySelectorAll('.skin-screen button')].find(b=>/爵士时刻/.test(b.textContent))?.click()`); await new Promise((r) => setTimeout(r, 900));
// switch to console skin
await evaluate(`document.querySelector('.theme-trigger')?.click()`); await new Promise((r) => setTimeout(r, 250));
const labels = await evaluate(`[...document.querySelectorAll('.theme-picker button')].map(b => (b.textContent||'').trim().slice(0,16))`);
console.log('theme options:', JSON.stringify(labels));
await evaluate(`[...document.querySelectorAll('.theme-picker button')].find(b=>/winamp/i.test(b.textContent))?.click()`); await new Promise((r) => setTimeout(r, 900));
// Return to the device screen: the console playlist role lives on the `now` page.
await evaluate(`document.querySelector('button[aria-label="返回"], button[aria-label="Back"]')?.click()`);
await new Promise((r) => setTimeout(r, 500));
await evaluate(`[...document.querySelectorAll('.skin-screen button')].find(b=>/正在播放/.test(b.textContent))?.click()`);
await new Promise((r) => setTimeout(r, 900));
const out = await evaluate(`(() => {
  const pl = document.querySelector('.classic-playlist');
  const stage = document.querySelector('.radio-stage');
  const root = document.querySelector('.radio-root');
  const sc = document.querySelector('.classic-playlist .playlist-scroll') || document.querySelector('.playlist-scroll');
  if (!pl) return { theme: document.querySelector('.radio-root')?.dataset.theme, page: document.querySelector('.skin-screen')?.dataset.page, missing: true };
  const r = pl.getBoundingClientRect(), s = sc.getBoundingClientRect();
  const cs = getComputedStyle(pl);
  return { cls: pl.className, pl: [Math.round(r.width), Math.round(r.height), Math.round(r.left), Math.round(r.top)], scroll: Math.round(s.height), overflow: cs.overflow, page: pl.dataset.page,
    viewport: [window.innerWidth, window.innerHeight], stage: stage ? [Math.round(stage.getBoundingClientRect().width), Math.round(stage.getBoundingClientRect().height)] : null, compact: root?.dataset.compact ?? null };
})()`);
console.log(JSON.stringify(out));
ws.close();
