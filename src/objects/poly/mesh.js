// Polygon modelling toolkit, after Blender's mesh tools: a model starts from primitives and is shaped by
// operators (bevel, inset, extrude, subdivision surface, solidify, array, mirror, deformers), then baked into an
// MB (mesh-builder.js) with uv in metres and weighted normals: flat faces stay flat, bevels and curved parts
// shade round. docs/modeling.md describes the tools and how to add one.
//
// A Poly holds positions P (THREE.Vector3) and faces F. A face is { v: vertex indices, counter-clockwise seen
// from outside; card: material or null (the bake's default); col: THREE.Color or null; u: uv u-axis or null (horizontal by default); vDown:
// texture v runs down the slope instead of up; tag: a name for selecting it later }. Operators are registered by
// name with Poly.op(name, fn) and become chainable methods: fn(poly, ...args) edits the poly in place (or returns
// a new one, whose contents then replace it). Operators that create faces leave their indices in poly.last, so
// the next step can work on them: p.inset('top', 0.05).extrude('last', -0.1).
import * as THREE from 'three';

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const FACE = { card: null, col: null, u: null, vDown: false, tag: null };

export class Poly {
  constructor() { this.P = []; this.F = []; this.last = []; }
  static op(name, fn) {
    Poly.prototype[name] = function (...a) {
      const r = fn(this, ...a);
      if (r instanceof Poly && r !== this) { this.P = r.P; this.F = r.F; this.last = r.last; }
      return this;
    };
  }
  static make(name, fn) { Poly[name] = fn; }
  vert(p) { this.P.push(p.isVector3 ? p.clone() : V3(p[0], p[1], p[2])); return this.P.length - 1; }
  face(v, attr = {}) { const f = Object.assign({}, FACE, attr, { v }); this.F.push(f); return this.F.length - 1; }
  clone() { const q = new Poly(); q.P = this.P.map(p => p.clone()); q.F = this.F.map(f => Object.assign({}, f, { v: f.v.slice() })); q.last = this.last.slice(); return q; }

  // face geometry: Newell normal (robust for slightly non-planar polygons), centroid, area
  newell(f) { const n = V3(0, 0, 0), v = f.v, P = this.P; for (let i = 0; i < v.length; i++) { const a = P[v[i]], b = P[v[(i + 1) % v.length]]; n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y); } return n; }
  normal(f) { return this.newell(f).normalize(); }
  area(f) { return this.newell(f).length() / 2; }
  center(f) { const c = V3(0, 0, 0); for (const i of f.v) c.add(this.P[i]); return c.divideScalar(f.v.length); }
  // directed edges 'a,b' → [face index, corner index of a]
  half() { const m = new Map(); this.F.forEach((f, fi) => f.v.forEach((a, k) => m.set(a + ',' + f.v[(k + 1) % f.v.length], [fi, k]))); return m; }
  bounds() { const b = new THREE.Box3(); for (const f of this.F) for (const i of f.v) b.expandByPoint(this.P[i]); return b; }

  // faces to work on: 'all', 'last', a tag, a predicate ({ f, i, n, c }) => bool, or an array of indices
  pick(sel = 'all') {
    if (Array.isArray(sel)) return sel;
    if (sel === 'all') return this.F.map((_, i) => i);
    if (sel === 'last') return this.last.slice();
    if (typeof sel === 'string') return this.F.map((f, i) => (f.tag === sel ? i : -1)).filter(i => i >= 0);
    return this.F.map((f, i) => (sel({ f, i, n: this.normal(f), c: this.center(f) }) ? i : -1)).filter(i => i >= 0);
  }
  // set face attributes (card, col, u, vDown, tag) on a selection
  set(attr, sel = 'all') { for (const i of this.pick(sel)) Object.assign(this.F[i], attr); return this; }

  transform(m) {
    const used = new Set(); for (const f of this.F) for (const i of f.v) used.add(i);
    for (const i of used) this.P[i].applyMatrix4(m);
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (const f of this.F) if (f.u) f.u = f.u.clone().applyMatrix3(nm).normalize();
    if (m.determinant() < 0) for (const f of this.F) f.v.reverse();   // a mirror turns faces inside out
    return this;
  }
  translate(x, y, z) { return this.transform(new THREE.Matrix4().makeTranslation(x, y, z)); }
  scale(x, y = x, z = x) { return this.transform(new THREE.Matrix4().makeScale(x, y, z)); }
  rotate(axis, angle) { return this.transform(new THREE.Matrix4().makeRotationAxis(axis.clone().normalize(), angle)); }
  // align: the poly's +x, +y, +z go to ax, ay, az, its origin to c (place a part along a beam, a wall, …)
  place(c, ax, ay, az) { return this.transform(new THREE.Matrix4().makeBasis(ax, ay, az).setPosition(c)); }
  // append other polys (their faces keep their attributes)
  merge(...others) {
    for (const o of others) { const off = this.P.length; this.P.push(...o.P.map(p => p.clone())); for (const f of o.F) this.F.push(Object.assign({}, f, { v: f.v.map(i => i + off) })); }
    return this;
  }
}
