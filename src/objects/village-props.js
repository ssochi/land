// Village props: fences and low stone walls (one 2.4m span each, placed along a polyline by m.fence), well,
// lantern post (a point light after dusk), barrel, crate, hay bale, wood pile, cart, signpost, market stall,
// windmill (the rotor turns in the vertex shader) and crops. Same conventions as buildings.js: uv in metres,
// material cards for the prop shader, userData.colliders / lights / smoke.
import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { MB, V3, addBlob, addPetal } from './mesh-builder.js';
import { quad, box, beam } from './buildings.js';

const C = hex => new THREE.Color(hex);
const WOOD = C('#a7825e'), WOOD_D = C('#6b4d36'), IRON = C('#3b3a38'), STONE = C('#b2a796'), GLOW = C('#ffd9a0'), PLASTER = C('#ecdcbc');

// cylinder along axis 'y' (upright), 'x' or 'z' (lying); uv u around, v along; card 7 wood by default
function cyl(mb, cx, cy, cz, r, h, segs, col, card = 7, axis = 'y', capCol = null) {
  const pt = (a, t) => axis === 'x' ? V3(cx + t, cy + Math.sin(a) * r, cz + Math.cos(a) * r)
    : axis === 'z' ? V3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, cz + t) : V3(cx + Math.cos(a) * r, cy + t, cz + Math.sin(a) * r);
  const radial = a => axis === 'x' ? V3(0, Math.sin(a), Math.cos(a)) : axis === 'z' ? V3(Math.cos(a), Math.sin(a), 0) : V3(Math.cos(a), 0, Math.sin(a));
  const along = axis === 'x' ? V3(1, 0, 0) : axis === 'z' ? V3(0, 0, 1) : V3(0, 1, 0);
  for (let i = 0; i < segs; i++) {
    const a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2;
    quad(mb, pt(a0, -h / 2), pt(a1, -h / 2), pt(a1, h / 2), pt(a0, h / 2), col, card, radial((a0 + a1) / 2), [i * r * Math.PI * 2 / segs, 0]);
  }
  for (const e of [-1, 1]) {
    const c = V3(cx, cy, cz).addScaledVector(along, e * h / 2), n = along.clone().multiplyScalar(e), cc = capCol || col;
    const ctr = mb.v(c.x, c.y, c.z, n.x, n.y, n.z, cc, 0, 0, 0, card);
    for (let i = 0; i < segs; i++) {
      const p0 = pt(i / segs * Math.PI * 2, e * h / 2), p1 = pt((i + 1) / segs * Math.PI * 2, e * h / 2);
      const a = mb.v(p0.x, p0.y, p0.z, n.x, n.y, n.z, cc, 0, p0.x + p0.y, p0.z + p0.y, card), b = mb.v(p1.x, p1.y, p1.z, n.x, n.y, n.z, cc, 0, p1.x + p1.y, p1.z + p1.y, card);
      if (p1.clone().sub(p0).cross(c.clone().sub(p0)).dot(n) > 0) mb.tri(a, b, ctr); else mb.tri(a, ctr, b);
    }
  }
}
const geo = (mb, ud) => { const g = mb.geo(); g.userData = Object.assign({ colliders: [], lights: [], smoke: [] }, ud); return g; };

// one fence span along x from −1.2 to 1.2 (post at the start; the next span supplies the end post)
export function makeFence(seed, lod = 0) {
  const R = mulberry32(seed), mb = new MB(), lean = (R() - 0.5) * 0.05;
  box(mb, -1.2, 0.55, 0, 0.14, 1.3, 0.14, WOOD_D, 7, lean);
  if (lod === 0) box(mb, -1.2, 1.22, 0, 0.18, 0.06, 0.18, WOOD_D.clone().multiplyScalar(0.8), 7);
  for (const y of [0.45, 0.95]) box(mb, 0, y + (R() - 0.5) * 0.04, 0, 2.42, 0.12, 0.05, WOOD.clone().multiplyScalar(0.85 + R() * 0.2), 7, (R() - 0.5) * 0.015);
  return geo(mb, { colliders: [[-1.2, 0, 0.18], [-0.6, 0, 0.18], [0, 0, 0.18], [0.6, 0, 0.18]] });
}

