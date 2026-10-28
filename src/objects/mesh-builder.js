// Procedural mesh building blocks. Vertices carry baked color (aColor), wind sway weight (aSway),
// leaf-atlas uv (aUV) and a leaf-card flag (aCard) consumed by the prop shader.
import * as THREE from 'three';
import { clamp, smooth, mulberry32 } from '../core/math.js';
import { vnoise3 } from '../core/noise.js';

export class MB {
  constructor() { this.p = []; this.n = []; this.c = []; this.s = []; this.i = []; this.uv = []; this.k = []; }
  v(x, y, z, nx, ny, nz, col, sw, u, w, card) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); this.s.push(sw); this.uv.push(u || 0, w || 0); this.k.push(card || 0); return this.p.length / 3 - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.s, 1));
    g.setAttribute('aUV', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aCard', new THREE.Float32BufferAttribute(this.k, 1));
    g.setIndex(this.i); g.computeBoundingSphere();
    return g;
  }
}

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Cut the triangles from index t0 on (mb.i) along planes a grid step g apart, in the two axes that lie closest to each
// triangle's plane, so a smooth deformation applied afterwards bends a big face instead of only moving its corners.
// Only faces wider than a cell are cut; cut points interpolate every attribute, and edges that coincide are cut at the
// same points (the grid is global), so faces that met still meet after the deformation. Faces wholly below yMin
// (where the deformation is nil) are left whole; gOf(card) can give a material its own (coarser) step.
export function sliceGrid(mb, t0, g, yMin = -Infinity, gOf = null) {
  const tris = mb.i.splice(t0), P = mb.p, A = [P, mb.n, mb.c, mb.uv], W = [3, 3, 3, 2];
  const rec = i => ({ id: i, a: A.map((arr, j) => arr.slice(i * W[j], i * W[j] + W[j])), s: mb.s[i], k: mb.k[i] });
  const lerp = (u, v, t) => ({ id: -1, a: u.a.map((x, j) => x.map((q, m) => q + (v.a[j][m] - q) * t)), s: u.s + (v.s - u.s) * t, k: u.k });
  const idOf = v => {
    if (v.id >= 0) return v.id;
    const nn = v.a[1], l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
    return (v.id = mb.v(v.a[0][0], v.a[0][1], v.a[0][2], nn[0] / l, nn[1] / l, nn[2] / l, { r: v.a[2][0], g: v.a[2][1], b: v.a[2][2] }, v.s, v.a[3][0], v.a[3][1], v.k));
  };
  // a convex polygon split by the plane coord[ax] = c into the parts below and above it
  const split = (poly, ax, c) => {
    const lo = [], hi = [];
    for (let i = 0; i < poly.length; i++) {
      const u = poly[i], v = poly[(i + 1) % poly.length], du = u.a[0][ax] - c, dv = v.a[0][ax] - c;
      if (du <= 0) lo.push(u); if (du >= 0) hi.push(u);
      if ((du < 0 && dv > 0) || (du > 0 && dv < 0)) { const m = lerp(u, v, du / (du - dv)); lo.push(m); hi.push(m); }
    }
    return [lo, hi];
  };
  for (let t = 0; t < tris.length; t += 3) {
    const ia = tris[t], ib = tris[t + 1], ic = tris[t + 2];
    const ext = [0, 1, 2].map(j => Math.max(P[ia * 3 + j], P[ib * 3 + j], P[ic * 3 + j]) - Math.min(P[ia * 3 + j], P[ib * 3 + j], P[ic * 3 + j]));
    const gs = gOf ? gOf(mb.k[ia]) || g : g;
    if ((ext[0] <= gs && ext[1] <= gs && ext[2] <= gs) || Math.max(P[ia * 3 + 1], P[ib * 3 + 1], P[ic * 3 + 1]) <= yMin) { mb.i.push(ia, ib, ic); continue; }
    const e1 = [0, 1, 2].map(j => P[ib * 3 + j] - P[ia * 3 + j]), e2 = [0, 1, 2].map(j => P[ic * 3 + j] - P[ia * 3 + j]);
    const nn = [Math.abs(e1[1] * e2[2] - e1[2] * e2[1]), Math.abs(e1[2] * e2[0] - e1[0] * e2[2]), Math.abs(e1[0] * e2[1] - e1[1] * e2[0])];
    const drop = nn[0] >= nn[1] && nn[0] >= nn[2] ? 0 : nn[1] >= nn[2] ? 1 : 2;
    let polys = [[rec(ia), rec(ib), rec(ic)]];
    for (const ax of [0, 1, 2]) {
      if (ax === drop) continue;
      const out = [];
      for (const poly of polys) {
        let lo = Infinity, hi = -Infinity; for (const v of poly) { lo = Math.min(lo, v.a[0][ax]); hi = Math.max(hi, v.a[0][ax]); }
        if (hi - lo <= gs) { out.push(poly); continue; }
        let rest = poly;
        for (let c = (Math.floor(lo / gs) + 1) * gs; c < hi - 1e-6; c += gs) {
          if (c <= lo + 1e-6) continue;
          const [below, above] = split(rest, ax, c);
          if (below.length >= 3) out.push(below);
          rest = above;
        }
        if (rest.length >= 3) out.push(rest);
      }
      polys = out;
    }
    for (const poly of polys) { const ids = poly.map(idOf); for (let j = 1; j < ids.length - 1; j++) mb.i.push(ids[0], ids[j], ids[j + 1]); }
  }
}

