// Ruins and landmarks built from weathered stone blocks: broken walls, pillars, arches and a watchtower.
// Blocks are slightly jittered and inset so the joints read as dark lines; moss grows on upward faces.
// Each geometry carries userData.colliders: [[x, z, r], …] circles covering its footprint in model space,
// used for walking collision and to keep grass and later placements out of the masonry.
import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { vnoise } from '../core/noise.js';
import { MB, V3 } from './mesh-builder.js';

const STONE_A = new THREE.Color('#a69a89'), STONE_B = new THREE.Color('#cfc4b1'), MOSS = new THREE.Color('#5d7430'), MOSS_LIT = new THREE.Color('#86973f');
const SLATE = new THREE.Color('#4f5a63'), DARK = new THREE.Color('#2d2a27');

// colour for one block: stone tone by hash, darker near the ground; moss on top faces where noise allows
function stoneColor(R, y, H) { return STONE_A.clone().lerp(STONE_B, R()).multiplyScalar(0.82 + 0.18 * Math.min(1, y / Math.max(H, 0.1) + 0.3)); }

// axis-aligned box rotated by `rot` around Y at centre c (size sx, sy, sz); `top` colours the +Y face;
// card 2 = masonry: the prop shader paints coursed, filtered block joints over it (src/render/props.js)
function addBox(mb, c, sx, sy, sz, rot, col, top, card = 0) {
  const cs = Math.cos(rot), sn = Math.sin(rot), hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const P = (x, y, z) => V3(c.x + x * cs - z * sn, c.y + y, c.z + x * sn + z * cs);
  const N = (x, y, z) => V3(x * cs - z * sn, y, x * sn + z * cs);
  const faces = [
    [N(1, 0, 0), [P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz)]],
    [N(-1, 0, 0), [P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz)]],
    [N(0, 1, 0), [P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz)]],
    [N(0, -1, 0), [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz)]],
    [N(0, 0, 1), [P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz)]],
    [N(0, 0, -1), [P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz)]]
  ];
  faces.forEach(([n, q], f) => {
    const cc = f === 2 && top ? top : col;
    const ids = q.map(p => mb.v(p.x, p.y, p.z, n.x, n.y, n.z, cc, 0, 0, 0, card));
    mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]);
  });
}

// tapered square prism (a tower shaft or buttress): centre c0 = [x, z] at y0 moving to c1 at y1, half-widths
// a0 → a1, split into `rows` bands so vertex colour can darken and green toward the damp base; masonry sides
function addShaft(mb, c0, c1, y0, y1, a0, a1, rows, colorAt) {
  const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
  for (let f = 0; f < 4; f++) {
    const [ax, az] = corners[f], [bx, bz] = corners[(f + 1) % 4];
    for (let r = 0; r < rows; r++) {
      const ya = y0 + (y1 - y0) * r / rows, yb = y0 + (y1 - y0) * (r + 1) / rows;
      const ta = r / rows, tb = (r + 1) / rows, ha = a0 + (a1 - a0) * ta, hb = a0 + (a1 - a0) * tb;
      const xa = c0[0] + (c1[0] - c0[0]) * ta, za = c0[1] + (c1[1] - c0[1]) * ta, xb = c0[0] + (c1[0] - c0[0]) * tb, zb = c0[1] + (c1[1] - c0[1]) * tb;
      const P = [V3(xa + ax * ha, ya, za + az * ha), V3(xa + bx * ha, ya, za + bz * ha), V3(xb + bx * hb, yb, zb + bz * hb), V3(xb + ax * hb, yb, zb + az * hb)];
      const n = P[1].clone().sub(P[0]).cross(P[3].clone().sub(P[0])).normalize();
      const ids = P.map(p => mb.v(p.x, p.y, p.z, n.x, n.y, n.z, colorAt(p.y), 0, 0, 0, 2));
      mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]);
    }
  }
}

