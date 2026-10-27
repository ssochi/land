// Bevel (Blender's Bevel modifier, limit method Angle): every edge whose faces meet at more than o.angle degrees
// (default 40) is cut back by o.width on both faces and replaced by a strip of o.segments facets on a round
// profile (o.profile 'chamfer': straight); where bevelled edges meet, a patch closes the corner. Faces shrink
// in their own planes, so flat faces stay flat, and with weighted normals (output.js) the strips shade like a
// rounded edge. An edge that is not bevelled but ends at a bevelled vertex gets a point slid along it, so a
// bevel can stop partway round a vertex (Blender does the same). o.select(a, b, nF, nG) narrows the edges further.
// Works on manifold meshes with consistent winding (open boundaries are fine; their edges are never bevelled).
import { Poly, V3, DETAIL } from './mesh.js';

Poly.op('bevel', (p, o = {}) => {
  const width = o.width != null ? o.width : 0.03;
  if (width < DETAIL.minBevel) return p;   // a lighter LOD (withDetail): too narrow to see from there
  const segs = DETAIL.level ? 1 : Math.max(1, o.segments || 2), round = o.profile !== 'chamfer';
  // a lighter level has coarser curves (fewer lathe segments): raise the angle so their facets, smooth at full
  // detail, do not start to count as edges
  const lim = Math.cos(Math.max(o.angle != null ? o.angle : 40, [0, 50, 62][DETAIL.level]) * Math.PI / 180), P = p.P, F = p.F;
  const half = p.half(), N = F.map(f => p.normal(f)), ek = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
  const bev = new Set();
  half.forEach(([fi], dk) => {
    const [a, b] = dk.split(',').map(Number), t = half.get(b + ',' + a);
    if (a > b || !t || N[fi].dot(N[t[0]]) > lim) return;
    if (!o.select || o.select(P[a], P[b], N[fi], N[t[0]])) bev.add(ek(a, b));
  });
  if (!bev.size) return p;
  const isB = (a, b) => bev.has(ek(a, b)), hit = new Set(); for (const k of bev) for (const v of k.split(',')) hit.add(+v);
  const len = (a, b) => P[a].distanceTo(P[b]);
  const corner = (fi, k) => { const v = F[fi].v, n = v.length; return [v[(k + n - 1) % n], v[k], v[(k + 1) % n]]; };
  // signed sine of a face's interior angle at v (negative at a reflex corner) and the unit edge directions
  const geom = (fi, u, v, w) => {
    const din = P[u].clone().sub(P[v]).normalize(), dout = P[w].clone().sub(P[v]).normalize();
    return { din, dout, s: dout.clone().cross(din).dot(N[fi]) };
  };

  // slide points: an unbevelled edge v–x at a bevelled vertex v gets a point at the distance its neighbouring
  // faces need to keep the bevel's width (the average when both faces ask)
  const req = new Map();
  F.forEach((f, fi) => f.v.forEach((v, k) => {
    if (!hit.has(v)) return;
    const [u, , w] = corner(fi, k), bin = isB(u, v), bout = isB(v, w);
    if (bin === bout) return;
    const { s } = geom(fi, u, v, w), x = bin ? w : u, d = width / Math.max(Math.abs(s), 0.1), r = req.get(v + '>' + x) || [0, 0];
    r[0] += d; r[1]++; req.set(v + '>' + x, r);
  }));
  const slide = new Map();
  req.forEach(([sum, n], key) => {
    const [v, x] = key.split('>').map(Number), d = Math.min(sum / n, 0.45 * len(v, x));
    slide.set(key, p.vert(P[v].clone().addScaledVector(P[x].clone().sub(P[v]).normalize(), d)));
  });
  const S = (v, x) => (slide.has(v + '>' + x) ? slide.get(v + '>' + x) : v);

  // the points that replace v in each face (in the face's winding)
  const chain = new Map();
  F.forEach((f, fi) => f.v.forEach((v, k) => {
    if (!hit.has(v)) return;
    const [u, , w] = corner(fi, k), bin = isB(u, v), bout = isB(v, w);
    let c;
    if (bin && bout) {
      const { din, dout, s } = geom(fi, u, v, w), q = P[v].clone();
      if (Math.abs(s) < 0.05) q.addScaledVector(N[fi].clone().cross(dout).normalize(), width);   // straight through
      else q.addScaledVector(din, Math.min(width / s, 0.45 * len(v, u))).addScaledVector(dout, Math.min(width / s, 0.45 * len(v, w)));
      c = [p.vert(q)];
    } else if (bin) c = [S(v, w)];
    else if (bout) c = [S(v, u)];
    else c = [S(v, u), v, S(v, w)].filter((x, i, a) => i === 0 || x !== a[i - 1]);
    chain.set(fi + ':' + k, c);
  }));
  const ch = (fi, v) => chain.get(fi + ':' + F[fi].v.indexOf(v));

  // strips along bevelled edges, a round (rational quadratic) or straight profile between the two faces' points;
  // the profile's inner points are kept for the corner patches (keyed by vertex and the face crossed from)
  const strips = [], mid = new Map();
  for (const key of bev) {
    const [a, b] = key.split(',').map(Number), fF = half.get(a + ',' + b)[0], fG = half.get(b + ',' + a)[0];
    const cFa = ch(fF, a), cFb = ch(fF, b), cGa = ch(fG, a), cGb = ch(fG, b);
    const Fa = cFa[cFa.length - 1], Fb = cFb[0], Ga = cGa[0], Gb = cGb[cGb.length - 1];
    const wgt = round ? Math.cos(Math.acos(Math.max(-1, Math.min(1, N[fF].dot(N[fG])))) / 2) : 1, dir = P[b].clone().sub(P[a]).normalize();
    const prof = (A, B) => {
      const pts = [A], m = P[A].clone().add(P[B]).multiplyScalar(0.5), K = P[a].clone().addScaledVector(dir, m.clone().sub(P[a]).dot(dir));
      for (let i = 1; i < segs; i++) {
        const t = i / segs, b0 = (1 - t) * (1 - t), b1 = 2 * t * (1 - t) * wgt, b2 = t * t, d = b0 + b1 + b2;
        pts.push(p.vert(round ? P[A].clone().multiplyScalar(b0 / d).addScaledVector(K, b1 / d).addScaledVector(P[B], b2 / d) : P[A].clone().lerp(P[B], t)));
      }
      pts.push(B); return pts;
    };
    const Qa = prof(Fa, Ga), Qb = prof(Fb, Gb);
    mid.set(a + ':' + fF, Qa.slice(1, -1)); mid.set(b + ':' + fG, Qb.slice(1, -1).reverse());
    for (let i = 0; i < segs; i++) strips.push([[Qb[i], Qa[i], Qa[i + 1], Qb[i + 1]], fF]);
  }

  // corner patches: walk the faces round each bevelled vertex (across each face's outgoing edge), collecting their
  // replacement points and the strips' profile points between them
  const patches = [];
  for (const v of hit) {
    let fi = -1;
    for (let i = 0; i < F.length && fi < 0; i++) if (F[i].v.includes(v)) fi = i;
    if (fi < 0) continue;
    const prevFace = f => { const t = half.get(v + ',' + corner(f, F[f].v.indexOf(v))[0]); return t ? t[0] : -1; };
    const nextFace = f => { const t = half.get(corner(f, F[f].v.indexOf(v))[2] + ',' + v); return t ? t[0] : -1; };
    let start = fi, open = false;
    for (let g = prevFace(start), n = 0; g >= 0 && g !== fi && n < 64; g = prevFace(g), n++) start = g;
    if (prevFace(start) < 0) open = true;
    const ring = [], nv = V3(0, 0, 0);
    for (let g = start, n = 0; g >= 0 && n < 64; n++) {
      ring.push(...ch(g, v)); nv.add(N[g]);
      if (mid.has(v + ':' + g)) ring.push(...mid.get(v + ':' + g));
      g = nextFace(g); if (g === start) break;
    }
    if (open) ring.push(v);
    const pts = ring.filter((x, i) => x !== ring[(i + 1) % ring.length]);
    if (pts.length >= 3) patches.push([pts, fi, nv.normalize(), v]);
  }

  // rebuild: shrunken faces, strips, patches (fanned round a point pushed toward the old corner when rounded)
  const attrs = F.map(({ card, col, u, vDown, tag }) => ({ card, col, u, vDown, tag })), attr = fi => attrs[fi];
  F.forEach((f, fi) => {
    const nvList = [];
    f.v.forEach((v, k) => nvList.push(...(chain.get(fi + ':' + k) || [v])));
    f.v = nvList.filter((x, i) => x !== nvList[(i + 1) % nvList.length]);
  });
  p.F = F.filter(f => f.v.length >= 3);
  const made = [];
  for (const [v, fi] of strips) { const q = v.filter((x, i) => x !== v[(i + 1) % v.length]); if (q.length >= 3) made.push(p.face(q, attr(fi))); }
  for (const [pts, fi, nv, v] of patches) {
    const sub = new Poly(); sub.P = P; const n = sub.newell({ v: pts });
    const loop = n.dot(nv) < 0 ? pts.slice().reverse() : pts;
    if (segs > 1 && loop.length > 3) {
      const c = V3(0, 0, 0); for (const i of loop) c.add(P[i]); c.divideScalar(loop.length).lerp(P[v], 0.45);
      const ci = p.vert(c);
      for (let i = 0; i < loop.length; i++) made.push(p.face([loop[i], loop[(i + 1) % loop.length], ci], attr(fi)));
    } else made.push(p.face(loop, attr(fi)));
  }
  p.last = made;
  return p;
});
