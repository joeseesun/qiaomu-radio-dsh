/**
 * Capture the six skins from the *production* build in a real Chrome, in both
 * colour schemes and a narrow viewport. Screenshots land in `docs/shots/`.
 */
import { WebSocket } from "ws";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = process.env.OUT_DIR ? join(root, process.env.OUT_DIR) : join(root, "docs/shots");
mkdirSync(outDir, { recursive: true });

const port = process.env.CDP_PORT ?? "9225";
const base = process.env.BASE ?? "http://127.0.0.1:4190/qiaomu-radio/";
const themes = ["rams", "fantasy", "editorial", "pocket", "deck", "console"];
const schemes = [
  { id: "light", emulated: "light", width: 1280, height: 860 },
  { id: "dark", emulated: "dark", width: 1280, height: 860 },
  { id: "narrow", emulated: "dark", width: 420, height: 900 },
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Per-image metadata, written next to the screenshots. Console output is
 * ephemeral, and a pixel comparison is only attributable if the `notice` state
 * of each capture is still readable later. */
const manifest = [];

for (const scheme of schemes) {
  for (const theme of themes) {
    const created = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`, { method: "PUT" })).json();
    const ws = new WebSocket(created.webSocketDebuggerUrl);
    let id = 0; const pending = new Map();
    ws.on("message", (d) => { const m = JSON.parse(String(d)); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
    await new Promise((r) => ws.once("open", r));
    const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });
    const evaluate = async (e) => (await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value;
    await send("Runtime.enable");
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme.emulated }] });
    await send("Emulation.setDeviceMetricsOverride", {
      width: scheme.width,
      height: scheme.height,
      deviceScaleFactor: 2,
      mobile: scheme.width < 720,
    });
    await wait(1600);
    await evaluate(`localStorage.clear()`);
    await send("Page.reload");
    await wait(2600);
    if (theme !== "rams") {
      await evaluate(`document.querySelector('[aria-label="切换主题"]')?.click()`);
      await wait(400);
      const label = { fantasy: "魔兽世界", rams: "博朗", editorial: "极简", pocket: "iPod", deck: "Winamp", console: "foobar2000" }[theme];
      await evaluate(`[...document.querySelectorAll('.theme-picker button')].find(b => (b.textContent||'').includes(${JSON.stringify(label)}))?.click()`);
      await wait(3200);
    }
    await evaluate(`document.activeElement?.blur?.()`);

    /* A `.radio-notice` sits on the device and silently pollutes every pixel
     * comparison, and it has TWO variants with different lifetimes:
     *
     *   - status  (`setNotice`)            -> `NOTICE_MS = 3_200` auto-dismiss
     *                                        (`src/client/useRadio.ts:44`);
     *   - alert   (`.has-error`, `setError`) -> NO timer at all
     *                                        (`src/client/useRadio.ts:361`),
     *                                        cleared only by user action.
     *
     * Both triggers are unrelated to the product: the skin-swap toast fired by
     * the picker click above, and the upstream-catalog warning
     * (`src/host/catalog.ts` WARNING_CATALOG_DOWN) when a Radio Browser request
     * loses its race.
     *
     * So: wait out the `status` variant (two consecutive absent polls, because a
     * replacing notice restarts its timer), never wait for the `alert` variant
     * (it would just burn the deadline), and record the state AT CAPTURE TIME as
     * well. A diff against a `notice: true` capture is attributable; without the
     * flag it is not. The capture Chrome must still run with
     * `--autoplay-policy=no-user-gesture-required` — granting the gesture keeps
     * autoplay from being blocked, which is what raises the `alert` variant. */
    const noticeState = await evaluate(`(async () => {
      const read = () => {
        const el = document.querySelector('.radio-notice');
        if (!el) return null;
        return { error: el.classList.contains('has-error'), text: (el.textContent || '').trim().slice(0, 40) };
      };
      const hide = () => {
        const el = document.querySelector('.radio-notice');
        if (el) { el.style.visibility = 'hidden'; el.style.pointerEvents = 'none'; }
      };
      let state = read();
      if (state && !state.error) {
        const absent = () => new Promise((r) => {
          if (read()) return r(false);
          setTimeout(() => r(!read()), 150);
        });
        const deadline = Date.now() + 6000;
        while (Date.now() < deadline) {
          if (await absent()) break;
          await new Promise((r) => setTimeout(r, 120));
        }
        state = read();
      }
      /* Does the notice swallow clicks on any control that is actually visible?
       * The notice is a sibling of '.skin-body', so a button-vs-button overlap
       * audit inside '.skin-body' cannot answer this. Clip-aware visibility is
       * required: a rect test alone counts playlist rows scrolled out of
       * '.playlist-scroll' as "covered" (they are clipped, not covered), which
       * is a false positive. Intersect the element rect with every
       * 'overflow != visible' ancestor, then test the notice against that. */
      /* @obstruction-check:start (byte-extracted by tools/notice-obstruction-check.mjs) */
      const clippedRect = (el) => {
        const rect = el.getBoundingClientRect();
        let box = { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom };
        for (let node = el.parentElement; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (!/(hidden|clip|auto|scroll)/.test(style.overflow + style.overflowX + style.overflowY)) continue;
          const outer = node.getBoundingClientRect();
          box = {
            top: Math.max(box.top, outer.top),
            left: Math.max(box.left, outer.left),
            right: Math.min(box.right, outer.right),
            bottom: Math.min(box.bottom, outer.bottom),
          };
        }
        return box;
      };
      const obstruction = (() => {
        const el = document.querySelector('.radio-notice');
        if (!el) return { measured: false, controls: 0, page: [], own: [] };
        const notice = clippedRect(el);
        const width = window.innerWidth, height = window.innerHeight;
        const page = [], own = [];
        const controls = [...document.querySelectorAll('button, a[href], input, select, [role="button"], [tabindex]:not([tabindex="-1"])')];
        for (const control of controls) {
          const style = getComputedStyle(control);
          if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') continue;
          const box = clippedRect(control);
          if (box.right - box.left <= 0 || box.bottom - box.top <= 0) continue;
          if (box.right < 0 || box.bottom < 0 || box.left > width || box.top > height) continue;
          if (!(notice.left < box.right && notice.right > box.left && notice.top < box.bottom && notice.bottom > box.top)) continue;
          const label = (control.getAttribute('aria-label') || control.textContent || control.tagName).trim().slice(0, 24);
          /* A control INSIDE the notice (the alert variant's own retry button)
           * is legitimately covered by it — expected, not a defect. Only page
           * controls count as obstruction; the own-control hits double as a
           * liveness proof that the intersection can actually fire. */
          if (el.contains(control)) own.push(label); else page.push(label);
        }
        return { measured: true, controls: controls.length, page, own };
      })();
      /* @obstruction-check:end */

      if (state) hide();
      return { present: !!state, error: !!state?.error, hidden: !!state, text: state?.text ?? null, obstruction };
    })()`);

    const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const file = join(outDir, `${theme}-${scheme.id}.png`);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, Buffer.from(shot.result.data, "base64"));
    const meta = await evaluate(`({ theme: document.querySelector('.radio-root')?.dataset.theme, state: document.querySelector('.radio-root')?.dataset.state, page: document.querySelector('.skin-screen')?.dataset.page,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 })`);
    manifest.push({
      file: `${theme}-${scheme.id}.png`,
      scheme: scheme.id,
      theme: meta.theme,
      state: meta.state,
      page: meta.page,
      overflow: meta.overflow,
      notice: noticeState.present,
      noticeError: noticeState.error,
      noticeHidden: noticeState.hidden,
      noticeText: noticeState.text,
      noticeObstructs: noticeState.obstruction.page,
      noticeOwnControlHits: noticeState.obstruction.own,
      noticeControlsChecked: noticeState.obstruction.controls,
    });
    if (noticeState.obstruction.page.length) {
      console.warn(`  ! ${theme}-${scheme.id}: notice overlaps ${noticeState.obstruction.page.length} page control(s): ${noticeState.obstruction.page.join(", ")}`);
    }
    console.log(`${scheme.id.padEnd(6)} ${theme.padEnd(9)} -> ${meta.theme}/${meta.state}/${meta.page} overflow=${meta.overflow} notice=${noticeState.present}${noticeState.error ? "/alert" : ""}${noticeState.present ? ` (hidden: ${noticeState.text})` : ""} ${file}`);
    ws.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${created.id}`);
  }
}

const { writeFileSync } = await import("node:fs");
writeFileSync(join(outDir, "capture-manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`, "utf8");
console.log(`\n${manifest.length} captures -> ${outDir} (manifest: capture-manifest.json, notices: ${manifest.filter((entry) => entry.notice).length})`);
const obstructed = manifest.reduce((total, entry) => total + entry.noticeObstructs.length, 0);
const withNotice = manifest.filter((entry) => entry.notice);
const ownHits = manifest.reduce((total, entry) => total + entry.noticeOwnControlHits.length, 0);
console.log(`notice obstruction: ${obstructed === 0 ? "none" : `${obstructed} control(s)`} across ${manifest.length} captures (${withNotice.length} with a notice present, controls seen: ${Math.max(0, ...manifest.map((entry) => entry.noticeControlsChecked))} max; own-control hits: ${ownHits})`);
