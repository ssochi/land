// Village props: fences and low stone walls (one 2.4m span each, placed along a polyline by m.fence), well,
// lantern post (a point light after dusk), barrel, crate, hay bale, wood pile, cart, signpost, market stall,
// windmill (the rotor turns in the vertex shader) and crops. Same conventions as buildings.js: uv in metres,
// material cards for the prop shader, userData.colliders / lights / smoke.
// LOD: each prop has one piece of modelling code; its lighter level is the same code run under the toolkit's
// withDetail (poly/mesh.js: fine bevels skipped, fewer segments), so the levels match in every part, colour
// and material and the switch is invisible.
import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { MB, V3, addBlob, addPetal } from './mesh-builder.js';
import { quad, box, beam, withChamfer } from './buildings.js';
import { Poly, rect2, circle2, fillet2, withDetail } from './poly/index.js';

const C = hex => new THREE.Color(hex);
const WOOD = C('#a7825e'), WOOD_D = C('#6b4d36'), IRON = C('#3b3a38'), STONE = C('#b2a796'), GLOW = C('#ffd9a0'), PLASTER = C('#ecdcbc');

const geo = (mb, ud) => { const g = mb.geo(); g.userData = Object.assign({ colliders: [], lights: [], smoke: [] }, ud); return g; };

// toolkit helpers (poly/): bake a part, and a squared timber from A to B (w across `up`, d along the side),
// chamfered and nudged out of true (o.sag bows it down in the middle, metres)
const M = new THREE.Matrix4(), X = V3(1, 0, 0), Y = V3(0, 1, 0), Z = V3(0, 0, 1);
const put = (mb, p, col, card, o = {}) => p.toMB(mb, Object.assign({ color: col, card }, o));
function timber(mb, A, B, w, d, col, R, up = Y, o = {}) {
  const ax = B.clone().sub(A), L = ax.length(); ax.divideScalar(L);
  let az = ax.clone().cross(up); if (az.lengthSq() < 1e-6) az = ax.clone().cross(X); az.normalize();
  const ay = az.clone().cross(ax), p = Poly.box(L, w, d, { u: X }).bevel({ width: Math.min(0.025, 0.2 * Math.min(w, d)), segments: 1 });
  p.jitter(Math.min(w, d) * 0.07, 3, R() * 100);
  if (o.sag) p.warp(q => { q.y -= o.sag * (1 - (2 * q.x / L) ** 2); });
  put(mb, p, col, o.card || 7, { at: M.makeBasis(ax, ay, az).setPosition(A.clone().add(B).multiplyScalar(0.5)) });
}
// a hewn post standing from y0 to y1 with a pointed top
function post(mb, x, z, w, y0, y1, col, R, lean = 0) {
  const p = Poly.box(w, y1 - y0, w, { u: Y }).translate(0, (y1 - y0) / 2, 0).extrude('py', w * 0.6);
  p.warp(q => { if (q.y > y1 - y0 + w * 0.3) { q.x *= 0.3; q.z *= 0.3; } }).bevel({ width: w * 0.12, segments: 1 }).jitter(w * 0.05, 3, R() * 100);
  put(mb, p, col, 7, { at: M.makeRotationZ(lean).setPosition(x, y0, z) });
}
// a closed hoop (band) round the y axis at height y: radius r, a w × t section
const hoop = (r, y, w, t, segs = 20) => Poly.sweep(circle2(r, segs).map(([x, z]) => V3(x, y, z)), rect2(t, w), {}, { closed: true });

// one fence span along x from −1.2 to 1.2 (post at the start; the next span supplies the end post)
export const makeFence = (seed, lod = 0) => withDetail(lod, () => fence(seed));
function fence(seed) {
  const R = mulberry32(seed), mb = new MB(), lean = (R() - 0.5) * 0.05;
  post(mb, -1.2, 0, 0.14, -0.1, 1.25, WOOD_D, R, lean);
  for (const y of [0.45, 0.95]) { const dy = (R() - 0.5) * 0.04; timber(mb, V3(-1.27, y + dy, 0.095), V3(1.2, y - dy, 0.095), 0.12, 0.05, WOOD.clone().multiplyScalar(0.85 + R() * 0.2), R, Y, { sag: 0.015 }); }
  return geo(mb, { colliders: [[-1.2, 0, 0.18], [-0.6, 0, 0.18], [0, 0, 0.18], [0.6, 0, 0.18]] });
}

