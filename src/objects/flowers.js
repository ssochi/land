// Meadow flowers: a tube stem, a few ground leaves and a species-specific head.
import * as THREE from 'three';
import { clamp, mulberry32 } from '../core/math.js';
import { MB, V3, addTube, addBlob, addPetal } from './mesh-builder.js';

const STEM = new THREE.Color('#6f9c3c');  // light enough that thin stems do not read as black lines in the grass

function stemPath(R, H, segs) { const bx = (R() - 0.5) * 0.12, bz = (R() - 0.5) * 0.12, out = []; for (let k = 0; k <= segs; k++) { const t = k / segs; out.push(V3(bx * t * t, t * H, bz * t * t)); } return out; }
function flowerSway(H) { return P => Math.pow(clamp(P.y / H, 0, 1), 1.8) * 0.14; }
function addLeaves(mb, R, n, len, sw) {
  for (let l = 0; l < n; l++) {
    const a = R() * 6.283, d = V3(Math.cos(a), 0, Math.sin(a));
    addPetal(mb, V3(0, 0.02, 0), d, len * (0.7 + R() * 0.5), len * 0.22, 0.9, -0.6, STEM, new THREE.Color('#6fa83a'), sw);
  }
}

export function makeDaisy(seed) {
  const R = mulberry32(seed), mb = new MB(), H = 0.62 + R() * 0.24, sw = flowerSway(H);
  const sp = stemPath(R, H, 4); addTube(mb, sp, [0.009, 0.008, 0.007, 0.006, 0.006], 4, () => STEM, sw);
  addLeaves(mb, R, 3, 0.12, sw);
  const top = sp[sp.length - 1], W = new THREE.Color('#fbfaf2'), Wt = new THREE.Color('#f4eee8');
  const np = 13;
  for (let k = 0; k < np; k++) { const a = k / np * 6.283 + R() * 0.1, d = V3(Math.cos(a), 0, Math.sin(a)); addPetal(mb, top.clone().add(d.clone().multiplyScalar(0.016)), d, 0.075, 0.022, 0.22, 0.12, W, Wt, sw); }
  addBlob(mb, top.clone().add(V3(0, 0.01, 0)), 0.028, 1, { lump: 0.1, squash: 0.55, sway: sw, nblend: 0, color: () => new THREE.Color('#f0bd2c') });
  return mb.geo();
}

export function makePoppy(seed) {
  const R = mulberry32(seed), mb = new MB(), H = 0.7 + R() * 0.25, sw = flowerSway(H);
  const sp = stemPath(R, H, 5); addTube(mb, sp, [0.008, 0.008, 0.007, 0.007, 0.006, 0.006], 4, () => STEM, sw);
  addLeaves(mb, R, 3, 0.14, sw);
  const top = sp[sp.length - 1], A = new THREE.Color('#d8361f'), B = new THREE.Color('#f2643a');
  for (let k = 0; k < 4; k++) { const a = k / 4 * 6.283 + R() * 0.3, d = V3(Math.cos(a), 0, Math.sin(a)); addPetal(mb, top.clone(), d, 0.08, 0.08, 0.5, 0.9, A, B, sw); }
  addBlob(mb, top.clone().add(V3(0, 0.012, 0)), 0.013, 1, { lump: 0.1, squash: 0.8, sway: sw, nblend: 0, color: () => new THREE.Color('#2c2a1c') });
  return mb.geo();
}

export function makeLupine(seed) {
  const R = mulberry32(seed), mb = new MB(), H = 0.85 + R() * 0.32, sw = flowerSway(H);
  const sp = stemPath(R, H, 6); addTube(mb, sp, [0.011, 0.01, 0.009, 0.008, 0.007, 0.006, 0.004], 4, () => STEM, sw);
  for (let l = 0; l < 7; l++) { const a = l / 7 * 6.283, d = V3(Math.cos(a), 0, Math.sin(a)); addPetal(mb, V3(0, 0.08, 0), d, 0.11, 0.025, 0.25, -0.2, STEM, new THREE.Color('#78ad3e'), sw); }
  const lo = new THREE.Color(R() > 0.5 ? '#6b4fc4' : '#5d66c9'), hi = new THREE.Color(R() > 0.6 ? '#e0a6e6' : '#b9a3ef');
  const nf = 22;
  // florets spiral up the spike at the golden angle, shrinking and fading toward the tip
  for (let f = 0; f < nf; f++) {
    const t = f / nf, y = H * (0.6 + 0.4 * t), a = f * 2.4, rr = 0.034 * (1 - t * 0.7);
    const P0 = V3(Math.cos(a) * rr + sp[6].x * (y / H), y, Math.sin(a) * rr + sp[6].z * (y / H));
    addBlob(mb, P0, 0.021 * (1 - t * 0.4), 0, { lump: 0.15, nblend: 0, sway: sw, color: () => lo.clone().lerp(hi, t) });
  }
  return mb.geo();
}

export function makeButtercup(seed) {
  const R = mulberry32(seed), mb = new MB(), H = 0.52 + R() * 0.18, sw = flowerSway(H);
  const sp = stemPath(R, H, 3); addTube(mb, sp, [0.006, 0.006, 0.005, 0.005], 4, () => STEM, sw);
  const top = sp[sp.length - 1], A = new THREE.Color('#e9b51f'), B = new THREE.Color('#ffe25a');
  for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283, d = V3(Math.cos(a), 0, Math.sin(a)); addPetal(mb, top.clone(), d, 0.038, 0.034, 0.45, 0.7, A, B, sw); }
  return mb.geo();
}
