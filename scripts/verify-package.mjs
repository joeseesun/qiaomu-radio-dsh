import { readFile, access } from "node:fs/promises";
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
const paths = new Set([pkg.main, "cordis.patch.yml", "lib/player/app.js", "lib/player/styles.css", "lib/player/hls.js", "lib/player/models/qiaomu-fantasy-radio-hyper3d-v2.glb"]);
for (const entry of Object.values(pkg.exports)) for (const path of typeof entry === "string" ? [entry] : Object.values(entry)) paths.add(path);
for (const path of paths) await access(new URL("../" + path, import.meta.url));
if (!pkg.dsh?.bundle?.patch) throw new Error("Missing dsh.bundle.patch");
console.log(`Verified ${paths.size} package entry points and assets`);
