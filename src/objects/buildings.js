// Village houses, generated from parameters. Modelled on Hateno Village (Breath of the Wild / Tears of the
// Kingdom): cream stucco over a rubble-stone base, steep roofs of chunky clay slabs whose own thick ends make the
// eaves and verges (no dark boards; rafter tails and purlin ends show under them), a tall tapering chimney propped
// with poles, small windows with pale sky-lit glass and faded slate shutters, flower boxes, a plank door under a little
// tiled canopy with a wall lamp, cloth banners. A house is a composition of blocks, not one box: the main body
// (gable or hipped roof), wings on its front or back wall (an L, T or cross plan, their roofs meeting the main
// roof in valleys), dormers on the front roof, a tall square tower with quoins and a pyramid roof (TotK) or a
// round one with a cone (BotW); each block has its own walls, openings and roof (planBlocks, buildBlock).
//   hateno  stucco, clay tile roof, tall chimney against a gable (the default look)
//   stone   rubble-stone walls with dressed quoins, clay tile roof, a stone stack through the roof
//   timber  white plaster in a dark timber frame, wooden shingle roof
//   hut     small weathered plank hut with a thatch roof
// front: 'eave' puts the long side (and the door) to the street, 'gable' turns a gable end to it.
// LOD: every level is the same house (same layout, colours and materials; details that only some levels draw
// use their own random streams). lod 0 is the close-up model (chamfered timber, every roof slab as geometry,
// rafter tails, mullions, flower boxes, door pots); lod 1 drops what is under a pixel or two from its distance
// (sharp timber, the tile texture on flat roof planes); lod 2 keeps every part that still shows as colour or
// silhouette — roof edges and boards, porch, banner, quoins, timber frame, shutters — but sets windows and the
// door flat on the wall. The model faces +z (front door) with its footprint
// centred on the origin. Surfaces carry uv in metres and a material card for the prop shader
// (0 vertex colour · 2 masonry · 3 rock · 4 thatch · 5 shingle · 6 lit glass · 7 wood · 8 stucco · 9 clay tile ·
// 10 rubble stone · 11 lamp glass · 13 dressed stone).
// On a slope the house stands on its stone base: base is how far the base reaches below the floor's ground
// level, lift raises the model above the ground at its centre, steps is the drop to the ground at the door
// (a flight of stone steps is built for it).
// userData: colliders (circles), smoke (chimney tops), lights (lamps: position + radius), footprint, door.
import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { MB, V3, sliceGrid, warp } from './mesh-builder.js';
import { Poly, bake, emit } from './poly/index.js';

const C = hex => new THREE.Color(hex);
// palette from TotK's Hateno (sampled from screenshots): near-white limestone, grey-brown timber
const STONE = C('#e0dac8'), TIMBER = C('#5c4a3d'), TIMBER_L = C('#8b7563'), IRON = C('#33312e'), GLOW = C('#ffd9a0');
const TILE_C = C('#ffffff'), THATCH_C = C('#ffffff'), SHINGLE_T = [C('#c49a7a'), C('#b48a70'), C('#a57d64')];
// lime-washed plaster: cream to warm white, the odd older ochre house (BotW's Hateno)
const WASH = { hateno: ['#f3e5cf', '#f5ebdb', '#efe0c8', '#f7efe3', '#eedcc0', '#f1e2c9'], stone: ['#d2c8b4'], timber: ['#f4efe4'], hut: ['#b3a38c'] };
const SHUTTER = [C('#8c9ea8'), C('#8197a2'), C('#9a9a8e'), C('#8e9c8c'), C('#a49a8f')];   // sun-faded slate blues, grey-greens, greys
// clay slabs are laid on texgen TILE's lattice: course r is offset by (r mod 2)/2 + SLAB_OFF[r mod 4] slabs
const SLAB_OFF = [0, 1 / 6, 0, 2 / 6];
const FRAME = C('#cfc4ae');   // window frames: limed, weathered wood, pale as TotK's (dark frames make every window a hole)
const QUOIN = C('#d3d1c8');   // dressed limestone at the corners: greyer and cooler than the lime-washed plaster
const BANNER = [C('#a3456b'), C('#5f7f3f'), C('#3f5f8f'), C('#b0703a')];
const BLOOM = [C('#ee7a2a'), C('#d8402f'), C('#e8c33a'), C('#e070a0'), C('#f2efe6')];
const POT = [C('#3f8f8a'), C('#4f7fa0'), C('#a0603f'), C('#b8653f')];
const CLOTH = ['#f2eee2', '#e6d8b8', '#9fb8d0', '#c4554a', '#8aa070', '#d8b25a', '#7f6fa0'].map(C);
const CURTAIN = ['#f3eee2', '#ead9b4', '#d9a092', '#b4c6d8', '#c9d6a8'].map(C);
const BLADE = ['#557f2c', '#668f34', '#7a9f40', '#4a7428', '#8aa84a'].map(C);
const STRAW = C('#c9a45e'), SOIL = C('#4a3a2a'), HERB = ['#6f7f3a', '#8a7a48', '#7a6a8a', '#94884e'].map(C);

// quad P0 P1 P2 P3; uv in metres along P0→P1 (u) and P0→P3 (v); `out` is the outward normal direction, used to
// pick the winding so the face is front-facing from outside
export function quad(mb, P0, P1, P2, P3, col, card, out, uv0 = [0, 0], sw = 0) {
  const U = P1.clone().sub(P0), Vv = P3.clone().sub(P0), lu = U.length() || 1, lv = Vv.length() || 1;
  // normal from the edges at P0, or from the diagonals when an edge has collapsed (the top course of a hip or
  // pyramid roof is a triangle drawn as a quad): a zero normal would light as NaN and blot out the bloom around it
  let n = U.clone().cross(Vv);
  if (n.lengthSq() < 1e-12) n = P2.clone().sub(P0).cross(P3.clone().sub(P1));
  if (n.lengthSq() < 1e-12 && out) n = out.clone();
  n.normalize();
  const flip = out && n.dot(out) < 0; if (flip) n.negate();
  U.divideScalar(lu); Vv.divideScalar(lv);
  const ids = [P0, P1, P2, P3].map(P => { const d = P.clone().sub(P0); return mb.v(P.x, P.y, P.z, n.x, n.y, n.z, col, sw, uv0[0] + d.dot(U), uv0[1] + d.dot(Vv), card); });
  if (flip) { mb.tri(ids[0], ids[2], ids[1]); mb.tri(ids[0], ids[3], ids[2]); } else { mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]); }
}

// While a close-up (lod 0) model is built, boxes and beams come out with chamfered edges (through the modelling
// toolkit, poly/): the chamfers catch the light and, with weighted normals, shade like the softened edges of real
// timber and dressed stone, where sharp boxes look machined. withChamfer(on, fn) sets it for one model.
let CHAMFER = 0;
export function withChamfer(on, fn) { const prev = CHAMFER; CHAMFER = on ? 1 : 0; try { return fn(); } finally { CHAMFER = prev; } }
const M4 = new THREE.Matrix4(), CHAMFERED = new Map();   // baked chamfered boxes by size (a house repeats most)
function chamfered(mb, c, ax, ay, az, sx, sy, sz, col, card) {
  const key = sx.toFixed(3) + ',' + sy.toFixed(3) + ',' + sz.toFixed(3);
  let b = CHAMFERED.get(key);
  if (!b) {
    const long = sy >= sx && sy >= sz ? V3(0, 1, 0) : sz > sx ? V3(0, 0, 1) : V3(1, 0, 0);   // wood grain along the piece
    b = bake(Poly.box(sx, sy, sz, { u: long }).bevel({ width: Math.min(0.03, 0.2 * Math.min(sx, sy, sz)), segments: 1 }));
    if (CHAMFERED.size > 4000) CHAMFERED.clear();
    CHAMFERED.set(key, b);
  }
  emit(mb, b, { at: M4.makeBasis(ax, ay, az).setPosition(c), color: col, card });
}

// axis-aligned box (rotated by rot about y around its centre); faces get uv in metres (side faces' v from v0);
// sw goes to aSway (wind sway weight, or the hub height for windmill rotor parts)
export function box(mb, cx, cy, cz, sx, sy, sz, col, card, rot = 0, topCol = null, sw = 0, v0 = 0) {
  const c = Math.cos(rot), s = Math.sin(rot), hx = sx / 2, hy = sy / 2, hz = sz / 2, uv = [0, v0];
  if (CHAMFER && !topCol && !sw && !v0 && Math.min(sx, sy, sz) > 0.012) return chamfered(mb, V3(cx, cy, cz), V3(c, 0, s), V3(0, 1, 0), V3(-s, 0, c), sx, sy, sz, col, card);
  const P = (x, y, z) => V3(cx + x * c - z * s, cy + y, cz + x * s + z * c), N = (x, y, z) => V3(x * c - z * s, y, x * s + z * c);
  quad(mb, P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), col, card, N(0, 0, 1), uv, sw);
  quad(mb, P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), col, card, N(0, 0, -1), uv, sw);
  quad(mb, P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), col, card, N(1, 0, 0), uv, sw);
  quad(mb, P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), col, card, N(-1, 0, 0), uv, sw);
  quad(mb, P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), topCol || col, card, N(0, 1, 0), undefined, sw);
  quad(mb, P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), col, card, N(0, -1, 0), undefined, sw);
}

// box on its own orthonormal axes ax ay az around centre c, sizes along them sx sy sz (u runs along ax)
export function obox(mb, c, ax, ay, az, sx, sy, sz, col, card) {
  if (CHAMFER && Math.min(sx, sy, sz) > 0.012) return chamfered(mb, c, ax, ay, az, sx, sy, sz, col, card);
  const P = (x, y, z) => c.clone().addScaledVector(ax, x * sx / 2).addScaledVector(ay, y * sy / 2).addScaledVector(az, z * sz / 2);
  const nx = ax.clone().negate(), ny = ay.clone().negate(), nz = az.clone().negate();
  quad(mb, P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), col, card, az);
  quad(mb, P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), col, card, nz);
  quad(mb, P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1), col, card, ay);
  quad(mb, P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), col, card, ny);
  quad(mb, P(1, -1, -1), P(1, -1, 1), P(1, 1, 1), P(1, 1, -1), col, card, ax);
  quad(mb, P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), col, card, nx);
}

// box on axes ax ay az (as obox) with its edges and corners chamfered by b: the bevels catch the light the way
// dressed stone does, where a sharp box looks machined
export function bevelBox(mb, c, ax, ay, az, sx, sy, sz, b, col, card) {
  const h = [sx / 2, sy / 2, sz / 2], A = [ax, ay, az], pt = v => c.clone().addScaledVector(ax, v[0]).addScaledVector(ay, v[1]).addScaledVector(az, v[2]);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {   // faces, inset by b
    const j = (i + 1) % 3, k = (i + 2) % 3, q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, w]) => { const v = [0, 0, 0]; v[i] = s * h[i]; v[j] = u * (h[j] - b); v[k] = w * (h[k] - b); return pt(v); });
    quad(mb, q[0], q[1], q[2], q[3], col, card, A[i].clone().multiplyScalar(s));
  }
  for (let i = 0; i < 3; i++) for (const si of [-1, 1]) for (const sj of [-1, 1]) {   // edge chamfers between faces i and j
    const j = (i + 1) % 3, k = (i + 2) % 3;
    const q = [[1, -1], [0, -1], [0, 1], [1, 1]].map(([onI, w]) => { const v = [0, 0, 0]; v[i] = si * (onI ? h[i] : h[i] - b); v[j] = sj * (onI ? h[j] - b : h[j]); v[k] = w * (h[k] - b); return pt(v); });
    quad(mb, q[0], q[1], q[2], q[3], col.clone().multiplyScalar(1.04), card, A[i].clone().multiplyScalar(si).addScaledVector(A[j], sj));
  }
  for (const s0 of [-1, 1]) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {   // corner facets
    const s = [s0, s1, s2], tri = [0, 1, 2].map(i => pt(s.map((si, a) => si * (a === i ? h[a] : h[a] - b))));
    const out = ax.clone().multiplyScalar(s0).addScaledVector(ay, s1).addScaledVector(az, s2), n = tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0]));
    const flip = n.dot(out) < 0; n.normalize(); if (flip) n.negate();
    const ids = tri.map(p => mb.v(p.x, p.y, p.z, n.x, n.y, n.z, col, 0, 0, 0, card));
    if (flip) mb.tri(ids[0], ids[2], ids[1]); else mb.tri(ids[0], ids[1], ids[2]);
  }
}

// a beam from A to B with a square section t; the section is rolled to keep one face toward `up`
export function beam(mb, A, B, t, col = TIMBER, card = 7, up = V3(0, 1, 0), t2 = t) {
  const ax = B.clone().sub(A), len = ax.length(); ax.divideScalar(len || 1);
  let az = ax.clone().cross(up); if (az.lengthSq() < 1e-6) az = ax.clone().cross(V3(1, 0, 0));
  az.normalize(); const ay = az.clone().cross(ax).normalize();
  obox(mb, A.clone().add(B).multiplyScalar(0.5), ax, ay, az, len, t, t2, col, card);
}

// surface of revolution about the vertical axis through (cx, cz): profile [[r, y], …]; o.sq > 2 squares the
// section off (superellipse), o.sx / o.sz stretch it, o.shade(j) darkens profile row j, o.flipV runs v from the
// top down (roof tiles need v down the slope), o.v0 offsets v. Smooth normals; uv: u around in metres, v along
// the profile.
export function lathe(mb, cx, cz, prof, segs, col, card, o = {}) {
  const sq = o.sq || 2, sx = o.sx || 1, sz = o.sz || 1, rot = o.rot || 0;
  const dirs = [];
  for (let i = 0; i <= segs; i++) {
    const a = rot + i / segs * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), k = Math.pow(Math.pow(Math.abs(c), sq) + Math.pow(Math.abs(s), sq), -1 / sq);
    // normal of the superellipse |x|^sq + |z|^sq = 1 (a squared-off section shades as flat sides, not a cylinder)
    const gx = Math.sign(c) * Math.pow(Math.abs(c * k), sq - 1) / sx, gz = Math.sign(s) * Math.pow(Math.abs(s * k), sq - 1) / sz, gl = Math.hypot(gx, gz) || 1;
    dirs.push([c * k * sx, s * k * sz, gx / gl, gz / gl, i / segs]);
  }
  const sn = [];
  for (let j = 0; j < prof.length - 1; j++) { const dr = prof[j + 1][0] - prof[j][0], dy = prof[j + 1][1] - prof[j][1], l = Math.hypot(dr, dy) || 1; sn.push([dy / l, -dr / l, l]); }
  const total = sn.reduce((a, s) => a + s[2], 0), rmax = Math.max(...prof.map(p => p[0])) * Math.max(sx, sz);
  let v = o.v0 || 0;
  for (let j = 0; j < sn.length; j++) {
    const [r0, y0] = prof[j], [r1, y1] = prof[j + 1], n = sn[j];
    const c0 = o.shade ? col.clone().multiplyScalar(o.shade(j)) : col, c1 = o.shade ? col.clone().multiplyScalar(o.shade(j + 1)) : col;
    const base = mb.p.length / 3, v0 = o.flipV ? total - v : v, v1 = o.flipV ? total - v - n[2] : v + n[2];   // (flipV ignores v0)
    for (let i = 0; i <= segs; i++) {
      const [x, z, nxr, nzr, t] = dirs[i], nl = Math.hypot(nxr * n[0], n[1], nzr * n[0]) || 1, u = t * Math.PI * 2 * rmax;
      mb.v(cx + x * r0, y0, cz + z * r0, nxr * n[0] / nl, n[1] / nl, nzr * n[0] / nl, c0, 0, u, v0, card);
      mb.v(cx + x * r1, y1, cz + z * r1, nxr * n[0] / nl, n[1] / nl, nzr * n[0] / nl, c1, 0, u, v1, card);
    }
    for (let i = 0; i < segs; i++) { const a = base + i * 2; mb.tri(a, a + 1, a + 2); mb.tri(a + 1, a + 3, a + 2); }
    v += n[2];
  }
}

// four-sided pyramid (a hipped cap) on the square of half-width `half` centred at (cx, y, cz), apex h above it
export function pyramid(mb, cx, y, cz, half, h, col, card) {
  const apex = V3(cx, y + h, cz);
  for (const [ax, az] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    const a = V3(cx + (ax - az) * half, y, cz + (az + ax) * half), b = V3(cx + (ax + az) * half, y, cz + (az - ax) * half);
    const e = b.clone().sub(a).cross(apex.clone().sub(a)), out = V3(ax, 0.6, az), n = e.clone().normalize();
    if (n.dot(out) < 0) n.negate();
    const sl = Math.hypot(half, h), ia = mb.v(a.x, a.y, a.z, n.x, n.y, n.z, col, 0, 0, sl, card), ib = mb.v(b.x, b.y, b.z, n.x, n.y, n.z, col, 0, 2 * half, sl, card), ic = mb.v(apex.x, apex.y, apex.z, n.x, n.y, n.z, col, 0, half, 0, card);
    if (e.dot(out) > 0) mb.tri(ia, ib, ic); else mb.tri(ia, ic, ib);
  }
}

