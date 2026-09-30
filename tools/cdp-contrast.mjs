import { WebSocket } from "ws";
const port = process.argv[2] ?? "9226";
const base = process.argv[3] ?? "http://127.0.0.1:4190/qiaomu-radio/";
for (const scheme of ["light", "dark"]) {
  const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`, { method: "PUT" })).json();
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.on("message", (d) => { const m = JSON.parse(String(d)); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await new Promise((r) => ws.once("open", r));
  const send = (method, params={}) => new Promise((res) => { const n=++id; pending.set(n,res); ws.send(JSON.stringify({id:n,method,params})); });
  const evaluate = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send("Runtime.enable");
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
  await new Promise((r) => setTimeout(r, 2500));
  const out = await evaluate(`(() => {
    const root = document.querySelector('.radio-root');
    const h1 = document.querySelector('h1');
    const pick = (el) => { const s = el && getComputedStyle(el); return s ? { color: s.color, bg: s.backgroundColor, colorScheme: s.colorScheme } : null; };
    const body = getComputedStyle(document.body);
    return {
      root: pick(root), h1: pick(h1),
      htmlColorScheme: getComputedStyle(document.documentElement).colorScheme,
      bodyMargin: body.margin, bodyBg: body.backgroundColor,
      rootHeight: root?.getBoundingClientRect().height,
      viewport: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight
    };
  })()`);
  console.log(scheme, JSON.stringify(out, null, 1));
  ws.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${created.id}`);
}