// low dry-stone wall span: lumpy stones (rounded by a creased subdivision, then knocked out of shape) in courses
export const makeStoneWall = (seed, lod = 0) => withDetail(lod, () => stoneWall(seed));
function stoneWall(seed) {
  const R = mulberry32(seed), mb = new MB();
  for (let y = 0.12, row = 0; y < 0.8; y += 0.24, row++) for (let x = -1.2 + (row % 2) * 0.18; x < 1.2; x += 0.35 + R() * 0.25) {
    const sx = 0.3 + R() * 0.25, sy = 0.22 + R() * 0.06, sz = 0.55 - y * 0.2, col = STONE.clone().multiplyScalar(0.8 + R() * 0.3), rot = (R() - 0.5) * 0.1;
    const p = Poly.box(sx + 0.04, sy + 0.04, sz, {}).subdivide({ levels: 1, sharp: 30, crease: 0.45 }).jitter(0.025, 4, R() * 100);
    put(mb, p, col, 3, { at: M.makeRotationY(rot).setPosition(x + sx / 2, y, (R() - 0.5) * 0.06) });
  }
  return geo(mb, { colliders: [[-1.2, 0, 0.4], [-0.4, 0, 0.4], [0.4, 0, 0.4]] });
}

export const makeWell = (seed, lod = 0) => withDetail(lod, () => well(seed));
function well(seed) {
  const R = mulberry32(seed), mb = new MB();
  {
    // two courses of rounded dressed blocks, staggered, under a coping ring
    for (let c = 0; c < 2; c++) for (let i = 0, n = 12; i < n; i++) {
      const a = (i + c * 0.5) / n * Math.PI * 2, blk = Poly.box(0.5, 0.36, 0.38).bevel({ width: 0.045, segments: 2 }).jitter(0.015, 4, R() * 100);
      put(mb, blk, STONE.clone().multiplyScalar(0.82 + R() * 0.25), 13, { at: M.makeRotationY(-a + Math.PI / 2).setPosition(Math.cos(a) * 0.95, 0.18 + c * 0.38, Math.sin(a) * 0.95) });
    }
    put(mb, Poly.sweep(circle2(0.95, 24).map(([x, z]) => V3(x, 0.8, z)), fillet2(rect2(0.5, 0.1), 0.04, 2), {}, { closed: true }), STONE.clone().multiplyScalar(1.02), 13);
    put(mb, Poly.cylinder(0.75, 0.05, 16).translate(0, 0.25, 0), C('#1d2a30'), 0);                                 // dark water
    for (const sx of [-1, 1]) timber(mb, V3(sx * 1.05, 0.7, 0), V3(sx * 1.05, 2.2, 0), 0.14, 0.14, WOOD_D, R);
    timber(mb, V3(-1.25, 2.15, 0), V3(1.25, 2.15, 0), 0.12, 0.12, WOOD_D, R);
    for (const sz of [-1, 1]) {   // shingled roof boards on rafters
      const roof = Poly.box(2.9, 0.06, 1.05, { card: 5, vDown: true, u: X }).bevel({ width: 0.02, segments: 1 });
      put(mb, roof, C('#a57d64'), 5, { at: M.makeRotationX(sz * -0.5).setPosition(0, 2.5, sz * 0.45) });
    }
    const bucket = Poly.lathe([[0, 0], [0.15, 0], [0.17, 0.24], [0.15, 0.24], [0.135, 0.04], [0, 0.04]], 12).bevel({ width: 0.008, segments: 1 });
    put(mb, bucket, WOOD, 7, { at: M.makeTranslation(0.25, 1.2, 0) });
    put(mb, hoop(0.165, 1.37, 0.03, 0.01, 12), IRON, 0); box(mb, 0.25, 1.75, 0, 0.02, 0.5, 0.02, IRON, 0);   // hoop, rope
  }
  return geo(mb, { colliders: [[0, 0, 1.25]] });
}

