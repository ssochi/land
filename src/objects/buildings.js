// Village houses, generated from parameters. Modelled on Hateno Village (Breath of the Wild / Tears of the
// Kingdom): ochre or cream stucco over a rubble-stone base, steep terracotta tile roofs with a ragged eave of
// single tiles on a dark timber frame (deck edge, bargeboards, exposed rafter tails and purlin ends), a tall
// tapering chimney propped with poles, small shuttered windows with flower boxes, a plank door under a little
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
// use their own random streams). lod 0 is the close-up model (chamfered timber, tile courses as geometry,
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
import { MB, V3 } from './mesh-builder.js';
import { Poly, bake, emit } from './poly/index.js';

const C = hex => new THREE.Color(hex);
const STONE = C('#bfae92'), TIMBER = C('#5e4532'), TIMBER_L = C('#86664a'), IRON = C('#33312e'), GLOW = C('#ffd9a0');
const TILE_C = C('#ffffff'), THATCH_C = C('#ffffff'), SHINGLE_T = [C('#c49a7a'), C('#8a95a6'), C('#a57d64')];
const WASH = { hateno: ['#e6c47e', '#edd49c', '#ecd8b0', '#e4bf8c', '#ddb56c', '#f1e7d0'], stone: ['#c4b49a'], timber: ['#f2ece0'], hut: ['#a8957c'] };
const SHUTTER = [C('#4e6a58'), C('#53708e'), C('#6c533f'), C('#5d7448'), C('#7d4b43')];
const BANNER = [C('#a3456b'), C('#5f7f3f'), C('#3f5f8f'), C('#b0703a')];
const BLOOM = [C('#ee7a2a'), C('#d8402f'), C('#e8c33a'), C('#e070a0'), C('#f2efe6')];
const POT = [C('#3f8f8a'), C('#4f7fa0'), C('#a0603f')];

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
  const R = mulberry32(seed), u = Array.from({ length: 32 }, () => R());
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
  const tower = typeof p.tower === 'number' ? p.tower : p.tower != null ? (p.tower ? 1.45 + u[9] * 0.45 : 0) : style === 'hateno' && u[8] < 0.32 ? 1.45 + u[9] * 0.45 : 0;
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
  let wings = p.wings;
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
  const Q = { style, front, width: +width.toFixed(2), depth: +depth.toFixed(2), floors, roof, pitch: +pitch.toFixed(1), chimney: chimney || false,
    tower: +tower.toFixed(2), towerSide, chimSide, banner, quoins, porch, tint, wash, roofShape, towerShape, wings, dormers, doorA: +doorA.toFixed(2),
    base: p.base || 1.2, lift: p.lift || 0, steps: p.steps || 0 };
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
  return out;
}
const squareTower = r => +(1.75 * r + 0.35).toFixed(2);   // side of a square tower for the round one's radius r
// where the tower stands (roof frame): a gable-front house's at the back gable's corner; an eave-front house's
// round one at a back corner, square one at a front corner
const towerAt = (P, hx, hz, s, k) => { const i = k * s * 0.6; return P.front === 'gable' ? [-(hx - i), P.towerSide * (hz - i)] : [P.towerSide * (hx - i), (P.towerShape === 'square' ? 1 : -1) * (hz - i)]; };

export function makeHouse(seed, lod = 0, params = {}) { return withChamfer(lod === 0, () => buildHouse(seed, lod, params)); }

// roof constants shared by the plan and the builder
const roofDims = (roof, pitch) => {
  const thatch = roof === 'thatch', tp = Math.tan(pitch * Math.PI / 180), cp = Math.cos(pitch * Math.PI / 180);
  return { thatch, tp, cp, sp: Math.sin(pitch * Math.PI / 180), ov: thatch ? 0.65 : 0.6, og: thatch ? 0.45 : 0.5, td: thatch ? 0 : 0.12, tt: thatch ? 0.36 : 0.13 };
};