// low dry-stone wall span (lumpy stones with the rock texture)
export function makeStoneWall(seed, lod = 0) {
  const R = mulberry32(seed), mb = new MB(), sc = lod ? 1.6 : 1;
  for (let y = 0.12; y < 0.8; y += 0.24 * sc) for (let x = -1.2; x < 1.2; x += (0.35 + R() * 0.25) * sc) {
    const sx = (0.3 + R() * 0.25) * sc, sy = 0.22 * sc + R() * 0.06;
    box(mb, x + sx / 2, y, (R() - 0.5) * 0.06, sx, sy, 0.55 - y * 0.2, STONE.clone().multiplyScalar(0.8 + R() * 0.3), 3, (R() - 0.5) * 0.1);
  }
  return geo(mb, { colliders: [[-1.2, 0, 0.4], [-0.4, 0, 0.4], [0.4, 0, 0.4]] });
}

export function makeWell(seed, lod = 0) {
  const R = mulberry32(seed), mb = new MB(), segs = lod ? 8 : 14;
  for (let i = 0; i < segs; i++) {
    const a = i / segs * Math.PI * 2, r = 0.95;
    box(mb, Math.cos(a) * r, 0.42, Math.sin(a) * r, 0.36, 0.84, 0.48, STONE.clone().multiplyScalar(0.85 + R() * 0.25), 2, -a + Math.PI / 2);
  }
  box(mb, 0, 0.1, 0, 1.5, 0.2, 1.5, C('#1d2a30'), 0);                                            // dark water
  for (const s of [-1, 1]) box(mb, s * 1.05, 1.2, 0, 0.14, 2.0, 0.14, WOOD_D, 7);
  box(mb, 0, 2.15, 0, 2.4, 0.12, 0.12, WOOD_D, 7);
  quad(mb, V3(-1.4, 2.25, -0.9), V3(1.4, 2.25, -0.9), V3(1.4, 2.75, 0), V3(-1.4, 2.75, 0), C('#a57d64'), 5, V3(0, 1, -1));
  quad(mb, V3(1.4, 2.25, 0.9), V3(-1.4, 2.25, 0.9), V3(-1.4, 2.75, 0), V3(1.4, 2.75, 0), C('#a57d64'), 5, V3(0, 1, 1));
  if (lod === 0) { cyl(mb, 0.25, 1.35, 0, 0.16, 0.26, 8, WOOD, 7); box(mb, 0.25, 1.75, 0, 0.02, 0.5, 0.02, IRON, 0); }   // bucket on its rope
  return geo(mb, { colliders: [[0, 0, 1.25]] });
}

// Hateno lamp post: a slender pole on two crossed braces, a lantern hanging from a short arm, a pale pennant
export function makeLantern(seed, lod = 0) {
  const R = mulberry32(seed), mb = new MB(), lean = (R() - 0.5) * 0.06, top = 2.95;
  const T = V3(lean, top, 0);
  beam(mb, V3(0, -0.3, 0), T, 0.11, WOOD_D);
  if (lod < 2) for (const s of [-1, 1]) beam(mb, V3(s * 0.55, -0.15, s * 0.18), V3(lean * 0.3, 0.95, 0), 0.08, WOOD_D);
  beam(mb, V3(lean - 0.04, top - 0.18, 0), V3(lean + 0.46, top - 0.18, 0), 0.06, WOOD_D);
  const lx = lean + 0.4, ly = top - 0.5;
  box(mb, lx, ly, 0, 0.18, 0.26, 0.18, GLOW, 11);
  box(mb, lx, ly + 0.16, 0, 0.24, 0.05, 0.24, IRON, 0); box(mb, lx, ly - 0.15, 0, 0.2, 0.04, 0.2, IRON, 0);
  if (lod === 0) {
    beam(mb, V3(lx, ly + 0.18, 0), V3(lx, top - 0.2, 0), 0.02, IRON, 0);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(mb, lx + sx * 0.09, ly, sz * 0.09, 0.025, 0.27, 0.025, IRON, 0);
    // pennant on the pole top, opposite the arm
    const c = C('#efe6d2');
    quad(mb, V3(lean - 0.05, top - 0.02, 0), V3(lean - 0.42, top - 0.1, 0.02), V3(lean - 0.42, top - 0.3, 0.02), V3(lean - 0.05, top - 0.34, 0), c, 0, V3(0, 0, 1));
    quad(mb, V3(lean - 0.05, top - 0.02, 0), V3(lean - 0.05, top - 0.34, 0), V3(lean - 0.42, top - 0.3, 0.02), V3(lean - 0.42, top - 0.1, 0.02), c, 0, V3(0, 0, -1));
  }
  return geo(mb, { colliders: [[0, 0, 0.2]], lights: [[lx, ly - 0.05, 0, 9]] });
}

