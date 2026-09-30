import { WebSocket } from "ws";
const port = process.argv[2] ?? "9226";
const base = process.argv[3] ?? "http://127.0.0.1:4190/qiaomu-radio/";
const themes = ["rams", "fantasy", "editorial", "pocket", "deck", "console"];
for (const theme of themes) {
  const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${base}?theme=${theme}`)}`, { method: "PUT" })).json();
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.on("message", (d) => { const m = JSON.parse(String(d)); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await new Promise((r) => ws.once("open", r));
  const send = (method, params={}) => new Promise((res) => { const n=++id; pending.set(n,res); ws.send(JSON.stringify({id:n,method,params})); });
  const evaluate = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await new Promise((r) => setTimeout(r, 2600));
  const out = await evaluate(`(() => {
    const box = (sel) => { const el = document.querySelector(sel); if (!el) return "ABSENT"; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return Math.round(r.width)+"x"+Math.round(r.height)+"@"+Math.round(r.x)+","+Math.round(r.y)+" disp="+s.display; };
    const root = document.querySelector('.radio-root').getBoundingClientRect();
    const dock = document.querySelector('.skin-dock');
    const transformed = [...document.querySelectorAll('.radio-root *')].filter(e => getComputedStyle(e).transform !== 'none').length;
    const device = document.querySelector('.skin-screen')?.closest('[class*="skin-"]') || document.querySelector('.skin-screen');
    const dr = device?.getBoundingClientRect();
    return {
      device: box('.skin-screen'),
      deviceAreaPct: dr ? Math.round((dr.width*dr.height)/(1440*1000)*1000)/10 : null,
      transformed,
      dockDisplay: dock ? getComputedStyle(dock).display : "ABSENT",
      rootHeight: Math.round(root.height),
      vpCenterDelta: dr ? Math.round((dr.y + dr.height/2) - 500) : null,
      scrollOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  })()`);
  console.log(theme.padEnd(10), JSON.stringify(out));
  ws.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${created.id}`);
}