// moss on a block's top face where low-frequency noise says so
const mossTop = (x, z, seed, k = 0.45) => (vnoise(x * 0.6 + seed, z * 0.6 - seed) > k ? MOSS.clone().lerp(MOSS_LIT, vnoise(x * 2.1, z * 2.1)) : null);

// n-sided prism drum (a column section) from y0 to y1
function addDrum(mb, cx, cz, y0, y1, r, sides, rot, col, top) {
  const ring = (y, rr) => Array.from({ length: sides }, (_, s) => { const a = rot + s / sides * Math.PI * 2; return V3(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr); });
  const lo = ring(y0, r), hi = ring(y1, r * 0.97);
  for (let s = 0; s < sides; s++) {
    const a = lo[s], b = lo[(s + 1) % sides], c = hi[(s + 1) % sides], d = hi[s];
    const n = b.clone().sub(a).cross(d.clone().sub(a)).normalize().negate();
    const ids = [a, b, c, d].map(p => mb.v(p.x, p.y, p.z, n.x, n.y, n.z, col, 0));
    mb.tri(ids[0], ids[2], ids[1]); mb.tri(ids[0], ids[3], ids[2]);
  }
  const ctr = mb.v(cx, y1, cz, 0, 1, 0, top || col, 0), tids = hi.map(p => mb.v(p.x, p.y, p.z, 0, 1, 0, top || col, 0));
  for (let s = 0; s < sides; s++) mb.tri(ctr, tids[(s + 1) % sides], tids[s]);
}

// a few blocks lying in the grass around a ruin
function rubble(mb, R, n, spreadX, spreadZ, seed) {
  for (let k = 0; k < n; k++) {
    const s = 0.35 + R() * 0.4, x = (R() - 0.5) * spreadX, z = (R() - 0.5) * spreadZ;
    addBox(mb, V3(x, s * 0.3, z), s * (1.2 + R()), s, s * (0.9 + R() * 0.5), R() * 6.283, stoneColor(R, 0, 1).multiplyScalar(0.92), mossTop(x, z, seed, 0.35));
  }
}

// broken wall: coursed blocks under a ragged top line that falls away toward one end
export function makeWall(seed) {
  const R = mulberry32(seed), mb = new MB();
  const L = 6 + R() * 3.5, H = 2.4 + R() * 1.4, T = 0.85, ch = 0.5;
  for (let y = 0, row = 0; y < H; y += ch, row++) {
    let x = -L / 2 + (row % 2 ? 0.5 : 0);
    while (x < L / 2) {
      const bl = Math.min(0.8 + R() * 0.7, L / 2 - x), cx = x + bl / 2;
      const u = (cx + L / 2) / L, top = H * (0.35 + 0.65 * Math.pow(1 - u, 0.6)) * (0.8 + 0.4 * vnoise(cx * 0.8 + seed, 3.1));
      if (y + ch <= top + 0.1 && (row === 0 || R() > 0.05)) {
        const c = V3(cx + (R() - 0.5) * 0.04, y + ch / 2, (R() - 0.5) * 0.06);
        const isTop = y + 2 * ch > top;
        addBox(mb, c, bl - 0.04, ch - 0.04, T - R() * 0.08, (R() - 0.5) * 0.04, stoneColor(R, y, H), isTop ? mossTop(cx, y, seed) : null);
      }
      x += bl;
    }
  }
  rubble(mb, R, 5 + Math.floor(R() * 4), L * 1.1, 4, seed);
  const g = mb.geo(); g.userData.colliders = [];
  for (let x = -L / 2 + 0.4; x < L / 2; x += 0.8) g.userData.colliders.push([x, 0, 0.75]);
  return g;
}

