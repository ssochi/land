// Understory plants: ferns, broadleaf herbs and reed clumps — the layer between grass and trees that makes
// woodland floors and banks read as lush.
import * as THREE from 'three';
import { clamp, mulberry32 } from '../core/math.js';
import { MB, V3, addTube, addPetal } from './mesh-builder.js';

const sway = H => P => Math.pow(clamp(P.y / H, 0, 1), 1.5) * 0.22;

// fern: a rosette of arching fronds, each a rachis with paired leaflets that shrink toward the tip
export function makeFern(seed) {
  const R = mulberry32(seed), mb = new MB(), H = 0.7 + R() * 0.35, sw = sway(H);
  const dark = new THREE.Color('#3f6a2c'), light = new THREE.Color('#79a845'), tipc = new THREE.Color('#9cbf55');
  const fronds = 7 + Math.floor(R() * 4);
  for (let f = 0; f < fronds; f++) {
    const a = f / fronds * 6.283 + R() * 0.4, d = V3(Math.cos(a), 0, Math.sin(a)), side = V3(-d.z, 0, d.x);
    const L = H * (1.1 + R() * 0.5), rise = 0.55 + R() * 0.35, S = 12;
    const at = t => V3(d.x * L * t, Math.sin(Math.PI * t * 0.75) * L * rise - t * t * L * 0.25, d.z * L * t);
    for (let s = 0; s < S; s++) {
      const t0 = s / S, t1 = (s + 1) / S, p0 = at(t0), p1 = at(t1), mid = p0.clone().lerp(p1, 0.5);
      const w = L * 0.22 * Math.sin(Math.PI * Math.min(1, t0 * 1.05 + 0.08));
      const col = dark.clone().lerp(light, 0.35 + 0.5 * t0).lerp(tipc, t0 * t0 * 0.6).multiplyScalar(0.92 + R() * 0.12);
      const n = p1.clone().sub(p0).cross(side).normalize(); if (n.y < 0) n.negate();
      for (const sgn of [-1, 1]) {
        // leaflet: a narrow triangle swept forward from the rachis
        const tip = mid.clone().addScaledVector(side, sgn * w).addScaledVector(d, L * 0.03).add(V3(0, -w * 0.25, 0));
        const i0 = mb.v(p0.x, p0.y, p0.z, n.x, n.y, n.z, col, sw(p0)), i1 = mb.v(p1.x, p1.y, p1.z, n.x, n.y, n.z, col, sw(p1)), i2 = mb.v(tip.x, tip.y, tip.z, n.x, n.y, n.z, col, sw(tip) + 0.03);
        if (sgn > 0) mb.tri(i0, i2, i1); else mb.tri(i0, i1, i2);
      }
    }
  }
  return mb.geo();
}

// broadleaf herb: a clump of large oval leaves on short stalks, darker inside, glossy-light at the edges
export function makeBroadleaf(seed) {
  const R = mulberry32(seed), mb = new MB(), H = 0.55 + R() * 0.3, sw = sway(H);
  const inner = new THREE.Color('#2f5a26'), outer = new THREE.Color('#6f9e3c');
  const n = 5 + Math.floor(R() * 4);
  for (let k = 0; k < n; k++) {
    const a = k / n * 6.283 + R() * 0.5, d = V3(Math.cos(a), 0, Math.sin(a));
    const stalk = 0.12 + R() * 0.18, base = V3(d.x * 0.06, stalk, d.z * 0.06);
    addTube(mb, [V3(0, 0, 0), base], [0.012, 0.01], 3, () => inner, sw);
    addPetal(mb, base, d, H * (0.8 + R() * 0.4), H * (0.45 + R() * 0.15), 0.35 + R() * 0.35, -0.35, inner, outer.clone().multiplyScalar(0.9 + R() * 0.2), sw);
  }
  return mb.geo();
}

// reed clump: tall thin blades leaning outward, a few with brown cattail heads
export function makeReed(seed) {
  const R = mulberry32(seed), mb = new MB(), H = 1.3 + R() * 0.6, sw = P => Math.pow(clamp(P.y / H, 0, 1), 1.6) * 0.35;
  const base = new THREE.Color('#4e6e2e'), tip = new THREE.Color('#a9b866'), head = new THREE.Color('#6b4a2c');
  const n = 16 + Math.floor(R() * 10);
  for (let k = 0; k < n; k++) {
    const a = R() * 6.283, r0 = Math.sqrt(R()) * 0.25, lean = 0.1 + R() * 0.25, h = H * (0.6 + R() * 0.5), w = 0.025 + R() * 0.015;
    const b = V3(Math.cos(a) * r0, 0, Math.sin(a) * r0), top = V3(b.x + Math.cos(a) * lean * h, h, b.z + Math.sin(a) * lean * h);
    const side = V3(-Math.sin(a), 0, Math.cos(a)), n2 = V3(Math.cos(a), 0.3, Math.sin(a)).normalize();
    const mid = b.clone().lerp(top, 0.55); mid.x += Math.cos(a) * lean * h * 0.1; mid.z += Math.sin(a) * lean * h * 0.1;
    const cA = base.clone(), cB = base.clone().lerp(tip, 0.5), cC = tip.clone().multiplyScalar(0.9 + R() * 0.15);
    const i0 = mb.v(b.x - side.x * w, 0, b.z - side.z * w, n2.x, n2.y, n2.z, cA, 0), i1 = mb.v(b.x + side.x * w, 0, b.z + side.z * w, n2.x, n2.y, n2.z, cA, 0);
    const i2 = mb.v(mid.x - side.x * w * 0.7, mid.y, mid.z - side.z * w * 0.7, n2.x, n2.y, n2.z, cB, sw(mid)), i3 = mb.v(mid.x + side.x * w * 0.7, mid.y, mid.z + side.z * w * 0.7, n2.x, n2.y, n2.z, cB, sw(mid));
    const i4 = mb.v(top.x, top.y, top.z, n2.x, n2.y, n2.z, cC, sw(top));
    mb.tri(i0, i1, i2); mb.tri(i1, i3, i2); mb.tri(i2, i3, i4);
    if (k < 4) addTube(mb, [top.clone().add(V3(0, -0.28, 0)), top.clone().add(V3(0, -0.02, 0))], [0.035, 0.03], 5, () => head, sw);
  }
  return mb.geo();
}
