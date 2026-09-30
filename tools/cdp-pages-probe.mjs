/** Exercise every screen page and the persist/like/history flows on a running player. */
import { WebSocket } from "ws";

const port = process.argv[2] ?? "9226";
const url = process.argv[3];
if (!url) { console.error("usage: node tools/cdp-pages-probe.mjs <cdp-port> <player-url>"); process.exit(1); }

const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.on("message", (d) => { const m = JSON.parse(String(d)); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
await new Promise((r) => ws.once("open", r));
const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Runtime.enable");
await evaluate(`localStorage.clear()`);
await wait(2500);

const click = async (pattern, ms = 500) => {
  const hit = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => ${pattern}.test(x.textContent || '') || ${pattern}.test(x.getAttribute('aria-label') || ''));
    if (!b) return null; b.click(); return (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 20);
  })()`);
  await wait(ms);
  return hit;
};
const page = () => evaluate(`document.querySelector('.skin-screen')?.dataset.page ?? null`);

const report = { pages: {}, steps: [] };
const goMenu = async () => { await click(`/打开菜单|open menu/i`); return page(); };
report.initial = await page();

// 1. every menu destination reachable
await goMenu();
report.pages.menu = await page();
const entries = await evaluate(`[...document.querySelectorAll('.skin-screen button')].map(b => (b.textContent || '').trim()).filter(Boolean)`);
report.steps.push({ menu: entries });
for (const label of ["正在播放", "频道", "地区电台", "电台列表", "搜索电台", "喜欢的电台", "最近收听", "语言", "关于", "支持"]) {
  const before = await page();
  if (before !== "menu") await goMenu();
  const hit = await click(`/${label}/`, 700);
  report.pages[label] = { reached: hit, page: await page() };
  // back out to the menu again
  await click(`/返回|back/i`, 300);
}

// 2. like + history after a real play
await goMenu();
await click(`/电台列表|stations|全球精选/i`, 900);
const station = await click(`/./`, 0);
report.steps.push({ stationPicked: station });
await wait(2500);
const liked = await click(`/喜欢|like|heart/i`, 600);
report.steps.push({ liked, page: await page() });
const stored = await evaluate(`({
  liked: JSON.parse(localStorage.getItem('qiaomu-radio-profile-v1') || '{}')?.liked?.length ?? null,
  history: JSON.parse(localStorage.getItem('qiaomu-radio-profile-v1') || '{}')?.history?.length ?? null,
  keys: Object.keys(localStorage)
})`);
report.profile = stored;
console.log(JSON.stringify(report, null, 1));
ws.close();