// broken column: plinth, a stack of slightly offset drums, a tilted fragment on top
export function makePillar(seed) {
  const R = mulberry32(seed), mb = new MB();
  const r = 0.5 + R() * 0.15, n = 3 + Math.floor(R() * 4), dh = 0.7 + R() * 0.25;
  addBox(mb, V3(0, 0.2, 0), r * 3.2, 0.4, r * 3.2, R() * 0.3, stoneColor(R, 0, 4).multiplyScalar(0.9), mossTop(0, 0, seed, 0.3));
  let y = 0.4;
  for (let k = 0; k < n; k++) {
    const ox = (R() - 0.5) * 0.06, oz = (R() - 0.5) * 0.06;
    addDrum(mb, ox, oz, y, y + dh - 0.03, r * (1 - k * 0.012), 10, R(), stoneColor(R, y, n * dh), k === n - 1 ? mossTop(ox, y, seed, 0.3) : null);
    y += dh;
  }
  addDrum(mb, 0.1, 0.05, y, y + dh * 0.45, r * 0.8, 7, R(), stoneColor(R, y, y), mossTop(0, y, seed, 0.2));
  rubble(mb, R, 3, 4, 4, seed);
  const g = mb.geo(); g.userData.colliders = [[0, 0, r * 1.5]];
  return g;
}