export function makeBarrel(seed, lod = 0) {
  const R = mulberry32(seed), mb = new MB(), segs = lod ? 8 : 14;
  cyl(mb, 0, 0.45, 0, 0.36, 0.9, segs, WOOD.clone().multiplyScalar(0.85 + R() * 0.2), 7, 'y', WOOD_D);
  if (lod === 0) for (const y of [0.15, 0.75]) cyl(mb, 0, y, 0, 0.375, 0.06, segs, IRON, 0);
  return geo(mb, { colliders: [[0, 0, 0.4]] });
}

export function makeCrate(seed, lod = 0) {
  const R = mulberry32(seed), mb = new MB(), s = 0.6 + R() * 0.25;
  box(mb, 0, s / 2, 0, s, s, s, WOOD.clone().multiplyScalar(0.9 + R() * 0.2), 7);
  if (lod === 0) for (const [x, z, sx, sz] of [[0, s / 2, s + 0.02, 0.06], [0, -s / 2, s + 0.02, 0.06], [s / 2, 0, 0.06, s + 0.02], [-s / 2, 0, 0.06, s + 0.02]]) {
    box(mb, x, 0.05, z, sx, 0.1, sz, WOOD_D, 7); box(mb, x, s - 0.05, z, sx, 0.1, sz, WOOD_D, 7);
  }
  return geo(mb, { colliders: [[0, 0, s * 0.7]] });
}

export function makeHaybale(seed, lod = 0) {
  const mb = new MB();
  cyl(mb, 0, 0.6, 0, 0.6, 1.25, lod ? 8 : 16, C('#f2d58c'), 4, 'x', C('#d6b46a'));
  return geo(mb, { colliders: [[-0.4, 0, 0.6], [0.4, 0, 0.6]] });
}

export function makeWoodpile(seed, lod = 0) {
  const R = mulberry32(seed), mb = new MB();
  for (let row = 0; row < 4; row++) for (let k = 0; k < 6 - row; k++) {
    const r = 0.11 + R() * 0.04;
    cyl(mb, -0.75 + k * 0.27 + row * 0.13, 0.12 + row * 0.22, 0, r, 1.1 + R() * 0.2, lod ? 5 : 8, C('#6e5440').multiplyScalar(0.85 + R() * 0.3), 7, 'z', C('#c9a477'));
  }
  return geo(mb, { colliders: [[-0.4, 0, 0.6], [0.4, 0, 0.6]] });
}

export function makeCart(seed, lod = 0) {
  const R = mulberry32(seed), mb = new MB();
  box(mb, 0, 0.75, 0, 1.6, 0.1, 1.1, WOOD, 7);
  for (const s of [-1, 1]) { box(mb, 0, 0.98, s * 0.55, 1.6, 0.36, 0.06, WOOD, 7); box(mb, s * 0.8, 0.98, 0, 0.06, 0.36, 1.1, WOOD, 7); }
  for (const s of [-1, 1]) {
    cyl(mb, 0, 0.5, s * 0.64, 0.5, 0.08, lod ? 10 : 18, WOOD_D, 7, 'z');
    if (lod === 0) for (let k = 0; k < 4; k++) box(mb, 0, 0.5, s * 0.69, 0.9, 0.05, 0.04, WOOD, 7, 0), box(mb, 0, 0.5, s * 0.69, 0.05, 0.9, 0.04, WOOD, 7, 0);
  }
  box(mb, 1.6, 0.62, 0.3, 1.8, 0.07, 0.07, WOOD_D, 7, 0.08); box(mb, 1.6, 0.62, -0.3, 1.8, 0.07, 0.07, WOOD_D, 7, -0.08);
  if (lod === 0 && R() < 0.7) for (let k = 0; k < 3; k++) cyl(mb, -0.4 + k * 0.4, 1.05, 0, 0.18, 0.5, 10, C('#f2d58c'), 4, 'x');
  return geo(mb, { colliders: [[-0.4, 0, 0.75], [0.4, 0, 0.75], [1.6, 0, 0.3]] });
}

export function makeSignpost(seed, lod = 0) {
  const R = mulberry32(seed), mb = new MB();
  box(mb, 0, 1.1, 0, 0.12, 2.2, 0.12, WOOD_D, 7);
  for (let k = 0; k < 2; k++) {
    const y = 1.55 + k * 0.38, rot = (R() - 0.5) * 1.6 + k * 1.2;
    box(mb, Math.cos(rot) * 0.35, y, -Math.sin(rot) * 0.35, 0.8, 0.22, 0.04, WOOD, 7, rot);
  }
  return geo(mb, { colliders: [[0, 0, 0.15]] });
}

