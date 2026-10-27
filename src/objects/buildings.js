// Village houses, generated from parameters. Modelled on Hateno Village (Breath of the Wild): ochre or cream
// stucco over a rubble-stone base, terracotta tile roofs on a dark timber frame (deck edge, bargeboards, exposed
// rafter tails and purlin ends), a tall tapering chimney propped with poles, round towers with conical roofs,
// small shuttered windows with flower boxes, a plank door under a little canopy with a wall lamp, cloth banners.
//   hateno  stucco, clay tile roof, tall chimney against a gable (the default look)
//   stone   coursed stone walls, clay tile roof, a stone stack through the roof
//   timber  white plaster in a dark timber frame, wooden shingle roof
//   hut     small weathered plank hut with a thatch roof
// front: 'eave' puts the long side (and the door) to the street, 'gable' turns a gable end to it.
// lod 0 is the full model for close views; lod 1 drops rubble stones, flower boxes, pots, rafter tails and
// mullions; lod 2 is walls, roof, chimney and tower only. The model faces +z (front door) with its footprint
// centred on the origin. Surfaces carry uv in metres and a material card for the prop shader
// (0 vertex colour · 2 masonry · 3 rock · 4 thatch · 5 shingle · 6 lit glass · 7 wood · 8 stucco · 9 clay tile ·
// 10 rubble stone · 11 lamp glass).
// On a slope the house stands on its stone base: base is how far the base reaches below the floor's ground
// level, lift raises the model above the ground at its centre, steps is the drop to the ground at the door
// (a flight of stone steps is built for it).
// userData: colliders (circles), smoke (chimney tops), lights (lamps: position + radius), footprint, door.
import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { MB, V3, addBlob } from './mesh-builder.js';

const C = hex => new THREE.Color(hex);
const STONE = C('#bfae92'), TIMBER = C('#5e4532'), TIMBER_L = C('#86664a'), IRON = C('#33312e'), GLOW = C('#ffd9a0');
const TILE_C = C('#ffffff'), THATCH_C = C('#ffffff'), SHINGLE_T = [C('#c49a7a'), C('#8a95a6'), C('#a57d64')];
const WASH = { hateno: ['#ead08e', '#f0ddb0', '#f2e6cc', '#e8c99c', '#e3c27c'], stone: ['#c9bda8'], timber: ['#f2ece0'], hut: ['#a8957c'] };
const SHUTTER = [C('#3d4c49'), C('#45566b'), C('#5a4535'), C('#4c5a3b'), C('#6a3f3a')];
const BANNER = [C('#a3456b'), C('#5f7f3f'), C('#3f5f8f'), C('#b0703a')];
const BLOOM = [C('#ee7a2a'), C('#d8402f'), C('#e8c33a'), C('#e070a0'), C('#f2efe6')];
const POT = [C('#3f8f8a'), C('#4f7fa0'), C('#a0603f')];

// quad P0 P1 P2 P3; uv in metres along P0→P1 (u) and P0→P3 (v); `out` is the outward normal direction, used to
// pick the winding so the face is front-facing from outside
export function quad(mb, P0, P1, P2, P3, col, card, out, uv0 = [0, 0], sw = 0) {
  const U = P1.clone().sub(P0), Vv = P3.clone().sub(P0), lu = U.length() || 1, lv = Vv.length() || 1;
  let n = U.clone().cross(Vv).normalize();
  const flip = out && n.dot(out) < 0; if (flip) n.negate();
  U.divideScalar(lu); Vv.divideScalar(lv);
  const ids = [P0, P1, P2, P3].map(P => { const d = P.clone().sub(P0); return mb.v(P.x, P.y, P.z, n.x, n.y, n.z, col, sw, uv0[0] + d.dot(U), uv0[1] + d.dot(Vv), card); });
  if (flip) { mb.tri(ids[0], ids[2], ids[1]); mb.tri(ids[0], ids[3], ids[2]); } else { mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]); }
}

// axis-aligned box (rotated by rot about y around its centre); faces get uv in metres; sw goes to aSway
// (wind sway weight, or the hub height for windmill rotor parts)
export function box(mb, cx, cy, cz, sx, sy, sz, col, card, rot = 0, topCol = null, sw = 0) {
  const c = Math.cos(rot), s = Math.sin(rot), hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const P = (x, y, z) => V3(cx + x * c - z * s, cy + y, cz + x * s + z * c), N = (x, y, z) => V3(x * c - z * s, y, x * s + z * c);
  quad(mb, P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), col, card, N(0, 0, 1), undefined, sw);
  quad(mb, P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), col, card, N(0, 0, -1), undefined, sw);
  quad(mb, P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), col, card, N(1, 0, 0), undefined, sw);
  quad(mb, P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), col, card, N(-1, 0, 0), undefined, sw);
  quad(mb, P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), topCol || col, card, N(0, 1, 0), undefined, sw);
  quad(mb, P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), col, card, N(0, -1, 0), undefined, sw);
}