// arch: two block piers carrying a ring of voussoirs, one or two of them fallen
export function makeArch(seed) {
  const R = mulberry32(seed), mb = new MB();
  const span = 3 + R() * 0.8, pier = 0.9, ph = 3 + R() * 0.8, ch = 0.55;
  for (const side of [-1, 1]) for (let y = 0; y < ph; y += ch) addBox(mb, V3(side * (span / 2 + pier / 2), y + ch / 2, 0), pier - 0.04, ch - 0.04, pier - 0.04 - R() * 0.06, (R() - 0.5) * 0.03, stoneColor(R, y, ph), null);
  const rIn = span / 2, rOut = rIn + 0.7, nv = 11, gone = Math.floor(R() * nv);
  for (let k = 0; k < nv; k++) {
    if (k === gone || (k === gone + 1 && R() > 0.5)) continue;
    const a = Math.PI * (k + 0.5) / nv, rm = (rIn + rOut) / 2;
    const c = V3(Math.cos(a) * rm, ph + Math.sin(a) * rm, 0);
    // voussoir: a box rotated to follow the ring (rotation about Z applied by building it in local space)
    const len = (rOut - rIn) - 0.04, w = Math.PI * rm / nv - 0.05, d = pier - 0.06;
    const ax = V3(Math.cos(a), Math.sin(a), 0), ay = V3(-Math.sin(a), Math.cos(a), 0), az = V3(0, 0, 1), col = stoneColor(R, c.y, ph + rOut);
    const corner = (u, v, s) => c.clone().addScaledVector(ax, u * len / 2).addScaledVector(ay, v * w / 2).addScaledVector(az, s * d / 2);
    const quads = [[ax, [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]], [ax.clone().negate(), [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
      [ay, [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]], [ay.clone().negate(), [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
      [az, [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]], [az.clone().negate(), [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]]];
    for (const [n, q] of quads) {
      const cc = n.y > 0.6 ? (mossTop(c.x, c.y, seed, 0.4) || col) : col;
      const ids = q.map(([u, v, s]) => { const p = corner(u, v, s); return mb.v(p.x, p.y, p.z, n.x, n.y, n.z, cc, 0); });
      mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]);
    }
  }
  rubble(mb, R, 4, span * 2, 3, seed);
  const g = mb.geo(); g.userData.colliders = [[-(span / 2 + pier / 2), 0, 0.7], [span / 2 + pier / 2, 0, 0.7]];
  return g;
}

// watchtower landmark (~26–32 m): a continuous tapering shaft with corner buttresses, a plinth and a string
// course, window slits, a corbelled crenellated platform and a slate spire. Courses and joints are painted by
// the prop shader (card 2) and filtered by pixel size, so the tower stays clean at any distance instead of
// the stair-stepped stripes that separate per-course blocks produced.
export function makeTower(seed) {
  const R = mulberry32(seed), mb = new MB();
  const H = 22 + R() * 5, w0 = 6.4, w1 = 4.6, half = y => (w0 + (w1 - w0) * y / H) / 2;
  const base = STONE_A.clone().lerp(STONE_B, 0.55);
  // damp, mossy foot fading into clean stone; a little darker again just under the platform
  const tone = y => base.clone().multiplyScalar(0.84 + 0.16 * Math.min(1, y / 6)).lerp(MOSS, 0.4 * (1 - Math.min(1, y / 3.5))).multiplyScalar(y > H - 2 ? 0.9 : 1);
  addShaft(mb, [0, 0], [0, 0], -0.5, H, half(0), half(H), 8, tone);
  // buttresses: square piers riding the shaft's corners, thinning a little as they rise
  const bt = H * 0.94;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const k0 = half(0) - 0.2, k1 = half(bt) - 0.2;
    addShaft(mb, [sx * k0, sz * k0], [sx * k1, sz * k1], -0.5, bt, 0.66, 0.5, 6, y => tone(y).multiplyScalar(0.95));
  }
  // plinth, and a string course between the second and third rows of windows
  addShaft(mb, [0, 0], [0, 0], -0.5, 1.3, half(0) + 0.75, half(1.3) + 0.68, 1, y => tone(y).multiplyScalar(0.9));
  const ys = 13.1;
  addShaft(mb, [0, 0], [0, 0], ys, ys + 0.35, half(ys) + 0.55, half(ys) + 0.55, 1, () => base.clone().multiplyScalar(0.97));
  // window slits on each face, every few metres (dark recesses, not masonry)
  for (let y = 5; y < H - 3; y += 5.5) for (let f = 0; f < 4; f++) {
    const a = f * Math.PI / 2, w = half(y) + 0.01, c = V3(Math.cos(a) * w, y, Math.sin(a) * w);
    addBox(mb, c, f % 2 ? 0.7 : 0.06, 1.8, f % 2 ? 0.06 : 0.7, 0, DARK, null);
  }
  // platform on corbels, merlons, spire
  const pw = w1 + 2.2;
  for (let k = 0; k < 4; k++) for (let m = -1; m <= 1; m++) {
    const a = k * Math.PI / 2, o = half(H) + 0.35, t = m * 1.5;
    addBox(mb, V3(Math.cos(a) * o + (k % 2 ? t : 0), H - 0.45, Math.sin(a) * o + (k % 2 ? 0 : t)), k % 2 ? 0.45 : 0.7, 0.9, k % 2 ? 0.7 : 0.45, 0, base.clone().multiplyScalar(0.88), null, 2);
  }
  addBox(mb, V3(0, H + 0.4, 0), pw, 0.8, pw, 0, base.clone().multiplyScalar(0.98), mossTop(0, H, seed, 0.6) || base.clone(), 2);
  for (let k = 0; k < 4; k++) for (let m = -2; m <= 2; m++) {
    if (R() < 0.12) continue;   // a few merlons have fallen
    const a = k * Math.PI / 2, ox = Math.cos(a) * (pw / 2 - 0.3), oz = Math.sin(a) * (pw / 2 - 0.3), t = m * (pw / 5);
    addBox(mb, V3(ox + (k % 2 ? t : 0), H + 1.3, oz + (k % 2 ? 0 : t)), 0.6, 1.0, 0.6, 0, stoneColor(R, H, H), null, 2);
  }
  const sp = H + 0.8, tip = V3(0, sp + 7 + R() * 2, 0), sb = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => V3(x * (w1 / 2 - 0.2), sp, z * (w1 / 2 - 0.2)));
  for (let k = 0; k < 4; k++) {
    const a = sb[k], b = sb[(k + 1) % 4], n = b.clone().sub(a).cross(tip.clone().sub(a)).normalize().negate();
    const col = SLATE.clone().multiplyScalar(0.9 + R() * 0.15);
    const ids = [a, b, tip].map(p => mb.v(p.x, p.y, p.z, n.x, n.y, n.z, col, 0));
    mb.tri(ids[0], ids[2], ids[1]);
  }
  rubble(mb, R, 6, 14, 14, seed);
  const g = mb.geo(); g.userData.colliders = [[0, 0, w0 / 2 + 0.3], ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => [sx * w0 / 2, sz * w0 / 2, 0.8])];
  return g;
}