// Move the vertices from v0 on by a smooth displacement field f(x, y, z, out) (writes [dx, dy, dz] into out), turning
// their normals with the field's Jacobian (forward differences), so a face that bows also shades as bowing.
// pts: extra [x, y, z, …] points (lamps, smoke) moved along.
export function warp(mb, v0, f, pts = []) {
  const P = mb.p, N = mb.n, h = 0.03, d = [0, 0, 0], e = [0, 0, 0], J = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = v0 * 3; i < P.length; i += 3) {
    const x = P[i], y = P[i + 1], z = P[i + 2];
    f(x, y, z, d);
    f(x + h, y, z, e); J[0] = (e[0] - d[0]) / h; J[3] = (e[1] - d[1]) / h; J[6] = (e[2] - d[2]) / h;
    f(x, y + h, z, e); J[1] = (e[0] - d[0]) / h; J[4] = (e[1] - d[1]) / h; J[7] = (e[2] - d[2]) / h;
    f(x, y, z + h, e); J[2] = (e[0] - d[0]) / h; J[5] = (e[1] - d[1]) / h; J[8] = (e[2] - d[2]) / h;
    // J[r + 3c] = ∂d_c/∂x_r: the normal moves by −Jᵀn
    const nx = N[i], ny = N[i + 1], nz = N[i + 2];
    const mx = nx - (J[0] * nx + J[3] * ny + J[6] * nz), my = ny - (J[1] * nx + J[4] * ny + J[7] * nz), mz = nz - (J[2] * nx + J[5] * ny + J[8] * nz), l = Math.hypot(mx, my, mz);
    P[i] = x + d[0]; P[i + 1] = y + d[1]; P[i + 2] = z + d[2];
    if (l > 1e-9) { N[i] = mx / l; N[i + 1] = my / l; N[i + 2] = mz / l; }
  }
  for (const q of pts) { f(q[0], q[1], q[2], d); q[0] += d[0]; q[1] += d[1]; q[2] += d[2]; }
}

// swept tube with parallel-transported frames; colorFn(t, angle, P), swayFn(P)
export function addTube(mb, pts, radii, segs, colorFn, swayFn) {
  const rings = [];
  let prevN = null;
  for (let k = 0; k < pts.length; k++) {
    const T = pts[Math.min(k + 1, pts.length - 1)].clone().sub(pts[Math.max(k - 1, 0)]).normalize();
    let Nn = prevN ? prevN.clone().sub(T.clone().multiplyScalar(prevN.dot(T))).normalize() : (Math.abs(T.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0)).cross(T).normalize();
    prevN = Nn; const B = T.clone().cross(Nn);
    const ring = [];
    for (let s = 0; s <= segs; s++) {
      const a = s / segs * Math.PI * 2, dir = Nn.clone().multiplyScalar(Math.cos(a)).add(B.clone().multiplyScalar(Math.sin(a)));
      const P = pts[k].clone().add(dir.clone().multiplyScalar(radii[k]));
      ring.push(mb.v(P.x, P.y, P.z, dir.x, dir.y, dir.z, colorFn(k / (pts.length - 1), a, P), swayFn(P)));
    }
    rings.push(ring);
  }
  for (let k = 0; k < rings.length - 1; k++) for (let s = 0; s < segs; s++) { const a = rings[k][s], b = rings[k][s + 1], c = rings[k + 1][s], d = rings[k + 1][s + 1]; mb.tri(a, b, c); mb.tri(b, d, c); }
}

