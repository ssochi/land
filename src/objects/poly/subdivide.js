// Subdivision surface (Blender's modifier, Catmull-Clark): every face splits into quads round its centre and
// every vertex moves toward the smooth limit surface, so a box becomes a soft pillow and a rough cage a smooth
// form. Edges whose faces meet at more than o.sharp degrees are creased with weight o.crease (1 keeps them sharp,
// 0.5 rounds them only a little); open boundaries stay put. o.simple splits without smoothing. Creases carry over
// to the halves of an edge, so they hold through every level.
import { Poly, V3 } from './mesh.js';

const ek = (a, b) => (a < b ? a + ',' + b : b + ',' + a);

function once(p, crease, simple) {
  const q = new Poly(), P = p.P, F = p.F, E = new Map();
  const fp = F.map(f => q.vert(p.center(f)));
  F.forEach((f, fi) => f.v.forEach((a, k) => {
    const b = f.v[(k + 1) % f.v.length], key = ek(a, b);
    let e = E.get(key); if (!e) E.set(key, e = { a, b, faces: [], c: crease.get(key) || 0 });
    e.faces.push(fi);
  }));
  // edge points: the smooth rule (ends and neighbouring face centres), the sharp one (midpoint), mixed by crease
  const ep = new Map();
  E.forEach((e, key) => {
    const m = P[e.a].clone().add(P[e.b]).multiplyScalar(0.5);
    if (!simple && e.faces.length === 2 && e.c < 1) m.lerp(P[e.a].clone().add(P[e.b]).add(q.P[fp[e.faces[0]]]).add(q.P[fp[e.faces[1]]]).multiplyScalar(0.25), 1 - e.c);
    ep.set(key, q.vert(m));
  });
  // vertex points: (Q + 2R + (n − 3)S) / n in the open; along a crease or boundary (two sharp edges) the curve
  // rule (a + 6S + b) / 8; at a corner (three or more) the vertex stays
  const vf = P.map(() => []), ve = P.map(() => []);
  F.forEach((f, fi) => f.v.forEach(a => vf[a].push(fi)));
  E.forEach(e => { ve[e.a].push(e); ve[e.b].push(e); });
  const vp = P.map((S, i) => {
    if (!ve[i].length) return -1;
    if (simple) return q.vert(S);
    const n = ve[i].length, sharp = ve[i].filter(e => e.faces.length !== 2 || e.c > 0);
    const Q = V3(0, 0, 0), R = V3(0, 0, 0);
    for (const fi of vf[i]) Q.add(q.P[fp[fi]]); Q.divideScalar(vf[i].length);
    for (const e of ve[i]) R.add(P[e.a]).add(P[e.b]); R.divideScalar(2 * n);
    const smooth = Q.add(R.multiplyScalar(2)).add(S.clone().multiplyScalar(n - 3)).divideScalar(n);
    if (sharp.length < 2) return q.vert(smooth);
    const w = sharp.reduce((s, e) => s + (e.faces.length !== 2 ? 1 : e.c), 0) / sharp.length;
    const hard = sharp.length === 2 ? sharp.reduce((s, e) => s.add(P[e.a === i ? e.b : e.a]), S.clone().multiplyScalar(6)).divideScalar(8) : S.clone();
    return q.vert(smooth.lerp(hard, w));
  });
  const nc = new Map();
  F.forEach((f, fi) => {
    const v = f.v, n = v.length;
    for (let k = 0; k < n; k++) {
      const a = v[k], b = v[(k + 1) % n], z = v[(k + n - 1) % n], eAB = ep.get(ek(a, b)), eZA = ep.get(ek(z, a));
      q.face([vp[a], eAB, fp[fi], eZA], { card: f.card, col: f.col, u: f.u, vDown: f.vDown, tag: f.tag });
      const c = E.get(ek(a, b)).c; if (c > 0) { nc.set(ek(vp[a], eAB), c); nc.set(ek(eAB, vp[b]), c); }
    }
  });
  q.crease = nc;
  return q;
}

Poly.op('subdivide', (p, o = {}) => {
  const levels = o.levels != null ? o.levels : 1, lim = Math.cos((o.sharp != null ? o.sharp : 180) * Math.PI / 180);
  let crease = p.crease || new Map();
  if (o.sharp != null) {
    const half = p.half(), N = p.F.map(f => p.normal(f));
    half.forEach(([fi], dk) => { const [a, b] = dk.split(',').map(Number), t = half.get(b + ',' + a); if (t && N[fi].dot(N[t[0]]) < lim) crease.set(ek(a, b), o.crease != null ? o.crease : 1); });
  }
  let q = p;
  for (let l = 0; l < levels; l++) { q = once(q, crease, !!o.simple); crease = q.crease; }
  q.last = q.F.map((_, i) => i);
  p.crease = q.crease;
  return q;
});
