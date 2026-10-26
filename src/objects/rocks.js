// Rocks: a lumpy sphere softly cut by a few random half-spaces (rounded flats and edges), with smooth shared
// normals. Colour varies per vertex — warm grey-beige stone, darker near the ground, moss fading in over the
// top — and the prop shader lays the baked rock texture and normal map over it (src/render/texgen.js).
import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { vnoise, vnoise3 } from '../core/noise.js';

// unit icosphere as indexed positions (shared vertices, so normals can be smooth)
function icoIndexed(detail) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, map = new Map(), verts = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)).normalize(), key = `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
    if (!map.has(key)) { map.set(key, verts.length); verts.push(v); }
    idx.push(map.get(key));
  }
  g.dispose();
  return { verts, idx };
}
const ICO = {};

// kind: 'pebble' | 'boulder' | 'cliff'
export function makeRock(seed, kind) {
  const R = mulberry32(seed), pebble = kind === 'pebble', cliff = kind === 'cliff';
  const { verts, idx } = ICO[pebble ? 2 : 4] || (ICO[pebble ? 2 : 4] = icoIndexed(pebble ? 2 : 4));
  const planes = [], K = pebble ? 3 : cliff ? 9 : 6;
  for (let k = 0; k < K; k++) {
    let n;
    if (k === 0 && !pebble) n = new THREE.Vector3((R() - 0.5) * 0.35, 1, (R() - 0.5) * 0.35);
    else { const u = R() * 1.4 - 0.6, a = R() * 6.283, sn = Math.sqrt(Math.max(0, 1 - u * u)); n = new THREE.Vector3(sn * Math.cos(a), u, sn * Math.sin(a)); }
    planes.push([n.normalize(), (pebble ? 0.78 : k === 0 && !cliff ? 0.74 : 0.56) + R() * 0.3]);  // boulder tops stay domed
  }
  planes.push([new THREE.Vector3(0, -1, 0), 0.32]);
  const st = new THREE.Vector3(1 + R() * 0.6, cliff ? 1.1 + R() * 0.6 : 0.72 + R() * 0.3, 0.8 + R() * 0.45);
  const soft = pebble ? 0.08 : 0.14;   // how much the cuts round off
  const shape = d => {
    const p = d.clone().multiplyScalar(1 + (vnoise3(d.x * 1.6 + seed, d.y * 1.6, d.z * 1.6) - 0.5) * (pebble ? 0.22 : 0.36) + (vnoise3(d.x * 4.3 - seed, d.y * 4.3, d.z * 4.3) - 0.5) * 0.08);
    for (const [n, dd] of planes) { const e = p.dot(n) - dd; if (e > -soft) p.addScaledVector(n, -(e + soft) * (e + soft) / (4 * soft) * (e < soft ? 1 : 0) - (e >= soft ? e : 0)); }
    return p.multiply(st);
  };
  const pos = new Float32Array(verts.length * 3), col = new Float32Array(verts.length * 3);
  verts.forEach((d, i) => { const p = shape(d); pos.set([p.x, p.y, p.z], i * 3); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // warm grey-beige stone; moss is darker and olive so it never reads as a patch of lawn
  const gA = new THREE.Color(pebble ? '#9a9286' : '#8e8477'), gB = new THREE.Color(pebble ? '#c4baa8' : '#bcb09d'), moss = new THREE.Color('#5a6f2e'), mossLit = new THREE.Color('#82943f'), dk = new THREE.Color('#5a544d');
  const nrm = g.attributes.normal, c = new THREE.Color();
  for (let i = 0; i < verts.length; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], ny = nrm.getY(i), nz = vnoise(x * 2.3 + seed, z * 2.3);
    c.copy(gA).lerp(gB, nz);
    const m = pebble ? 0 : Math.max(0, Math.min(1, (ny - 0.45 + (vnoise(x * 1.4 - seed, z * 1.4 + 3.1) - 0.5) * 0.7) * 3)) * (y > 0 ? 1 : 0);
    c.lerp(moss.clone().lerp(mossLit, nz), m * 0.9);
    c.lerp(dk, Math.max(0, Math.min(1, -y / st.y * 3)) * 0.45);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(verts.length), 1));
  g.setAttribute('aUV', new THREE.BufferAttribute(new Float32Array(verts.length * 2), 2));
  g.setAttribute('aCard', new THREE.BufferAttribute(new Float32Array(verts.length).fill(3), 1));   // 3 = textured stone
  g.computeBoundingSphere();
  return g;
}
