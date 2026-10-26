// Rocks: lumpy sphere cut by random half-spaces (flat faces), stepped into strata, faceted shading.
import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { vnoise, vnoise3 } from '../core/noise.js';
import { MB, V3, icoDirs } from './mesh-builder.js';

// kind: 'pebble' | 'boulder' | 'cliff'
export function makeRock(seed, kind) {
  const R = mulberry32(seed), mb = new MB(), pebble = kind === 'pebble', cliff = kind === 'cliff', dirs = icoDirs(pebble ? 1 : 2);
  const planes = [], K = pebble ? 3 : cliff ? 12 : 8;
  for (let k = 0; k < K; k++) {
    let n;
    if (k === 0 && !pebble) n = V3((R() - 0.5) * 0.35, 1, (R() - 0.5) * 0.35);
    else { const u = R() * 1.4 - 0.6, a = R() * 6.283, sn = Math.sqrt(Math.max(0, 1 - u * u)); n = V3(sn * Math.cos(a), u, sn * Math.sin(a)); }
    planes.push([n.normalize(), (pebble ? 0.75 : 0.5) + R() * 0.35]);
  }
  planes.push([V3(0, -1, 0), 0.32]);
  const st = V3(1 + R() * 0.6, cliff ? 1.1 + R() * 0.6 : 0.72 + R() * 0.3, 0.8 + R() * 0.45), steps = cliff ? 5 : 3.5;
  const shape = d => {
    const p = d.clone().multiplyScalar(1 + (vnoise3(d.x * 1.7 + seed, d.y * 1.7, d.z * 1.7) - 0.5) * (pebble ? 0.25 : 0.42));
    for (const [n, dd] of planes) { const e = p.dot(n) - dd; if (e > 0) p.addScaledVector(n, -e); }
    if (!pebble) { const q = Math.round(p.y * steps) / steps; p.y += (q - p.y) * 0.35; }
    return p.multiply(st);
  };
  const gA = new THREE.Color(pebble ? '#9d968a' : '#878174'), gB = new THREE.Color(pebble ? '#c2b9a6' : '#aaa292'), moss = new THREE.Color('#77a23b'), grassTop = new THREE.Color('#8fb848'), dk = new THREE.Color('#57534b');
  for (let t = 0; t < dirs.length; t += 3) {
    const Pp = [shape(dirs[t]), shape(dirs[t + 1]), shape(dirs[t + 2])];
    const fn = Pp[1].clone().sub(Pp[0]).cross(Pp[2].clone().sub(Pp[0])).normalize();
    const cy = (Pp[0].y + Pp[1].y + Pp[2].y) / 3, nz = vnoise(Pp[0].x * 3 + seed, Pp[0].z * 3);
    const col = new THREE.Color().copy(gA).lerp(gB, nz);
    if (!pebble && ((cy / st.y) * (cliff ? 2.6 : 1.8) + nz * 0.35) % 1 < 0.13) col.multiplyScalar(0.8);
    if (!pebble && fn.y > 0.55 + (nz - 0.5) * 0.3 && cy > 0) col.copy(moss).lerp(grassTop, nz);
    if (cy < -0.1 * st.y) col.lerp(dk, 0.45);
    Pp.forEach(p => mb.v(p.x, p.y, p.z, fn.x, fn.y, fn.z, col, 0));
    const b = mb.p.length / 3; mb.tri(b - 3, b - 2, b - 1);
  }
  return mb.geo();
}
