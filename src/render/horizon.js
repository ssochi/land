// Horizon maps over the FAR grid: per texel, the max elevation tangent toward 8 azimuths (for large-scale
// terrain shadowing that follows the sun) and cosine-weighted sky visibility (ambient occlusion).
import * as THREE from 'three';
import { FAR } from '../world/grid.js';

export const HZ_M = 301, HZ_DIRS = 8;
const hzData0 = new Uint16Array(HZ_M * HZ_M * 4), hzData1 = new Uint16Array(HZ_M * HZ_M * 4), hzAOData = new Uint16Array(HZ_M * HZ_M * 4);
function mkHzTex(d) { const t = new THREE.DataTexture(d, HZ_M, HZ_M, THREE.RGBAFormat, THREE.HalfFloatType); t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t; }
export const HZ0 = mkHzTex(hzData0), HZ1 = mkHzTex(hzData1), HZAO = mkHzTex(hzAOData);

export function computeHorizon() {
  const G = FAR, step = G.size / (HZ_M - 1), toH = THREE.DataUtils.toHalfFloat, lo = G.min, hi = G.min + G.size;
  const dists = []; for (let d = 6; d < 1700; d *= 1.2) dists.push(d);
  const cs = [], sn = []; for (let q = 0; q < HZ_DIRS; q++) { cs.push(Math.cos(q / HZ_DIRS * Math.PI * 2)); sn.push(Math.sin(q / HZ_DIRS * Math.PI * 2)); }
  for (let j = 0; j < HZ_M; j++) for (let i = 0; i < HZ_M; i++) {
    const x = lo + i * step, z = lo + j * step, h0 = G.sample(x, z) + 1.5, k = (j * HZ_M + i) * 4;
    let vis = 0;
    for (let q = 0; q < HZ_DIRS; q++) {
      let mt = -0.5;
      for (const d of dists) { const xx = x + cs[q] * d, zz = z + sn[q] * d; if (xx < lo || zz < lo || xx > hi || zz > hi) break; const t = (G.sample(xx, zz) - h0) / d; if (t > mt) mt = t; }
      vis += 1 - Math.sin(Math.atan(Math.max(mt, 0)));
      (q < 4 ? hzData0 : hzData1)[k + (q & 3)] = toH(mt);
    }
    hzAOData[k] = toH(vis / HZ_DIRS);
  }
  HZ0.needsUpdate = HZ1.needsUpdate = HZAO.needsUpdate = true;
}
