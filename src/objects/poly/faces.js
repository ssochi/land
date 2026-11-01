// Face tools (Blender's Inset Faces, Extrude Region / Individual Faces, Solidify). Each takes a selection (see
// Poly.pick) and leaves the faces it made in poly.last: inset → the inner faces, extrude → the moved faces.
import { Poly, V3 } from './mesh.js';

const attrOf = f => ({ card: f.card, col: f.col, u: f.u, vDown: f.vDown, tag: f.tag });

// inset each selected face by `amount` within its plane (a frame of quads round a smaller copy), the copy moved
// `depth` along the normal (negative sinks it: a panel, a window reveal). o.tag names the inner faces, o.rim the
// frame; o.attr sets anything else on the inner faces.
Poly.op('inset', (p, sel, amount, depth = 0, o = {}) => {
  const P = p.P, out = [];
  for (const fi of p.pick(sel)) {
    const f = p.F[fi], n = p.normal(f), v = f.v, m = v.length, inner = [];
    for (let k = 0; k < m; k++) {
      const a = P[v[(k + m - 1) % m]], b = P[v[k]], c = P[v[(k + 1) % m]];
      const din = a.clone().sub(b).normalize(), dout = c.clone().sub(b).normalize(), s = dout.clone().cross(din).dot(n);
      const q = b.clone(), d = Math.abs(s) < 0.05 ? null : amount / s;
      if (d === null) q.addScaledVector(n.clone().cross(dout).normalize(), amount);
      else q.addScaledVector(din, d).addScaledVector(dout, d);
      inner.push(p.vert(q.addScaledVector(n, depth)));
    }
    const base = attrOf(f);
    for (let k = 0; k < m; k++) { const j = (k + 1) % m; p.face([v[k], v[j], inner[j], inner[k]], Object.assign({}, base, o.rim ? { tag: o.rim } : {})); }
    f.v = inner; if (o.tag) f.tag = o.tag; if (o.attr) Object.assign(f, o.attr);
    out.push(fi);
  }
  p.last = out;
});

// extrude the selected faces by `dist` along their normals (or by a vector), as one region: faces sharing edges
// move together and only the region's outline grows side walls. o.individual extrudes each face on its own.
// o.side tags the walls.
Poly.op('extrude', (p, sel, dist, o = {}) => {
  const ids = p.pick(sel);
  const groups = o.individual ? ids.map(i => [i]) : [ids];
  const out = [];
  for (const g of groups) {
    const inSel = new Set(g), half = p.half(), moved = new Map(), acc = new Map();
    for (const fi of g) { const n = p.normal(p.F[fi]); for (const v of p.F[fi].v) { const a = acc.get(v) || V3(0, 0, 0); acc.set(v, a.add(n)); } }
    acc.forEach((nsum, v) => {
      const off = dist && dist.isVector3 ? dist.clone() : nsum.normalize().multiplyScalar(dist);
      moved.set(v, p.vert(p.P[v].clone().add(off)));
    });
    for (const fi of g) {
      const f = p.F[fi], v = f.v, m = v.length;
      for (let k = 0; k < m; k++) {
        const a = v[k], b = v[(k + 1) % m], t = half.get(b + ',' + a);
        if (t && inSel.has(t[0])) continue;   // an inner edge of the region: no wall
        p.face([a, b, moved.get(b), moved.get(a)], Object.assign(attrOf(f), o.side ? { tag: o.side } : {}));
      }
      f.v = v.map(x => moved.get(x));
      out.push(fi);
    }
  }
  p.last = out;
});

// give an open surface thickness t (Blender's Solidify): a copy offset against the vertex normals, turned to face
// the other way, joined along the open edges. For cloth, awnings, leaves of a planter, thin roofs.
Poly.op('solidify', (p, t = 0.02) => {
  const P = p.P, F0 = p.F.slice(), half = p.half(), nrm = new Map();
  for (const f of F0) { const n = p.normal(f); for (const v of f.v) nrm.set(v, (nrm.get(v) || V3(0, 0, 0)).add(n)); }
  const back = new Map(); nrm.forEach((n, v) => back.set(v, p.vert(P[v].clone().addScaledVector(n.normalize(), -t))));
  for (const f of F0) {
    p.face(f.v.map(v => back.get(v)).reverse(), attrOf(f));
    for (let k = 0; k < f.v.length; k++) {
      const a = f.v[k], b = f.v[(k + 1) % f.v.length];
      if (!half.has(b + ',' + a)) p.face([b, a, back.get(a), back.get(b)], attrOf(f));
    }
  }
});