// Hateno lamp post: a slender pole on two crossed braces, a lantern hanging from a short arm, a pale pennant
export const makeLantern = (seed, lod = 0) => withChamfer(lod === 0, () => withDetail(lod, () => lanternPost(seed)));
function lanternPost(seed) {
  const R = mulberry32(seed), mb = new MB(), lean = (R() - 0.5) * 0.06, top = 2.95;
  const T = V3(lean, top, 0);
  beam(mb, V3(0, -0.3, 0), T, 0.11, WOOD_D);
  for (const s of [-1, 1]) beam(mb, V3(s * 0.55, -0.15, s * 0.18), V3(lean * 0.3, 0.95, 0), 0.08, WOOD_D);
  beam(mb, V3(lean - 0.04, top - 0.18, 0), V3(lean + 0.46, top - 0.18, 0), 0.06, WOOD_D);
  const lx = lean + 0.4, ly = top - 0.5;
  box(mb, lx, ly, 0, 0.18, 0.26, 0.18, GLOW, 11);
  box(mb, lx, ly - 0.15, 0, 0.22, 0.04, 0.22, IRON, 0);
  {
    put(mb, Poly.box(0.28, 0.02, 0.28).extrude('py', 0.1).warp(q => { if (q.y > 0.05) { q.x *= 0.15; q.z *= 0.15; } }), IRON, 0, { at: M.makeTranslation(lx, ly + 0.14, 0) });   // hipped cap
    beam(mb, V3(lx, ly + 0.24, 0), V3(lx, top - 0.2, 0), 0.02, IRON, 0);
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(mb, lx + sx * 0.09, ly, sz * 0.09, 0.025, 0.27, 0.025, IRON, 0);
    // pennant on the pole top, opposite the arm
    const c = C('#efe6d2');
    quad(mb, V3(lean - 0.05, top - 0.02, 0), V3(lean - 0.42, top - 0.1, 0.02), V3(lean - 0.42, top - 0.3, 0.02), V3(lean - 0.05, top - 0.34, 0), c, 0, V3(0, 0, 1));
    quad(mb, V3(lean - 0.05, top - 0.02, 0), V3(lean - 0.05, top - 0.34, 0), V3(lean - 0.42, top - 0.3, 0.02), V3(lean - 0.42, top - 0.1, 0.02), c, 0, V3(0, 0, -1));
  }
  return geo(mb, { colliders: [[0, 0, 0.2]], lights: [[lx, ly - 0.05, 0, 9]] });
}