// box on its own orthonormal axes ax ay az around centre c, sizes along them sx sy sz (u runs along ax)
export function obox(mb, c, ax, ay, az, sx, sy, sz, col, card) {
  const P = (x, y, z) => c.clone().addScaledVector(ax, x * sx / 2).addScaledVector(ay, y * sy / 2).addScaledVector(az, z * sz / 2);
  const nx = ax.clone().negate(), ny = ay.clone().negate(), nz = az.clone().negate();
  quad(mb, P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), col, card, az);
  quad(mb, P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), col, card, nz);
  quad(mb, P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1), col, card, ay);
  quad(mb, P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), col, card, ny);
  quad(mb, P(1, -1, -1), P(1, -1, 1), P(1, 1, 1), P(1, 1, -1), col, card, ax);
  quad(mb, P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), col, card, nx);
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
// top down (roof tiles need v down the slope). Smooth normals; uv: u around in metres, v along the profile.
export function lathe(mb, cx, cz, prof, segs, col, card, o = {}) {
  const sq = o.sq || 2, sx = o.sx || 1, sz = o.sz || 1, rot = o.rot || 0;
  const dirs = [];
  for (let i = 0; i <= segs; i++) {
    const a = rot + i / segs * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), k = Math.pow(Math.pow(Math.abs(c), sq) + Math.pow(Math.abs(s), sq), -1 / sq);
    dirs.push([c * k * sx, s * k * sz, c / sx, s / sz, i / segs]);
  }
  const sn = [];
  for (let j = 0; j < prof.length - 1; j++) { const dr = prof[j + 1][0] - prof[j][0], dy = prof[j + 1][1] - prof[j][1], l = Math.hypot(dr, dy) || 1; sn.push([dy / l, -dr / l, l]); }
  const total = sn.reduce((a, s) => a + s[2], 0), rmax = Math.max(...prof.map(p => p[0])) * Math.max(sx, sz);
  let v = 0;
  for (let j = 0; j < sn.length; j++) {
    const [r0, y0] = prof[j], [r1, y1] = prof[j + 1], n = sn[j];
    const c0 = o.shade ? col.clone().multiplyScalar(o.shade(j)) : col, c1 = o.shade ? col.clone().multiplyScalar(o.shade(j + 1)) : col;
    const base = mb.p.length / 3, v0 = o.flipV ? total - v : v, v1 = o.flipV ? total - v - n[2] : v + n[2];
    for (let i = 0; i <= segs; i++) {
      const [x, z, nxr, nzr, t] = dirs[i], nl = Math.hypot(nxr * n[0], n[1], nzr * n[0]) || 1, u = t * Math.PI * 2 * rmax;
      mb.v(cx + x * r0, y0, cz + z * r0, nxr * n[0] / nl, n[1] / nl, nzr * n[0] / nl, c0, 0, u, v0, card);
      mb.v(cx + x * r1, y1, cz + z * r1, nxr * n[0] / nl, n[1] / nl, nzr * n[0] / nl, c1, 0, u, v1, card);
    }
    for (let i = 0; i < segs; i++) { const a = base + i * 2; mb.tri(a, a + 1, a + 2); mb.tri(a + 1, a + 3, a + 2); }
    v += n[2];
  }
}

// fill in missing parameters from the style and seed. Every random draw happens whatever was given, so a
// house keeps its other features when one parameter is overridden. lot: [w, d] the ground it needs.
export function houseParams(seed, p = {}) {
  const R = mulberry32(seed), u = Array.from({ length: 18 }, () => R());
  const style = p.style || ['hateno', 'hateno', 'stone', 'timber'][Math.floor(u[0] * 4)], hut = style === 'hut';
  const front = p.front || (hut ? 'eave' : u[1] < 0.35 ? 'gable' : 'eave');
  const long = hut ? 4.2 + u[2] * 1.2 : 7.2 + u[2] * 2.4, short = hut ? 3.6 + u[3] * 0.8 : 5.4 + u[3] * 1.4;
  const width = p.width || (front === 'gable' ? short : long), depth = p.depth || (front === 'gable' ? long : short);
  const floors = p.floors || (hut ? 1 : u[4] < (style === 'timber' ? 0.25 : 0.35) ? 2 : 1);
  const roof = p.roof || (hut ? 'thatch' : style === 'timber' ? 'shingle' : 'tile');
  const pitch = p.pitch || (roof === 'thatch' ? 46 + u[5] * 6 : roof === 'tile' ? 28 + u[5] * 7 : 34 + u[5] * 6);
  let chimney = p.chimney != null ? p.chimney : !hut || u[6] < 0.4;
  if (chimney === true) chimney = style === 'hateno' && u[7] < 0.85 ? 'tall' : 'stack';
  const tower = typeof p.tower === 'number' ? p.tower : p.tower != null ? (p.tower ? 1.45 + u[9] * 0.45 : 0) : style === 'hateno' && u[8] < 0.3 ? 1.45 + u[9] * 0.45 : 0;
  const towerSide = p.towerSide || (u[10] < 0.5 ? -1 : 1), chimSide = p.chimSide || (tower ? -towerSide : u[11] < 0.5 ? -1 : 1);
  const banner = p.banner != null ? !!p.banner : !hut && u[12] < 0.35;
  const porch = p.porch != null ? !!p.porch : (style === 'stone' || style === 'timber') && u[13] < 0.45;
  const tint = p.tint != null ? p.tint : Math.floor(u[14] * 5), washes = WASH[style] || WASH.hateno;
  const wash = p.wash || washes[Math.floor(u[15] * washes.length)];
  // ground needed, symmetric about the centre: walls + overhangs, a chimney outside a gable, a tower at a corner
  const L = front === 'gable' ? depth : width, D = front === 'gable' ? width : depth;
  // the door's offset along the front wall, and the spot in front of it (model frame)
  const doorA = p.doorA != null ? p.doorA : front === 'gable' ? (u[16] - 0.5) * 0.6 : (u[16] - 0.5) * Math.max(0, L - 3.4) * 0.6;
  let ex = L + 1.2 + (chimney === 'tall' ? 2.2 : 0), ez = D + 1.6 + (tower ? 1.6 : 0) + (porch ? 1.6 : 0);
  if (front === 'gable') [ex, ez] = [ez, ex];
  return { style, front, width: +width.toFixed(2), depth: +depth.toFixed(2), floors, roof, pitch: +pitch.toFixed(1), chimney: chimney || false,
    tower: +tower.toFixed(2), towerSide, chimSide, banner, porch, tint, wash, doorA: +doorA.toFixed(2),
    door: [+doorA.toFixed(2), +(depth / 2 + (porch ? 2.7 : 1.3)).toFixed(2)], lot: [+ex.toFixed(2), +ez.toFixed(2)],
    base: p.base || 1.2, lift: p.lift || 0, steps: p.steps || 0 };
}