// a window box's planting at c (the soil, box along ax, out of the wall along on, w long): small leaves fanning up
// and out over the front, two-sided and lit from above, with five-petalled flowers among them
const LEAF_G = C('#4c7f2e');
function planter(mb, c, ax, on, w, bloom, R) {
  const up = V3(0, 1, 0), nUp = V3(on.x * 0.35, 1, on.z * 0.35).normalize();
  for (let k = 0, n = Math.round(w * 80); k < n; k++) {
    const p = c.clone().addScaledVector(ax, (R() - 0.5) * w * 0.95).addScaledVector(on, (R() - 0.6) * 0.16);
    const d = up.clone().multiplyScalar(0.5 + R() * 0.6).addScaledVector(on, 0.15 + R() * 0.7).addScaledVector(ax, (R() - 0.5) * 1.1).normalize();
    const side = d.clone().cross(on); if (side.lengthSq() < 0.05) side.copy(ax); side.normalize();
    const l = 0.1 + R() * 0.09, m = p.clone().addScaledVector(d, l * 0.45), tip = p.clone().addScaledVector(d, l);
    const col = LEAF_G.clone().multiplyScalar(0.7 + R() * 0.4 + 0.25 * d.y), ids = [p, m.clone().addScaledVector(side, l * 0.3), tip, m.clone().addScaledVector(side, -l * 0.3)].map(q => mb.v(q.x, q.y, q.z, nUp.x, nUp.y, nUp.z, col, 0, 0, 0, 0));
    mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]); mb.tri(ids[0], ids[2], ids[1]); mb.tri(ids[0], ids[3], ids[2]);
  }
  for (let k = 0, n = Math.round(w * 26); k < n; k++) {
    const q = c.clone().addScaledVector(ax, (R() - 0.5) * w * 0.9).addScaledVector(on, 0.04 + R() * 0.14).addScaledVector(up, 0.07 + R() * 0.12);
    const f = on.clone().multiplyScalar(0.8).addScaledVector(up, 0.6 + R() * 0.4).addScaledVector(ax, (R() - 0.5) * 0.6).normalize();
    const t1 = f.clone().cross(up); if (t1.lengthSq() < 0.05) t1.copy(ax); t1.normalize(); const t2 = f.clone().cross(t1);
    const r = 0.045 + R() * 0.025, col = bloom.clone().multiplyScalar(0.88 + R() * 0.24), rot = R() * 6.283;
    const ctr = mb.v(q.x, q.y, q.z, f.x, f.y, f.z, C('#e8c040'), 0, 0, 0, 0), rim = [];
    for (let j = 0; j < 10; j++) {   // five petals: a ten-point star, every other point out at the petal tip
      const a = rot + j / 10 * 6.283, rr = j % 2 ? r * 0.45 : r, P = q.clone().addScaledVector(t1, Math.cos(a) * rr).addScaledVector(t2, Math.sin(a) * rr);
      rim.push(mb.v(P.x, P.y, P.z, f.x, f.y, f.z, col, 0, 0, 0, 0));
    }
    for (let j = 0; j < 10; j++) { mb.tri(ctr, rim[j], rim[(j + 1) % 10]); mb.tri(ctr, rim[(j + 1) % 10], rim[j]); }
  }
}

// fill in missing parameters from the style and seed. Every random draw happens whatever was given, so a
// house keeps its other features when one parameter is overridden.
//   massing (Hateno's houses are rarely one box): wings [{ side 'f'|'b', a, w, e, floors }] — a gabled wing on
//   the front or back wall of the main body (roof frame, ridge along x; a is its offset along the ridge, w its
//   width, e how far it reaches out); dormers (how many on the front roof); roofShape 'gable' | 'hip';
//   towerShape 'round' (BotW) | 'square' (TotK, with quoins and a steep pyramid roof).
//   lot: [w, d] the ground the house needs and lotC its centre (model frame; the lot is not centred when a wing
//   reaches out on one side).
export function houseParams(seed, p = {}) {
  const R = mulberry32(seed), u = Array.from({ length: 40 }, () => R());
  const style = p.style || ['hateno', 'hateno', 'stone', 'timber'][Math.floor(u[0] * 4)], hut = style === 'hut';
  const front = p.front || (hut ? 'eave' : u[1] < 0.35 ? 'gable' : 'eave');
  const long = hut ? 4.2 + u[2] * 1.2 : 7.4 + u[2] * 2.6, short = hut ? 3.6 + u[3] * 0.8 : 5.4 + u[3] * 1.4;
  const width = p.width || (front === 'gable' ? short : long), depth = p.depth || (front === 'gable' ? long : short);
  const floors = p.floors || (hut ? 1 : u[4] < (style === 'timber' ? 0.25 : 0.35) ? 2 : 1);
  const roof = p.roof || (hut ? 'thatch' : style === 'timber' ? 'shingle' : 'tile');
  // steep roofs, as on Hateno's houses: the roof is half the house seen from the street
  const pitch = p.pitch || (roof === 'thatch' ? 46 + u[5] * 6 : roof === 'tile' ? 38 + u[5] * 8 : 40 + u[5] * 8);
  let chimney = p.chimney != null ? p.chimney : !hut || u[6] < 0.4;
  if (chimney === true) chimney = style === 'hateno' && u[7] < 0.85 ? 'tall' : 'stack';
  // towers are landmarks: one house in eight or so (the village gives its chief's house one)
  const tower = typeof p.tower === 'number' ? p.tower : p.tower != null ? (p.tower ? 1.45 + u[9] * 0.45 : 0) : style === 'hateno' && u[8] < 0.14 ? 1.45 + u[9] * 0.45 : 0;
  const towerShape = p.towerShape || (u[19] < 0.55 ? 'square' : 'round');
  const doorA0 = p.doorA != null ? p.doorA : (front === 'gable' ? (u[16] - 0.5) * 0.6 : (u[16] - 0.5) * Math.max(0, (front === 'gable' ? depth : width) - 3.4) * 0.6);
  // a square tower stands at a front corner, the end away from the door (TotK's chief's house); a round one at a
  // back corner
  const towerSide = p.towerSide || (tower && towerShape === 'square' && front !== 'gable' && Math.abs(doorA0) > 0.2 ? -Math.sign(doorA0) : u[10] < 0.5 ? -1 : 1);
  const chimSide = p.chimSide || (tower ? -towerSide : u[11] < 0.5 ? -1 : 1);
  const banner = p.banner != null ? !!p.banner : !hut && u[12] < 0.35, quoins = p.quoins != null ? !!p.quoins : style === 'hateno' && u[17] < 0.5;
  const porch = p.porch != null ? !!p.porch : (style === 'stone' || style === 'timber') && u[13] < 0.45;
  const tint = p.tint != null ? p.tint : Math.floor(u[14] * 5), washes = WASH[style] || WASH.hateno;
  const wash = p.wash || washes[Math.floor(u[15] * washes.length)];
  const roofShape = p.roofShape || (!hut && roof !== 'thatch' && u[18] < 0.22 ? 'hip' : 'gable');
  const L = front === 'gable' ? depth : width, D = front === 'gable' ? width : depth;
  const doorA = doorA0;   // the door's offset along the front wall (model frame)
  // wings: an eave-front house grows one at the back (the street side keeps its door); a gable-front house, whose
  // door is in the +x gable, on either side, sometimes both (a T or a cross plan). Clear of the tower's corner and
  // the door gable.
  // given wings get defaults for what they leave out (on the back, centred, as tall as the house) and are kept on the wall
  let wings = Array.isArray(p.wings) ? p.wings.map(W => {
    const w = +Math.min(D * 0.9, Math.max(1.5, +W.w || Math.min(D * 0.78, 3.8))).toFixed(2), lim = Math.max(0, (L - w) / 2 - 0.3);
    return { side: W.side === 'f' ? 'f' : 'b', a: +Math.max(-lim, Math.min(lim, +W.a || 0)).toFixed(2), w, e: +Math.max(1, +W.e || 3.2).toFixed(2), floors: W.floors === 1 || W.floors === 2 ? W.floors : floors };
  }) : null;
  if (!wings) {
    wings = [];
    if (!hut && L >= 7 && u[20] < (style === 'hateno' ? 0.55 : 0.4)) {
      const sides = front === 'gable' ? (u[21] < 0.3 ? ['f', 'b'] : [u[21] < 0.65 ? 'f' : 'b']) : ['b'];
      sides.forEach((side, k) => {
        const w = +Math.min(D * 0.78, 3.3 + u[22 + k] * 1.5).toFixed(2), e = +(2.4 + u[24 + k] * 2.6).toFixed(2);
        const zs = side === 'f' ? 1 : -1, tz = front === 'gable' ? towerSide : towerShape === 'square' ? 1 : -1, tx = front === 'gable' ? -1 : towerSide;   // the tower's corner
        let lo = -(L - w) / 2 + 0.45, hi = (L - w) / 2 - 0.45;
        if (front === 'gable') hi -= 1.0;                                        // keep off the door gable
        if (tower && zs === tz) { if (tx < 0) lo += 2.2; else hi -= 2.2; }       // and off the tower
        if (hi < lo) return;
        const a = lo + (hi - lo) * (sides.length > 1 ? (k ? 0.75 : 0.25) : u[26]);
        wings.push({ side, a: +a.toFixed(2), w, e, floors: floors === 2 && u[27 + k] < 0.5 ? 1 : floors });
      });
    }
  }
  const dormers = p.dormers != null ? p.dormers : !hut && roof !== 'thatch' && L >= 6.5 && u[29] < 0.45 ? 1 + Math.floor(u[30] * Math.min(3, (L - 3.5) / 2.2)) : 0;
  // attachments (the clutter of a lived-in house): a timber pergola with a big lantern and a sign before the door,
  // a raised deck with a railing on a gable end, a lean-to woodshed, a shop sign on a bracket, ivy up a wall, a
  // laundry line out from a gable (or the back wall)
  const pick = (k, v, chance) => (p[k] != null ? !!p[k] : !hut && v < chance);
  const pergola = pick('pergola', u[31], 0.1), deck = pick('deck', u[32], 0.16), lean = pick('lean', u[33], 0.16), sign = pick('sign', u[34], 0.18), ivy = pick('ivy', u[35], 0.3), laundry = pick('laundry', u[36], 0.3);
  const Q = { style, front, width: +width.toFixed(2), depth: +depth.toFixed(2), floors, roof, pitch: +pitch.toFixed(1), chimney: chimney || false,
    tower: +tower.toFixed(2), towerSide, chimSide, banner, quoins, porch, tint, wash, roofShape, towerShape, wings, dormers, pergola, deck, lean, sign, ivy, laundry, doorA: +doorA.toFixed(2),
    base: p.base || 1.2, lift: p.lift || 0, steps: p.steps || 0, warp: p.warp !== false };
  // ground needed: the walls' footprints, overhangs and a chimney outside its gable, a porch, in the model frame
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [cx, cz, w, d] of houseFootprints(Q, 0.65)) { x0 = Math.min(x0, cx - w / 2); x1 = Math.max(x1, cx + w / 2); z0 = Math.min(z0, cz - d / 2); z1 = Math.max(z1, cz + d / 2); }
  return Object.assign(Q, { door: [+doorA.toFixed(2), +(depth / 2 + (porch ? 2.7 : 1.3)).toFixed(2)], lot: [+(x1 - x0).toFixed(2), +(z1 - z0).toFixed(2)], lotC: [+((x0 + x1) / 2).toFixed(2), +((z0 + z1) / 2).toFixed(2)] });
}

// the house's parts as rectangles [cx, cz, w, d] in the model frame (+z the street), each grown by m: main body,
// wings, tower, a tall chimney, a porch. The village keeps its clutter, flowers and other lots off them.
export function houseFootprints(P, m = 0) {
  const gable = P.front === 'gable', L = gable ? P.depth : P.width, D = gable ? P.width : P.depth, hx = L / 2, hz = D / 2, out = [];
  const add = (cx, cz, w, d) => out.push(gable ? [-cz, cx, d + 2 * m, w + 2 * m] : [cx, cz, w + 2 * m, d + 2 * m]);   // roof frame → model frame
  add(0, 0, L, D);
  for (const W of P.wings || []) { const zs = W.side === 'f' ? 1 : -1; add(W.a, zs * (hz + W.e) / 2, W.w, hz + W.e); }
  if (P.tower) {
    const s = P.towerShape === 'square' ? squareTower(P.tower) : 2 * P.tower + 0.2, k = P.towerShape === 'square' ? 0.32 : 0.3;
    const [tx, tz] = towerAt(P, hx, hz, s, k);
    add(tx, tz, s, s);
  }
  if (P.chimney === 'tall') add((gable ? -1 : P.chimSide) * (hx + 0.55), 0, 2.2, 2.6);
  if (P.porch) { if (gable) add(hx + 1.0, 0, 2.0, 3.6); else add(P.doorA, hz + 1.0, 3.6, 2.0); }
  if (P.pergola) { if (gable) add(hx + 1.0, P.doorA, 2.0, 3.4); else add(P.doorA, hz + 1.0, 3.4, 2.0); }
  const g = freeGables(P);
  if (P.deck && g[0]) add(g[0] * (hx + 1.0), 0, 2.1, Math.min(D - 0.6, 4.4));
  const ls = P.lean && leanSpot(P);
  if (ls) { if (ls.face === 'b') add(-ls.a, -(hz + 1.1), ls.ln + 0.5, 2.3); else add((ls.face === 'r' ? 1 : -1) * (hx + 1.1), 0, 2.3, ls.ln + 0.5); }
  const lsp = P.laundry && laundrySpot(P);
  if (lsp) { if (lsp.face === 'b') add(0, -(hz + 1.8), 3.4, 3.6); else add((lsp.face === 'r' ? 1 : -1) * (hx + 1.8), 0, 3.6, 3.4); }
  return out;
}
// gable ends (roof frame: −1 the −x end, +1 the +x end) free for a deck or a lean-to: not where the tall chimney
// stands, not a gable-front house's door gable, not where the tower's corner is
function freeGables(P) {
  const gable = P.front === 'gable', out = [];
  for (const sx of [-1, 1]) {
    if (P.chimney === 'tall' && (gable ? -1 : P.chimSide) === sx) continue;
    if (gable && sx > 0) continue;
    if (P.tower && (gable ? -1 : P.towerSide) === sx) continue;
    out.push(sx);
  }
  return out;
}
// where a lean-to goes (roof frame): against a free gable (the second one when a deck has the first), else against
// the back wall at the end away from the chimney, clear of wings; { face, a, ln } or null
function leanSpot(P) {
  const gable = P.front === 'gable', L = gable ? P.depth : P.width, D = gable ? P.width : P.depth, g = freeGables(P), gl = g[P.deck ? 1 : 0];
  if (gl) return { face: gl > 0 ? 'r' : 'l', a: 0, ln: Math.min(D - 0.8, 3.8) };
  const ln = Math.min(L * 0.45, 3.6), xs = gable ? 1 : -(P.chimSide || 1), x = xs * (L / 2 - ln / 2 - 0.3);   // roof-frame x of its middle
  if ((P.wings || []).some(W => W.side === 'b' && Math.abs(W.a - x) < W.w / 2 + ln / 2 + 0.3)) return null;
  if (P.tower && P.towerShape === 'round' && !gable && Math.sign(x) === P.towerSide) return null;
  return { face: 'b', a: -x, ln };   // on the back wall the along-coordinate runs toward −x
}
// where the laundry line goes: out from the next free gable (after a deck's and a lean-to's), else from the middle of
// the back wall when no wing or lean-to is there; { face } or null (the run along the wall is picked clear of windows)
function laundrySpot(P) {
  const g = freeGables(P), ls = P.lean && leanSpot(P), sx = g[(P.deck ? 1 : 0) + (ls && ls.face !== 'b' ? 1 : 0)];
  if (sx) return { face: sx > 0 ? 'r' : 'l' };
  if ((P.wings || []).some(W => W.side === 'b' && Math.abs(W.a) < W.w / 2 + 1.8) || (ls && ls.face === 'b' && Math.abs(ls.a) < ls.ln / 2 + 1.8)) return null;
  return { face: 'b' };
}
const squareTower = r => +(1.75 * r + 0.35).toFixed(2);   // side of a square tower for the round one's radius r
// where the tower stands (roof frame): a gable-front house's at the back gable's corner; an eave-front house's
// round one at a back corner, square one at a front corner
const towerAt = (P, hx, hz, s, k) => { const i = k * s * 0.6; return P.front === 'gable' ? [-(hx - i), P.towerSide * (hz - i)] : [P.towerSide * (hx - i), (P.towerShape === 'square' ? 1 : -1) * (hz - i)]; };

export function makeHouse(seed, lod = 0, params = {}) { return withChamfer(lod === 0, () => buildHouse(seed, lod, params)); }

// roof constants shared by the plan and the builder
const roofDims = (roof, pitch) => {
  const thatch = roof === 'thatch', tp = Math.tan(pitch * Math.PI / 180), cp = Math.cos(pitch * Math.PI / 180);
  return { thatch, tp, cp, sp: Math.sin(pitch * Math.PI / 180), ov: thatch ? 0.65 : 0.6, og: thatch ? 0.45 : 0.5, td: thatch ? 0 : 0.08, tt: thatch ? 0.36 : 0.09 };
};