// barrel: bulging staves (each its own tone), a lip round a sunk lid, iron hoops
export const makeBarrel = (seed, lod = 0) => withDetail(lod, () => barrel(seed));
function barrel(seed) {
  const R = mulberry32(seed), mb = new MB(), base = WOOD.clone().multiplyScalar(0.85 + R() * 0.2), H = 0.9, r0 = 0.31, r1 = 0.37;
  const rad = y => r0 + (r1 - r0) * Math.sin(Math.PI * y / H);
  const segs = 16, prof = [[0, 0]];
  for (let k = 0; k <= 8; k++) prof.push([rad(k / 8 * H), k / 8 * H]);
  prof.push([r0 - 0.03, H], [r0 - 0.03, H - 0.035], [0, H - 0.035]);
  const p = Poly.lathe(prof, segs, { u: Y }).bevel({ width: 0.01, segments: 1 });
  const tone = Array.from({ length: segs }, () => 0.86 + R() * 0.24);
  p.F.forEach(f => { const c = p.center(f), i = Math.floor(((Math.atan2(c.z, c.x) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * segs) % segs; f.col = (f.tag === 'top' ? WOOD_D : base).clone().multiplyScalar(tone[i]); });
  put(mb, p, base, 7);
  for (const y of [0.12, 0.27, 0.63, 0.78]) put(mb, hoop(rad(y) + 0.006, y, 0.045, 0.012, segs), IRON, 0);
  return geo(mb, { colliders: [[0, 0, 0.4]] });
}

// crate: boards on every side between corner battens, the dark inside showing through the gaps
export const makeCrate = (seed, lod = 0) => withDetail(lod, () => crate(seed));
function crate(seed) {
  const R = mulberry32(seed), mb = new MB(), s = 0.6 + R() * 0.25, h = s / 2, base = WOOD.clone().multiplyScalar(0.9 + R() * 0.2);
  put(mb, Poly.box(s - 0.05, s - 0.05, s - 0.05).translate(0, h, 0), C('#3a2c20'), 0);
  for (const [n, a] of [[X, Z], [X.clone().negate(), Z], [Z, X], [Z.clone().negate(), X], [Y, X]]) {
    for (let k = 0; k < 3; k++) {
      const off = (k - 1) * s / 3, c = V3(0, h, 0).addScaledVector(n, h - 0.0125).addScaledVector(n.clone().cross(a), off);
      timber(mb, c.clone().addScaledVector(a, -h + 0.06), c.clone().addScaledVector(a, h - 0.06), 0.025, s / 3 - 0.014, base.clone().multiplyScalar(0.88 + R() * 0.2), R, n);
    }
  }
  for (const ax of [X, Y, Z]) for (const [p1, p2] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const o1 = ax === X ? Y : X, o2 = ax === Z ? Y : Z, c = V3(0, h, 0).addScaledVector(o1, p1 * (h - 0.02)).addScaledVector(o2, p2 * (h - 0.02));
    timber(mb, c.clone().addScaledVector(ax, -h), c.clone().addScaledVector(ax, h), 0.06, 0.06, WOOD_D.clone().multiplyScalar(0.9 + R() * 0.2), R, ax === Y ? X : Y);
  }
  return geo(mb, { colliders: [[0, 0, s * 0.7]] });
}

// hay bale: a soft round bale (a cylinder bevelled deep into its ends), two twine bands
export const makeHaybale = (seed, lod = 0) => withDetail(lod, () => haybale(seed));
function haybale(seed) {
  const R = mulberry32(seed), mb = new MB();
  const p = Poly.cylinder(0.6, 1.25, 20).bevel({ width: 0.13, segments: 3 }).jitter(0.025, 2.5, R() * 100);
  p.F.forEach(f => { f.col = Math.abs(p.normal(f).y) > 0.9 ? C('#d6b46a') : C('#f2d58c'); });
  put(mb, p, C('#f2d58c'), 4, { at: M.makeRotationZ(Math.PI / 2).setPosition(0.625, 0.6, 0) });
  for (const x of [-0.3, 0.3]) put(mb, hoop(0.607, 0, 0.025, 0.01, 20), C('#7a5a34'), 0, { at: M.makeRotationZ(Math.PI / 2).setPosition(x, 0.6, 0) });
  return geo(mb, { colliders: [[-0.4, 0, 0.6], [0.4, 0, 0.6]] });
}

// wood pile: split logs with bark sides and pale, softened end grain
export const makeWoodpile = (seed, lod = 0) => withDetail(lod, () => woodpile(seed));
function woodpile(seed) {
  const R = mulberry32(seed), mb = new MB();
  for (let row = 0; row < 4; row++) for (let k = 0; k < 6 - row; k++) {
    const r = 0.11 + R() * 0.04, L = 1.1 + R() * 0.2, x = -0.75 + k * 0.27 + row * 0.13, y = 0.12 + row * 0.22, bark = C('#6e5440').multiplyScalar(0.85 + R() * 0.3);
    const p = Poly.cylinder(r, L, 9, { u: Y }).bevel({ width: 0.012, segments: 1 }).jitter(0.008, 4, R() * 100);
    p.F.forEach(f => { if (Math.abs(p.normal(f).y) > 0.8) Object.assign(f, { col: C('#c99c68').multiplyScalar(0.9 + R() * 0.15), card: 0 }); else f.col = bark; });   // end grain
    put(mb, p, bark, 7, { at: M.makeRotationX(Math.PI / 2).setPosition(x, y, -L / 2) });
  }
  return geo(mb, { colliders: [[-0.4, 0, 0.6], [0.4, 0, 0.6]] });
}

// two-wheeled cart: plank bed with side boards, spoked wheels (rim, hub, spokes), shafts, sometimes a load of hay
export const makeCart = (seed, lod = 0) => withDetail(lod, () => cart(seed));
function cart(seed) {
  const R = mulberry32(seed), mb = new MB();
  for (let k = 0; k < 5; k++) timber(mb, V3(-0.8, 0.75, -0.55 + (k + 0.5) * 0.22), V3(0.8, 0.75, -0.55 + (k + 0.5) * 0.22), 0.06, 0.2, WOOD.clone().multiplyScalar(0.88 + R() * 0.2), R);
  for (const s of [-1, 1]) {
    for (const y of [0.88, 1.08]) timber(mb, V3(-0.82, y, s * 0.55), V3(0.82, y, s * 0.55), 0.17, 0.05, WOOD.clone().multiplyScalar(0.85 + R() * 0.2), R, Y);
    timber(mb, V3(s * 0.8, 0.8, -0.55), V3(s * 0.8, 0.8, 0.55), 0.06, 0.06, WOOD_D, R);
    for (const x of [-0.8, 0.8]) timber(mb, V3(x, 0.72, s * 0.57), V3(x, 1.2, s * 0.57), 0.07, 0.07, WOOD_D, R);
    // wheel: a rim swept round the circle, a hub, eight spokes
    const wz = s * 0.68, rim = Poly.sweep(circle2(0.47, 24).map(([x, y]) => V3(x, y, 0)), fillet2(rect2(0.08, 0.08), 0.02, 1), {}, { closed: true, up: Z });
    put(mb, rim, WOOD_D, 7, { at: M.makeTranslation(0, 0.5, wz) });
    put(mb, Poly.cylinder(0.11, 0.2, 10).bevel({ width: 0.02, segments: 1 }), WOOD_D, 7, { at: M.makeRotationX(Math.PI / 2).setPosition(0, 0.5, wz + 0.1) });
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; timber(mb, V3(Math.cos(a) * 0.1, 0.5 + Math.sin(a) * 0.1, wz), V3(Math.cos(a) * 0.44, 0.5 + Math.sin(a) * 0.44, wz), 0.045, 0.035, WOOD, R, Z); }
  }
  for (const s of [-1, 1]) timber(mb, V3(0.7, 0.72, s * 0.3), V3(2.5, 0.52, s * 0.42), 0.07, 0.07, WOOD_D, R, Y, { sag: -0.04 });
  if (R() < 0.7) for (let k = 0; k < 3; k++) {
    const hay = Poly.cylinder(0.2, 0.5, 12).bevel({ width: 0.05, segments: 2 }).jitter(0.015, 3, R() * 100);
    put(mb, hay, C('#f2d58c'), 4, { at: M.makeRotationZ(Math.PI / 2).setPosition(-0.4 + k * 0.4 + 0.25, 1.0, (R() - 0.5) * 0.3) });
  }
  return geo(mb, { colliders: [[-0.4, 0, 0.75], [0.4, 0, 0.75], [1.6, 0, 0.3]] });
}

// signpost: a hewn post with arrow-shaped boards pointing two ways
export const makeSignpost = (seed, lod = 0) => withDetail(lod, () => signpost(seed));
function signpost(seed) {
  const R = mulberry32(seed), mb = new MB();
  post(mb, 0, 0, 0.12, -0.1, 2.15, WOOD_D, R);
  const arrow = [[-0.4, -0.11], [0.3, -0.11], [0.43, 0], [0.3, 0.11], [-0.4, 0.11]];
  for (let k = 0; k < 2; k++) {
    const y = 1.55 + k * 0.38, rot = (R() - 0.5) * 1.6 + k * 1.2, flip = R() < 0.5 ? 1 : -1;
    const board = Poly.prism(arrow.map(([x, z]) => [x * flip, z]), 0.04, { u: X }).translate(0, -0.02, 0).rotate(X, Math.PI / 2).bevel({ width: 0.012, segments: 1 }).jitter(0.006, 4, R() * 100);
    put(mb, board, WOOD.clone().multiplyScalar(0.9 + R() * 0.2), 7, { at: M.makeRotationY(rot).setPosition(Math.cos(rot) * 0.35 * flip, y, -Math.sin(rot) * 0.35 * flip) });
  }
  return geo(mb, { colliders: [[0, 0, 0.15]] });
}

// market stall: posts, a counter of planks, a striped cloth awning that sags between its poles with a scalloped
// valance, baskets of produce
export const makeStall = (seed, lod = 0) => withDetail(lod, () => stall(seed));
function stall(seed) {
  const R = mulberry32(seed), mb = new MB(), cloth = [C('#c9463a'), C('#3f6a8a'), C('#d9a43a'), C('#5f7d3e')][Math.floor(R() * 4)];
  for (const [x, z] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]]) timber(mb, V3(x, 0, z), V3(x, 2.5 - (z > 0 ? 0.3 : 0), z), 0.1, 0.1, WOOD_D, R);
  put(mb, Poly.box(2.75, 0.08, 0.72).bevel({ width: 0.02, segments: 1 }).jitter(0.004, 3, seed), WOOD, 7, { at: M.makeTranslation(0, 0.85, 0.55) });
  for (let k = 0; k < 4; k++) timber(mb, V3(-1.35, 0.12 + k * 0.2, 0.86), V3(1.35, 0.12 + k * 0.2, 0.86), 0.19, 0.04, WOOD.clone().multiplyScalar(0.8 + R() * 0.15), R, Y);
  // awning: a grid sloping from back to front, bowed down between the poles, a scalloped valance along the front
  const stripes = 8, aw = Poly.grid(3.0, 2.25, stripes * 2, 6, {});
  aw.warp(q => { const t = q.z / 2.25 + 0.5, sx = q.x / 1.5; q.y = 2.62 - 0.36 * t - 0.09 * Math.sin(Math.PI * t) * (1 - 0.6 * sx * sx); q.z -= 0.0; });
  aw.F.forEach(f => { const c = aw.center(f); f.col = Math.floor((c.x / 3 + 0.5) * stripes) % 2 ? C('#f0e8d8') : cloth; });
  const val = new Poly(), nv = stripes * 6, top = [], bot = [];
  for (let i = 0; i <= nv; i++) { const x = -1.5 + 3 * i / nv, sc = Math.abs(Math.sin(Math.PI * i / 6)); top.push(val.vert([x, 2.26, 1.125])); bot.push(val.vert([x, 2.26 - 0.16 - 0.08 * sc, 1.135])); }
  for (let i = 0; i < nv; i++) val.face([bot[i], bot[i + 1], top[i + 1], top[i]], { col: Math.floor((i + 0.5) / nv * stripes) % 2 ? C('#f0e8d8') : cloth });
  put(mb, aw.solidify(0.02), cloth, 0); put(mb, val.solidify(0.015), cloth, 0);
  const produce = [C('#d8402f'), C('#e8a23a'), C('#7fb046'), C('#8a5a9a')];
  for (let b = 0; b < 4; b++) {
    const x = -1.0 + b * 0.68, col = produce[Math.floor(R() * produce.length)];
    put(mb, Poly.lathe([[0, 0], [0.2, 0], [0.27, 0.15], [0.25, 0.15], [0.18, 0.03], [0, 0.03]], 12).bevel({ width: 0.01, segments: 1 }), C('#b08850'), 4, { at: M.makeTranslation(x, 0.89, 0.55) });
    for (let k = 0; k < 9; k++) put(mb, Poly.icosphere(0.065, 1).jitter(0.008, 8, R() * 100), col.clone().multiplyScalar(0.85 + R() * 0.3), 0, { at: M.makeTranslation(x + (R() - 0.5) * 0.3, 1.03 + R() * 0.05, 0.55 + (R() - 0.5) * 0.24) });
  }
  return geo(mb, { colliders: [[-1.0, 0, 0.7], [0, 0, 0.7], [1.0, 0, 0.7]] });
}