export function makeHouse(seed, lod = 0, params = {}) {
  const P = houseParams(seed, params), R = mulberry32(seed * 31 + 7), mb = new MB();
  const { style, floors, roof, pitch } = P, gable = P.front === 'gable', hut = style === 'hut';
  // built in a frame with the ridge along x; a gable-front house is turned a quarter at the end so its +x gable
  // (where the door goes) faces +z
  const L = gable ? P.depth : P.width, D = gable ? P.width : P.depth, hx = L / 2, hz = D / 2;
  const y0 = hut ? 0.35 : 0.55, fh = hut ? 2.4 : 2.85, yW = y0 + floors * fh;
  const wash = C(P.wash), wallCard = style === 'stone' ? 2 : hut ? 7 : 8, shut = SHUTTER[P.tint % SHUTTER.length];
  const ud = { colliders: [], smoke: [], lights: [], footprint: [P.width, P.depth], door: [0, 0] };
  const doorFace = gable ? 'r' : 'f', len = f => (f === 'f' || f === 'b' ? L : D);
  const tp = Math.tan(pitch * Math.PI / 180), cp = Math.cos(pitch * Math.PI / 180), sp = Math.sin(pitch * Math.PI / 180);
  const thatch = roof === 'thatch', ov = thatch ? 0.65 : 0.6, og = thatch ? 0.45 : 0.5, td = thatch ? 0 : 0.12, tt = thatch ? 0.36 : 0.09;
  const eaveU = yW - ov * tp, ridgeU = yW + hz * tp, ridgeTop = ridgeU + (td + tt) / cp, yB = -P.base;

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

  // where the chimney and tower stand (roof frame), so windows keep clear of them; a gable-front house keeps its
  // chimney on the back gable
  const sc = P.chimSide, rT = P.tower, ts = P.towerSide;
  const chim = P.chimney === 'tall' ? { x: (gable ? -1 : sc) * (hx + 0.68), z: (R() < 0.5 ? -1 : 1) * (0.95 + R() * 0.35) } : null;
  const tower = rT ? (gable ? { x: -(hx - 0.2 * rT), z: ts * (hz - 0.3 * rT) } : { x: ts * (hx - 0.3 * rT), z: -(hz - 0.2 * rT) }) : null;
  if (chim && tower && gable) chim.z = -Math.sign(tower.z) * Math.abs(chim.z);
  const blocked = (x, z, m = 0.5) => (chim && Math.hypot(x - chim.x, z - chim.z) < 1.0 + m) || (tower && Math.hypot(x - tower.x, z - tower.z) < rT + m);

  // ── stone base: a rubble band down into the ground (so slopes never show a gap), ragged stones on top ──
  box(mb, 0, (y0 + 0.05 + yB) / 2, 0, L + 0.16, y0 + 0.05 - yB, D + 0.16, STONE.clone().multiplyScalar(0.92), 10);
  if (lod === 0 && !hut) for (const f of ['f', 'b', 'l', 'r']) {
    const ln = len(f) + 0.16;
    for (let a = -ln / 2; a < ln / 2 - 0.15;) {
      const sw = Math.min(0.32 + R() * 0.5, ln / 2 - a), sh = 0.2 + R() * 0.22, top = y0 + 0.02 + R() * (R() < 0.25 ? 0.42 : 0.14);
      if (R() < 0.3) { a += sw; continue; }   // gaps keep the top edge ragged
      const c = onWall(f, a + sw / 2, top - sh / 2, 0.06 + R() * 0.05), ax = alongV(f);
      box(mb, c.x, c.y, c.z, sw - 0.04, sh, 0.14, STONE.clone().multiplyScalar(0.7 + R() * 0.22), 10, Math.atan2(-ax.z, ax.x) + (R() - 0.5) * 0.08);
      a += sw;
    }
  }

  // ── walls, darker toward the ground and under the eaves ──
  const wallFace = (A, B, out, rows) => {
    const ux = B.x - A.x, uz = B.z - A.z, lu = Math.hypot(ux, uz), ids = [];
    for (const [y, k] of rows) { const c = wash.clone().multiplyScalar(k); ids.push([mb.v(A.x, y, A.z, out.x, 0, out.z, c, 0, 0, y, wallCard), mb.v(B.x, y, B.z, out.x, 0, out.z, c, 0, lu, y, wallCard)]); }
    const fwd = -uz * out.x + ux * out.z > 0;
    for (let k = 0; k < ids.length - 1; k++) {
      const [a, b] = ids[k], [d, c] = ids[k + 1];
      if (fwd) { mb.tri(a, b, c); mb.tri(a, c, d); } else { mb.tri(a, c, b); mb.tri(a, d, c); }
    }
  };
  const eaveRows = [[y0 - 0.05, 0.84], [y0 + 0.6, 0.98], [yW - 0.9, 0.98], [yW, 0.78]], gableRows = [[y0 - 0.05, 0.84], [y0 + 0.6, 0.98], [yW, 0.95]];
  wallFace(V3(-hx, 0, hz), V3(hx, 0, hz), V3(0, 0, 1), eaveRows);
  wallFace(V3(hx, 0, -hz), V3(-hx, 0, -hz), V3(0, 0, -1), eaveRows);
  wallFace(V3(hx, 0, hz), V3(hx, 0, -hz), V3(1, 0, 0), gableRows);
  wallFace(V3(-hx, 0, -hz), V3(-hx, 0, hz), V3(-1, 0, 0), gableRows);
  for (const sx of [1, -1]) {   // gable triangles, shaded toward the apex under the roof
    const x = sx * hx, n = V3(sx, 0, 0), pts = [[-hz, yW, 0.95], [hz, yW, 0.95], [0, ridgeU, 0.7]];
    const ids = pts.map(([z, y, k]) => mb.v(x, y, z, n.x, 0, 0, wash.clone().multiplyScalar(k), 0, -sx * z, y, wallCard));
    if (sx > 0) mb.tri(ids[0], ids[2], ids[1]); else mb.tri(ids[0], ids[1], ids[2]);
  }
  if (style === 'stone' && lod < 2) for (const [qx, qz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) for (let y = y0, k = 0; y < yW - 0.2; y += 0.55, k++)   // quoins
    box(mb, qx * (hx - 0.16), y + 0.26, qz * (hz - 0.16), k % 2 ? 0.4 : 0.56, 0.5, k % 2 ? 0.56 : 0.4, STONE.clone().multiplyScalar(1.05), 3);

  // ── openings: the door, windows along each wall per floor, a small window high in the gables ──
  const doorA = P.doorA;
  const openings = [];
  for (let fl = 0; fl < floors; fl++) {
    const sill = y0 + fl * fh + (fl === 0 ? 1.0 : 0.95);
    for (const f of ['f', 'b', 'l', 'r']) {
      const ln = len(f), n = Math.max(1, Math.floor((ln - 1.0) / 2.5));
      if ((f === 'l' || f === 'r') && f !== doorFace && R() < 0.3) continue;
      for (let k = 0; k < n; k++) {
        const a = -ln / 2 + (k + 0.5) * ln / n, c = onWall(f, a, sill, 0);
        if ((f === doorFace && fl === 0 && Math.abs(a - doorA) < 1.35) || R() < 0.12 || blocked(c.x, c.z)) continue;
        openings.push({ f, a, y: sill, ww: hut ? 0.6 : 0.78, wh: fl === 0 ? 0.95 : 0.85 });
      }
    }
  }
  if (!hut && hz * tp > 1.2) for (const f of ['l', 'r']) {
    const c = onWall(f, 0, yW + 0.3, 0);
    if (R() < (f === doorFace ? 0.95 : 0.6) && !blocked(c.x, c.z)) openings.push({ f, a: 0, y: yW + 0.22, ww: 0.48, wh: 0.58, small: true });
  }

  // door: planked leaf in a heavy frame, a stone step, a canopy on brackets and a wall lamp
  const door = { w: hut ? 0.95 : 1.08, h: hut ? 1.9 : 2.1 };
  panel(doorFace, doorA, y0, door.w, door.h, 0.03, TIMBER_L.clone().multiplyScalar(0.85), 7, true);
  const dO = outN(doorFace), dAl = alongV(doorFace);
  if (lod < 2) {
    for (const s of [-1, 1]) slat(doorFace, doorA + s * (door.w / 2 + 0.08), y0, 0.16, door.h + 0.1, 0, 0.13, TIMBER);
    slat(doorFace, doorA, y0 + door.h, door.w + 0.42, 0.2, 0, 0.15, TIMBER);
    // a stone step, or a flight down to the ground when the house stands high on a slope
    const drop = y0 + P.steps, n = P.steps > 0.25 ? Math.ceil(drop / 0.2) : 1, rise = drop / n, sw = door.w + 0.7;
    for (let k = 0; k < n; k++) {
      const top = n === 1 ? y0 + 0.01 : y0 + 0.01 - k * rise, bot = n === 1 ? y0 - 0.3 : -P.steps - 0.4, st = onWall(doorFace, doorA, (top + bot) / 2, 0.42 + k * 0.34);
      box(mb, st.x, st.y, st.z, dAl.x ? sw : 0.36 + (k ? 0 : 0.4), top - bot, dAl.x ? 0.36 + (k ? 0 : 0.4) : sw, STONE.clone().multiplyScalar(0.86 + (k % 2) * 0.06), 10);
    }
    // lamp on a bracket beside the door (lights up after dusk)
    const ls = doorA - door.w / 2 - 0.45, lp = onWall(doorFace, ls, y0 + 2.0, 0.3);
    beam(mb, onWall(doorFace, ls, y0 + 2.18, 0), onWall(doorFace, ls, y0 + 2.18, 0.36), 0.05, IRON, 0);
    box(mb, lp.x, lp.y, lp.z, 0.17, 0.24, 0.17, GLOW, 11);
    box(mb, lp.x, lp.y + 0.15, lp.z, 0.22, 0.06, 0.22, IRON, 0); box(mb, lp.x, lp.y - 0.14, lp.z, 0.2, 0.04, 0.2, IRON, 0);
    ud.lights.push([lp.x + dO.x * 0.2, lp.y, lp.z + dO.z * 0.2, 7]);
  }
  if (lod === 0 && !hut) {
    // canopy: a tilted plank roof over the door on two angled brackets (pots only where the ground is near)
    const cw = door.w + 0.75, cd = 0.8, cy = y0 + door.h + 0.42, tilt = 0.32;
    const ax = dAl.clone(), dn = V3(dO.x * Math.cos(tilt), -Math.sin(tilt), dO.z * Math.cos(tilt)), up = ax.clone().cross(dn).negate();
    const cc = onWall(doorFace, doorA, cy, 0).addScaledVector(dn, cd / 2);
    obox(mb, cc, ax, up, dn, cw, 0.07, cd, TIMBER_L, 7);
    for (const s of [-1, 1]) beam(mb, onWall(doorFace, doorA + s * (cw / 2 - 0.15), cy - 0.55, 0.02), onWall(doorFace, doorA + s * (cw / 2 - 0.15), cy - 0.2, cd - 0.15), 0.07, TIMBER);
    // pots by the door
    for (let k = 0, n = P.steps > 0.25 ? 0 : Math.floor(R() * 3); k < n; k++) {
      const pc = onWall(doorFace, doorA + door.w / 2 + 0.5 + k * 0.45, 0, 0.32), s = 0.8 + R() * 0.5;
      lathe(mb, pc.x, pc.z, [[0.1 * s, y0 - 0.25], [0.2 * s, y0 - 0.25 + 0.12 * s], [0.23 * s, y0 - 0.25 + 0.3 * s], [0.14 * s, y0 - 0.25 + 0.5 * s], [0.15 * s, y0 - 0.25 + 0.56 * s]], 8, POT[Math.floor(R() * POT.length)], 0);
    }
  }
  ud.door = (() => { const p = onWall(doorFace, doorA, 0, 1.3); return [p.x, p.z]; })();

  // windows: dark glass (lit at night) in a frame with a cross mullion, shutters, flower boxes under some
  for (const o of openings) {
    panel(o.f, o.a, o.y, o.ww, o.wh, 0.02, GLOW, 6);
    if (lod === 2) continue;
    const fr = TIMBER;
    slat(o.f, o.a, o.y - 0.1, o.ww + 0.3, 0.1, 0, 0.14, TIMBER_L);              // sill
    slat(o.f, o.a, o.y + o.wh, o.ww + 0.26, 0.14, 0, 0.11, fr);                  // lintel
    for (const s of [-1, 1]) slat(o.f, o.a + s * (o.ww / 2 + 0.05), o.y, 0.1, o.wh, 0, 0.09, fr);
    if (lod > 0) continue;
    slat(o.f, o.a, o.y, 0.05, o.wh, 0.02, 0.04, fr); slat(o.f, o.a, o.y + o.wh * 0.52, o.ww, 0.05, 0.02, 0.04, fr);
    if (!o.small && !hut) for (const s of [-1, 1]) panel(o.f, o.a + s * (o.ww / 2 + 0.36), o.y - 0.03, 0.52, o.wh + 0.06, 0.07, shut, 7, true);
    if (!o.small && o.y < y0 + 1.2 && R() < 0.55) {
      const b = onWall(o.f, o.a, o.y - 0.3, 0.2), ax = alongV(o.f), on = outN(o.f);
      box(mb, b.x, b.y, b.z, ax.x ? o.ww + 0.24 : 0.3, 0.22, ax.x ? 0.3 : o.ww + 0.24, TIMBER_L, 7);
      const bloom = BLOOM[Math.floor(R() * BLOOM.length)];
      for (let k = 0; k < 5; k++) {
        const q = b.clone().addScaledVector(ax, (k / 4 - 0.5) * (o.ww + 0.06)).add(V3(0, 0.17, 0)).addScaledVector(on, 0.02 + R() * 0.04);
        addBlob(mb, q, 0.15, 1, { color: () => C('#4f8030').multiplyScalar(0.8 + R() * 0.35), sway: () => 0, lump: 0.4, seed: k * 7 + o.a, nblend: 0.5, squash: 0.9 });
        for (let j = 0; j < 5; j++) {
          const bc = bloom.clone().multiplyScalar(0.85 + R() * 0.3), d = V3((R() - 0.5) * 0.26, 0.06 + R() * 0.1, 0).addScaledVector(on, 0.02 + R() * 0.12);
          addBlob(mb, q.clone().add(d), 0.045 + R() * 0.02, 0, { color: () => bc, sway: () => 0, lump: 0.25, seed: j * 3 + k });
        }
      }
    }
  }

  // timber frame (timber style): posts at corners and between openings, beams at the floor lines
  if (style === 'timber' && lod < 2) for (const f of ['f', 'b', 'l', 'r']) {
    const ln = len(f), half = ln / 2;
    for (let fl = 0; fl <= floors; fl++) slat(f, 0, y0 + fl * fh - (fl === floors ? 0.2 : 0.08), ln + 0.2, 0.2, -0.02, 0.1, TIMBER);
    const posts = Math.max(2, Math.round(ln / 2.2) + 1);
    for (let k = 0; k < posts; k++) {
      const a = -half + k * ln / (posts - 1);
      if (openings.some(o => o.f === f && Math.abs(o.a - a) < o.ww / 2 + 0.25) || (f === doorFace && Math.abs(a - doorA) < door.w / 2 + 0.3)) continue;
      slat(f, a, y0, 0.18, floors * fh, -0.02, 0.1, TIMBER);
    }
  }

  // ── roof: tiles on a timber deck, bargeboards along the rakes, fascia, rafter tails, purlin ends, ridge ──
  const rc = roof === 'tile' ? TILE_C : roof === 'shingle' ? SHINGLE_T[P.tint % 3] : THATCH_C, rCard = roof === 'tile' ? 9 : roof === 'shingle' ? 5 : 4;
  const xa = -hx - og, xb = hx + og;
  for (const s of [1, -1]) {
    const n = V3(0, cp, s * sp), down = V3(0, -sp, s * cp), ez = s * (hz + ov);
    const Ru = x => V3(x, ridgeU, 0), Eu = x => V3(x, eaveU, ez), o1 = n.clone().multiplyScalar(td), o2 = n.clone().multiplyScalar(td + tt);
    quad(mb, Ru(xa).add(o2), Ru(xb).add(o2), Eu(xb).add(o2), Eu(xa).add(o2), rc, rCard, n);
    if (lod === 2) continue;
    quad(mb, Eu(xa).add(o1), Eu(xb).add(o1), Eu(xb).add(o2), Eu(xa).add(o2), rc.clone().multiplyScalar(0.7), rCard, down);       // tile edge
    for (const x of [xa, xb]) quad(mb, Ru(x).add(o1), Eu(x).add(o1), Eu(x).add(o2), Ru(x).add(o2), rc.clone().multiplyScalar(0.7), rCard, V3(Math.sign(x), 0, 0));
    quad(mb, Ru(xa), Ru(xb), Eu(xb), Eu(xa), TIMBER.clone().multiplyScalar(0.62), thatch ? 4 : 7, n.clone().negate());              // soffit
    if (thatch) continue;
    quad(mb, Eu(xa), Eu(xb), Eu(xb).add(o1), Eu(xa).add(o1), TIMBER, 7, down);
    // bargeboards: deep boards along both rakes, hanging below the deck
    const slope = Eu(0).sub(Ru(0)), sl = slope.length(), sd = slope.clone().normalize();
    for (const x of [xa - 0.02, xb + 0.02]) obox(mb, Ru(x).add(Eu(x)).multiplyScalar(0.5).addScaledVector(n, td - 0.15).addScaledVector(sd, 0.04), sd, n, V3(1, 0, 0), sl + 0.12, 0.3, 0.13, TIMBER, 7);
    obox(mb, Eu(0).addScaledVector(n, td - 0.12).addScaledVector(sd, -0.03), V3(1, 0, 0), n, sd, xb - xa + 0.2, 0.24, 0.1, TIMBER, 7);   // fascia
    if (lod === 0) for (let x = -hx + 0.35; x <= hx - 0.3; x += 0.8) {   // rafter tails under the eave
      const a = V3(x, yW - 0.02, s * hz).addScaledVector(n, -0.08), b = Eu(x).addScaledVector(down, -0.14).addScaledVector(n, -0.08);
      beam(mb, a, b, 0.12, TIMBER.clone().multiplyScalar(0.9), 7, n);
    }
  }
  if (!thatch && lod < 2) for (const sx of [1, -1]) for (const zp of [0, hz * 0.5, -hz * 0.5]) {   // purlin ends through the gables
    const y = ridgeU - Math.abs(zp) * tp - 0.13;
    if (chim && Math.sign(chim.x) === sx && Math.abs(zp - chim.z) < 0.75) continue;
    beam(mb, V3(sx * (hx - 0.1), y, zp), V3(sx * (hx + og + 0.14), y, zp), 0.2, TIMBER);
  }
  if (thatch) box(mb, 0, ridgeTop - 0.08, 0, xb - xa + 0.1, 0.32, 0.55, THATCH_C.clone().multiplyScalar(0.82), 4);
  else if (lod < 2) {   // half-round ridge tiles
    const rr = 0.15, yc = ridgeTop - 0.05, segs = 6, ids = [];
    for (let i = 0; i <= segs; i++) {
      const a = i / segs * Math.PI, ny = Math.sin(a), nz = Math.cos(a);
      ids.push([xa - 0.06, xb + 0.06].map(x => mb.v(x, yc + ny * rr, nz * rr, 0, ny, nz, rc.clone().multiplyScalar(0.92), 0, x, a * rr, rCard)));
    }
    for (let i = 0; i < segs; i++) { mb.tri(ids[i][0], ids[i][1], ids[i + 1][0]); mb.tri(ids[i][1], ids[i + 1][1], ids[i + 1][0]); }
  } else box(mb, 0, ridgeTop, 0, xb - xa, 0.18, 0.3, rc, rCard);

  // ── chimney: tall and tapering against a gable, propped with poles; or a stone stack through the roof ──
  if (chim) {
    const H = ridgeTop + 1.5 + R() * 1.1, prof = [], segs = lod ? 8 : 16;
    // a broad foot that sweeps in over the eave height into a straight stack (concave profile)
    // bottle profile: broad up to about the eaves, then a long sweep into a thick stack
    const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let k = 0; k <= 12; k++) { const t = k / 12, y = yB + t * (H - yB); prof.push([0.52 + 0.48 * (1 - sm(yW * 0.55, ridgeTop + 0.6, y)), y]); }
    lathe(mb, chim.x, chim.z, prof, segs, wash.clone().multiplyScalar(1.03), 8, { sq: 3.2, sx: 0.78, sz: 0.98, rot: Math.PI / segs, shade: j => (j === 0 ? 0.85 : 1) });
    const hw = 0.52 * 0.98 + 0.05;
    box(mb, chim.x, H + 0.2, chim.z, hw * 2, 0.42, hw * 2, wash.clone().multiplyScalar(0.98), 8);
    if (lod < 2) {
      for (const [vx, vz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {   // dark vents in the head
        const c = V3(chim.x + vx * (hw + 0.005), H + 0.12, chim.z + vz * (hw + 0.005)), t = V3(-vz * 0.13, 0, vx * 0.13);
        quad(mb, c.clone().sub(t), c.clone().add(t), c.clone().add(t).setY(H + 0.32), c.clone().sub(t).setY(H + 0.32), C('#2a2522'), 0, V3(vx, 0, vz));
      }
      box(mb, chim.x, H + 0.44, chim.z, hw * 2 + 0.24, 0.06, hw * 2 + 0.24, TIMBER, 7);
    }
    // little pyramid roof of tiles
    const py = H + 0.47, ph = 0.4, pr = hw + 0.16, apex = V3(chim.x, py + ph, chim.z);
    for (const [ax, az] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const a = V3(chim.x + (ax - az) * pr, py, chim.z + (az + ax) * pr), b = V3(chim.x + (ax + az) * pr, py, chim.z + (az - ax) * pr);
      const n = b.clone().sub(a).cross(apex.clone().sub(a)).normalize(), out = V3(ax, 0.6, az);
      if (n.dot(out) < 0) n.negate();
      const ia = mb.v(a.x, a.y, a.z, n.x, n.y, n.z, rc, 0, 0, 0.6, rCard), ib = mb.v(b.x, b.y, b.z, n.x, n.y, n.z, rc, 0, 2 * pr, 0.6, rCard), ic = mb.v(apex.x, apex.y, apex.z, n.x, n.y, n.z, rc, 0, pr, 0, rCard);
      if (b.clone().sub(a).cross(apex.clone().sub(a)).dot(out) > 0) mb.tri(ia, ib, ic); else mb.tri(ia, ic, ib);
    }
    ud.smoke.push([chim.x, H + 0.45, chim.z]);
    const sx = Math.sign(chim.x);
    if (lod < 2) beam(mb, V3(chim.x + sx * 0.12, H - 1.0, chim.z), V3(chim.x + sx * 1.5, yB + 0.9, chim.z + Math.sign(chim.z) * 2.3), 0.11, TIMBER);
    if (lod === 0) beam(mb, V3(chim.x - sx * 0.1, H - 0.5, chim.z), V3(sx * (hx - 2.0), ridgeTop + 0.02, 0), 0.1, TIMBER);
    ud.colliders.push([chim.x, chim.z, 0.85]);
  } else if (P.chimney) {
    const cx = sc * (hx - 0.9), cz = (R() < 0.5 ? -1 : 1) * Math.min(hz * 0.4, 0.9), top = ridgeTop + 0.9;
    box(mb, cx, (y0 + top) / 2, cz, 0.78, top - y0, 0.78, STONE, 2);
    if (lod < 2) box(mb, cx, top + 0.08, cz, 0.96, 0.16, 0.96, STONE.clone().multiplyScalar(0.8), 3);
    ud.smoke.push([cx, top + 0.3, cz]);
  }

  // ── round tower with a conical tile roof at a back corner ──
  if (tower) {
    const yT = yW + 1.0 + (floors === 1 ? 0.5 : 0), segs = lod ? 12 : 20, { x: tx, z: tz } = tower;
    lathe(mb, tx, tz, [[rT + 0.1, yB], [rT + 0.1, y0 + 0.15]], segs, STONE.clone().multiplyScalar(0.92), 10);
    lathe(mb, tx, tz, [[rT, y0 + 0.1], [rT, y0 + 0.7], [rT, yT - 0.8], [rT, yT]], segs, wash, 8, { shade: j => [0.85, 0.98, 0.98, 0.78][j] });
    const re = rT + 0.45;
    if (lod < 2) lathe(mb, tx, tz, [[rT, yT], [re, yT - 0.14]], segs, TIMBER.clone().multiplyScalar(0.62), 7);
    lathe(mb, tx, tz, [[re, yT - 0.14], [re + 0.02, yT - 0.02], [0.02, yT - 0.02 + re * 1.05]], segs, rc, rCard, { flipV: true });
    if (lod < 2) box(mb, tx, yT + re * 1.05 + 0.1, tz, 0.12, 0.3, 0.12, TIMBER, 7);
    if (lod < 2) {   // a window facing away from the house
      const d = V3(tx, 0, tz).normalize(), al = V3(-d.z, 0, d.x);
      for (const wy of floors > 1 ? [y0 + 1.1, y0 + fh + 1.0] : [y0 + 1.2]) {
        const c = V3(tx, wy, tz).addScaledVector(d, rT + 0.03);
        quad(mb, c.clone().addScaledVector(al, -0.3), c.clone().addScaledVector(al, 0.3), c.clone().addScaledVector(al, 0.3).setY(wy + 0.8), c.clone().addScaledVector(al, -0.3).setY(wy + 0.8), GLOW, 6, d);
        const fc = V3(tx, wy - 0.05, tz).addScaledVector(d, rT + 0.05);
        box(mb, fc.x, fc.y, fc.z, 0.75, 0.1, 0.16, TIMBER_L, 7, Math.atan2(al.z, al.x));
        const lc = V3(tx, wy + 0.85, tz).addScaledVector(d, rT + 0.05);
        box(mb, lc.x, lc.y, lc.z, 0.75, 0.12, 0.12, TIMBER, 7, Math.atan2(al.z, al.x));
      }
    }
    ud.colliders.push([tx, tz, rT + 0.1]);
  }

  // ── banner: a cloth hung from a pole on the street side ──
  if (P.banner && lod < 2) {
    const f = doorFace, ln = len(f), free = [];
    for (let a = -ln / 2 + 0.75; a <= ln / 2 - 0.75; a += 0.25) {
      const c = onWall(f, a, 1, 0);
      if (Math.abs(a - doorA) > door.w / 2 + 0.75 && !openings.some(o => o.f === f && !o.small && Math.abs(o.a - a) < o.ww / 2 + 0.95) && !blocked(c.x, c.z, 0.3)) free.push(a);
    }
    if (free.length) {
      const a = free[Math.floor(R() * free.length)], top = (f === 'l' || f === 'r') ? yW + 0.35 : yW - 0.35, bl = Math.min(2.5, top - y0 - 0.9), bc = BANNER[(P.tint + 1) % BANNER.length];
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
  if (P.porch && lod < 2) {
    const pw = Math.min(len(doorFace) - 0.6, 3.4), pd = 1.9, py = y0 + door.h + 0.55;
    const a0 = Math.max(-len(doorFace) / 2 + pw / 2 + 0.3, Math.min(len(doorFace) / 2 - pw / 2 - 0.3, doorA));
    const W = (a, y, o) => onWall(doorFace, a, y, o);
    quad(mb, W(a0 - pw / 2, py + 0.5, 0), W(a0 + pw / 2, py + 0.5, 0), W(a0 + pw / 2, py, pd), W(a0 - pw / 2, py, pd), rc, rCard, V3(dO.x, 1, dO.z));
    quad(mb, W(a0 - pw / 2, py + 0.42, 0), W(a0 + pw / 2, py + 0.42, 0), W(a0 + pw / 2, py - 0.08, pd), W(a0 - pw / 2, py - 0.08, pd), TIMBER, 7, V3(-dO.x, -1, -dO.z));
    for (const s of [-1, 1]) { const b = W(a0 + s * (pw / 2 - 0.12), y0, pd - 0.12); box(mb, b.x, (y0 + py) / 2, b.z, 0.16, py - y0, 0.16, TIMBER, 7); }
    const dp = W(doorA, 0, pd + 0.8); ud.door = [dp.x, dp.z];
  }

  // footprint for walking and to keep grass and later placements out
  for (let x = -hx; x <= hx + 1e-6; x += 0.8) ud.colliders.push([x, hz, 0.45], [x, -hz, 0.45]);
  for (let z = -hz + 0.8; z < hz; z += 0.8) ud.colliders.push([hx, z, 0.45], [-hx, z, 0.45]);
  for (let x = -hx + 1.2; x < hx - 0.6; x += 1.4) for (let z = -hz + 1.2; z < hz - 0.6; z += 1.4) ud.colliders.push([x, z, 0.8]);

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