const ICO = {};
// unit directions of an icosphere's non-indexed triangles (3 per face), cached per detail level
export function icoDirs(detail) {
  if (ICO[detail]) return ICO[detail];
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, out = [];
  for (let i = 0; i < p.count; i++) out.push(V3(p.getX(i), p.getY(i), p.getZ(i)).normalize());
  g.dispose(); return (ICO[detail] = out);
}

// blob: lumpy sphere, normals blended toward an external center (fluffy canopy shading); o.card is its material
export function addBlob(mb, C, r, detail, o) {
  const dirs = icoDirs(detail), ncen = o.ncenter || C, nb = o.nblend != null ? o.nblend : 0.6, lump = o.lump != null ? o.lump : 0.25, sq = o.squash || 1, seed = o.seed || 0;
  for (let t = 0; t < dirs.length; t += 3) {
    const ids = [];
    for (let q = 0; q < 3; q++) {
      const d = dirs[t + q];
      const f = 1 + lump * (vnoise3(d.x * 2.3 + seed, d.y * 2.3, d.z * 2.3 - seed) - 0.5) * 2;
      const P = V3(C.x + d.x * r * f, C.y + d.y * r * f * sq, C.z + d.z * r * f);
      const nn = P.clone().sub(ncen).normalize().multiplyScalar(nb).add(d.clone().multiplyScalar(1 - nb)).normalize();
      ids.push(mb.v(P.x, P.y, P.z, nn.x, nn.y, nn.z, o.color(P, d), o.sway(P), 0, 0, o.card));
    }
    mb.tri(ids[0], ids[1], ids[2]);
  }
  if (o.tufts) {
    const R = mulberry32(seed * 977 + 13);
    for (let k = 0; k < o.tufts; k++) {
      const d = dirs[Math.floor(R() * dirs.length)];
      if (d.y < -0.6) continue;
      const f = 1 + lump * (vnoise3(d.x * 2.3 + seed, d.y * 2.3, d.z * 2.3 - seed) - 0.5) * 2;
      const P = V3(C.x + d.x * r * f * 0.97, C.y + d.y * r * f * sq * 0.97, C.z + d.z * r * f * 0.97);
      const t1 = (Math.abs(d.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0)).cross(d).normalize(), t2 = d.clone().cross(t1);
      const ang = R() * 6.283, a1 = t1.clone().multiplyScalar(Math.cos(ang)).add(t2.clone().multiplyScalar(Math.sin(ang))), a2 = d.clone().cross(a1);
      const sz = r * (0.3 + R() * 0.22);
      const tip = P.clone().addScaledVector(d, sz * 0.4).addScaledVector(a1, sz * 0.95);
      const b1 = P.clone().addScaledVector(a2, sz * 0.3).addScaledVector(d, -sz * 0.18);
      const b2 = P.clone().addScaledVector(a2, -sz * 0.3).addScaledVector(d, -sz * 0.18);
      const nn = P.clone().sub(ncen).normalize().multiplyScalar(nb).add(d.clone().multiplyScalar(1 - nb)).normalize();
      const col = o.color(tip, d).clone().multiplyScalar(1.02 + R() * 0.12);
      const i0 = mb.v(b1.x, b1.y, b1.z, nn.x, nn.y, nn.z, col, o.sway(b1), 0, 0, o.card), i1 = mb.v(b2.x, b2.y, b2.z, nn.x, nn.y, nn.z, col, o.sway(b2), 0, 0, o.card), i2 = mb.v(tip.x, tip.y, tip.z, nn.x, nn.y, nn.z, col, o.sway(tip), 0, 0, o.card);
      mb.tri(i0, i1, i2); mb.tri(i0, i2, i1);
    }
  }
}

