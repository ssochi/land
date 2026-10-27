// Lantern lights: of all the light points the props carry (src/render/props.js), the 12 nearest the camera
// feed the shared lighting (uPL in the common shader), re-picked when the camera moves a few metres.
import * as THREE from 'three';
import { U } from './uniforms.js';

export function createLights() {
  let all = [];
  const at = new THREE.Vector3(1e9, 0, 0);
  return {
    set(list) { all = list || []; at.set(1e9, 0, 0); },
    update(camera) {
      const c = camera.position;
      if (c.distanceToSquared(at) < 9) return;
      at.copy(c);
      const near = all.map(l => [(l[0] - c.x) ** 2 + (l[1] - c.y) ** 2 + (l[2] - c.z) ** 2, l]).sort((a, b) => a[0] - b[0]).slice(0, U.uPL.value.length);
      U.uPL.value.forEach((v, i) => { const l = near[i] && near[i][1]; if (l) v.set(l[0], l[1], l[2], l[3]); else v.set(0, 0, 0, 0); });
    },
    count: () => all.length
  };
}
