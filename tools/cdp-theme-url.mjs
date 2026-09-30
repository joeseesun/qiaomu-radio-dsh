import { WebSocket } from "ws";
const port = process.argv[2] ?? "9226";
const base = process.argv[3];
const themes = ["editorial", "fantasy", "deck", "console", "pocket", "rams"];
for (const theme of themes) {
  const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(`${base}?theme=${theme}`)}`, { method: "PUT" })).json();
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.on("message", (d) => { const m = JSON.parse(String(d)); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  await new Promise((r) => ws.once("open", r));
  const send = (method, params={}) => new Promise((res) => { const n=++id; pending.set(n,res); ws.send(JSON.stringify({id:n,method,params})); });
  const evaluate = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await send("Runtime.enable");
  await new Promise((r) => setTimeout(r, 3000));
  const got = await evaluate(`({ theme: document.querySelector('.radio-root')?.dataset.theme, rootClass: document.querySelector('.radio-root')?.className, scrollOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 })`);
  console.log(`${theme.padEnd(10)} -> ${got.theme}  (${got.rootClass})  overflow=${got.scrollOverflow}`);
  ws.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${created.id}`);
}
