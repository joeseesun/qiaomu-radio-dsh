import { readFileSync } from "node:fs";
import { afterAll, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createSurfaceSampler } from "../src/client/skins/three/surfaceSampler";
import { normalizeFantasyModel, surfacePatch, FANTASY_SCREEN, FANTASY_CONTROLS } from "../src/client/skins/three/fantasySurface";

afterAll(() => vi.unstubAllGlobals());
it("matches every original screen/control vertex on the shipped double-sided model", async () => {
  // Parse the actual mesh with embedded bytes, skipping only browser-only textures.
  const bytes = readFileSync(new URL("../assets/models/qiaomu-fantasy-radio-hyper3d-v2.glb", import.meta.url));
  const length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString());
  const binary = bytes.subarray(28 + length);
  json.buffers = [{ uri: `data:application/octet-stream;base64,${binary.toString("base64")}`, byteLength: binary.length }];
  delete json.images; delete json.textures; delete json.extensionsUsed; delete json.extensionsRequired;
  json.materials = [{ doubleSided: true }];
  vi.stubGlobal("ProgressEvent", class {});
  const { scene } = await new GLTFLoader().parseAsync(JSON.stringify(json), "");
  normalizeFantasyModel(scene);
  const before = performance.now();
  const sample = createSurfaceSampler(scene);
  const s = FANTASY_SCREEN;
  const specs = [[s.x,s.y,s.width,s.height,32,.04], ...FANTASY_CONTROLS.map(c => [c.x,c.y,c.radius*1.5,c.radius*1.5,12,0])];
  const accelerated = specs.map(([x,y,w,h,n,r]) => surfacePatch(scene,x,y,w,h,n,r,sample));
  const fastMs = performance.now() - before;
  const baseline = performance.now();
  specs.forEach(([x,y,w,h,n,r], i) => {
    const original = surfacePatch(scene,x,y,w,h,n,r);
    const a = accelerated[i].attributes.position.array, b = original.attributes.position.array;
    expect(a.length).toBe(b.length);
    for (let k=0;k<a.length;k++) expect(Math.abs(a[k]-b[k])).toBeLessThan(1e-6);
    original.dispose(); accelerated[i].dispose();
  });
  console.log(JSON.stringify({ calibrationIndexedMs: Math.round(fastMs), calibrationOriginalMs: Math.round(performance.now()-baseline) }));
  scene.traverse(m => { if(m instanceof THREE.Mesh) {m.geometry.dispose();(Array.isArray(m.material)?m.material:[m.material]).forEach(v=>v.dispose());} });
});