// The house as blocks, in the roof frame (main body centred, ridge along x). Each block has its own walls,
// openings and roof, placed by a turn th about y and an offset (cx, cz); blocks interpenetrate and the depth
// buffer keeps the outermost surface, which is exactly the joined building: a wing's roof meets the main roof in
// a true valley (same eaves, same pitch) or, when lower, runs into its wall; a dormer's walls and roof sink into
// the roof they stand on; a tower rises through a corner. Parts left inside another block are hidden, and the
// builder keeps windows, quoins and trim off them.
function planBlocks(P, seed, y0, fh) {
  const gable = P.front === 'gable', L = gable ? P.depth : P.width, D = gable ? P.width : P.depth, hx = L / 2, hz = D / 2;
  const R = mulberry32(seed * 31 + 11), rd = roofDims(P.roof, P.pitch), yW = y0 + P.floors * fh;
  const ridgeTop = yW + hz * rd.tp + (rd.td + rd.tt) / rd.cp;
  const main = { kind: 'main', cx: 0, cz: 0, th: 0, L, D, yF: y0, yW, floors: P.floors, roof: P.roof, pitch: P.pitch, shape: P.roofShape, sag: 0.03 + R() * 0.05 };
  const blocks = [main], obst = [];
  // chimney and round tower stand on the main body's frame (= the roof frame)
  const rT = P.tower, ts = P.towerSide;
  main.chim = P.chimney === 'tall' ? { x: (gable ? -1 : P.chimSide) * (hx + 0.55), z: (R() < 0.5 ? -1 : 1) * (0.95 + R() * 0.35) } : null;
  if (rT && P.towerShape === 'round') main.round = gable ? { x: -(hx - 0.2 * rT), z: ts * (hz - 0.3 * rT) } : { x: ts * (hx - 0.3 * rT), z: -(hz - 0.2 * rT) };
  if (rT && P.towerShape === 'square') {
    // tall and slender, two stages clear of the roof, under a steep pyramid of tiles
    const s = squareTower(rT), [tx, tz] = towerAt(P, hx, hz, s, 0.32);
    blocks.push({ kind: 'tower', cx: tx, cz: tz, th: 0, L: s, D: s, yF: y0, yW: ridgeTop + 3.0 + R() * 2.2, floors: 1, roof: P.roof === 'thatch' ? 'tile' : P.roof, pitch: 60 + R() * 6, shape: 'hip', ov: 0.3, og: 0.3, trim: 0.6 });
    main.towerSq = { x: tx, z: tz, s };
  }
  if (main.chim && (main.round || main.towerSq) && gable) { const t = main.round || main.towerSq; main.chim.z = -Math.sign(t.z) * Math.abs(main.chim.z); }
  if (main.chim) obst.push({ x: main.chim.x, z: main.chim.z, r: 1.0 });
  if (main.round) obst.push({ x: main.round.x, z: main.round.z, r: rT });
  // wings: local x runs out of the main wall; the inner gable sits at the main body's centre line, hidden
  for (const W of P.wings || []) {
    const zs = W.side === 'f' ? 1 : -1, Lw = hz + W.e;
    blocks.push({ kind: 'wing', cx: W.a, cz: zs * Lw / 2, th: -zs * Math.PI / 2, L: Lw, D: W.w, yF: y0, yW: y0 + W.floors * fh, floors: W.floors, roof: P.roof, pitch: P.pitch, shape: 'gable', sag: 0.02 + R() * 0.03, inner: true });
  }
  // dormers on the front roof: little gabled boxes whose fronts stand a little up the slope
  if (P.dormers && P.roof !== 'thatch') {
    const n = P.dormers, surf = z => yW + (hz - z) * rd.tp + (rd.td + rd.tt) / rd.cp, zf = hz - 0.55 - R() * 0.35;
    const wingOn = x => (P.wings || []).some(W => W.side === 'f' && Math.abs(x - W.a) < W.w / 2 + 1.1);
    const reach = P.roofShape === 'hip' ? hx - hz - 0.2 + (hz - zf) : hx - 1.1;
    for (let k = 0; k < n; k++) {
      const x = n === 1 ? (R() - 0.5) * 0.8 : -reach * 0.7 + 1.4 * reach * k / (n - 1);
      if (Math.abs(x) > reach || wingOn(x) || obst.some(o => Math.abs(o.x - x) < 1.6 && o.z > 0) || (main.towerSq && main.towerSq.z > 0 && Math.abs(main.towerSq.x - x) < main.towerSq.s / 2 + 1.0)) continue;
      const w = 1.3 + R() * 0.25, dp = Math.min(56, P.pitch + 8), dd = roofDims(P.roof, dp);
      const yd = surf(zf) + 1.15 + R() * 0.2, ridge = yd + (w / 2) * dd.tp + 0.35;
      const zb = Math.max(0.2, hz - (ridge + 0.35 - yW - (rd.td + rd.tt) / rd.cp) / rd.tp), Ld = zf - zb;
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
  // R lays a block out; details that only some LOD levels draw take their own streams (RQ quoins, RD door pots,
  // RW flower boxes, RB banner), so a level that skips one never shifts the draws behind it — every level is the
  // same house, down to the chimney's height and where the banner hangs
  const ctx = { P, mb, lod, y0, fh, yB: -P.base, ud, plan, hut, seed, style: P.style, wash: C(P.wash), shut: SHUTTER[P.tint % SHUTTER.length],
    RQ: mulberry32(seed * 31 + 101), RD: mulberry32(seed * 31 + 103), RW: mulberry32(seed * 31 + 107), RB: mulberry32(seed * 31 + 109) };
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
  const { P, mb, lod, fh, yB, hut, style, wash, shut, RQ, RD, RW } = ctx;
  const main = B.kind === 'main', wing = B.kind === 'wing', dormer = B.kind === 'dormer', tw = B.kind === 'tower';
  const start = mb.p.length / 3, ud = { colliders: [], smoke: [], lights: [] };
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
  const wv = (p, n, k, u, v) => mb.v(p.x, p.y, p.z, n.x, n.y, n.z, wash.clone().multiplyScalar(k), 0, u, v - vf, wallCard);
  const holes = { f: [], b: [], l: [], r: [] };
  if (lod < 2) {
    for (const o of openings) if (!o.small) holes[o.f].push({ a0: o.a - o.ww / 2, a1: o.a + o.ww / 2, y0: o.y, y1: o.y + o.wh, dp: 0.24, sill: true });
    if (main) holes[doorFace].push({ a0: doorA - door.w / 2, a1: doorA + door.w / 2, y0: y0 - 0.05, y1: y0 + door.h, dp: 0.16 });
  }
  for (const f of ['f', 'r', 'b', 'l']) {
    if (B.inner && f === 'l') continue;   // the inner end of a wing or dormer is inside what it joins
    const rows = rowsOf(f), half = len(f) / 2, n = outN(f), a0 = -half + CH, a1 = half - CH;
    const ys = [...new Set([...rows.map(r => r[0]), ...holes[f].flatMap(h => [h.y0, h.y1])])].sort((p, q) => p - q);
    const q = (x0, x1, ya, yb) => {
      const ids = [[x0, ya], [x1, ya], [x1, yb], [x0, yb]].map(([a, y]) => wv(onWall(f, a, y, 0), n, shadeAt(rows, y), a + half, y));
      mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]);
    };
    for (let k = 0; k < ys.length - 1; k++) {
      const ya = ys[k], yb = ys[k + 1], ym = (ya + yb) / 2;
      let x = a0;
      for (const h of holes[f].filter(h => h.y0 < ym && h.y1 > ym).sort((p, r) => p.a0 - r.a0)) { if (h.a0 > x) q(x, h.a0, ya, yb); x = Math.max(x, h.a1); }
      if (a1 > x) q(x, a1, ya, yb);
    }
    for (const h of holes[f]) {   // reveals: sides, head and sill, set back dp, darker inside
      const al = alongV(f), W = (a, y, o) => onWall(f, a, y, o);
      quad(mb, W(h.a0, h.y0, 0), W(h.a0, h.y0, -h.dp), W(h.a0, h.y1, -h.dp), W(h.a0, h.y1, 0), wash.clone().multiplyScalar(0.86), wallCard, al, [0, h.y0 - vf]);
      quad(mb, W(h.a1, h.y0, 0), W(h.a1, h.y0, -h.dp), W(h.a1, h.y1, -h.dp), W(h.a1, h.y1, 0), wash.clone().multiplyScalar(0.86), wallCard, al.clone().negate(), [0, h.y0 - vf]);
      quad(mb, W(h.a0, h.y1, 0), W(h.a1, h.y1, 0), W(h.a1, h.y1, -h.dp), W(h.a0, h.y1, -h.dp), wash.clone().multiplyScalar(0.68), wallCard, V3(0, -1, 0), [0, h.y1 - vf]);
      if (h.sill) quad(mb, W(h.a0, h.y0, 0), W(h.a1, h.y0, 0), W(h.a1, h.y0, -h.dp), W(h.a0, h.y0, -h.dp), wash.clone().multiplyScalar(0.95), wallCard, V3(0, 1, 0), [0, h.y0 - vf]);
    }
  }
  if (CH) for (const [f1, f2] of [['f', 'r'], ['r', 'b'], ['b', 'l'], ['l', 'f']]) {
    const r1 = rowsOf(f1), r2 = rowsOf(f2), h1 = len(f1) / 2, h2 = len(f2) / 2, ids = [];
    for (const y of [...new Set([...r1, ...r2].map(r => r[0]))].sort((p, q) => p - q))
      ids.push([wv(onWall(f1, h1 - CH, y, 0), outN(f1), shadeAt(r1, y), 2 * h1 - CH, y), wv(onWall(f2, -h2 + CH, y, 0), outN(f2), shadeAt(r2, y), 2 * h1 - CH * 0.6, y)]);
    for (let k = 0; k < ids.length - 1; k++) { const [a, b] = ids[k], [d, c] = ids[k + 1]; mb.tri(a, b, c); mb.tri(a, c, d); }
  }
  if (!hip) for (const sx of [1, -1]) {   // gable triangles, shaded toward the apex under the roof
    if (B.inner && sx < 0) continue;
    const x = sx * hx, n = V3(sx, 0, 0), pts = [[-(hz - CH), yW, 0.95], [hz - CH, yW, 0.95], [0, ridgeU, 0.7]];
    const ids = pts.map(([z, y, k]) => mb.v(x, y, z, n.x, 0, 0, wash.clone().multiplyScalar(k), 0, hz - sx * z, y - vf, wallCard));
    if (sx > 0) mb.tri(ids[0], ids[2], ids[1]); else mb.tri(ids[0], ids[1], ids[2]);
  }
  // quoins: dressed stones up the corners, long and short in turn, standing a little proud of the wall (a square
  // tower always has them, the way TotK's do)
  if (!dormer && (style === 'stone' || P.quoins || tw)) for (const [f1, f2] of [['f', 'r'], ['r', 'b'], ['b', 'l'], ['l', 'f']]) {
    const h1 = len(f1) / 2, a1 = alongV(f1), a2 = alongV(f2), t = 0.035, sc = tw ? 0.85 : 1;
    for (let y = y0 + 0.02, k = 0; y < yW - 0.3; k++) {
      const bh = (0.27 + RQ() * 0.07) * sc, l1 = ((k % 2 ? 0.3 : 0.52) + RQ() * 0.06) * sc, l2 = ((k % 2 ? 0.52 : 0.3) + RQ() * 0.06) * sc;
      const c = onWall(f1, h1, y + bh / 2, 0).addScaledVector(a1, (t - l1) / 2).addScaledVector(a2, (l2 - t) / 2);
      const qc = STONE.clone().multiplyScalar(0.98 + RQ() * 0.12);
      y += bh + 0.025;
      if (covered(c.clone().addScaledVector(a1, l1 * 0.3).addScaledVector(a2, -l2 * 0.3), 0.05)) continue;
      if (lod === 0) bevelBox(mb, c, a1, V3(0, 1, 0), a2, l1 + t, bh, l2 + t, 0.03, qc, 13); else obox(mb, c, a1, V3(0, 1, 0), a2, l1 + t, bh, l2 + t, qc, 13);
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
    if (!hut) {
      // canopy: a tilted roof of tiles over the door on two angled brackets (pots only where the ground is near,
      // and only close up)
      const cw = door.w + 0.75, cd = 0.8, cy = y0 + door.h + 0.42, tilt = 0.36;
      const ax = dAl.clone(), dn = V3(dO.x * Math.cos(tilt), -Math.sin(tilt), dO.z * Math.cos(tilt)), up = ax.clone().cross(dn).negate();
      const cc = onWall(doorFace, doorA, cy, 0).addScaledVector(dn, cd / 2);
      obox(mb, cc, ax, up, dn, cw, 0.07, cd, TIMBER_L, 7);
      if (roof === 'tile') obox(mb, cc.clone().addScaledVector(up, 0.07), ax, up, dn, cw + 0.1, 0.07, cd + 0.08, C('#d9845c'), 0);
      for (const s of [-1, 1]) beam(mb, onWall(doorFace, doorA + s * (cw / 2 - 0.15), cy - 0.55, 0.02), onWall(doorFace, doorA + s * (cw / 2 - 0.15), cy - 0.2, cd - 0.15), 0.07, TIMBER);
      for (let k = 0, n = P.steps > 0.25 || lod ? 0 : Math.floor(RD() * 3); k < n; k++) {
        const pc = onWall(doorFace, doorA + door.w / 2 + 0.5 + k * 0.45, 0, 0.32), s = 0.8 + RD() * 0.5;
        lathe(mb, pc.x, pc.z, [[0.1 * s, y0 - 0.25], [0.2 * s, y0 - 0.25 + 0.12 * s], [0.23 * s, y0 - 0.25 + 0.3 * s], [0.14 * s, y0 - 0.25 + 0.5 * s], [0.15 * s, y0 - 0.25 + 0.56 * s]], 8, POT[Math.floor(RD() * POT.length)], 0);
      }
    }
    ud.door = (() => { const p = onWall(doorFace, doorA, 0, 1.3); return [p.x, p.z]; })();
  }

  // windows: set back in their reveals — dark glass (lit at night) in a slim frame with a cross mullion, a timber
  // sill out past the wall, plank shutters folded back flat against it, flower boxes under some ground-floor ones
  for (const o of openings) {
    const deep = !o.small && lod < 2, dp = deep ? 0.24 : -0.02;
    panel(o.f, o.a, o.y, o.ww, o.wh, -dp, GLOW, 6);
    if (lod === 2) {   // far away: the coloured shutters still read, as flat panels
      if (!hut && !o.small) for (const s of [-1, 1]) { const sw = o.ww / 2 + 0.05; panel(o.f, o.a + s * (o.ww / 2 + 0.03 + sw / 2), o.y - 0.02, sw, o.wh + 0.04, 0.01, shut, 7, true); }
      continue;
    }
    const fr = TIMBER;
    if (!deep) {   // small windows sit on the wall in a plain frame (a tower's in dressed stone)
      const fc = o.slit ? STONE.clone().multiplyScalar(1.02) : TIMBER_L, fk = o.slit ? 13 : 7;
      slat(o.f, o.a, o.y - 0.08, o.ww + 0.2, 0.08, 0, 0.1, fc, fk); slat(o.f, o.a, o.y + o.wh, o.ww + 0.2, 0.1, 0, 0.08, o.slit ? fc : fr, fk);
      for (const s of [-1, 1]) slat(o.f, o.a + s * (o.ww / 2 + 0.04), o.y, 0.08, o.wh, 0, 0.07, o.slit ? fc : fr, fk);
      if (o.dormer && lod === 0) slat(o.f, o.a, o.y + o.wh * 0.5, o.ww, 0.04, 0, 0.035, fr);
      continue;
    }
    const fb = -dp + 0.005;
    for (const s of [-1, 1]) slat(o.f, o.a + s * (o.ww / 2 - 0.03), o.y, 0.06, o.wh, fb, 0.05, fr);
    slat(o.f, o.a, o.y + o.wh - 0.06, o.ww, 0.06, fb, 0.05, fr); slat(o.f, o.a, o.y, o.ww, 0.06, fb, 0.05, fr);
    if (lod === 0) { slat(o.f, o.a, o.y, 0.04, o.wh, fb, 0.035, fr); slat(o.f, o.a, o.y + o.wh * 0.55, o.ww, 0.04, fb, 0.035, fr); }
    slat(o.f, o.a, o.y - 0.085, o.ww + 0.18, 0.08, -0.04, 0.16, TIMBER_L);
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
    for (let fl = 0; fl <= floors; fl++) slat(f, 0, y0 + fl * fh - (fl === floors ? 0.2 : 0.08), ln + 0.2, 0.2, -0.02, 0.1, TIMBER);
    const posts = Math.max(2, Math.round(ln / 2.2) + 1);
    for (let k = 0; k < posts; k++) {
      const a = -half + k * ln / (posts - 1);
      if (openings.some(o => o.f === f && Math.abs(o.a - a) < o.ww / 2 + 0.25) || (f === doorFace && Math.abs(a - doorA) < door.w / 2 + 0.3)) continue;
      if (covered(onWall(f, a, y0 + 1.0, 0.1))) continue;
      slat(f, a, y0, 0.18, floors * fh, -0.02, 0.1, TIMBER);
    }
  }

  // ── roof ──
  roofOf(ctx, B, { hx, hz, rx, hip, yW, eaveU, ridgeU, ridgeTop, ov, og, td, tt, tp, cp, sp, thatch, trim, R });

  if (main) mainExtras(ctx, B, { hx, hz, yW, ridgeTop, y0, doorFace, door, openings, onWall, outN, alongV, len, R, ud, vf });

  // a hand-made roof: the ridge sags a few centimetres in the middle, most at the top
  if (B.sag) {
    const p = mb.p, span = rx + og + 0.2;
    for (let i = start; i < p.length / 3; i++) {
      const y = p[i * 3 + 1]; if (y <= yW) continue;
      const k = Math.min(1, (y - yW) / Math.max(0.1, ridgeTop - yW)), u = Math.max(0, 1 - (p[i * 3] / span) ** 2);
      p[i * 3 + 1] -= B.sag * k * u;
    }
  }
  // into the roof frame
  if (B.th || B.cx || B.cz) {
    const p = mb.p, nn = mb.n, c = Math.cos(B.th), s = Math.sin(B.th);
    for (let i = start * 3; i < p.length; i += 3) {
      const x = p[i], z = p[i + 2], nx = nn[i], nz = nn[i + 2];
      p[i] = B.cx + x * c + z * s; p[i + 2] = B.cz - x * s + z * c; nn[i] = nx * c + nz * s; nn[i + 2] = -nx * s + nz * c;
    }
  }
  for (const [x, z, r] of ud.colliders) { const [a, b] = toRoof(B, x, z); ctx.ud.colliders.push([a, b, r]); }
  for (const [x, y, z] of ud.smoke) { const [a, b] = toRoof(B, x, z); ctx.ud.smoke.push([a, y, b]); }
  for (const [x, y, z, r] of ud.lights) { const [a, b] = toRoof(B, x, z); ctx.ud.lights.push([a, y, b, r]); }
  if (main) ctx.ud.door = ud.door;
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
  const plane = (top, dn, ax, n, half, sl) => {
    if (roof === 'tile' && lod === 0) {
      const pc = 2 / 6, lip = 0.06, nC = Math.ceil(sl / pc - 0.05);
      const at = (u, t, up) => top.clone().addScaledVector(ax, u).addScaledVector(dn, t).addScaledVector(n, up);
      for (let k = 0; k < nC; k++) {
        const t0 = k * pc, t1 = Math.min(sl, (k + 1) * pc), up = k === nC - 1 ? 0 : lip, h0 = half(t0), h1 = half(t1);
        if (h0 + h1 < 0.02) continue;
        quad(mb, at(-h0, t0, 0), at(h0, t0, 0), at(h1, t1, up), at(-h1, t1, up), rc, rCard, n, [-h0, t0]);
        if (up) quad(mb, at(-h1, t1, up), at(h1, t1, up), at(h1, t1, 0), at(-h1, t1, 0), rc.clone().multiplyScalar(0.72), rCard, dn, [-h1, t1 - 0.03]);
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
  const ragged = (A, Bp, n, out) => {
    if (lod !== 0 || thatch) return;
    const R = RT;
    const ax = Bp.clone().sub(A), Ln = ax.length(); ax.divideScalar(Ln);
    const k = Math.max(1, Math.round(Ln / 0.4)), w = Ln / k, side = out.clone().normalize(), up = n.clone();
    for (let i = 0; i < k; i++) {
      const hang = 0.02 + R() * 0.06, c = A.clone().addScaledVector(ax, (i + 0.5) * w).addScaledVector(side, hang - 0.14).addScaledVector(up, 0.025 + R() * 0.012);
      const tilt = (R() - 0.5) * 0.12, a1 = ax.clone().applyAxisAngle(up, tilt), a3 = up.clone().cross(a1).normalize();
      const col = (roof === 'tile' ? C('#c9704c') : rc).clone().multiplyScalar(0.9 + R() * 0.25);
      withChamfer(false, () => obox(mb, c, a1, up, a3.dot(side) > 0 ? a3 : a3.negate(), w * (0.92 + R() * 0.06), 0.035, 0.32, col, 0));   // too thin to chamfer
    }
  };
  const tim = TIMBER, dark = TIMBER.clone().multiplyScalar(0.62), slopeL = Math.hypot(hz + ov, (hz + ov) * tp);
  for (const s of [1, -1]) {   // the two long planes (front and back)
    const n = V3(0, cp, s * sp), down = V3(0, -sp, s * cp), ez = s * (hz + ov);
    const o1 = n.clone().multiplyScalar(td), o2 = n.clone().multiplyScalar(td + tt);
    const top = V3(0, ridgeU, 0).add(o2), half = t => hip ? rx + (EX - rx) * (t / slopeL) : xb;
    plane(top, down, V3(1, 0, 0), n, half, slopeL);
    const Eu = x => V3(x, eaveU, ez);
    quad(mb, Eu(-EX).add(o1), Eu(EX).add(o1), Eu(EX).add(o2), Eu(-EX).add(o2), rc.clone().multiplyScalar(0.7), rCard, down);       // tile edge
    quad(mb, V3(-rx, ridgeU, 0), V3(rx, ridgeU, 0), Eu(EX), Eu(-EX), dark, thatch ? 4 : 7, n.clone().negate());                      // soffit (a hip's tapers)
    ragged(Eu(-EX).add(o2), Eu(EX).add(o2), n, down);
    if (thatch) continue;
    quad(mb, Eu(-EX), Eu(EX), Eu(EX).add(o1), Eu(-EX).add(o1), tim, 7, down);
    const sd = down.clone();
    obox(mb, Eu(0).addScaledVector(n, td - 0.12 * trim).addScaledVector(sd, -0.03), V3(1, 0, 0), n, sd, 2 * EX + (hip ? 0.02 : 0.2), 0.24 * trim, 0.1 * trim, tim, 7);   // fascia
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
      quad(mb, Eu(-(hz + ov)), Eu(hz + ov), Eu(hz + ov).add(o1), Eu(-(hz + ov)).add(o1), tim, 7, down);
      obox(mb, Eu(0).addScaledVector(n, td - 0.12 * trim).addScaledVector(down, -0.03), V3(0, 0, 1), n, down, 2 * (hz + ov) + 0.02, 0.24 * trim, 0.1 * trim, tim, 7);
      // boards up the two hips, capped with ridge tiles
      for (const sz of [1, -1]) {
        const A = V3(sx * rx, ridgeTop - 0.02, 0), Bp = V3(sx * (hx + ov), eaveU + (td + tt) / cp, sz * (hz + ov));
        beam(mb, A, Bp, 0.16 * trim, roof === 'tile' ? C('#c06a48') : rc.clone().multiplyScalar(0.9), roof === 'tile' ? 0 : rCard, V3(0, 1, 0), 0.12 * trim);
      }
    }
  } else {
    // gable ends: the deck's edge, and deep bargeboards along both rakes hanging below it
    for (const s of [1, -1]) {
      const n = V3(0, cp, s * sp), ez = s * (hz + ov), o1 = n.clone().multiplyScalar(td), o2 = n.clone().multiplyScalar(td + tt);
      const Ru = x => V3(x, ridgeU, 0), Eu = x => V3(x, eaveU, ez);
      for (const x of [xa, xb]) {
        if (B.inner && x < 0) continue;
        quad(mb, Ru(x).add(o1), Eu(x).add(o1), Eu(x).add(o2), Ru(x).add(o2), rc.clone().multiplyScalar(0.7), rCard, V3(Math.sign(x), 0, 0));
        ragged(Ru(x).add(o2), Eu(x).add(o2), n, V3(Math.sign(x), 0, 0));
        if (thatch) continue;
        const slope = Eu(0).sub(Ru(0)), sl = slope.length(), sd = slope.clone().normalize();
        obox(mb, Ru(x + Math.sign(x) * 0.02).add(Eu(x + Math.sign(x) * 0.02)).multiplyScalar(0.5).addScaledVector(n, td - 0.15 * trim).addScaledVector(sd, 0.04), sd, n, V3(1, 0, 0), sl + 0.12, 0.3 * trim, 0.13 * trim, TIMBER, 7);
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
    if (lod < 2) {   // half-round ridge tiles
      const rr = 0.15 * Math.max(0.6, trim), yc = ridgeTop - 0.05, segs = 6, ids = [];
      for (let i = 0; i <= segs; i++) {
        const a = i / segs * Math.PI, ny = Math.sin(a), nz = Math.cos(a);
        ids.push([r0, r1].map(x => mb.v(x, yc + ny * rr, nz * rr, 0, ny, nz, rc.clone().multiplyScalar(0.92), 0, x, a * rr, rCard)));
      }
      for (let i = 0; i < segs; i++) { mb.tri(ids[i][0], ids[i][1], ids[i + 1][0]); mb.tri(ids[i][1], ids[i + 1][1], ids[i + 1][0]); }
    } else box(mb, (r0 + r1) / 2, ridgeTop, 0, r1 - r0, 0.18, 0.3, rc, rCard);
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
    const H = ridgeTop + 2.2 + R() * 1.4, prof = [], segs = 16, rb = 1.4, rt = 0.62;
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