// windmill: tapered octagonal stone tower, shingled cap, four-armed rotor with sails facing +z
export const makeWindmill = (seed, lod = 0) => withChamfer(lod === 0, () => windmill(seed));
function windmill(seed) {
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
    // sail: a cloth panel on a lattice beside the spar
    const sc = C('#efe6d2');
    quad(mb, arm(1.4, 0.1), arm(L, 0.1), arm(L, 1.15), arm(1.4, 0.95), sc, 28, V3(0, 0, 1), undefined, hub);
    quad(mb, arm(1.4, 0.1), arm(L, 0.1), arm(L, 1.15), arm(1.4, 0.95), sc.clone().multiplyScalar(0.8), 28, V3(0, 0, -1), undefined, hub);
    for (let t = 1.4; t <= L + 0.01; t += 0.48) quad(mb, arm(t, 0.08), arm(t + 0.05, 0.08), arm(t + 0.05, 1.18), arm(t, 1.18), WOOD_D, 27, V3(0, 0, 1), undefined, hub);
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
// the lighter level keeps every other stalk (the same draws in the same order), stems and ears thicker to cover
// the same area
export function makeWheat(seed, lod = 0) {
  const R = mulberry32(seed), mb = new MB(), k2 = lod ? Math.SQRT2 : 1;
  for (let k = 0; k < 26; k++) {
    const x = (R() - 0.5) * 0.5, z = (R() - 0.5) * 0.5, h = 0.8 + R() * 0.3, lx = x + (R() - 0.5) * 0.12, lz = z + (R() - 0.5) * 0.12;
    const stem = C('#c9b067'), ear = C('#e2c578').multiplyScalar(0.9 + R() * 0.2), sw = P => Math.max(0, P.y / h) ** 1.5 * 0.4;
    if (lod && k % 2) continue;
    const a = mb.v(x - 0.006 * k2, 0, z, 0, 0, 1, stem, 0), b = mb.v(x + 0.006 * k2, 0, z, 0, 0, 1, stem, 0), c = mb.v(lx, h - 0.12, lz, 0, 0, 1, stem, sw(V3(0, h, 0)));
    mb.tri(a, b, c); mb.tri(a, c, b);
    addBlob(mb, V3(lx, h, lz), 0.025 * k2, 0, { lump: 0.1, squash: 3.2 / k2, nblend: 0, sway: () => sw(V3(0, h, 0)), color: () => ear });
  }
  return geo(mb, {});
}