// The house as blocks, in the roof frame (main body centred, ridge along x). Each block has its own walls,
// openings and roof, placed by a turn th about y and an offset (cx, cz); blocks interpenetrate and the depth
// buffer keeps the outermost surface, which is exactly the joined building: a wing's roof meets the main roof in
// a true valley (same eaves, same pitch) or, when lower, runs into its wall; a dormer's walls and roof sink into
// the roof they stand on; a tower rises through a corner. Parts left inside another block are hidden, and the
// builder keeps windows, quoins and trim off them.
function planBlocks(P, seed, y0, fh) {
  const gable = P.front === 'gable', L = gable ? P.depth : P.width, D = gable ? P.width : P.depth, hx = L / 2, hz = D / 2;
  // a single storey gets a knee wall up into the roof space (Hateno's cottages stand taller than their door and
  // windows by well over a metre; the bare storey height puts the eaves at the door head)
  const wallTop = f => y0 + f * fh + (f === 1 && P.style !== 'hut' ? 0.5 : 0);
  const R = mulberry32(seed * 31 + 11), rd = roofDims(P.roof, P.pitch), yW = wallTop(P.floors);
  const ridgeTop = yW + hz * rd.tp + (rd.td + rd.tt) / rd.cp;
  const main = { kind: 'main', cx: 0, cz: 0, th: 0, L, D, yF: y0, yW, floors: P.floors, roof: P.roof, pitch: P.pitch, shape: P.roofShape, sag: 0.03 + R() * 0.05 };
  const blocks = [main], obst = [];
  // chimney and round tower stand on the main body's frame (= the roof frame)
  const rT = P.tower, ts = P.towerSide;
  main.chim = P.chimney === 'tall' ? { x: (gable ? -1 : P.chimSide) * (hx + 0.55), z: (R() < 0.5 ? -1 : 1) * (0.95 + R() * 0.35) } : null;
  if (rT && P.towerShape === 'round') main.round = gable ? { x: -(hx - 0.2 * rT), z: ts * (hz - 0.3 * rT) } : { x: ts * (hx - 0.3 * rT), z: -(hz - 0.2 * rT) };
  if (rT && P.towerShape === 'square') {
    // tall and slender, rising well clear of the roof (TotK's chief's house: the tower stands about twice the
    // house's height), under a steep pyramid of tiles
    const s = squareTower(rT), [tx, tz] = towerAt(P, hx, hz, s, 0.32);
    blocks.push({ kind: 'tower', cx: tx, cz: tz, th: 0, L: s, D: s, yF: y0, yW: ridgeTop + 4.2 + R() * 2.2, floors: 1, roof: P.roof === 'thatch' ? 'tile' : P.roof, pitch: 64 + R() * 6, shape: 'hip', ov: 0.3, og: 0.3, trim: 0.6 });
    main.towerSq = { x: tx, z: tz, s };
  }
  if (main.chim && (main.round || main.towerSq) && gable) { const t = main.round || main.towerSq; main.chim.z = -Math.sign(t.z) * Math.abs(main.chim.z); }
  if (main.chim) obst.push({ x: main.chim.x, z: main.chim.z, r: 1.0 });
  if (main.round) obst.push({ x: main.round.x, z: main.round.z, r: rT });
  // wings: local x runs out of the main wall; the inner gable sits at the main body's centre line, hidden
  for (const W of P.wings || []) {
    const zs = W.side === 'f' ? 1 : -1, Lw = hz + W.e;
    blocks.push({ kind: 'wing', cx: W.a, cz: zs * Lw / 2, th: -zs * Math.PI / 2, L: Lw, D: W.w, yF: y0, yW: wallTop(W.floors), floors: W.floors, roof: P.roof, pitch: P.pitch, shape: 'gable', sag: 0.02 + R() * 0.03, inner: true });
  }
  // dormers on the front roof: little gabled boxes whose fronts stand a little up the slope
  if (P.dormers && P.roof !== 'thatch') {
    const n = P.dormers, surf = z => yW + (hz - z) * rd.tp + (rd.td + rd.tt) / rd.cp, zf = hz - 0.55 - R() * 0.35;
    const wingOn = x => (P.wings || []).some(W => W.side === 'f' && Math.abs(x - W.a) < W.w / 2 + 1.1);
    const reach = P.roofShape === 'hip' ? hx - hz - 0.2 + (hz - zf) : hx - 1.1;
    for (let k = 0; k < n; k++) {
      const x = n === 1 ? (R() - 0.5) * 0.8 : -reach * 0.7 + 1.4 * reach * k / (n - 1);
      if (Math.abs(x) > reach || wingOn(x) || obst.some(o => Math.abs(o.x - x) < 1.6 && o.z > 0) || (main.towerSq && main.towerSq.z > 0 && Math.abs(main.towerSq.x - x) < main.towerSq.s / 2 + 1.0)) continue;
      const w = 1.3 + R() * 0.25, yd0 = surf(zf) + 1.15 + R() * 0.2;
      // its ridge has to run into the main roof below the main ridge (a taller dormer's ridge pokes out of the roof
      // behind it): lowered as far as its window allows, then pitched as the main roof, else no dormer here
      const lim = surf(0.4) - 0.25;
      let dp = 0, dd = null, yd = 0;
      for (const pq of [Math.min(56, P.pitch + 8), P.pitch]) {
        const q = roofDims(P.roof, pq), rTop = y => y + (w / 2) * q.tp + (q.td + q.tt) / q.cp;
        const y = Math.max(surf(zf) + 0.95, Math.min(yd0, yd0 - (rTop(yd0) - lim)));
        if (rTop(y) <= lim) { dp = pq; dd = q; yd = y; break; }
      }
      if (!dd) continue;
      const rTop = y => y + (w / 2) * dd.tp + (dd.td + dd.tt) / dd.cp;
      const zb = hz - (rTop(yd) + 0.3 - yW - (rd.td + rd.tt) / rd.cp) / rd.tp, Ld = zf - zb;
      if (Ld < 0.8) continue;
      blocks.push({ kind: 'dormer', cx: x, cz: (zf + zb) / 2, th: -Math.PI / 2, L: Ld, D: w, yF: surf(zf) - 0.45, yW: yd, floors: 1, roof: P.roof, pitch: dp, shape: 'gable', ov: 0.2, og: 0.18, trim: 0.5, inner: true });
    }
  }
  return { blocks, obst, ridgeTop };
}

// local (block) → roof frame, and back
const toRoof = (B, x, z) => [B.cx + x * Math.cos(B.th) + z * Math.sin(B.th), B.cz - x * Math.sin(B.th) + z * Math.cos(B.th)];
const toLocal = (B, x, z) => { const dx = x - B.cx, dz = z - B.cz; return [dx * Math.cos(B.th) - dz * Math.sin(B.th), dx * Math.sin(B.th) + dz * Math.cos(B.th)]; };
// is a roof-frame point inside block B's solid (walls up to the eaves, then under its roof)?
function insideBlock(B, x, y, z, m = 0.02) {
  const [lx, lz] = toLocal(B, x, z), hx = B.L / 2 + m, hz = B.D / 2 + m;
  if (Math.abs(lx) > hx || Math.abs(lz) > hz || y < B.yF - 0.3) return false;
  const tp = Math.tan(B.pitch * Math.PI / 180);
  let top = B.yW + (B.D / 2 - Math.abs(lz)) * tp;
  if (B.shape === 'hip') top = Math.min(top, B.yW + (B.L / 2 - Math.abs(lx)) * tp);
  return y < top;
}

function buildHouse(seed, lod, params) {
  const P = houseParams(seed, params), mb = new MB(), gable = P.front === 'gable', hut = P.style === 'hut';
  const y0 = hut ? 0.35 : 0.55, fh = hut ? 2.4 : 2.85;
  const ud = { colliders: [], smoke: [], lights: [], footprint: [P.width, P.depth], door: [0, 0] };
  const plan = planBlocks(P, seed, y0, fh);
  // R lays a block out; details that only some LOD levels draw take their own streams (RQ quoins,
  // RW flower boxes, RB banner), so a level that skips one never shifts the draws behind it — every level is the
  // same house, down to the chimney's height and where the banner hangs
  const ctx = { P, mb, lod, y0, fh, yB: -P.base, ud, plan, hut, seed, style: P.style, wash: C(P.wash), shut: SHUTTER[P.tint % SHUTTER.length],
    RQ: mulberry32(seed * 31 + 101), RW: mulberry32(seed * 31 + 107), RB: mulberry32(seed * 31 + 109) };
  // the household's habits: curtain cloth, timber lintels over the windows, iron wall ties (and their shape)
  const RH = mulberry32(seed * 31 + 313);
  ctx.life = { curtain: CURTAIN[Math.floor(RH() * CURTAIN.length)], lintel: P.style === 'hateno' && RH() < 0.5, ties: !hut && P.style !== 'timber' && RH() < 0.65, tieX: RH() < 0.6 };
  plan.blocks.forEach((B, bi) => buildBlock(ctx, B, bi, mulberry32(seed * 31 + 7 + 977 * bi)));
  // footprint for walking and to keep grass and later placements out (main body and wings; the tower adds its own)
  for (const B of plan.blocks) {
    if (B.kind === 'dormer') continue;
    const hx = B.L / 2, hz = B.D / 2, pts = [];
    for (let x = -hx; x <= hx + 1e-6; x += 0.8) pts.push([x, hz, 0.45], [x, -hz, 0.45]);
    for (let z = -hz + 0.8; z < hz; z += 0.8) pts.push([hx, z, 0.45], [-hx, z, 0.45]);
    for (let x = -hx + 1.2; x < hx - 0.6; x += 1.4) for (let z = -hz + 1.2; z < hz - 0.6; z += 1.4) pts.push([x, z, 0.8]);
    for (const [x, z, r] of pts) { const [rx, rz] = toRoof(B, x, z); ud.colliders.push([rx, rz, r]); }
  }

  // lift onto the stone base
  if (P.lift) {
    for (let i = 1; i < mb.p.length; i += 3) mb.p[i] += P.lift;
    ud.smoke.forEach(s => { s[1] += P.lift; }); ud.lights.forEach(l => { l[1] += P.lift; });
  }
  // gable front: turn the roof frame a quarter so its +x gable faces +z: (x, z) → (−z, x)
  if (gable) {
    const p = mb.p, nn = mb.n;
    for (let i = 0; i < p.length; i += 3) { const x = p[i], z = p[i + 2]; p[i] = -z; p[i + 2] = x; const nx = nn[i], nz = nn[i + 2]; nn[i] = -nz; nn[i + 2] = nx; }
    ud.colliders = ud.colliders.map(([x, z, r]) => [-z, x, r]);
    ud.smoke = ud.smoke.map(([x, y, z]) => [-z, y, x]);
    ud.lights = ud.lights.map(([x, y, z, r]) => [-z, y, x, r]);
    ud.door = [-ud.door[1], ud.door[0]];
  }
  const g = mb.geo(); g.userData = ud;
  return g;
}

