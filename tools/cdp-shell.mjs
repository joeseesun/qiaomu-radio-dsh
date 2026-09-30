import { WebSocket } from "ws";
const port = process.argv[2] ?? "9226";
const base = process.argv[3] ?? "http://127.0.0.1:4190/qiaomu-radio/";
for (const theme of ["rams", "fantasy", "editorial", "console"]) {
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
    const walk = (el, depth) => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 46), box: Math.round(r.width)+"x"+Math.round(r.height)+"@"+Math.round(r.x)+","+Math.round(r.y), kids: depth > 0 ? [...el.children].slice(0,4).map(c => walk(c, depth-1)) : undefined };
    };
    const root = document.querySelector('.radio-root');
    const stage = document.querySelector('.radio-stage') || root;
    return { tree: walk(stage, 3), stageBox: (() => { const r = stage.getBoundingClientRect(); const s = getComputedStyle(stage); return Math.round(r.width)+"x"+Math.round(r.height)+" pad="+s.padding; })() };
  })()`);
  console.log("==== " + theme + "  stage=" + out.stageBox);
  console.log(JSON.stringify(out.tree));
  ws.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${created.id}`);
}
