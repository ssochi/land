// Bake a Poly into an MB (mesh-builder.js) for the prop shader.
//   normals: weighted by face area within smooth sectors (Blender's Smooth by Angle + Weighted Normal): edges
//     sharper than o.smooth degrees (default 50) stay hard; across softer ones each corner averages the faces
//     round its vertex, big faces counting for more, so a flat face stays flat while a bevel strip or a cylinder
//     side shades round. This is what makes a modest polygon count read as a carefully made model.
//   uv: metres in each face's frame (u horizontal along the face unless the face says otherwise, v up or up the
//     slope; vDown flips it, for roof tiles), plus o.v0 (a number or card => number) on v — stucco needs v measured
//     from the wall's foot. Planar per frame, so neighbouring faces line up.
//   o.at: Matrix4 placing the poly; o.color: colour for faces without one; o.shade(P, n): a factor on the colour;
//   o.sway: number or fn(P) for aSway; o.card: material for faces without their own (default 0).
import * as THREE from 'three';
import { Poly, V3 } from './mesh.js';

const Y = V3(0, 1, 0), X = V3(1, 0, 0), WHITE = new THREE.Color(1, 1, 1);

// bake: the poly's corners as flat arrays in its own space (position, normal, uv, material, face colour) and
// triangles; emit: those into an MB, placed by o.at and coloured. Splitting them lets a caller cache the bake of
// a part it repeats (every timber of the same size, say) and only emit it again.
export function bake(p, o = {}) {
  const P = p.P, F = p.F, N = F.map(f => p.newell(f)), A = N.map(n => n.length() / 2), half = p.half();
  N.forEach(n => n.normalize());
  const cosLim = Math.cos((o.smooth != null ? o.smooth : 50) * Math.PI / 180);
  // the corner normal of face fi at its corner k: walk round the vertex both ways while edges stay soft
  const cornerN = (fi, k) => {
    const v = F[fi].v[k], n = N[fi].clone().multiplyScalar(A[fi] + 1e-9), seen = new Set([fi]);
    for (const dir of [1, -1]) {
      let g = fi, gk = k;
      for (let step = 0; step < 32; step++) {
        const gv = F[g].v, m = gv.length, other = dir > 0 ? gv[(gk + 1) % m] : gv[(gk + m - 1) % m];
        const t = half.get(dir > 0 ? other + ',' + v : v + ',' + other);
        if (!t || seen.has(t[0]) || N[g].dot(N[t[0]]) < cosLim) break;
        g = t[0]; gk = F[g].v.indexOf(v); seen.add(g);
        if (N[fi].dot(N[g]) >= cosLim) n.addScaledVector(N[g], A[g]);
      }
    }
    return n.normalize();
  };
  const out = { pos: [], nrm: [], uv: [], card: [], col: [], tri: [] };
  F.forEach((f, fi) => {
    const n = N[fi], m = f.v.length;
    if (m < 3 || !(A[fi] > 1e-12)) return;
    // a frame that does not spin on faces nearly square to it (a jittered cap would get a random u per triangle):
    // the face's own u if it lies well within the face, else horizontal, else x
    const u = (f.u && Math.abs(f.u.dot(n)) < 0.9 ? f.u.clone().sub(n.clone().multiplyScalar(f.u.dot(n))) : Math.abs(n.y) < 0.9 ? Y.clone().cross(n) : X.clone().sub(n.clone().multiplyScalar(n.x))).normalize();
    const vv = n.clone().cross(u); if (f.vDown) vv.negate();
    const base = out.pos.length / 3;
    f.v.forEach((vi, k) => {
      const q = P[vi], cn = cornerN(fi, k);
      out.pos.push(q.x, q.y, q.z); out.nrm.push(cn.x, cn.y, cn.z); out.uv.push(q.dot(u), q.dot(vv)); out.card.push(f.card); out.col.push(f.col);
    });
    // triangles: a fan for convex faces, ear clipping (in the face's own plane) for concave ones
    const pts = f.v.map(vi => new THREE.Vector2(P[vi].dot(u), P[vi].dot(n.clone().cross(u))));
    let convex = true;
    for (let k = 0; k < m && convex; k++) { const a = pts[k], b = pts[(k + 1) % m], c = pts[(k + 2) % m]; if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < -1e-9) convex = false; }
    const tris = convex ? Array.from({ length: m - 2 }, (_, k) => [0, k + 1, k + 2]) : THREE.ShapeUtils.triangulateShape(pts, []);
    for (const [a, b, c] of tris) {
      const e1 = P[f.v[b]].clone().sub(P[f.v[a]]), e2 = P[f.v[c]].clone().sub(P[f.v[a]]);
      if (e1.cross(e2).dot(n) >= 0) out.tri.push(base + a, base + b, base + c); else out.tri.push(base + a, base + c, base + b);
    }
  });
  return out;
}

const _q = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
export function emit(mb, b, o = {}) {
  const at = o.at || null, flip = at && at.determinant() < 0;   // a mirroring placement turns the winding
  if (at) _nm.getNormalMatrix(at);
  const swayOf = typeof o.sway === 'function' ? o.sway : () => o.sway || 0, start = mb.p.length / 3;
  for (let i = 0, n = b.pos.length / 3; i < n; i++) {
    _q.set(b.pos[i * 3], b.pos[i * 3 + 1], b.pos[i * 3 + 2]); _n.set(b.nrm[i * 3], b.nrm[i * 3 + 1], b.nrm[i * 3 + 2]);
    if (at) { _q.applyMatrix4(at); _n.applyMatrix3(_nm).normalize(); }
    const card = b.card[i] != null ? b.card[i] : o.card || 0, v0 = typeof o.v0 === 'function' ? o.v0(card) : o.v0 || 0;
    const base = b.col[i] || o.color || WHITE, col = o.shade ? base.clone().multiplyScalar(o.shade(_q, _n)) : base;
    mb.v(_q.x, _q.y, _q.z, _n.x, _n.y, _n.z, col, swayOf(_q), b.uv[i * 2], b.uv[i * 2 + 1] + v0, card);
  }
  for (let i = 0; i < b.tri.length; i += 3) {
    if (flip) mb.tri(start + b.tri[i], start + b.tri[i + 2], start + b.tri[i + 1]);
    else mb.tri(start + b.tri[i], start + b.tri[i + 1], start + b.tri[i + 2]);
  }
}

Poly.op('toMB', (p, mb, o = {}) => { emit(mb, bake(p, o), o); });