// one block, built in its own frame (ridge along x, centred) and then turned and moved into the roof frame
function buildBlock(ctx, B, bi, R) {
  const { P, mb, lod, fh, yB, hut, style, wash, shut, RQ, RW } = ctx;
  const main = B.kind === 'main', wing = B.kind === 'wing', dormer = B.kind === 'dormer', tw = B.kind === 'tower';
  const start = mb.p.length / 3, tri0 = mb.i.length, ud = { colliders: [], smoke: [], lights: [] };
  const floors = B.floors, roof = B.roof, L = B.L, D = B.D, hx = L / 2, hz = D / 2, y0 = B.yF, yW = B.yW;
  const wallCard = style === 'stone' && !dormer ? 10 : hut ? 7 : 8;
  const rd = roofDims(roof, B.pitch), { thatch, tp, cp, sp, td } = rd, tt = rd.tt;
  const ov = B.ov != null ? B.ov : rd.ov, og = B.og != null ? B.og : rd.og, trim = B.trim || 1;
  const hip = B.shape === 'hip', rx = hip ? Math.max(0, hx - hz) : hx;              // ridge half-length
  const eaveU = yW - ov * tp, ridgeU = yW + hz * tp, ridgeTop = ridgeU + (td + tt) / cp;
  const doorFace = main ? (P.front === 'gable' ? 'r' : 'f') : null, len = f => (f === 'f' || f === 'b' ? L : D);

  // wall-relative helpers: a point on face f at along-coordinate a, height y, raised o off the wall
  const onWall = (f, a, y, o) => f === 'f' ? V3(a, y, hz + o) : f === 'b' ? V3(-a, y, -hz - o) : f === 'r' ? V3(hx + o, y, -a) : V3(-hx - o, y, a);
  const outN = f => f === 'f' ? V3(0, 0, 1) : f === 'b' ? V3(0, 0, -1) : f === 'r' ? V3(1, 0, 0) : V3(-1, 0, 0);
  const alongV = f => f === 'f' ? V3(1, 0, 0) : f === 'b' ? V3(-1, 0, 0) : f === 'r' ? V3(0, 0, -1) : V3(0, 0, 1);
  // a flat panel on a wall (vert: uv u runs up it, so planks stand upright)
  const panel = (f, a, y, ww, h, o, col, card, vert = false) => {
    const c = onWall(f, a, y, o), u = alongV(f).multiplyScalar(ww / 2), bl = c.clone().sub(u), br = c.clone().add(u);
    if (vert) quad(mb, bl, bl.clone().setY(y + h), br.clone().setY(y + h), br, col, card, outN(f));
    else quad(mb, bl, br, br.clone().setY(y + h), bl.clone().setY(y + h), col, card, outN(f));
  };
  // a slat (thin box) on a wall, t thick
  const slat = (f, a, y, ww, h, o, t, col, card = 7) => {
    const c = onWall(f, a, y + h / 2, o + t / 2), ax = alongV(f);
    box(mb, c.x, c.y, c.z, ww, h, t, col, card, Math.atan2(-ax.z, ax.x));
  };
  // a local point hidden inside another block, or against the chimney / round tower
  const covered = (p, m = 0.02) => {
    const [x, z] = toRoof(B, p.x, p.z);
    return ctx.plan.blocks.some((O, oi) => oi !== bi && insideBlock(O, x, p.y, z, m)) || ctx.plan.obst.some(o => Math.hypot(x - o.x, z - o.z) < o.r + 0.5);
  };
  const exposed = (f, a, y, w, h) => [[-w / 2, 0], [w / 2, 0], [-w / 2, h], [w / 2, h], [0, h / 2]].every(([da, dy]) => !covered(onWall(f, a + da, y + dy, 0.12)));

  // ── stone base: a rubble band down into the ground (so slopes never show a gap), nearly flush with the stucco;
  // where the plaster has worn off above it, the prop shader shows the same stonework ──
  if (!dormer) box(mb, 0, (y0 + 0.05 + yB) / 2, 0, L + 0.04, y0 + 0.05 - yB, D + 0.04, STONE.clone().multiplyScalar(0.92), 10);

  // ── openings: windows along each wall per floor (small, as on Hateno's thick-walled houses), a small one high
  // in the gables; the door on the main body; a tower gets a slit window per stage, a dormer one in its face ──
  const doorA = P.doorA, door = { w: hut ? 0.95 : 1.08, h: hut ? 1.9 : 2.1 };
  const openings = [];
  const tryWin = (o) => { if (exposed(o.f, o.a, o.y, o.ww + 0.5, o.wh)) openings.push(o); };
  if (main || wing) {
    for (let fl = 0; fl < floors; fl++) {
      const sill = y0 + fl * fh + (fl === 0 ? 1.05 : 0.95);
      for (const f of ['f', 'b', 'l', 'r']) {
        const ln = len(f), n = Math.max(1, Math.floor((ln - 1.0) / 2.5));
        if ((f === 'l' || f === 'r') && f !== doorFace && R() < 0.3) continue;
        for (let k = 0; k < n; k++) {
          const a = -ln / 2 + (k + 0.5) * ln / n;
          if ((f === doorFace && fl === 0 && Math.abs(a - doorA) < 1.35) || R() < 0.12) continue;
          tryWin({ f, a, y: sill, ww: hut ? 0.56 : 0.66, wh: fl === 0 ? 0.82 : 0.76 });
        }
      }
    }
    if (!hut && !hip && hz * tp > 1.2) for (const f of ['l', 'r']) if (R() < (f === doorFace ? 0.95 : 0.6)) tryWin({ f, a: 0, y: yW + 0.22, ww: 0.44, wh: 0.54, small: true });
  } else if (tw) {
    for (const f of ['f', 'r', 'b', 'l']) for (const y of [y0 + 1.15, (ctx.plan.ridgeTop + yW) / 2 - 0.35, yW - 1.15]) if (R() < 0.75) tryWin({ f, a: (R() - 0.5) * 0.3, y, ww: 0.42, wh: 0.62, small: true, slit: true });
  } else if (dormer) openings.push({ f: 'r', a: 0, y: y0 + 0.62, ww: 0.56, wh: 0.66, small: true, dormer: true });

  // ── walls: faces with holes cut for the door and the windows (deep plaster reveals), shaded darker toward the
  // ground and broadly up under the eaves, their corners softly rounded by a narrow strip whose normals turn the
  // corner ──
  const CH = hut ? 0 : 0.07;
  const eaveRows = [[y0 - 0.05, 0.88], [y0 + 0.6, 0.99], [yW - 1.5, 0.97], [yW, 0.68]].filter((r, i, a) => i === 0 || r[0] > a[i - 1][0]);
  const gableRows = hip ? eaveRows : [[y0 - 0.05, 0.88], [y0 + 0.6, 0.99], [yW, 0.93]].filter((r, i, a) => i === 0 || r[0] > a[i - 1][0]);
  const rowsOf = f => (f === 'f' || f === 'b' ? eaveRows : gableRows);
  const shadeAt = (rows, y) => {
    for (let k = 1; k < rows.length; k++) if (y <= rows[k][0]) { const [ya, ka] = rows[k - 1], [yb, kb] = rows[k]; return ka + (kb - ka) * Math.max(0, y - ya) / (yb - ya); }
    return rows[rows.length - 1][1];
  };
  // stucco v is the height above the wall's foot (the prop shader wears the plaster off there); a dormer's foot is
  // buried in the roof, so its v starts high and it never wears
  const vf = y0 - 0.05 - (dormer ? 4 : 0);
  // aSway on stucco carries 1 + how far below a drip edge (the eave, a window sill) the point is: the prop shader runs
  // rain streaks down from there (0: no edge known, as on a chimney)
  const wv = (p, n, k, u, v, dr = 7) => mb.v(p.x, p.y, p.z, n.x, n.y, n.z, wash.clone().multiplyScalar(k), 1 + dr, u, v - vf, wallCard);
  const holes = { f: [], b: [], l: [], r: [] };
  if (lod < 2) {
    for (const o of openings) if (!o.small) holes[o.f].push({ a0: o.a - o.ww / 2, a1: o.a + o.ww / 2, y0: o.y, y1: o.y + o.wh, dp: 0.24, sill: true });
    if (main) holes[doorFace].push({ a0: doorA - door.w / 2, a1: doorA + door.w / 2, y0: y0 - 0.05, y1: y0 + door.h, dp: 0.16 });
  }
  for (const f of ['f', 'r', 'b', 'l']) {
    if (B.inner && f === 'l') continue;   // the inner end of a wing or dormer is inside what it joins
    const rows = rowsOf(f), half = len(f) / 2, n = outN(f), a0 = -half + CH, a1 = half - CH;
    const ys = [...new Set([...rows.map(r => r[0]), ...holes[f].flatMap(h => [h.y0, h.y1])])].sort((p, q) => p - q);
    // drip edges: the eave over an eave wall (any wall of a hipped block), each window's sill over the strip below it
    // (cut as its own column, so the streaks start under the sill)
    const eave = f === 'f' || f === 'b' || hip, cols = openings.filter(o => o.f === f && !o.small).map(o => [o.a - o.ww / 2 - 0.1, o.a + o.ww / 2 + 0.1, o.y - 0.09]);
    const q = (x0, x1, ya, yb) => {
      const c = cols.find(([c0, c1, sy]) => (x0 + x1) / 2 > c0 && (x0 + x1) / 2 < c1 && yb <= sy + 1e-3), dr = y => Math.max(0, c ? c[2] - y : eave ? yW - y : 7);
      const ids = [[x0, ya], [x1, ya], [x1, yb], [x0, yb]].map(([a, y]) => wv(onWall(f, a, y, 0), n, shadeAt(rows, y), a + half, y, dr(y)));
      mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]);
    };
    for (let k = 0; k < ys.length - 1; k++) {
      const ya = ys[k], yb = ys[k + 1], ym = (ya + yb) / 2, cuts = cols.filter(c => c[2] >= yb - 1e-3).flatMap(c => [c[0], c[1]]);
      const seg = (x0, x1) => { let x = x0; for (const c of cuts.filter(c => c > x0 + 0.02 && c < x1 - 0.02).sort((p, r) => p - r)) { q(x, c, ya, yb); x = c; } q(x, x1, ya, yb); };
      let x = a0;
      for (const h of holes[f].filter(h => h.y0 < ym && h.y1 > ym).sort((p, r) => p.a0 - r.a0)) { if (h.a0 > x) seg(x, h.a0); x = Math.max(x, h.a1); }
      if (a1 > x) seg(x, a1);
    }
    for (const h of holes[f]) {   // reveals: sides, head and sill, set back dp, darker inside
      const al = alongV(f), W = (a, y, o) => onWall(f, a, y, o);
      quad(mb, W(h.a0, h.y0, 0), W(h.a0, h.y0, -h.dp), W(h.a0, h.y1, -h.dp), W(h.a0, h.y1, 0), wash.clone().multiplyScalar(0.86), wallCard, al, [0, h.y0 - vf], 8);
      quad(mb, W(h.a1, h.y0, 0), W(h.a1, h.y0, -h.dp), W(h.a1, h.y1, -h.dp), W(h.a1, h.y1, 0), wash.clone().multiplyScalar(0.86), wallCard, al.clone().negate(), [0, h.y0 - vf], 8);
      quad(mb, W(h.a0, h.y1, 0), W(h.a1, h.y1, 0), W(h.a1, h.y1, -h.dp), W(h.a0, h.y1, -h.dp), wash.clone().multiplyScalar(0.68), wallCard, V3(0, -1, 0), [0, h.y1 - vf], 8);
      if (h.sill) quad(mb, W(h.a0, h.y0, 0), W(h.a1, h.y0, 0), W(h.a1, h.y0, -h.dp), W(h.a0, h.y0, -h.dp), wash.clone().multiplyScalar(0.95), wallCard, V3(0, 1, 0), [0, h.y0 - vf], 8);
    }
  }
  if (CH) for (const [f1, f2] of [['f', 'r'], ['r', 'b'], ['b', 'l'], ['l', 'f']]) {
    const r1 = rowsOf(f1), r2 = rowsOf(f2), h1 = len(f1) / 2, h2 = len(f2) / 2, ids = [];
    for (const y of [...new Set([...r1, ...r2].map(r => r[0]))].sort((p, q) => p - q))
      ids.push([wv(onWall(f1, h1 - CH, y, 0), outN(f1), shadeAt(r1, y), 2 * h1 - CH, y, f1 === 'f' || f1 === 'b' || hip ? Math.max(0, yW - y) : 7), wv(onWall(f2, -h2 + CH, y, 0), outN(f2), shadeAt(r2, y), 2 * h1 - CH * 0.6, y, f2 === 'f' || f2 === 'b' || hip ? Math.max(0, yW - y) : 7)]);
    for (let k = 0; k < ids.length - 1; k++) { const [a, b] = ids[k], [d, c] = ids[k + 1]; mb.tri(a, b, c); mb.tri(a, c, d); }
  }
  if (!hip) for (const sx of [1, -1]) {   // gable triangles, shaded toward the apex under the roof
    if (B.inner && sx < 0) continue;
    const x = sx * hx, n = V3(sx, 0, 0), pts = [[-(hz - CH), yW, 0.95], [hz - CH, yW, 0.95], [0, ridgeU, 0.7]];
    const ids = pts.map(([z, y, k]) => mb.v(x, y, z, n.x, 0, 0, wash.clone().multiplyScalar(k), 8, hz - sx * z, y - vf, wallCard));
    if (sx > 0) mb.tri(ids[0], ids[2], ids[1]); else mb.tri(ids[0], ids[1], ids[2]);
  }
  // quoins: big dressed stones up the corners, long and short in turn, standing proud of the wall and butted with
  // no plaster between them (a gap shows the lit wall and the corner reads as a ladder); their deep bevels make
  // the dark joints. A touch greyer than the plaster, each its own tone. A square tower always has them (TotK).
  if (!dormer && (style === 'stone' || P.quoins || tw)) for (const [f1, f2] of [['f', 'r'], ['r', 'b'], ['b', 'l'], ['l', 'f']]) {
    const h1 = len(f1) / 2, a1 = alongV(f1), a2 = alongV(f2), t = 0.04, sc = tw ? 0.9 : 1;
    for (let y = y0 + 0.02, k = 0; y < yW - 0.35; k++) {
      const bh = Math.min((0.4 + RQ() * 0.1) * sc, yW - y), l1 = ((k % 2 ? 0.36 : 0.66) + RQ() * 0.08) * sc, l2 = ((k % 2 ? 0.66 : 0.36) + RQ() * 0.08) * sc;
      const c = onWall(f1, h1, y + bh / 2, 0).addScaledVector(a1, (t - l1) / 2).addScaledVector(a2, (l2 - t) / 2);
      const qc = QUOIN.clone().multiplyScalar(0.9 + RQ() * 0.14);
      y += bh;
      if (covered(c.clone().addScaledVector(a1, l1 * 0.3).addScaledVector(a2, -l2 * 0.3), 0.05)) continue;
      if (lod === 0) bevelBox(mb, c, a1, V3(0, 1, 0), a2, l1 + t, bh, l2 + t, 0.04, qc, 13); else obox(mb, c, a1, V3(0, 1, 0), a2, l1 + t, bh - 0.03, l2 + t, qc, 13);
    }
  }

  // a square tower's dressed-stone bands: one where it clears the roof, a cornice under its eaves
  if (tw) for (const y of [ctx.plan.ridgeTop + 0.35, yW - 0.1]) box(mb, 0, y, 0, L + 0.14, 0.18, D + 0.14, STONE.clone().multiplyScalar(1.02), 13);

  if (main) {
    // door: a planked leaf set back in its reveal behind a heavy frame, iron strap hinges, a stone step (or a
    // flight down to the ground), a canopy on brackets and a wall lamp
    const dDp = lod < 2 ? 0.16 : -0.03;
    panel(doorFace, doorA, y0, door.w, door.h, -dDp, TIMBER_L.clone().multiplyScalar(0.85), 7, true);
    const dO = outN(doorFace), dAl = alongV(doorFace);
    if (lod < 2) {
      for (const s of [-1, 1]) slat(doorFace, doorA + s * (door.w / 2 + 0.08), y0, 0.16, door.h + 0.1, 0, 0.13, TIMBER);
      slat(doorFace, doorA, y0 + door.h, door.w + 0.42, 0.2, 0, 0.15, TIMBER);
      if (lod === 0) for (const yy of [y0 + 0.35, y0 + door.h - 0.45]) slat(doorFace, doorA - 0.1, yy, door.w * 0.72, 0.06, -dDp, 0.02, IRON, 0);
      const drop = y0 + P.steps, n = P.steps > 0.25 ? Math.ceil(drop / 0.2) : 1, rise = drop / n, sw = door.w + 0.45;
      for (let k = 0; k < n; k++) {
        const dd = k ? 0.34 : 0.5, top = n === 1 ? y0 + 0.01 : y0 + 0.01 - k * rise, bot = n === 1 ? y0 - 0.3 : -P.steps - 0.4, st = onWall(doorFace, doorA, (top + bot) / 2, k ? 0.33 + k * 0.34 : 0.25);
        bevelBox(mb, st, V3(1, 0, 0), V3(0, 1, 0), V3(0, 0, 1), dAl.x ? sw : dd, top - bot, dAl.x ? dd : sw, 0.035, STONE.clone().multiplyScalar(0.8 + (k % 2) * 0.07), 13);
      }
      // lamp hung from an iron arm beside the door: glass in a frame of corner posts under a little hipped cap
      const ls = doorA - door.w / 2 - 0.45, lp = onWall(doorFace, ls, y0 + 1.95, 0.34), lw = 0.2;
      beam(mb, onWall(doorFace, ls, y0 + 2.3, 0), onWall(doorFace, ls, y0 + 2.3, 0.38), 0.045, IRON, 0);
      beam(mb, onWall(doorFace, ls, y0 + 1.98, 0), onWall(doorFace, ls, y0 + 2.28, 0.3), 0.03, IRON, 0);
      box(mb, lp.x, lp.y + 0.22, lp.z, 0.02, 0.1, 0.02, IRON, 0);
      box(mb, lp.x, lp.y, lp.z, lw - 0.02, 0.24, lw - 0.02, GLOW, 11);
      for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(mb, lp.x + px * lw / 2, lp.y, lp.z + pz * lw / 2, 0.025, 0.26, 0.025, IRON, 0);
      box(mb, lp.x, lp.y - 0.14, lp.z, lw + 0.04, 0.04, lw + 0.04, IRON, 0);
      pyramid(mb, lp.x, lp.y + 0.12, lp.z, lw / 2 + 0.05, 0.12, IRON, 0);
      ud.lights.push([lp.x + dO.x * 0.2, lp.y, lp.z + dO.z * 0.2, 7]);
    }
    if (!hut && !P.pergola) {
      // canopy: a tilted roof of tiles over the door on two angled brackets
      const cw = door.w + 0.75, cd = 0.8, cy = y0 + door.h + 0.42, tilt = 0.36;
      const ax = dAl.clone(), dn = V3(dO.x * Math.cos(tilt), -Math.sin(tilt), dO.z * Math.cos(tilt)), up = ax.clone().cross(dn).negate();
      const cc = onWall(doorFace, doorA, cy, 0).addScaledVector(dn, cd / 2);
      obox(mb, cc, ax, up, dn, cw, 0.07, cd, TIMBER_L, 7);
      if (roof === 'tile') obox(mb, cc.clone().addScaledVector(up, 0.07), ax, up, dn, cw + 0.1, 0.07, cd + 0.08, C('#e2a486'), 0);
      for (const s of [-1, 1]) beam(mb, onWall(doorFace, doorA + s * (cw / 2 - 0.15), cy - 0.55, 0.02), onWall(doorFace, doorA + s * (cw / 2 - 0.15), cy - 0.2, cd - 0.15), 0.07, TIMBER);
    }
    ud.door = (() => { const p = onWall(doorFace, doorA, 0, 1.3); return [p.x, p.z]; })();
  }

  // windows: set back in their reveals — dark glass (lit at night) in a slim frame with a cross mullion, a timber
  // sill out past the wall, plank shutters folded back flat against it, flower boxes under some ground-floor ones
  const RC = mulberry32(ctx.seed * 31 + 311 + 7 * bi);   // curtains: drawn for every window at every level
  for (const o of openings) {
    const deep = !o.small && lod < 2, dp = deep ? 0.24 : -0.02, cu = [RC(), RC(), RC()];
    panel(o.f, o.a, o.y, o.ww, o.wh, -dp, GLOW, 6);
    if (deep && cu[0] < 0.7) {   // curtains drawn half across inside the glass, or a café curtain over the lower half
      const cc = ctx.life.curtain, cw = o.ww * (0.22 + cu[1] * 0.16);
      if (cu[2] < 0.25) panel(o.f, o.a, o.y + 0.03, o.ww - 0.04, o.wh * 0.45, -dp + 0.012, cc, 0);
      else for (const s of [-1, 1]) panel(o.f, o.a + s * (o.ww / 2 - cw / 2 - 0.02), o.y + 0.03, cw, o.wh - 0.06, -dp + 0.012, cc.clone().multiplyScalar(s > 0 ? 1 : 0.93), 0, true);
    }
    if (deep && ctx.life.lintel && o.y + o.wh + 0.3 < yW) slat(o.f, o.a, o.y + o.wh, o.ww + 0.36, 0.14, 0, 0.05, TIMBER);   // a timber lintel over the opening
    if (lod === 2) {   // far away: the coloured shutters still read, as flat panels
      if (!hut && !o.small) for (const s of [-1, 1]) { const sw = o.ww / 2 + 0.05; panel(o.f, o.a + s * (o.ww / 2 + 0.03 + sw / 2), o.y - 0.02, sw, o.wh + 0.04, 0.01, shut, 7, true); }
      continue;
    }
    const fr = FRAME;
    if (!deep) {   // small windows sit on the wall in a plain frame (a tower's in dressed stone)
      const fc = o.slit ? STONE.clone().multiplyScalar(1.02) : FRAME, fk = o.slit ? 13 : 7;
      slat(o.f, o.a, o.y - 0.08, o.ww + 0.2, 0.08, 0, 0.1, fc, fk); slat(o.f, o.a, o.y + o.wh, o.ww + 0.2, 0.1, 0, 0.08, o.slit ? fc : fr, fk);
      for (const s of [-1, 1]) slat(o.f, o.a + s * (o.ww / 2 + 0.04), o.y, 0.08, o.wh, 0, 0.07, o.slit ? fc : fr, fk);
      if (o.dormer && lod === 0) slat(o.f, o.a, o.y + o.wh * 0.5, o.ww, 0.04, 0, 0.035, fr);
      continue;
    }
    const fb = -dp + 0.005;
    for (const s of [-1, 1]) slat(o.f, o.a + s * (o.ww / 2 - 0.03), o.y, 0.06, o.wh, fb, 0.05, fr);
    slat(o.f, o.a, o.y + o.wh - 0.06, o.ww, 0.06, fb, 0.05, fr); slat(o.f, o.a, o.y, o.ww, 0.06, fb, 0.05, fr);
    if (lod === 0) { slat(o.f, o.a, o.y, 0.04, o.wh, fb, 0.035, fr); slat(o.f, o.a, o.y + o.wh * 0.55, o.ww, 0.04, fb, 0.035, fr); }
    slat(o.f, o.a, o.y - 0.085, o.ww + 0.18, 0.08, -0.04, 0.16, STONE, 13);   // a stone sill
    if (!hut) for (const s of [-1, 1]) {
      const sw = o.ww / 2 + 0.05, sa = o.a + s * (o.ww / 2 + 0.03 + sw / 2);
      slat(o.f, sa, o.y - 0.02, sw, o.wh + 0.04, 0, 0.035, shut.clone().multiplyScalar(0.8));
      panel(o.f, sa, o.y - 0.02, sw - 0.01, o.wh + 0.04, 0.036, shut, 7, true);
      if (lod === 0) for (const yy of [o.y + 0.1, o.y + o.wh - 0.14]) slat(o.f, sa, yy, sw - 0.06, 0.05, 0.036, 0.015, shut.clone().multiplyScalar(0.72));
    }
    if (o.y < y0 + 1.2 && RW() < 0.55 && lod === 0) {
      const b = onWall(o.f, o.a, o.y - 0.33, 0.2), ax = alongV(o.f), bw = o.ww + 0.22;
      box(mb, b.x, b.y, b.z, ax.x ? bw : 0.26, 0.2, ax.x ? 0.26 : bw, TIMBER_L, 7);
      planter(mb, b.clone().setY(b.y + 0.09), ax, outN(o.f), bw, BLOOM[Math.floor(RW() * BLOOM.length)], RW);
    }
  }

  // timber frame (timber style): posts at corners and between openings, beams at the floor lines
  if (style === 'timber' && (main || wing)) for (const f of ['f', 'b', 'l', 'r']) {
    if (B.inner && f === 'l') continue;
    const ln = len(f), half = ln / 2;
    for (let fl = 0; fl <= floors; fl++) slat(f, 0, (fl === floors ? yW - 0.2 : y0 + fl * fh - 0.08), ln + 0.2, 0.2, -0.02, 0.1, TIMBER);
    const posts = Math.max(2, Math.round(ln / 2.2) + 1);
    for (let k = 0; k < posts; k++) {
      const a = -half + k * ln / (posts - 1);
      if (openings.some(o => o.f === f && Math.abs(o.a - a) < o.ww / 2 + 0.25) || (f === doorFace && Math.abs(a - doorA) < door.w / 2 + 0.3)) continue;
      if (covered(onWall(f, a, y0 + 1.0, 0.1))) continue;
      slat(f, a, y0, 0.18, yW - y0, -0.02, 0.1, TIMBER);
    }
  }

  // iron wall ties where the upper floor's beams are anchored through the walls (an X or a bar with a boss)
  if (ctx.life.ties && floors > 1 && (main || wing) && lod < 2) for (const f of ['f', 'b', 'l', 'r']) {
    if (B.inner && f === 'l') continue;
    const ln = len(f), y = y0 + fh - 0.12;
    for (const a of ln > 9 ? [-ln / 3, 0, ln / 3] : [-ln / 4, ln / 4]) {
      if ((f === doorFace && Math.abs(a - doorA) < 1.7) || covered(onWall(f, a, y, 0.1)) || openings.some(o => o.f === f && Math.abs(o.a - a) < o.ww / 2 + 0.3 && Math.abs(o.y - y) < 0.4)) continue;
      const c = onWall(f, a, y, 0.03), al = alongV(f), up = V3(0, 1, 0);
      if (ctx.life.tieX) for (const s of [-1, 1]) beam(mb, c.clone().addScaledVector(al, -0.2).addScaledVector(up, -0.2 * s), c.clone().addScaledVector(al, 0.2).addScaledVector(up, 0.2 * s), 0.035, IRON, 0);
      else beam(mb, c.clone().addScaledVector(up, -0.3), c.clone().addScaledVector(up, 0.3), 0.04, IRON, 0);
      const b = onWall(f, a, y, 0.06); box(mb, b.x, b.y, b.z, 0.08, 0.08, 0.08, IRON, 0);
    }
  }

  // ── roof ──
  roofOf(ctx, B, { hx, hz, rx, hip, yW, eaveU, ridgeU, ridgeTop, ov, og, td, tt, tp, cp, sp, thatch, trim, R });

  if (main) mainExtras(ctx, B, { hx, hz, rx, yW, ridgeTop, y0, doorFace, door, openings, onWall, outN, alongV, len, R, ud, vf, covered, slat, panel });

  // into the roof frame
  if (B.th || B.cx || B.cz) {
    const p = mb.p, nn = mb.n, c = Math.cos(B.th), s = Math.sin(B.th);
    for (let i = start * 3; i < p.length; i += 3) {
      const x = p[i], z = p[i + 2], nx = nn[i], nz = nn[i + 2];
      p[i] = B.cx + x * c + z * s; p[i + 2] = B.cz - x * s + z * c; nn[i] = nx * c + nz * s; nn[i + 2] = -nx * s + nz * c;
    }
  }
  for (const [x, z, r] of ud.colliders) { const [a, b] = toRoof(B, x, z); ctx.ud.colliders.push([a, b, r]); }
  const smoke = ud.smoke.map(([x, y, z]) => { const [a, b] = toRoof(B, x, z); return [a, y, b]; }), lights = ud.lights.map(([x, y, z, r]) => { const [a, b] = toRoof(B, x, z); return [a, y, b, r]; });
  // hand-built, not machined: the block is cut into a grid and bent by a smooth field (a dormer with the roof it sits
  // on), lamps and smoke moving with it
  if (P.warp) {
    sliceGrid(mb, tri0, [1.1, 1.8, 3.2][lod], dormer ? -Infinity : B.yF + 0.06, k => (k === 9 ? [1.5, 2.2, 3.2][lod] : 0));   // tile courses bend over a longer step
    warp(mb, start, fieldOf(ctx, dormer ? ctx.plan.blocks[0] : B), [...smoke, ...lights]);
  }
  ctx.ud.smoke.push(...smoke); ctx.ud.lights.push(...lights);
  if (main) ctx.ud.door = ud.door;
}