// petal: curved strip from base along dir, lifted by cup
export function addPetal(mb, base, dir, len, wid, tilt, cup, colA, colB, sw) {
  const side = V3(-dir.z, 0, dir.x), S = 4, ids = [];
  for (let s = 0; s <= S; s++) {
    const t = s / S, w = wid * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.15)) * (t < 0.15 ? 0.5 : 1);
    const lift = Math.sin(tilt) * len * t + cup * len * t * t;
    const C = base.clone().add(dir.clone().multiplyScalar(Math.cos(tilt) * len * t)); C.y += lift;
    const nrm = V3(-dir.x * (0.4 + cup), 1, -dir.z * (0.4 + cup)).normalize();
    const col = colA.clone().lerp(colB, t);
    const L = C.clone().add(side.clone().multiplyScalar(-w * 0.5)), R = C.clone().add(side.clone().multiplyScalar(w * 0.5));
    ids.push([mb.v(L.x, L.y, L.z, nrm.x, nrm.y, nrm.z, col, sw(L)), mb.v(R.x, R.y, R.z, nrm.x, nrm.y, nrm.z, col, sw(R))]);
  }
  for (let s = 0; s < S; s++) { const [a, b] = ids[s], [c, d] = ids[s + 1]; mb.tri(a, c, b); mb.tri(b, c, d); }
}

// one leaf card at P, facing roughly along d; normals transferred from the canopy centre
export function addCard(mb, P, d, sz, R, colorFn, sway, ncen, nb, atlasU) {
  const nrm = d.clone().add(V3(R() - 0.5, R() - 0.5, R() - 0.5).multiplyScalar(1.1)).normalize();
  const t1 = (Math.abs(nrm.y) < 0.9 ? V3(0, 1, 0) : V3(1, 0, 0)).cross(nrm).normalize(), t2 = nrm.clone().cross(t1);
  const rot = R() * 6.283, ax = t1.clone().multiplyScalar(Math.cos(rot)).add(t2.clone().multiplyScalar(Math.sin(rot))), ay = nrm.clone().cross(ax);
  const h = sz * 0.5, tint = 0.92 + R() * 0.16, u0 = atlasU || 0;
  const ids = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].map(([a, b, u, w]) => {
    const Q = P.clone().addScaledVector(ax, a * h).addScaledVector(ay, b * h);
    const nn = Q.clone().sub(ncen).normalize().multiplyScalar(nb).add(d.clone().multiplyScalar(1 - nb)).normalize();
    return mb.v(Q.x, Q.y, Q.z, nn.x, nn.y, nn.z, colorFn(Q, nn).multiplyScalar(tint), sway(Q), u0 + u * 0.5, w, 1);
  });
  mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]);
}

// `count` cards scattered in a (squashed) ball of radius r around C
export function addCards(mb, C, r, count, o) {
  const R = mulberry32((o.seed || 0) * 131 + 7), ncen = o.ncenter || C, nb = o.nblend != null ? o.nblend : 0.75, sq = o.squash || 1;
  for (let k = 0; k < count; k++) {
    let d;
    do { const u = R() * 2 - 1, a = R() * 6.283, sn = Math.sqrt(1 - u * u); d = V3(sn * Math.cos(a), u, sn * Math.sin(a)); } while (d.y < -0.5 && R() < 0.75);
    const dist = r * (0.5 + R() * 0.55), P = V3(C.x + d.x * dist, C.y + d.y * dist * sq, C.z + d.z * dist);
    addCard(mb, P, d, r * (o.size || 0.8) * (0.75 + R() * 0.5), R, o.color, o.sway, ncen, nb, o.atlas === 'needle' ? 0.5 : 0);
  }
}

// vertical dark -> mid -> light gradient across a canopy, lighter where the normal faces up
export function canopyColor(Cc, span, dark, mid, light) {
  return (P, n) => { const t = clamp((P.y - (Cc.y - span)) / (span * 2), 0, 1); const lit = clamp(n.y * 0.5 + 0.5, 0, 1); return new THREE.Color().copy(dark).lerp(mid, smooth(0.05, 0.55, t)).lerp(light, smooth(0.5, 1, t) * (0.4 + 0.6 * lit)); };
}