// market stall: posts, counter, striped cloth awning, baskets of produce
export function makeStall(seed, lod = 0) {
  const R = mulberry32(seed), mb = new MB(), cloth = [C('#c9463a'), C('#3f6a8a'), C('#d9a43a'), C('#5f7d3e')][Math.floor(R() * 4)];
  for (const [x, z] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]]) box(mb, x, 1.2, z, 0.1, 2.4, 0.1, WOOD_D, 7);
  box(mb, 0, 0.85, 0.55, 2.7, 0.08, 0.7, WOOD, 7); box(mb, 0, 0.42, 0.85, 2.7, 0.84, 0.06, WOOD.clone().multiplyScalar(0.85), 7);
  const stripes = lod ? 1 : 6;
  for (let k = 0; k < stripes; k++) {
    const x0 = -1.5 + k * 3 / stripes, x1 = -1.5 + (k + 1) * 3 / stripes, col = k % 2 && !lod ? C('#f0e8d8') : cloth;
    quad(mb, V3(x0, 2.6, -1.0), V3(x1, 2.6, -1.0), V3(x1, 2.25, 1.25), V3(x0, 2.25, 1.25), col, 8, V3(0, 1, 0.2));
    quad(mb, V3(x0, 2.58, -1.0), V3(x1, 2.58, -1.0), V3(x1, 2.23, 1.25), V3(x0, 2.23, 1.25), col.clone().multiplyScalar(0.7), 8, V3(0, -1, -0.2));
  }
  if (lod === 0) {
    const produce = [C('#d8402f'), C('#e8a23a'), C('#7fb046'), C('#8a5a9a')];
    for (let b = 0; b < 4; b++) {
      const x = -1.0 + b * 0.68, col = produce[Math.floor(R() * produce.length)];
      box(mb, x, 0.98, 0.55, 0.55, 0.18, 0.45, WOOD_D, 7);
      for (let k = 0; k < 7; k++) addBlob(mb, V3(x + (R() - 0.5) * 0.38, 1.1, 0.55 + (R() - 0.5) * 0.3), 0.07, 0, { lump: 0.1, nblend: 0, sway: () => 0, color: () => col.clone().multiplyScalar(0.85 + R() * 0.3) });
    }
  }
  return geo(mb, { colliders: [[-1.0, 0, 0.7], [0, 0, 0.7], [1.0, 0, 0.7]] });
}

