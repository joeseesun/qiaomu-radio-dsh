/** Open the real harness GUI and report whether the plugin's client bundle loads cleanly. */
import { WebSocket } from "ws";

const port = process.argv[2] ?? "9222";
const gui = process.argv[3];
if (!gui) {
  console.error("usage: node tools/cdp-gui-probe.mjs <cdp-port> <gui-url-with-token>");
  process.exit(1);
}
const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(gui)}`, { method: "PUT" })).json();
const ws = new WebSocket(created.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const net = [];
const errors = [];
const logs = [];
ws.on("message", (data) => {
  const msg = JSON.parse(String(data));
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === "Network.responseReceived") {
    const { url, status } = msg.params.response;
    if (/qiaomu|radio/.test(url)) net.push(`${status} ${url}`);
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    logs.push(msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
  }
  if (msg.method === "Runtime.exceptionThrown") {
    errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  }
});
await new Promise((resolve) => ws.once("open", resolve));
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    pending.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await send("Runtime.enable");
await send("Network.enable");
await send("Network.setCacheDisabled", { cacheDisabled: true });
await wait(9000);

const state = await evaluate(`({
  title: document.title,
  modules: Object.keys(window.__ModuleLoader__?.cache ?? {}).filter((k) => /qiaomu/.test(k)),
  radioEntry: !!(window.__DSH_BOOT__?.entries ?? []).find((e) => e.id === "@qiaomu/dsh-radio"),
  bootRev: window.__DSH_BOOT__?.rev ?? null,
  bodyChars: document.body.innerText.length
})`);
console.log(JSON.stringify({ state, net, consoleErrors: logs.slice(0, 8), exceptions: errors.slice(0, 8) }, null, 2));
ws.close();
