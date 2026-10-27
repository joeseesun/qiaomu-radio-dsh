import { readFile, access } from "node:fs/promises";
const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url)));
const metadata = JSON.parse(await readFile(new URL("../dsh-plugin.json", import.meta.url)));
if (pkg.version !== metadata.version || pkg.name !== metadata.id) throw new Error("Package and plugin metadata differ");
const paths = new Set([pkg.main, "cordis.patch.yml", "lib/player/app.js", "lib/player/styles.css", "lib/player/hls.js", "lib/player/models/qiaomu-fantasy-radio-hyper3d-v2.glb"]);
for (const path of ["vendor/qiaomu-radio/LICENSE", "vendor/qiaomu-radio/NOTICE", "vendor/qiaomu-radio/source.json", "vendor/lucide/LICENSE"]) {
  if (!pkg.files.includes(path)) throw new Error(`Missing packaged notice: ${path}`);
  paths.add(path);
}
for (const entry of Object.values(pkg.exports)) for (const path of typeof entry === "string" ? [entry] : Object.values(entry)) paths.add(path);
for (const path of paths) await access(new URL("../" + path, import.meta.url));
if (!pkg.dsh?.bundle?.patch) throw new Error("Missing dsh.bundle.patch");
console.log(`Verified ${paths.size} package entry points and assets`);
