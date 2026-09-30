import { WebSocket } from "ws";
const port = process.argv[2] ?? "9226";
const base = process.argv[3] ?? "http://127.0.0.1:4190/qiaomu-radio/";
const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`, { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const net = [];
ws.on("message", (d) => { const m = JSON.parse(String(d));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === "Network.responseReceived") net.push(`${m.params.response.status} ${m.params.response.url}`);
});
await new Promise((r) => ws.once("open", r));
const send = (method, params={}) => new Promise((res) => { const n=++id; pending.set(n,res); ws.send(JSON.stringify({id:n,method,params})); });
const evaluate = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await send("Runtime.enable"); await send("Network.enable");
await evaluate(`localStorage.clear()`);
await wait(2500);
const snapshot = async (label) => {
  const s = await evaluate(`({
    page: document.querySelector('.skin-screen')?.dataset.page,
    menus: [...document.querySelectorAll('button[aria-label="打开菜单"]')].length,
    rows: [...document.querySelectorAll('.skin-screen button')].map(b => (b.textContent||'').replace(/\\s+/g,' ').trim().slice(0,22)).slice(0,9)
  })`);
  console.log('--- ' + label + ': page=' + s.page + ' menuBtns=' + s.menus);
  console.log('    rows:', s.rows.join(' | '));
  return s;
};
await snapshot('initial');
await evaluate(`document.querySelector('button[aria-label="打开菜单"]')?.click()`);
await wait(400);
await snapshot('after-menu');
await evaluate(`[...document.querySelectorAll('.skin-screen button')].find(b => /频道/.test(b.textContent||''))?.click()`);
await wait(500);
await snapshot('after-channels');
await evaluate(`[...document.querySelectorAll('.skin-screen button')].find(b => /中国/.test(b.textContent||''))?.click()`);
await wait(3000);
await snapshot('after-china-pick');
await evaluate(`[...document.querySelectorAll('.skin-screen button')].find(b => /央广中国之声/.test(b.textContent||''))?.click()`);
await wait(9000);
const final = await evaluate(`({ page: document.querySelector('.skin-screen')?.dataset.page, state: document.querySelector('.radio-root')?.dataset.state, theme: document.querySelector('.radio-root')?.dataset.theme, text: (document.querySelector('.skin-screen')?.textContent||'').replace(/\\s+/g,' ').slice(0,80), hls: typeof window.Hls, hlsSrc: document.querySelector('script[data-hls-runtime]')?.src ?? null, audio: (document.querySelector('audio')?.currentSrc||'').slice(0,60) })`);
console.log('--- final:', JSON.stringify(final));
console.log('--- media requests:');
for (const r of net.filter(x => /stream\/|hls\.js|resolve-play/.test(x))) console.log('    ' + r);
ws.close();
