import * as THREE from "three";
import { Octree } from "three/addons/math/Octree.js";

/** Temporary acceleration structure for the static, normalized GLB surface.
 * The bundled model is double-sided. Keep that behavior when querying triangles.
 * Discard the sampler after calibration: controls deform the model afterwards.
 */
export function createSurfaceSampler(model: THREE.Object3D) {
  const tree = new Octree().fromGraphNode(model);
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
  const hit = new THREE.Vector3();
  return (x: number, y: number): THREE.Vector3 | undefined => {
    ray.origin.set(x, y, 2);
    const triangles: THREE.Triangle[] = [];
    tree.getRayTriangles(ray, triangles);
    let nearest: THREE.Vector3 | undefined;
    for (const triangle of triangles) {
      if (ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)
        && (!nearest || hit.z > nearest.z)) nearest = hit.clone();
    }
    return nearest;
  };
}