// The field that bends block B (its own frame): its walls lean a little and bow in or out between the corners (not at
// the foot, the corners or the eaves), the ridge sags in the middle and the eaves with it, eaves and rakes wave and
// the roof planes undulate by a few centimetres. Smooth everywhere, so pieces that touch stay together; its own random
// stream, so every LOD level bends the same way. fieldOf gives it in the roof frame.
function warpField(B, seed, bi) {
  const R = mulberry32(seed * 31 + 601 + 53 * bi), r = (a, b) => a + R() * (b - a), sg = () => (R() < 0.5 ? -1 : 1);
  const tw = B.kind === 'tower', hx = B.L / 2, hz = B.D / 2, y0 = B.yF, yW = B.yW, rd = roofDims(B.roof, B.pitch);
  const ov = B.ov != null ? B.ov : rd.ov, og = B.og != null ? B.og : rd.og, rx = B.shape === 'hip' ? Math.max(0, hx - hz) : hx;
  const eaveU = yW - ov * rd.tp, ridgeTop = yW + hz * rd.tp + (rd.td + rd.tt) / rd.cp;
  const lean = tw ? r(0.006, 0.014) : r(0.002, 0.008), la = R() * 6.283;
  const W = { lx: lean * Math.cos(la), lz: lean * Math.sin(la), bF: sg() * r(0.025, 0.06), bB: sg() * r(0.025, 0.06), bR: sg() * r(0.02, 0.05), bL: sg() * r(0.02, 0.05),
    sag: tw ? 0 : (B.sag || 0.03) * r(1.8, 2.6), span: rx + og + 0.3,
    wa: r(0.015, 0.03), fa: 6.283 / r(2.2, 4.0), pa: R() * 6.283, wb: r(0.01, 0.02), fb: 6.283 / r(1.8, 3.2), pb: R() * 6.283,
    ua: r(0.012, 0.025), fu: 6.283 / r(2.8, 5.0), pu: R() * 6.283, fv: 6.283 / r(2.4, 4.0), pv: R() * 6.283 };
  if (tw) { W.wa *= 0.4; W.wb *= 0.4; W.ua *= 0.4; }
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  return (x, y, z, o) => {
    const hy = Math.max(0, y - y0), h = hy < yW - y0 ? Math.sin(Math.PI * hy / (yW - y0)) : 0;
    const cx = Math.max(-1.2, Math.min(1.2, x / hx)), cz = Math.max(-1.2, Math.min(1.2, z / hz)), wx = Math.max(0, 1 - cx * cx), wz = Math.max(0, 1 - cz * cz);
    o[0] = W.lx * hy + (x > 0 ? W.bR : W.bL) * cx * wz * h; o[2] = W.lz * hy + (z > 0 ? W.bF : W.bB) * cz * wx * h; o[1] = 0;
    const rr = sm(yW - 1.2, yW - 0.2, y);
    if (rr === 0) return;
    const k = sm(eaveU - 0.2, ridgeTop, y), u = x / W.span;
    o[1] = rr * (-W.sag * Math.max(0, 1 - u * u) * (0.35 + 0.65 * k) + (1 - 0.5 * k) * (W.wa * Math.sin(W.fa * x + W.pa) + W.wb * Math.sin(W.fb * z + W.pb))
      + W.ua * Math.sin(W.fu * x + W.pu) * Math.sin(W.fv * z + W.pv));
  };
}
function fieldOf(ctx, B) {
  if (!B.fieldR) {
    const f = warpField(B, ctx.seed, ctx.plan.blocks.indexOf(B)), c = Math.cos(B.th), s = Math.sin(B.th);
    B.fieldR = (x, y, z, o) => {   // roof frame → block frame and back (toLocal / toRoof)
      const dx = x - B.cx, dz = z - B.cz;
      f(dx * c - dz * s, y, dx * s + dz * c, o);
      const a = o[0], b = o[2]; o[0] = a * c + b * s; o[2] = -a * s + b * c;
    };
  }
  return B.fieldR;
}

// ── roof: tiles on a timber deck. Gable: bargeboards along the rakes, purlin ends through the gables. Hip (and a
// tower's pyramid, a hip with no ridge): four planes, boards up the hips. Both: tile edge, fascia, soffit, rafter
// tails, ridge tiles; close up, a ragged edge of single tiles along the eaves and rakes. ──
function roofOf(ctx, B, d) {
  const { P, mb, lod } = ctx, roof = B.roof, main = B.kind === 'main', wing = B.kind === 'wing', dormer = B.kind === 'dormer';
  const { hx, hz, rx, hip, yW, eaveU, ridgeU, ridgeTop, ov, og, td, tt, tp, cp, sp, thatch, trim } = d;
  const rc = roof === 'tile' ? TILE_C : roof === 'shingle' ? SHINGLE_T[P.tint % 3] : THATCH_C, rCard = roof === 'tile' ? 9 : roof === 'shingle' ? 5 : 4;
  const xa = -hx - og, xb = hx + og, EX = hip ? hx + ov : xb;   // eave line ends (a hip's eaves go round the ends at ov)
  // one roof plane: courses (close up, tile roofs) or a single polygon. top: the middle of its upper edge; dn:
  // down the slope; ax: along the eave; n: normal; half(t): half-length of the plane at t down the slope; sl: slope
  // length; x0 offset of the plane's centre along ax (gable planes are not trimmed)
  const plane = (top, dn, ax, n, half, sl, verge = false) => {
    if (roof === 'tile' && lod === 0) {
      // close up, every slab is its own piece, on the texture's lattice (texgen TILE: 4 courses × 3 slabs per 2m,
      // course r offset by (r mod 2)/2 + SLAB_OFF[r mod 4]): each hangs its own way, its lower edge further down or
      // tilted, its lip raised more or less, so a course's edge is a jagged run of slab ends, not one straight line
      // (one line per course reads as weatherboard). The texture's slab face runs to just above its rim.
      const pc = 2 / 4, lip = 0.08, nC = Math.ceil(sl / pc - 0.05), RS = RTL;
      const at = (u, t, up) => top.clone().addScaledVector(ax, u).addScaledVector(dn, t).addScaledVector(n, up);
      const vtx = (p, nn, u, v, k = 1) => mb.v(p.x, p.y, p.z, nn.x, nn.y, nn.z, rc.clone().multiplyScalar(k), 0, u, v, rCard);
      const face = (A, Bp, Cp, Dp, uv, out, k) => {   // quad with explicit uv, wound to face `out`
        let nn = Bp.clone().sub(A).cross(Dp.clone().sub(A));
        if (nn.lengthSq() < 1e-12) nn = Cp.clone().sub(A).cross(Dp.clone().sub(Bp));
        nn.normalize(); const fl = nn.dot(out) < 0; if (fl) nn.negate();
        const ids = [A, Bp, Cp, Dp].map((p, i) => vtx(p, nn, uv[i][0], uv[i][1], k));
        if (fl) { mb.tri(ids[0], ids[2], ids[1]); mb.tri(ids[0], ids[3], ids[2]); } else { mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]); }
      };
      // a dark underlay just beneath the slabs: through any chink between them the eye meets roof, not the sky
      // (the soffit under the deck faces down and is culled from above)
      quad(mb, at(-half(0), 0, -0.012), at(half(0), 0, -0.012), at(half(sl), sl, -0.012), at(-half(sl), sl, -0.012), rc.clone().multiplyScalar(0.4), rCard, n, [-half(0), 0.45]);
      for (let k = 0; k < nC; k++) {
        const t0 = k * pc, last = k === nC - 1, t1 = Math.min(sl, (k + 1) * pc), h0 = half(t0), h1 = half(t1), vb = t0 + pc * 0.86;
        if (h0 + h1 < 0.02) continue;
        const off = (k % 2) * 0.5 + SLAB_OFF[k % 4], hm = Math.max(h0, h1);
        for (let j = Math.floor(-hm * 1.5 + off); (j - off) / 1.5 < hm; j++) {
          const ua = (j - off) / 1.5, ub = (j + 1 - off) / 1.5;
          let a0 = Math.max(ua, -h0), b0 = Math.min(ub, h0), a1 = Math.max(ua, -h1), b1 = Math.min(ub, h1);
          if (b0 - a0 < 0.02 && b1 - a1 < 0.02) continue;
          // the end slabs of a course run out over a gable verge, each by its own amount
          const eL = verge && ua <= -h0 ? 0.02 + RS() * 0.07 : 0, eR = verge && ub >= h0 ? 0.02 + RS() * 0.07 : 0;
          a0 -= eL; a1 -= eL; b0 += eR; b1 += eR;
          const slip = RS() < 0.05 ? 0.06 + RS() * 0.06 : 0, d = RS() * 0.05 + (last ? 0 : slip), sk = (RS() - 0.5) * 0.05;
          const up = lip * (0.75 + RS() * 0.55) * (last ? 0.5 : 1), dL = d + sk, dR = d - sk, kk = 0.94 + RS() * 0.12;
          const A = at(a0, t0, 0), Bp = at(b0, t0, 0), Cp = at(b1, t1 + dR, up), Dp = at(a1, t1 + dL, up);
          face(A, Bp, Cp, Dp, [[a0, t0], [b0, t0], [b1, vb], [a1, vb]], n, kk);
          // its thick lower edge, catching the light as the slab's rim does, and its two sides (closed even where a hip
          // cuts it, so no chink opens along the hip)
          face(Dp, Cp, at(b1, t1 + dR, 0), at(a1, t1 + dL, 0), [[a1, vb], [b1, vb], [b1, vb + 0.02], [a1, vb + 0.02]], dn, kk * 0.9);
          face(A, Dp, at(a1, t1 + dL, 0), at(a0, t0, 0), [[a0, t0], [a1, vb], [a1, vb], [a0, t0]], ax.clone().negate(), kk * 0.8);
          face(Bp, Cp, at(b1, t1 + dR, 0), at(b0, t0, 0), [[b0, t0], [b1, vb], [b1, vb], [b0, t0]], ax, kk * 0.8);
        }
      }
    } else {
      const h0 = half(0), h1 = half(sl), A = top.clone().addScaledVector(ax, -h0), Bp = top.clone().addScaledVector(ax, h0);
      const Cp = top.clone().addScaledVector(dn, sl).addScaledVector(ax, h1), Dp = top.clone().addScaledVector(dn, sl).addScaledVector(ax, -h1);
      if (h0 < 0.01) { // a triangle (hip end, pyramid face)
        const ids = [A, Cp, Dp].map(p => { const q = p.clone().sub(top); return mb.v(p.x, p.y, p.z, n.x, n.y, n.z, rc, 0, q.dot(ax), q.dot(dn), rCard); });
        const e = Cp.clone().sub(A).cross(Dp.clone().sub(A)); if (e.dot(n) > 0) mb.tri(ids[0], ids[1], ids[2]); else mb.tri(ids[0], ids[2], ids[1]);
      } else {
        const ids = [A, Bp, Cp, Dp].map(p => { const q = p.clone().sub(top); return mb.v(p.x, p.y, p.z, n.x, n.y, n.z, rc, 0, q.dot(ax), q.dot(dn), rCard); });
        const e = Bp.clone().sub(A).cross(Cp.clone().sub(A)); if (e.dot(n) > 0) { mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]); } else { mb.tri(ids[0], ids[2], ids[1]); mb.tri(ids[0], ids[3], ids[2]); }
      }
    }
  };
  // a ragged eave: single tiles laid over the edge, each hanging out a little differently, so the roofline reads as
  // made of tiles (close up only; farther the straight edge is under a pixel)
  const RT = mulberry32(ctx.seed * 31 + 401 + 13 * (ctx.plan.blocks.indexOf(B) + 1));   // its own stream: only the close-up level draws these
  const RTL = mulberry32(ctx.seed * 31 + 409 + 13 * (ctx.plan.blocks.indexOf(B) + 1));  // and the close-up slabs theirs
  const ragged = (A, Bp, n, out) => {
    if (lod !== 0 || thatch || roof === 'tile') return;   // close up, a tile roof's own slabs make its ragged edges
    const R = RT;
    const ax = Bp.clone().sub(A), Ln = ax.length(); ax.divideScalar(Ln);
    const k = Math.max(1, Math.round(Ln / 0.67)), w = Ln / k, side = out.clone().normalize(), up = n.clone();
    for (let i = 0; i < k; i++) {
      const hang = 0.02 + R() * 0.06, c = A.clone().addScaledVector(ax, (i + 0.5) * w).addScaledVector(side, hang - 0.14).addScaledVector(up, 0.025 + R() * 0.012);
      const tilt = (R() - 0.5) * 0.12, a1 = ax.clone().applyAxisAngle(up, tilt), a3 = up.clone().cross(a1).normalize();
      const col = (roof === 'tile' ? C('#dc9c7e') : rc).clone().multiplyScalar(0.9 + R() * 0.25);
      withChamfer(false, () => obox(mb, c, a1, up, a3.dot(side) > 0 ? a3 : a3.negate(), w * (0.92 + R() * 0.06), 0.035, 0.32, col, 0));   // too thin to chamfer
    }
  };
  const tim = TIMBER, dark = TIMBER.clone().multiplyScalar(0.62), edge = rc.clone().multiplyScalar(roof === 'tile' ? 0.5 : 0.62), slopeL = Math.hypot(hz + ov, (hz + ov) * tp);
  for (const s of [1, -1]) {   // the two long planes (front and back)
    const n = V3(0, cp, s * sp), down = V3(0, -sp, s * cp), ez = s * (hz + ov);
    const o1 = n.clone().multiplyScalar(td), o2 = n.clone().multiplyScalar(td + tt);
    const top = V3(0, ridgeU, 0).add(o2), half = t => hip ? rx + (EX - rx) * (t / slopeL) : xb;
    plane(top, down, V3(1, 0, 0), n, half, slopeL, !hip);
    const Eu = x => V3(x, eaveU, ez);
    quad(mb, Eu(-EX).add(o1), Eu(EX).add(o1), Eu(EX).add(o2), Eu(-EX).add(o2), rc.clone().multiplyScalar(0.7), rCard, down);       // tile edge
    quad(mb, V3(-rx, ridgeU, 0), V3(rx, ridgeU, 0), Eu(EX), Eu(-EX), dark, thatch ? 4 : 7, n.clone().negate());                      // soffit (a hip's tapers)
    ragged(Eu(-EX).add(o2), Eu(EX).add(o2), n, down);
    if (thatch) continue;
    quad(mb, Eu(-EX), Eu(EX), Eu(EX).add(o1), Eu(-EX).add(o1), edge, rCard, down);
    const sd = down.clone();
    obox(mb, Eu(0).addScaledVector(n, -0.05 * trim).addScaledVector(sd, -0.16), V3(1, 0, 0), n, sd, hip ? 2 * (EX - 0.16 * cp) + 0.08 * trim : 2 * EX - 0.1, 0.12 * trim, 0.08 * trim, tim, 7);   // fascia, back under the tiles (a hip's meet at the corners)
    if (lod === 0 && (main || wing)) for (let x = -hx + 0.35; x <= hx - 0.3; x += 0.8) {   // rafter tails under the eave
      const a = V3(x, yW - 0.02, s * hz).addScaledVector(n, -0.08), b = Eu(x).addScaledVector(down, -0.14).addScaledVector(n, -0.08);
      if (B.inner && x < -hx + hz) continue;
      beam(mb, a, b, 0.12, TIMBER.clone().multiplyScalar(0.9), 7, n);
    }
  }
  if (hip) {
    // the two end planes, triangles from the ridge ends down to the end eaves
    for (const sx of [1, -1]) {
      const n = V3(sx * sp, cp, 0), down = V3(sx * cp, -sp, 0), ex = sx * (hx + ov);
      const o1 = n.clone().multiplyScalar(td), o2 = n.clone().multiplyScalar(td + tt), sl = slopeL;
      plane(V3(sx * rx, ridgeU, 0).add(o2), down, V3(0, 0, -sx), n, t => (hz + ov) * (t / sl), sl);
      const Eu = z => V3(ex, eaveU, z);
      quad(mb, Eu(-(hz + ov)).add(o1), Eu(hz + ov).add(o1), Eu(hz + ov).add(o2), Eu(-(hz + ov)).add(o2), rc.clone().multiplyScalar(0.7), rCard, down);
      const ids = [V3(sx * rx, ridgeU, 0), Eu(hz + ov), Eu(-(hz + ov))].map(p => mb.v(p.x, p.y, p.z, -n.x, -n.y, -n.z, dark, 0, p.z, p.y, 7));
      if (sx > 0) mb.tri(ids[0], ids[1], ids[2]); else mb.tri(ids[0], ids[2], ids[1]);
      ragged(Eu(hz + ov).add(o2), Eu(-(hz + ov)).add(o2), n, down);
      if (thatch) continue;
      quad(mb, Eu(-(hz + ov)), Eu(hz + ov), Eu(hz + ov).add(o1), Eu(-(hz + ov)).add(o1), edge, rCard, down);
      obox(mb, Eu(0).addScaledVector(n, -0.05 * trim).addScaledVector(down, -0.16), V3(0, 0, 1), n, down, 2 * (hz + ov - 0.16 * cp) + 0.08 * trim, 0.12 * trim, 0.08 * trim, tim, 7);
      // capping up the two hips: wide enough to cover the cut ends of the slabs on both sides
      for (const sz of [1, -1]) {
        const A = V3(sx * rx, ridgeTop + 0.02, 0), Bp = V3(sx * (hx + ov), eaveU + (td + tt) / cp + 0.04, sz * (hz + ov)), k = Math.max(0.75, trim);
        beam(mb, A, Bp, (roof === 'tile' ? 0.3 : 0.18) * k, rc.clone().multiplyScalar(0.9), rCard, V3(0, 1, 0), (roof === 'tile' ? 0.2 : 0.13) * k);
      }
    }
  } else {
    // gable ends: the tiles run out over the gable and their thick edge is the verge (TotK's Hateno roofs have no dark
    // boards along the rakes); a narrow bargeboard sits back under them, in their shadow
    for (const s of [1, -1]) {
      const n = V3(0, cp, s * sp), ez = s * (hz + ov), o1 = n.clone().multiplyScalar(td), o2 = n.clone().multiplyScalar(td + tt);
      const Ru = x => V3(x, ridgeU, 0), Eu = x => V3(x, eaveU, ez);
      for (const x of [xa, xb]) {
        if (B.inner && x < 0) continue;
        quad(mb, Ru(x).add(o1), Eu(x).add(o1), Eu(x).add(o2), Ru(x).add(o2), rc.clone().multiplyScalar(0.85), rCard, V3(Math.sign(x), 0, 0));
        quad(mb, Ru(x), Eu(x), Eu(x).add(o1), Ru(x).add(o1), edge, rCard, V3(Math.sign(x), 0, 0));
        ragged(Ru(x).add(o2), Eu(x).add(o2), n, V3(Math.sign(x), 0, 0));
        if (thatch) continue;
        const slope = Eu(0).sub(Ru(0)), sl = slope.length(), sd = slope.clone().normalize(), xi = x - Math.sign(x) * 0.12;
        obox(mb, Ru(xi).add(Eu(xi)).multiplyScalar(0.5).addScaledVector(n, -0.06 * trim).addScaledVector(sd, 0.04), sd, n, V3(1, 0, 0), sl - 0.1, 0.13 * trim, 0.08 * trim, TIMBER, 7);
      }
    }
    if (!thatch && lod < 2 && (main || wing)) for (const sx of [1, -1]) for (const zp of [0, hz * 0.5, -hz * 0.5]) {   // purlin ends through the gables
      if (B.inner && sx < 0) continue;
      const y = ridgeU - Math.abs(zp) * tp - 0.13;
      if (B.chim && Math.sign(B.chim.x) === sx && Math.abs(zp - B.chim.z) < 1.2) continue;
      beam(mb, V3(sx * (hx - 0.1), y, zp), V3(sx * (hx + og + 0.14), y, zp), 0.2, TIMBER);
    }
  }
  // ridge
  const r0 = hip ? -rx : xa - (B.inner ? 0 : 0.06), r1 = hip ? rx : xb + 0.06;
  if (thatch) box(mb, 0, ridgeTop - 0.08, 0, xb - xa + 0.1, 0.32, 0.55, THATCH_C.clone().multiplyScalar(0.82), 4);
  else if (r1 - r0 > 0.05) {
    // capping tiles: half-rounds wide enough to cover the gap between the two planes' top edges, sitting just over
    // them; close up each is its own tile, flaring toward one end so every joint steps
    const rr = (sp * (td + tt) + 0.06) * Math.max(0.7, trim), yc = ridgeU + cp * (td + tt) + 0.02, segs = 6;
    if (lod < 2) {
      const n = lod === 0 ? Math.max(1, Math.round((r1 - r0) / 0.42)) : 1, len = (r1 - r0) / n;
      for (let k = 0; k < n; k++) {
        const xs = [r0 + k * len - (k ? 0.03 : 0), r0 + (k + 1) * len], rs = n > 1 ? [rr, rr * 1.12] : [rr, rr], ids = [];
        const kk = 0.86 + RT() * 0.12;
        for (let i = 0; i <= segs; i++) {
          const a = i / segs * Math.PI, ny = Math.sin(a), nz = Math.cos(a);
          ids.push(xs.map((x, e) => mb.v(x, yc + ny * rs[e], nz * rs[e], 0, ny, nz, rc.clone().multiplyScalar(kk), 0, x, a * rr, rCard)));
        }
        for (let i = 0; i < segs; i++) { mb.tri(ids[i][0], ids[i][1], ids[i + 1][0]); mb.tri(ids[i][1], ids[i + 1][1], ids[i + 1][0]); }
        if (n > 1) {   // the flared end's rim
          const c = [], x = xs[1];
          for (let i = 0; i <= segs; i++) { const a = i / segs * Math.PI; c.push([mb.v(x, yc + Math.sin(a) * rs[1], Math.cos(a) * rs[1], 1, 0, 0, rc.clone().multiplyScalar(kk * 0.8), 0, a, 0, rCard), mb.v(x, yc + Math.sin(a) * rs[0] * 0.8, Math.cos(a) * rs[0] * 0.8, 1, 0, 0, rc.clone().multiplyScalar(kk * 0.8), 0, a, 0.05, rCard)]); }
          for (let i = 0; i < segs; i++) { mb.tri(c[i][0], c[i][1], c[i + 1][0]); mb.tri(c[i][1], c[i + 1][1], c[i + 1][0]); }
        }
      }
    } else box(mb, (r0 + r1) / 2, yc + rr * 0.5, 0, r1 - r0, rr, rr * 2, rc, rCard);
  }
  if (B.kind === 'tower') box(mb, 0, ridgeTop + 0.12, 0, 0.12, 0.34, 0.12, TIMBER, 7);   // finial (every level: it tops the silhouette)
  if (dormer) return;
}