// windmill: tapered octagonal stone tower, shingled cap, four-armed rotor with sails facing +z
export function makeWindmill(seed, lod = 0) {
  const mb = new MB(), H = 9, r0 = 2.4, r1 = 1.7, sides = 8, hub = H + 0.9;
  for (let i = 0; i < sides; i++) {
    const a0 = (i + 0.5) / sides * Math.PI * 2, a1 = (i + 1.5) / sides * Math.PI * 2, am = (a0 + a1) / 2;
    quad(mb, V3(Math.cos(a0) * r0, 0, Math.sin(a0) * r0), V3(Math.cos(a1) * r0, 0, Math.sin(a1) * r0), V3(Math.cos(a1) * r1, H, Math.sin(a1) * r1), V3(Math.cos(a0) * r1, H, Math.sin(a0) * r1), PLASTER, 8, V3(Math.cos(am), 0, Math.sin(am)));
  }
  box(mb, 0, -0.4, 0, r0 * 2.1, 0.9, r0 * 2.1, STONE.clone().multiplyScalar(0.85), 10);
  // cap: an eight-sided cone of shingles
  for (let i = 0; i < sides; i++) {
    const a0 = (i + 0.5) / sides * Math.PI * 2, a1 = (i + 1.5) / sides * Math.PI * 2, am = (a0 + a1) / 2, rr = r1 + 0.35;
    const p0 = V3(Math.cos(a0) * rr, H, Math.sin(a0) * rr), p1 = V3(Math.cos(a1) * rr, H, Math.sin(a1) * rr), tip = V3(0, H + 2.6, 0);
    const n = V3(Math.cos(am), 0.7, Math.sin(am)).normalize();
    const ids = [p0, p1, tip].map(P => mb.v(P.x, P.y, P.z, n.x, n.y, n.z, C('#8a95a6'), 0, Math.atan2(P.z, P.x) * rr, -P.y, 5));
    if (p1.clone().sub(p0).cross(tip.clone().sub(p0)).dot(n) > 0) mb.tri(ids[0], ids[1], ids[2]); else mb.tri(ids[0], ids[2], ids[1]);
  }
  // door and a window
  quad(mb, V3(-0.5, 0.05, r0 - 0.08), V3(0.5, 0.05, r0 - 0.08), V3(0.5, 2.0, r0 - 0.18), V3(-0.5, 2.0, r0 - 0.18), WOOD_D, 7, V3(0, 0, 1));
  quad(mb, V3(-0.3, 5.0, (r0 + r1) / 2 + 0.05), V3(0.3, 5.0, (r0 + r1) / 2 + 0.05), V3(0.3, 5.9, (r0 + r1) / 2), V3(-0.3, 5.9, (r0 + r1) / 2), GLOW, 6, V3(0, 0.1, 1));
  // rotor (card + 10 spins about z through the hub; aSway carries the hub height)
  const zf = r1 + 0.7;
  box(mb, 0, hub, zf - 0.3, 0.5, 0.5, 0.9, WOOD_D, 27, 0, null, hub);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + 0.3, c = Math.cos(a), s = Math.sin(a), L = 6.2;
    const arm = (t, o) => V3(c * t - s * o, hub + s * t + c * o, zf);
    // arm spar
    quad(mb, arm(0.3, -0.08), arm(L, -0.08), arm(L, 0.08), arm(0.3, 0.08), WOOD_D, 27, V3(0, 0, 1), undefined, hub);
    if (lod === 2) continue;
    // sail: a cloth panel on a lattice beside the spar
    const sc = C('#efe6d2');
    quad(mb, arm(1.4, 0.1), arm(L, 0.1), arm(L, 1.15), arm(1.4, 0.95), sc, 28, V3(0, 0, 1), undefined, hub);
    quad(mb, arm(1.4, 0.1), arm(L, 0.1), arm(L, 1.15), arm(1.4, 0.95), sc.clone().multiplyScalar(0.8), 28, V3(0, 0, -1), undefined, hub);
    if (lod === 0) for (let t = 1.4; t <= L + 0.01; t += 0.48) quad(mb, arm(t, 0.08), arm(t + 0.05, 0.08), arm(t + 0.05, 1.18), arm(t, 1.18), WOOD_D, 27, V3(0, 0, 1), undefined, hub);
  }
  return geo(mb, { colliders: [[0, 0, r0 + 0.3]] });
}

// crops: a cabbage rosette and a wheat clump (many stalks with ears)
export function makeCabbage(seed) {
  const R = mulberry32(seed), mb = new MB(), sw = () => 0;
  addBlob(mb, V3(0, 0.16, 0), 0.15, 1, { lump: 0.12, nblend: 0, sway: sw, color: () => C('#a9c97a') });
  for (let k = 0; k < 9; k++) { const a = k * 2.4 + R(), d = V3(Math.cos(a), 0, Math.sin(a)); addPetal(mb, V3(0, 0.05, 0), d, 0.28 + R() * 0.08, 0.22, 0.5, 0.5, C('#4f7f3a'), C('#8db96a'), sw); }
  return geo(mb, {});
}
export function makeWheat(seed, lod = 0) {
  const R = mulberry32(seed), mb = new MB(), n = lod ? 10 : 26;
  for (let k = 0; k < n; k++) {
    const x = (R() - 0.5) * 0.5, z = (R() - 0.5) * 0.5, h = 0.8 + R() * 0.3, lx = x + (R() - 0.5) * 0.12, lz = z + (R() - 0.5) * 0.12;
    const stem = C('#c9b067'), ear = C('#e2c578').multiplyScalar(0.9 + R() * 0.2), sw = P => Math.max(0, P.y / h) ** 1.5 * 0.4;
    const a = mb.v(x - 0.006, 0, z, 0, 0, 1, stem, 0), b = mb.v(x + 0.006, 0, z, 0, 0, 1, stem, 0), c = mb.v(lx, h - 0.12, lz, 0, 0, 1, stem, sw(V3(0, h, 0)));
    mb.tri(a, b, c); mb.tri(a, c, b);
    addBlob(mb, V3(lx, h, lz), 0.025, 0, { lump: 0.1, squash: 3.2, nblend: 0, sway: () => sw(V3(0, h, 0)), color: () => ear });
  }
  return geo(mb, {});
}