// the main body's chimney, round tower, banner and porch
function mainExtras(ctx, B, d) {
  const { P, mb, lod, yB, wash, RB } = ctx, { hx, hz, yW, ridgeTop, y0, doorFace, door, openings, onWall, outN, alongV, len, R, ud, vf } = d;
  const roof = B.roof, rc = roof === 'tile' ? TILE_C : roof === 'shingle' ? SHINGLE_T[P.tint % 3] : THATCH_C, rCard = roof === 'tile' ? 9 : roof === 'shingle' ? 5 : 4;
  const chim = B.chim, doorA = P.doorA, floors = B.floors, fh = ctx.fh;
  const blocked = (x, z, m = 0.5) => ctx.plan.obst.some(o => Math.hypot(x - o.x, z - o.z) < o.r + m) || (B.towerSq && Math.abs(x - B.towerSq.x) < B.towerSq.s / 2 + m && Math.abs(z - B.towerSq.z) < B.towerSq.s / 2 + m);
  // ── chimney: tall and tapering against a gable, propped with poles; or a stone stack through the roof ──
  if (chim) {
    // Hateno's chimneys are massive: built into the gable, nearly as wide as it at the foot, tapering steadily like
    // a tall truncated pyramid into a stack well above the ridge. Squared-off section.
    const H = ridgeTop + 1.7 + R() * 1.2, prof = [], segs = 16, rb = 1.4, rt = 0.62;
    for (let k = 0; k <= 12; k++) { const t = k / 12, y = yB + t * (H - yB); prof.push([rt + (rb - rt) * Math.pow(Math.max(0, 1 - Math.max(0, y) / H), 0.9), y]); }
    lathe(mb, chim.x, chim.z, prof, segs, wash.clone().multiplyScalar(1.0), 8, { sq: 7, sx: 0.75, sz: 1.0, rot: Math.PI / segs, v0: yB - vf, shade: j => (j === 0 ? 0.85 : j < 3 ? 0.92 : 1) });
    const hw = rt + 0.05;
    box(mb, chim.x, H + 0.2, chim.z, hw * 2, 0.42, hw * 2, wash.clone().multiplyScalar(0.98), 8, 0, null, 0, H);
    if (lod < 2) {
      for (const [vx, vz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {   // dark vents in the head
        const c = V3(chim.x + vx * (hw + 0.005), H + 0.12, chim.z + vz * (hw + 0.005)), t = V3(-vz * 0.13, 0, vx * 0.13);
        quad(mb, c.clone().sub(t), c.clone().add(t), c.clone().add(t).setY(H + 0.32), c.clone().sub(t).setY(H + 0.32), C('#2a2522'), 0, V3(vx, 0, vz));
      }
      box(mb, chim.x, H + 0.44, chim.z, hw * 2 + 0.24, 0.06, hw * 2 + 0.24, TIMBER, 7);
    }
    pyramid(mb, chim.x, H + 0.47, chim.z, hw + 0.16, 0.4, rc, rCard);   // little hipped roof of tiles
    ud.smoke.push([chim.x, H + 0.45, chim.z]);
    const sx = Math.sign(chim.x);
    beam(mb, V3(chim.x + sx * 0.12, H - 1.0, chim.z), V3(chim.x + sx * 1.5, yB + 0.9, chim.z + Math.sign(chim.z) * 2.3), 0.11, TIMBER);   // the prop: part of the silhouette even far off
    if (lod < 2) beam(mb, V3(chim.x - sx * 0.1, H - 0.5, chim.z), V3(sx * (hx - 2.0), ridgeTop + 0.02, 0), 0.1, TIMBER);
    ud.colliders.push([chim.x, chim.z, 1.1]);
  } else if (P.chimney) {
    const cx = P.chimSide * (hx - 0.9), cz = (R() < 0.5 ? -1 : 1) * Math.min(hz * 0.4, 0.9), top = ridgeTop + 0.9;
    box(mb, cx, (y0 + top) / 2, cz, 0.78, top - y0, 0.78, STONE, 2);
    box(mb, cx, top + 0.08, cz, 0.96, 0.16, 0.96, STONE.clone().multiplyScalar(0.9), 13);
    ud.smoke.push([cx, top + 0.3, cz]);
  }

  // ── round tower with a conical tile roof at a back corner ──
  if (B.round) {
    const rT = P.tower, yT = yW + 1.0 + (floors === 1 ? 0.5 : 0), segs = lod === 2 ? 14 : 20, { x: tx, z: tz } = B.round;
    lathe(mb, tx, tz, [[rT + 0.1, yB], [rT + 0.1, y0 + 0.15]], segs, STONE.clone().multiplyScalar(0.92), 10);
    lathe(mb, tx, tz, [[rT, y0 + 0.1], [rT, y0 + 0.7], [rT, yT - 0.8], [rT, yT]], segs, wash, 8, { v0: y0 + 0.1 - vf, shade: j => [0.85, 0.98, 0.98, 0.78][j] });
    const re = rT + 0.45;
    lathe(mb, tx, tz, [[rT, yT], [re, yT - 0.14]], segs, TIMBER.clone().multiplyScalar(0.62), 7);
    lathe(mb, tx, tz, [[re, yT - 0.14], [re + 0.02, yT - 0.02], [0.02, yT - 0.02 + re * 1.05]], segs, rc, rCard, { flipV: true });
    if (lod < 2) box(mb, tx, yT + re * 1.05 + 0.1, tz, 0.12, 0.3, 0.12, TIMBER, 7);
    if (lod < 2) {   // a window facing away from the house
      const dv = V3(tx, 0, tz).normalize(), al = V3(-dv.z, 0, dv.x);
      for (const wy of floors > 1 ? [y0 + 1.1, y0 + fh + 1.0] : [y0 + 1.2]) {
        const c = V3(tx, wy, tz).addScaledVector(dv, rT + 0.03);
        quad(mb, c.clone().addScaledVector(al, -0.3), c.clone().addScaledVector(al, 0.3), c.clone().addScaledVector(al, 0.3).setY(wy + 0.8), c.clone().addScaledVector(al, -0.3).setY(wy + 0.8), GLOW, 6, dv);
        const fc = V3(tx, wy - 0.05, tz).addScaledVector(dv, rT + 0.05);
        box(mb, fc.x, fc.y, fc.z, 0.75, 0.1, 0.16, TIMBER_L, 7, Math.atan2(al.z, al.x));
        const lc = V3(tx, wy + 0.85, tz).addScaledVector(dv, rT + 0.05);
        box(mb, lc.x, lc.y, lc.z, 0.75, 0.12, 0.12, TIMBER, 7, Math.atan2(al.z, al.x));
      }
    }
    ud.colliders.push([tx, tz, rT + 0.1]);
  }

  // ── banner: a cloth hung from a pole on the street side ──
  if (P.banner) {
    const f = doorFace, ln = len(f), free = [];
    for (let a = -ln / 2 + 0.75; a <= ln / 2 - 0.75; a += 0.25) {
      const c = onWall(f, a, 1, 0);
      if (Math.abs(a - doorA) > door.w / 2 + 0.75 && !openings.some(o => o.f === f && !o.small && Math.abs(o.a - a) < o.ww / 2 + 0.95) && !blocked(c.x, c.z, 0.3)) free.push(a);
    }
    if (free.length) {
      const a = free[Math.floor(RB() * free.length)], top = (f === 'l' || f === 'r') ? yW + 0.35 : yW - 0.35, bl = Math.min(2.5, top - y0 - 0.9), bc = BANNER[(P.tint + 1) % BANNER.length];
      beam(mb, onWall(f, a - 0.55, top + 0.06, 0.16), onWall(f, a + 0.55, top + 0.06, 0.16), 0.07, TIMBER);
      for (const s of [-1, 1]) beam(mb, onWall(f, a + s * 0.45, top + 0.06, 0), onWall(f, a + s * 0.45, top + 0.06, 0.18), 0.06, TIMBER);
      const al = alongV(f), on = outN(f), ids = [], rows = 6;
      for (let k = 0; k <= rows; k++) {
        const t = k / rows, y = top - t * bl, o = 0.13 + 0.05 * Math.sin(Math.PI * t);
        const col = t > 0.9 ? bc.clone().multiplyScalar(0.7) : bc;
        ids.push([-0.42, 0.42].map(x => { const p = onWall(f, a, y, o).addScaledVector(al, x); return mb.v(p.x, p.y, p.z, on.x, 0, on.z, col, 0, 0, 0, 0); }));
      }
      for (let k = 0; k < rows; k++) { const [a0, b0] = ids[k], [a1, b1] = ids[k + 1]; mb.tri(a0, a1, b0); mb.tri(b0, a1, b1); }
      // emblem: a pale diamond between two pale bars
      const ey = top - bl * 0.42, eo = 0.13 + 0.05 * Math.sin(Math.PI * 0.42) + 0.006, pale = bc.clone().lerp(C('#f4ead8'), 0.6);
      const E = (x, y) => onWall(f, a, ey + y, eo).addScaledVector(al, x);
      quad(mb, E(-0.28, -0.32), E(0.28, -0.32), E(0.28, -0.26), E(-0.28, -0.26), pale, 0, on); quad(mb, E(-0.28, 0.26), E(0.28, 0.26), E(0.28, 0.32), E(-0.28, 0.32), pale, 0, on);
      quad(mb, E(0, -0.2), E(0.16, 0), E(0, 0.2), E(-0.16, 0), pale, 0, on);
    }
  }

  attachments(ctx, B, d);
  livedIn(ctx, B, d, blocked);

  // porch: a lean-to on posts over the front door (stone and timber houses)
  if (P.porch) {
    const pw = Math.min(len(doorFace) - 0.6, 3.4), pd = 1.9, py = y0 + door.h + 0.55, dO = outN(doorFace);
    const a0 = Math.max(-len(doorFace) / 2 + pw / 2 + 0.3, Math.min(len(doorFace) / 2 - pw / 2 - 0.3, doorA));
    const W = (a, y, o) => onWall(doorFace, a, y, o);
    quad(mb, W(a0 - pw / 2, py + 0.5, 0), W(a0 + pw / 2, py + 0.5, 0), W(a0 + pw / 2, py, pd), W(a0 - pw / 2, py, pd), rc, rCard, V3(dO.x, 1, dO.z));
    quad(mb, W(a0 - pw / 2, py + 0.42, 0), W(a0 + pw / 2, py + 0.42, 0), W(a0 + pw / 2, py - 0.08, pd), W(a0 - pw / 2, py - 0.08, pd), TIMBER, 7, V3(-dO.x, -1, -dO.z));
    for (const s of [-1, 1]) { const b = W(a0 + s * (pw / 2 - 0.12), y0, pd - 0.12); box(mb, b.x, (y0 + py) / 2, b.z, 0.16, py - y0, 0.16, TIMBER, 7); }
    const dp = W(doorA, 0, pd + 0.8); ud.door = [dp.x, dp.z];
  }
}

// ── attachments: pergola, deck, lean-to, shop sign, ivy (the main body's frame) ──
const LEAF_D = C('#3f6e2a');
function attachments(ctx, B, d) {
  const { P, mb, lod, yB } = ctx, { y0, doorFace, door, onWall, outN, alongV, len, ud } = d;
  const RA = mulberry32(ctx.seed * 31 + 211), doorA = P.doorA, roofTile = B.roof === 'tile';
  const tile = C('#dc9c7e'), plank = TIMBER_L, dark = TIMBER;
  const ground = -P.steps;   // the ground at the door (a flight of steps when the house stands up on its base)
  // ivy leaves along a run of wall or timber: small overlapping leaf quads facing out, darker inside the clump; a
  // farther level keeps every second (or fourth) leaf, larger, so the clump keeps its shape and tone
  const leaves = (pts, on, spread, R) => {
    const keep = [1, 2, 4][lod], sc = Math.sqrt(keep);
    pts.forEach((c, k) => {
      const s = (0.07 + R() * 0.05) * sc, out = 0.02 + R() * spread, tone = 0.7 + R() * 0.5, rot = R() * 6.283;
      if (k % keep) return;
      const ax = V3(Math.cos(rot), Math.sin(rot) * 0.8, 0); ax.applyAxisAngle(V3(0, 1, 0), Math.atan2(on.x, on.z)); ax.normalize();
      const ay = on.clone().cross(ax).normalize(), q = c.clone().addScaledVector(on, out), col = LEAF_D.clone().multiplyScalar(tone);
      const n = on.clone().multiplyScalar(0.7).add(V3(0, 0.6, 0)).normalize();
      const ids = [[-1, 0], [0, -0.6], [1, 0], [0, 0.6]].map(([a, b]) => { const p = q.clone().addScaledVector(ax, a * s).addScaledVector(ay, b * s); return mb.v(p.x, p.y, p.z, n.x, n.y, n.z, col, 0, 0, 0, 0); });
      mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]); mb.tri(ids[0], ids[2], ids[1]); mb.tri(ids[0], ids[3], ids[2]);
    });
  };
  // a big lantern hanging at p: glass in an iron frame under a hipped cap, lit after dusk
  const lantern = (p, s = 1) => {
    const lw = 0.32 * s;
    beam(mb, p.clone().setY(p.y + 0.5 * s), p.clone().setY(p.y + 0.22 * s), 0.025, IRON, 0);
    box(mb, p.x, p.y, p.z, lw - 0.03, 0.4 * s, lw - 0.03, GLOW, 11);
    for (const [px, pz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) box(mb, p.x + px * lw / 2, p.y, p.z + pz * lw / 2, 0.035, 0.42 * s, 0.035, IRON, 0);
    box(mb, p.x, p.y - 0.23 * s, p.z, lw + 0.06, 0.05, lw + 0.06, IRON, 0);
    pyramid(mb, p.x, p.y + 0.2 * s, p.z, lw / 2 + 0.08, 0.2 * s, IRON, 0);
    ud.lights.push([p.x, p.y, p.z, 9]);
  };
  // a hanging signboard at p across `ax`, an emblem painted on both faces
  const signboard = (p, ax, on) => {
    const w = 0.7, h = 0.42, col = C(['#a3456b', '#3f5f8f', '#5f7f3f', '#b0703a'][P.tint % 4]);
    obox(mb, p, ax, V3(0, 1, 0), on, w, h, 0.05, plank, 7);
    for (const s of [-1, 1]) beam(mb, p.clone().addScaledVector(ax, s * w * 0.35).setY(p.y + h / 2), p.clone().addScaledVector(ax, s * w * 0.35).setY(p.y + h / 2 + 0.22), 0.015, IRON, 0);
    for (const sd of [-1, 1]) {   // emblem: a coloured disc with a pale bar, on both faces
      const c = p.clone().addScaledVector(on, sd * 0.028), nn = on.clone().multiplyScalar(sd), ids = [], ctr = mb.v(c.x, c.y, c.z, nn.x, nn.y, nn.z, col, 0, 0, 0, 0);
      for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283, q = c.clone().addScaledVector(ax, Math.cos(a) * 0.14).add(V3(0, Math.sin(a) * 0.14, 0)); ids.push(mb.v(q.x, q.y, q.z, nn.x, nn.y, nn.z, col, 0, 0, 0, 0)); }
      for (let i = 0; i < 12; i++) { const a = ids[i], b = ids[(i + 1) % 12]; const e = mb.p; const pa = V3(e[a * 3], e[a * 3 + 1], e[a * 3 + 2]), pb = V3(e[b * 3], e[b * 3 + 1], e[b * 3 + 2]); if (pa.sub(c).cross(pb.sub(c)).dot(nn) > 0) mb.tri(ctr, a, b); else mb.tri(ctr, b, a); }
    }
  };

  // pergola: two posts out front and two against the wall, beams and rafters over, a big lantern and the house's
  // sign hung from the front beam, ivy along the top (the inn's entrance in TotK)
  if (P.pergola) {
    const f = doorFace, w = door.w + 2.2, dp = 1.9, top = y0 + door.h + 0.95, ax = alongV(f), on = outN(f);
    for (const s of [-1, 1]) {
      const a = doorA + s * w / 2;
      beam(mb, onWall(f, a, ground - 0.2, dp), onWall(f, a, top + 0.1, dp), 0.22, dark);
      beam(mb, onWall(f, a, top, 0), onWall(f, a, top, dp + 0.3), 0.2, dark);                   // beams back to the wall
      beam(mb, onWall(f, a, top - 0.6, dp - 0.02), onWall(f, a, top - 0.02, dp - 0.55), 0.09, dark);   // knee braces
      beam(mb, onWall(f, a, top - 0.6, 0.02), onWall(f, a, top - 0.02, 0.5), 0.09, dark);
    }
    beam(mb, onWall(f, doorA - w / 2 - 0.35, top + 0.14, dp), onWall(f, doorA + w / 2 + 0.35, top + 0.14, dp), 0.22, dark);   // front beam
    for (let k = 0; k <= 5; k++) { const a = doorA - w / 2 + 0.15 + k * (w - 0.3) / 5; beam(mb, onWall(f, a, top + 0.3, 0), onWall(f, a, top + 0.3, dp + 0.3), 0.11, plank); }
    const lp = onWall(f, doorA - 0.55, top - 0.62, dp - 0.15); lantern(lp, 1.15);
    signboard(onWall(f, doorA + 0.55, top - 0.42, dp), ax, on);
    const vines = [];   // ivy draped along the front beam and over the rafters
    for (let k = 0; k < 320; k++) { const t = RA(), a = doorA - w / 2 - 0.3 + t * (w + 0.6), hang = RA() * RA(); vines.push(onWall(f, a, top + 0.4 - hang * 1.1, dp - 0.2 + (RA() - 0.5) * 0.8 * (1 - hang))); }
    for (let k = 0; k < 90; k++) { const s = RA() < 0.5 ? -1 : 1; vines.push(onWall(f, doorA + s * w / 2 + (RA() - 0.5) * 0.3, ground + RA() * (top - ground), dp + (RA() - 0.5) * 0.3)); }   // and up a post
    leaves(vines, on, 0.12, RA);
    ud.colliders.push(...[-1, 1].map(s => { const p = onWall(f, doorA + s * w / 2, 0, dp); return [p.x, p.z, 0.25]; }));
  }

  // deck: a timber platform at floor level on posts down to the ground, boards, a railing on its open sides and a
  // short flight of steps (the decks along Hateno's houses)
  const g = freeGables(P);
  if (P.deck && g[0]) {
    const sx = g[0], f = sx > 0 ? 'r' : 'l', ln = Math.min(len(f) - 0.6, 4.4), dp = 2.1, yT = y0 - 0.02;
    const at = (a, y, o) => onWall(f, a, y, o), on = outN(f), ax = alongV(f);
    for (const a of [-ln / 2 + 0.1, 0, ln / 2 - 0.1]) for (const o of [0.25, dp - 0.1]) beam(mb, at(a, yB, o), at(a, yT - 0.06, o), 0.15, dark);
    obox(mb, at(0, yT - 0.06, dp / 2), ax, V3(0, 1, 0), on, ln + 0.2, 0.12, dp + 0.05, plank, 7);
    if (lod === 0) for (let k = 1; k < 9; k++) obox(mb, at(0, yT + 0.001, k * dp / 9), ax, V3(0, 1, 0), on, ln + 0.18, 0.012, 0.012, dark, 0);   // board joints
    const rail = (a0, o0, a1, o1) => { beam(mb, at(a0, yT + 0.92, o0), at(a1, yT + 0.92, o1), 0.08, dark); beam(mb, at(a0, yT + 0.45, o0), at(a1, yT + 0.45, o1), 0.05, plank); };
    for (const a of [-ln / 2 + 0.1, 0, ln / 2 - 0.1]) beam(mb, at(a, yT, dp - 0.1), at(a, yT + 0.96, dp - 0.1), 0.09, dark);
    for (const s of [-1, 1]) beam(mb, at(s * (ln / 2 - 0.1), yT, 0.25), at(s * (ln / 2 - 0.1), yT + 0.96, 0.25), 0.09, dark);
    rail(-ln / 2 + 0.1, dp - 0.1, ln / 2 - 0.1, dp - 0.1); rail(ln / 2 - 0.1, 0.25, ln / 2 - 0.1, dp - 0.1);
    rail(-ln / 2 + 0.1, 0.25, -ln / 2 + 0.1, dp - 1.1);   // the end left open toward the steps
    for (let k = 0; k < 4; k++) obox(mb, at(-ln / 2 - 0.3 - k * 0.0, yT - 0.18 - k * 0.17, dp - 0.5 + k * 0.0), ax, V3(0, 1, 0), on, 0.55, 0.06, 0.8, plank, 7);
    // a door onto it
    const dc = at(0.6, y0 - 0.02, -0.01);
    quad(mb, dc.clone().addScaledVector(ax, -0.46), dc.clone().addScaledVector(ax, 0.46), dc.clone().addScaledVector(ax, 0.46).setY(y0 + 1.95), dc.clone().addScaledVector(ax, -0.46).setY(y0 + 1.95), plank.clone().multiplyScalar(0.85), 7, on);
    for (const a of [-ln / 2, 0, ln / 2]) { const p = at(a, 0, dp / 2); ud.colliders.push([p.x, p.z, 0.9]); }
  }

  // lean-to: an open woodshed against a gable, a single slope of tiles on two posts, logs stacked inside
  const ls = P.lean && leanSpot(P);
  if (ls) {
    const f = ls.face, ln = ls.ln, dp = 2.2, hi = y0 + 2.5, lo = y0 + 1.85, on = outN(f), ax = alongV(f);
    const at = (a, y, o) => onWall(f, a, y, o), aOff = ls.a;
    for (const s of [-1, 1]) {
      beam(mb, at(aOff + s * (ln / 2 - 0.1), yB, dp - 0.1), at(aOff + s * (ln / 2 - 0.1), lo, dp - 0.1), 0.14, dark);
      beam(mb, at(aOff + s * (ln / 2 - 0.1), hi, 0), at(aOff + s * (ln / 2 - 0.1), lo, dp + 0.05), 0.12, dark);   // rafters
    }
    beam(mb, at(aOff - ln / 2 - 0.1, lo + 0.04, dp - 0.1), at(aOff + ln / 2 + 0.1, lo + 0.04, dp - 0.1), 0.13, dark);
    const n = on.clone().multiplyScalar(Math.sin(Math.atan2(hi - lo, dp))).add(V3(0, Math.cos(Math.atan2(hi - lo, dp)), 0)).normalize();
    const A = at(aOff - ln / 2 - 0.25, hi + 0.12, -0.02), Bq = at(aOff + ln / 2 + 0.25, hi + 0.12, -0.02), Cq = at(aOff + ln / 2 + 0.25, lo - 0.02, dp + 0.35), Dq = at(aOff - ln / 2 - 0.25, lo - 0.02, dp + 0.35);
    quad(mb, A, Bq, Cq, Dq, roofTile ? TILE_C : SHINGLE_T[0], roofTile ? 9 : 5, n, [0, 0]);
    quad(mb, A.clone().addScaledVector(n, -0.08), Bq.clone().addScaledVector(n, -0.08), Cq.clone().addScaledVector(n, -0.08), Dq.clone().addScaledVector(n, -0.08), dark.clone().multiplyScalar(0.7), 7, n.clone().negate());
    quad(mb, Dq, Cq, Cq.clone().addScaledVector(n, -0.08), Dq.clone().addScaledVector(n, -0.08), tile.clone().multiplyScalar(0.75), 0, on.clone().add(V3(0, -0.5, 0)));
    // logs stacked against the wall
    for (let row = 0; row < 4; row++) for (let k = 0, m = Math.floor((ln - 0.6) / 0.24); k < m - (row % 2); k++) {
      const a = aOff - ln / 2 + 0.42 + k * 0.24 + (row % 2) * 0.12, c = at(a, y0 - 0.1 + row * 0.2, 0.45);
      const bark = C('#6e5440').multiplyScalar(0.85 + RA() * 0.3);
      obox(mb, c, ax, V3(0, 1, 0), on, 0.2, 0.18, 0.7, bark, 7);
      if (lod < 2) quad(mb, c.clone().addScaledVector(on, 0.351).addScaledVector(ax, -0.09).setY(c.y - 0.08), c.clone().addScaledVector(on, 0.351).addScaledVector(ax, 0.09).setY(c.y - 0.08), c.clone().addScaledVector(on, 0.351).addScaledVector(ax, 0.09).setY(c.y + 0.08), c.clone().addScaledVector(on, 0.351).addScaledVector(ax, -0.09).setY(c.y + 0.08), C('#c99c68'), 0, on);
    }
    for (const s of [-1, 0, 1]) { const p = at(aOff + s * ln / 3, 0, dp / 2); ud.colliders.push([p.x, p.z, 0.8]); }
  }

  // shop sign: a board hung from a timber bracket beside the door
  if (P.sign && !P.pergola) {
    const f = doorFace, a = doorA + door.w / 2 + 0.75, on = outN(f), ax = alongV(f), y = y0 + door.h + 0.35;
    beam(mb, onWall(f, a, y + 0.3, 0), onWall(f, a, y + 0.3, 0.95), 0.08, dark);
    beam(mb, onWall(f, a, y - 0.25, 0), onWall(f, a, y + 0.27, 0.7), 0.06, dark);
    signboard(onWall(f, a, y - 0.12, 0.62), on, ax);
  }

  // ivy: a clump climbing a wall from the ground, thinning out as it goes up
  if (P.ivy) {
    const faces = ['f', 'b', 'l', 'r'].filter(f => f !== doorFace), f = faces[Math.floor(RA() * faces.length)], ln = len(f), on = outN(f);
    const a0 = (RA() - 0.5) * (ln - 2.4), wd = 1.2 + RA() * 1.4, ht = 1.6 + RA() * 2.0, pts = [];
    for (let k = 0; k < 420; k++) {
      const u = RA() * 2 - 1, v = Math.pow(RA(), 1.4), a = a0 + u * wd * (1 - 0.55 * v), y = y0 - 0.1 + v * ht * (0.75 + 0.35 * Math.cos(u * 2.1 + a0));
      if (Math.abs(a) > ln / 2 - 0.1) continue;
      pts.push(onWall(f, a, y, 0));
    }
    leaves(pts, on, 0.06, RA);
  }
}

// ── signs of life: what makes a house look lived in rather than built. Potted plants by the door, a bench, a broom
// and a bucket, weeds along the foot of the walls, herbs and tools hung on a peg rail, a laundry line, a rain barrel,
// a weather vane (curtains, lintels and wall ties are drawn with the windows and walls). Its own random stream, drawn
// the same at every level: the close-up level draws the small things, the middle one the bigger, the far one only
// what makes the outline (the laundry post, the vane). Ground things only where the ground is at the door. ──
function livedIn(ctx, B, d, blocked) {
  const { P, mb, lod, hut } = ctx, { y0, rx, ridgeTop, doorFace, door, openings, onWall, outN, alongV, len, ud, covered } = d;
  const RL = mulberry32(ctx.seed * 31 + 307), r = (a, b) => a + RL() * (b - a), pickOf = arr => arr[Math.floor(RL() * arr.length)];
  const doorA = P.doorA, flat = P.steps < 0.25, up = V3(0, 1, 0);
  const g = freeGables(P), ls = P.lean && leanSpot(P), lsp = P.laundry && laundrySpot(P), deckF = P.deck && g[0] ? (g[0] > 0 ? 'r' : 'l') : null;
  const used = { f: [], b: [], l: [], r: [] };   // runs of wall foot already taken, [a0, a1]
  used[doorFace].push([doorA - door.w / 2 - 0.3, doorA + door.w / 2 + 0.3]);
  if (ls) used[ls.face].push([ls.a - ls.ln / 2 - 0.3, ls.a + ls.ln / 2 + 0.3]);
  // a run a0..a1 along face f, o out from it: on the wall, clear of the deck, what is there, other blocks, the chimney
  const free = (f, a0, a1, o = 0.3) => f !== deckF && a0 > -len(f) / 2 + 0.2 && a1 < len(f) / 2 - 0.2 && !used[f].some(([u0, u1]) => a1 > u0 && a0 < u1)
    && [a0, (a0 + a1) / 2, a1].every(a => { const p = onWall(f, a, y0 + 0.3, o); return !covered(p) && !blocked(p.x, p.z, 0.15); });
  const winAt = (f, a0, a1, ya, yb) => openings.some(o => o.f === f && a1 > o.a - o.ww / 2 - 0.15 && a0 < o.a + o.ww / 2 + 0.15 && yb > o.y - 0.15 && ya < o.y + o.wh + 0.15);
  // leaves fanning up and out from c (radius rad, height ht), flowers among them; a farther level keeps every other
  // leaf, larger, so the plant keeps its shape and tone
  const plant = (c, rad, ht, n, bloom, R) => {
    const keep = lod ? 2 : 1, sc = Math.sqrt(keep);
    for (let k = 0; k < n; k++) {
      const a = R() * 6.283, el = 0.3 + R() * 1.0, l = (0.5 + R() * 0.6) * Math.max(rad, ht * 0.6) * sc, tone = 0.68 + R() * 0.45, fl = R() < 0.25;
      if (k % keep) continue;
      const dir = V3(Math.cos(a) * Math.cos(el) * rad / Math.max(rad, ht), Math.sin(el), Math.sin(a) * Math.cos(el) * rad / Math.max(rad, ht)).normalize();
      const side = V3(-Math.sin(a), 0, Math.cos(a)), nUp = V3(dir.x * 0.4, 1, dir.z * 0.4).normalize();
      const m = c.clone().addScaledVector(dir, l * 0.45), tip = c.clone().addScaledVector(dir, l), col = LEAF_G.clone().multiplyScalar(tone);
      const ids = [c, m.clone().addScaledVector(side, l * 0.22), tip, m.clone().addScaledVector(side, -l * 0.22)].map(q => mb.v(q.x, q.y, q.z, nUp.x, nUp.y, nUp.z, col, 0, 0, 0, 0));
      mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]); mb.tri(ids[0], ids[2], ids[1]); mb.tri(ids[0], ids[3], ids[2]);
      if (fl && bloom) { const q = tip.clone(), s = 0.05 * sc, b = bloom.clone().multiplyScalar(0.9 + 0.2 * tone); box(mb, q.x, q.y, q.z, s, s * 0.6, s, b, 0); }
    }
  };
  // thin grass blades from c leaning out from the wall (on), darker at the root
  const blades = (c, n, ht, on, R) => {
    const keep = lod ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const a = R() * 6.283, lean = 0.15 + R() * 0.55, h = ht * (0.5 + R() * 0.6), w = (0.02 + R() * 0.02) * (lod ? 1.6 : 1), col = BLADE[Math.floor(R() * BLADE.length)], off = R() * 0.07;
      if (k % keep) continue;
      const dir = V3(Math.cos(a) * lean + on.x * 0.35, 1, Math.sin(a) * lean + on.z * 0.35).normalize(), side = V3(-Math.sin(a), 0, Math.cos(a));
      const b = c.clone().add(V3(Math.cos(a) * off, 0, Math.sin(a) * off)), tip = b.clone().addScaledVector(dir, h), nn = V3(on.x * 0.3, 1, on.z * 0.3).normalize();
      const ids = [[b.clone().addScaledVector(side, -w), 0.62], [b.clone().addScaledVector(side, w), 0.62], [tip, 1.12]].map(([q, t]) => mb.v(q.x, q.y, q.z, nn.x, nn.y, nn.z, col.clone().multiplyScalar(t), 0, 0, 0, 0));
      mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[1]);
    }
  };

  // ── pots by the door: one to four, a row out from the door on either side, each with a plant ──
  const nPots = flat ? 1 + Math.floor(RL() * 3.6) : 0, row = { '-1': 0, 1: 0 };
  for (let k = 0; k < nPots; k++) {
    const s = RL() < 0.55 ? 1 : -1, sz = r(0.75, 1.35), kind = Math.floor(RL() * 3), col = pickOf(POT), pk = RL(), bloom = RL() < 0.6 ? pickOf(BLOOM) : null, RP = mulberry32(Math.floor(RL() * 1e9));
    const a = doorA + s * (door.w / 2 + 0.5 + row[s] * 0.5), f = doorFace, c = onWall(f, a, 0, 0.32);
    if (Math.abs(a) > len(f) / 2 - 0.3 || covered(onWall(f, a, y0 + 0.3, 0.3)) || blocked(c.x, c.z, 0.1)) continue;
    row[s]++;
    if (lod === 2) continue;
    const prof = kind === 0 ? [[0.1, 0], [0.19, 0.12], [0.22, 0.3], [0.14, 0.48], [0.16, 0.54]] : kind === 1 ? [[0.17, 0], [0.2, 0.02], [0.22, 0.34], [0.24, 0.36]] : [[0.1, 0], [0.16, 0.2], [0.17, 0.5], [0.1, 0.68], [0.12, 0.74]];
    lathe(mb, c.x, c.z, prof.map(([pr, py]) => [pr * sz * 0.85, py * sz - 0.02]), lod ? 6 : 10, kind === 1 ? TIMBER_L : col, kind === 1 ? 7 : 0);
    const [tr, ty] = prof[prof.length - 1], soil = c.clone().setY(ty * sz - 0.05);
    lathe(mb, c.x, c.z, [[tr * sz * 0.8, soil.y], [0.01, soil.y + 0.01]], lod ? 6 : 10, SOIL, 0);
    plant(soil, tr * sz * (pk < 0.5 ? 1.3 : 0.9), (pk < 0.5 ? 0.35 : 0.6) * sz, Math.round((pk < 0.5 ? 40 : 28) * sz), bloom, RP);
    ud.colliders.push([c.x, c.z, 0.25]);
  }

  // ── a bench against the wall: beside the door if there is room, else along a side wall ──
  const wantBench = flat && RL() < 0.45, bs = RL() < 0.5 ? 1 : -1, back = RL() < 0.5;
  if (wantBench) {
    const cands = [[doorFace, doorA + bs * (door.w / 2 + 2.1)], [doorFace, doorA - bs * (door.w / 2 + 2.1)], ...['f', 'r', 'b', 'l'].filter(f => f !== doorFace).map(f => [f, 0])];
    const hit = cands.find(([f, a]) => free(f, a - 0.75, a + 0.75, 0.25) && !winAt(f, a - 0.75, a + 0.75, 0, 0.95));
    if (hit) {
      const [f, a] = hit, ax = alongV(f), on = outN(f);
      used[f].push([a - 0.8, a + 0.8]);
      if (lod < 2) {
        obox(mb, onWall(f, a, 0.45, 0.3), ax, up, on, 1.45, 0.06, 0.36, TIMBER_L, 7);
        for (const s of [-1, 1]) obox(mb, onWall(f, a + s * 0.58, 0.21, 0.3), ax, up, on, 0.07, 0.42, 0.32, TIMBER, 7);
        if (back) { beam(mb, onWall(f, a - 0.72, 0.86, 0.07), onWall(f, a + 0.72, 0.86, 0.07), 0.07, TIMBER); for (const s of [-1, 1]) beam(mb, onWall(f, a + s * 0.58, 0.47, 0.12), onWall(f, a + s * 0.58, 0.88, 0.07), 0.05, TIMBER); }
      }
      const p = onWall(f, a, 0, 0.3); ud.colliders.push([p.x, p.z, 0.55]);
    }
  }

  // ── a broom leaning by the door and a bucket (close up) ──
  const broom = flat && RL() < 0.55, bucket = flat && RL() < 0.4, bcol = RL() < 0.5 ? TIMBER_L : C('#7d8a8c');
  {
    let a = doorA + door.w / 2 + 0.55 + row[1] * 0.5;
    const f = doorFace, ax = alongV(f);
    if (broom && free(f, a - 0.12, a + 0.12, 0.3)) {
      if (lod === 0) {
        const b0 = onWall(f, a, 0.08, 0.36), b1 = onWall(f, a + 0.14, 1.4, 0.05), hd = b1.clone().sub(b0).normalize(), az = ax.clone().cross(hd).normalize(), ax2 = hd.clone().cross(az).normalize();
        beam(mb, b0, b1, 0.032, TIMBER_L);
        obox(mb, b0.clone().addScaledVector(hd, 0.06), ax2, hd, az, 0.27, 0.32, 0.07, STRAW, 4);
        obox(mb, b0.clone().addScaledVector(hd, 0.2), ax2, hd, az, 0.2, 0.04, 0.08, IRON, 0);
      }
      a += 0.35;
    }
    if (bucket && free(f, a - 0.18, a + 0.18, 0.3) && lod === 0) {
      const c = onWall(f, a, 0, 0.33);
      lathe(mb, c.x, c.z, [[0.13, 0], [0.16, 0.28], [0.165, 0.3]], 10, bcol, bcol === TIMBER_L ? 7 : 0);
      for (const y of [0.06, 0.22]) lathe(mb, c.x, c.z, [[0.14 + y * 0.1, y], [0.145 + y * 0.1, y + 0.03]], 10, IRON, 0);
      lathe(mb, c.x, c.z, [[0.15, 0.25], [0.01, 0.255]], 10, C('#3b4a52'), 0);   // water
    }
  }

  // ── weeds along the foot of the walls, thicker at the corners and beside the steps (the grass stops at the wall) ──
  const nW = flat ? 30 : 0, faces = ['f', 'r', 'b', 'l'], tot = faces.reduce((t, f) => t + len(f), 0);
  for (let k = 0; k < nW; k++) {
    let u = RL() * tot, f = 'f'; for (const ff of faces) { if (u < len(ff)) { f = ff; break; } u -= len(ff); }
    const corner = RL() < 0.3, a = corner ? (RL() < 0.5 ? -1 : 1) * (len(f) / 2 - 0.05) : u - len(f) / 2, o = 0.04 + RL() * 0.14, n = 5 + Math.floor(RL() * 7), ht = 0.18 + RL() * 0.3, RP = mulberry32(Math.floor(RL() * 1e9));
    if (lod === 2 || f === deckF || (f === doorFace && Math.abs(a - doorA) < door.w / 2 + 0.45) || covered(onWall(f, a, y0 + 0.2, 0.15))) continue;
    blades(onWall(f, a, -0.03, o), n, ht, outN(f), RP);
  }

  // ── herbs, a basket and a rake hung on a peg rail near the door (close up) ──
  if (!hut && RL() < 0.5) {
    const items = [Math.floor(RL() * 4), Math.floor(RL() * 4), Math.floor(RL() * 4)], RP = mulberry32(Math.floor(RL() * 1e9)), y = y0 + 1.85;
    const cands = [[doorFace, doorA + door.w / 2 + 1.35], [doorFace, doorA - door.w / 2 - 1.5], ...faces.filter(f => f !== doorFace && f !== deckF).map(f => [f, 0.6])];
    const hit = cands.find(([f, a]) => Math.abs(a) < len(f) / 2 - 0.6 && !winAt(f, a - 0.5, a + 0.5, y - 1.0, y + 0.2) && !(f === doorFace && Math.abs(a - doorA) < door.w / 2 + 0.95) && !covered(onWall(f, a, y, 0.2)) && !blocked(onWall(f, a, y, 0.2).x, onWall(f, a, y, 0.2).z, 0.2));
    if (hit && lod === 0) {
      const [f, a] = hit, ax = alongV(f), on = outN(f);
      beam(mb, onWall(f, a - 0.48, y, 0.04), onWall(f, a + 0.48, y, 0.04), 0.06, TIMBER);
      items.forEach((it, k) => {
        const pa = a - 0.32 + k * 0.32, peg = onWall(f, pa, y + 0.01, 0.12);
        beam(mb, onWall(f, pa, y + 0.01, 0.04), peg, 0.025, TIMBER_L);
        if (it === 0 || it === 1) {   // a bunch of drying herbs, heads down
          const col = HERB[Math.floor(RP() * HERB.length)];
          for (let j = 0; j < 22; j++) {
            const dx = (RP() - 0.5) * 0.14, dz = RP() * 0.08, l = 0.22 + RP() * 0.16, p0 = peg.clone().addScaledVector(on, -0.02), p1 = p0.clone().addScaledVector(ax, dx).addScaledVector(on, dz).add(V3(0, -l, 0));
            const sd = ax.clone().multiplyScalar(0.025), ids = [p0.clone().sub(sd.clone().multiplyScalar(0.3)), p0.clone().add(sd.clone().multiplyScalar(0.3)), p1.clone().add(sd), p1.clone().sub(sd)].map(q => mb.v(q.x, q.y, q.z, on.x, 0.3, on.z, col.clone().multiplyScalar(0.8 + RP() * 0.4), 0, 0, 0, 0));
            mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]); mb.tri(ids[0], ids[2], ids[1]); mb.tri(ids[0], ids[3], ids[2]);
          }
          box(mb, peg.x, peg.y - 0.03, peg.z, 0.05, 0.05, 0.05, C('#9c7a4a'), 0);
        } else if (it === 2) {   // a basket hung by its handle
          const c = peg.clone().addScaledVector(on, 0.06).add(V3(0, -0.36, 0));
          lathe(mb, c.x, c.z, [[0.1, c.y], [0.15, c.y + 0.08], [0.17, c.y + 0.2]], 10, STRAW, 4);
          for (const s of [-1, 1]) beam(mb, peg, c.clone().addScaledVector(ax, s * 0.16).setY(c.y + 0.2), 0.015, TIMBER_L);
        } else {   // a rake, tines up
          const b = peg.clone().add(V3(0, -1.25, 0)).addScaledVector(on, 0.02);
          beam(mb, b, peg.clone().add(V3(0, 0.3, 0)), 0.03, TIMBER_L);
          beam(mb, peg.clone().add(V3(0, 0.3, 0)).addScaledVector(ax, -0.2), peg.clone().add(V3(0, 0.3, 0)).addScaledVector(ax, 0.2), 0.035, TIMBER_L);
          for (let j = 0; j < 7; j++) beam(mb, peg.clone().add(V3(0, 0.3, 0)).addScaledVector(ax, -0.18 + j * 0.06), peg.clone().add(V3(0, 0.42, 0)).addScaledVector(ax, -0.18 + j * 0.06), 0.012, IRON, 0);
        }
      });
    }
  }

  // ── laundry line: from a bracket on the wall out to a T-post, sagging, with washing pegged on it ──
  if (lsp) {
    const f = lsp.face, ax = alongV(f), yl = y0 + 1.7, L = 3.4, n = 3 + Math.floor(RL() * 3), RP = mulberry32(Math.floor(RL() * 1e9));
    const a = [-0.9, 0.9, -1.7, 1.7, 0].find(a => Math.abs(a) < len(f) / 2 - 0.4 && !winAt(f, a - 0.15, a + 0.15, yl - 0.3, yl + 0.3)) ?? 0;
    const sag = 0.16, at = t => onWall(f, a, yl - sag * 4 * t * (1 - t), 0.22 + t * (L - 0.22));
    beam(mb, onWall(f, a, yl, 0), onWall(f, a, yl, 0.24), 0.06, TIMBER);
    beam(mb, onWall(f, a, -0.4, L), onWall(f, a, yl + 0.1, L), 0.09, TIMBER);
    beam(mb, onWall(f, a - 0.3, yl + 0.04, L), onWall(f, a + 0.3, yl + 0.04, L), 0.06, TIMBER);
    if (lod < 2) for (let k = 0; k < 8; k++) beam(mb, at(k / 8), at((k + 1) / 8), 0.014, C('#d8d0c0'), 0);
    const pc = onWall(f, a, 0, L); ud.colliders.push([pc.x, pc.z, 0.2]);
    let t = 0.12;
    for (let k = 0; k < n; k++) {
      const w = 0.35 + RP() * 0.5, h = 0.4 + RP() * 0.5, col = CLOTH[Math.floor(RP() * CLOTH.length)], wave = (RP() - 0.5) * 0.12, tw = w / (L - 0.22);
      if (t + tw > 0.92) break;
      const t0 = t, t1 = t + tw; t = t1 + 0.04 + RP() * 0.08;
      if (lod === 2) continue;
      const cols = 3, ids = [];
      for (let i = 0; i <= cols; i++) {
        const tt = t0 + (t1 - t0) * i / cols, top = at(tt).add(V3(0, -0.01, 0)), fold = Math.sin(i * 2.1 + wave * 20) * 0.04 + wave * (i / cols);
        ids.push([top.clone().addScaledVector(ax, fold * 0.3), top.clone().addScaledVector(ax, fold).add(V3(0, -h, 0))]);
      }
      for (const sd of [1, -1]) {
        const nn = ax.clone().multiplyScalar(sd), vi = ids.map(([p, q]) => [p, q].map((v, j) => mb.v(v.x, v.y, v.z, nn.x, 0.2, nn.z, col.clone().multiplyScalar(j ? 0.92 : 1), 0, 0, 0, 0)));
        for (let i = 0; i < cols; i++) { const [a0, b0] = vi[i], [a1, b1] = vi[i + 1]; if (sd > 0) { mb.tri(a0, b0, b1); mb.tri(a0, b1, a1); } else { mb.tri(a0, b1, b0); mb.tri(a0, a1, b1); } }
      }
      if (lod === 0) for (const tt of [t0 + 0.01, t1 - 0.01]) { const q = at(tt); box(mb, q.x, q.y - 0.02, q.z, 0.02, 0.06, 0.02, TIMBER_L, 0); }
    }
  }

  // ── a rain barrel at a free corner ──
  if (flat && RL() < 0.35) {
    const k0 = Math.floor(RL() * 4), order = faces.map((f, i) => faces[(i + k0) % 4]), sgn = RL() < 0.5 ? 1 : -1;
    for (const f of order) {
      const a = sgn * (len(f) / 2 - 0.5);
      if (!free(f, a - 0.38, a + 0.38, 0.45)) continue;
      used[f].push([a - 0.4, a + 0.4]);
      if (lod < 2) {
        const c = onWall(f, a, 0, 0.45);
        lathe(mb, c.x, c.z, [[0.28, -0.02], [0.33, 0.4], [0.28, 0.82]], lod ? 8 : 12, TIMBER_L, 7);
        for (const y of [0.12, 0.68]) lathe(mb, c.x, c.z, [[0.31 + (y > 0.4 ? -0.015 : 0.0), y], [0.315 + (y > 0.4 ? -0.015 : 0.0), y + 0.05]], lod ? 8 : 12, IRON, 0);
        lathe(mb, c.x, c.z, [[0.27, 0.76], [0.01, 0.765]], lod ? 8 : 12, C('#36454c'), 0);
      }
      const p = onWall(f, a, 0, 0.45); ud.colliders.push([p.x, p.z, 0.4]);
      break;
    }
  }

  // ── a weather vane on the ridge, at the end away from the chimney (every level: it tops the outline) ──
  if (!hut && P.roof !== 'thatch' && RL() < 0.3) {
    const x = rx > 0.6 ? -(P.chimSide || 1) * (rx - 0.4) : 0, yv = ridgeTop + 0.05, yaw = RL() * 6.283, dx = V3(Math.cos(yaw), 0, Math.sin(yaw));
    beam(mb, V3(x, yv - 0.15, 0), V3(x, yv + 0.95, 0), 0.03, IRON, 0);
    if (lod < 2) {
      for (const [ax, az] of [[1, 0], [0, 1]]) beam(mb, V3(x - ax * 0.22, yv + 0.5, -az * 0.22), V3(x + ax * 0.22, yv + 0.5, az * 0.22), 0.015, IRON, 0);
      const c = V3(x, yv + 0.85, 0), tail = c.clone().addScaledVector(dx, -0.3), head = c.clone().addScaledVector(dx, 0.32);
      beam(mb, tail, head, 0.02, IRON, 0);
      const nn = dx.clone().cross(up).normalize();
      for (const [p0, p1, p2] of [[head, head.clone().addScaledVector(dx, -0.1).add(V3(0, 0.07, 0)), head.clone().addScaledVector(dx, -0.1).add(V3(0, -0.07, 0))], [tail, tail.clone().addScaledVector(dx, 0.14).add(V3(0, 0.13, 0)), tail.clone().addScaledVector(dx, 0.14).add(V3(0, -0.06, 0))]]) {
        const ids = [p0, p1, p2].map(q => mb.v(q.x, q.y, q.z, nn.x, nn.y, nn.z, IRON, 0, 0, 0, 0)); mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[1]);
      }
    }
  }
}
