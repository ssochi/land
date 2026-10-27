// Modelling toolkit (src/objects/poly): every operator keeps a closed mesh closed, and the bake shades the way
// the mid-poly workflow needs (flat faces flat, bevels round).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Poly, fillet2, rect2, circle2, bake } from '../src/objects/poly/index.js';
import { MB } from '../src/objects/mesh-builder.js';

// closed and consistently wound: every directed edge has its reverse, none appears twice; Euler characteristic
// chi (2 for a ball-like solid, 0 for a ring)
function closed(p, name, chi = 2) {
  const h = p.half(), seen = new Set(), V = new Set();
  for (const f of p.F) for (let k = 0; k < f.v.length; k++) {
    const a = f.v[k], b = f.v[(k + 1) % f.v.length];
    assert.ok(!seen.has(a + ',' + b), `${name}: edge ${a},${b} twice`); seen.add(a + ',' + b);
    assert.ok(h.has(b + ',' + a), `${name}: open edge ${a},${b}`); V.add(a);
  }
  assert.equal(V.size - seen.size / 2 + p.F.length, chi, `${name}: Euler characteristic`);
  assert.ok(p.volume() > 0, `${name}: faces wind outward`);
}

test('primitives are closed solids with outward faces', () => {
  closed(Poly.box(1, 2, 3), 'box');
  closed(Poly.cylinder(0.5, 1, 12), 'cylinder');
  closed(Poly.lathe([[0, 1], [0.4, 0.8], [0.3, 0.2], [0, 0]], 10), 'lathe given top to bottom');
  closed(Poly.prism([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], 0.5), 'concave prism');
  closed(Poly.prism(fillet2(rect2(1, 0.6), 0.1, 3), 0.3), 'filleted prism');
  closed(Poly.sweep(Array.from({ length: 8 }, (_, i) => new THREE.Vector3(Math.sin(i * 0.4), i * 0.3, 0)), circle2(0.1, 8)), 'sweep');
  closed(Poly.sweep(circle2(1, 16).map(([x, z]) => new THREE.Vector3(x, 0, z)), rect2(0.1, 0.2), {}, { closed: true }), 'ring', 0);
  closed(Poly.icosphere(1, 1), 'icosphere');
});

test('bevel rounds the sharp edges only, keeps the mesh closed and the flat faces flat', () => {
  const b = Poly.box(1, 1, 1).bevel({ width: 0.1, segments: 3 });
  closed(b, 'bevelled box');
  assert.equal(b.F.length, 6 + 12 * 3 + 8 * 9, 'faces + strips + corners (a 9-gon each: 3 points + 2 profile points per strip, fanned)');
  const bb = b.bounds(); assert.ok(Math.abs(bb.max.x - 0.5) < 1e-9 && Math.abs(bb.min.y + 0.5) < 1e-9, 'the bevel stays inside the box');
  closed(Poly.cylinder(0.5, 1, 12).bevel({ width: 0.05 }), 'cylinder: rims only');
  assert.equal(Poly.cylinder(0.5, 1, 12).bevel({ width: 0.05, segments: 1 }).F.length, 36 + 24, 'only the 24 rim edges get a strip (side edges at 30° stay; rim strips meet with no corner patch)');
  closed(Poly.prism([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], 0.5).bevel({ width: 0.05, segments: 2 }), 'concave prism bevel');
  closed(Poly.box(2, 1, 1).inset('pz', 0.2).extrude('last', -0.1).bevel({ width: 0.03 }), 'bevel after inset and extrude');
  // baked, the big faces keep their normal; corners on the bevel turn
  const mb = new MB(); b.toMB(mb, {});
  const g = mb.geo(), p = g.attributes.position.array, n = g.attributes.normal.array;
  let flat = 1, turned = 0;
  for (let i = 0; i < p.length / 3; i++) if (p[i * 3 + 1] > 0.4999) { if (Math.abs(p[i * 3]) < 0.39 && Math.abs(p[i * 3 + 2]) < 0.39) flat = Math.min(flat, n[i * 3 + 1]); }
  for (let i = 0; i < p.length / 3; i++) if (p[i * 3 + 1] < 0.45 && p[i * 3 + 1] > -0.45 && Math.abs(p[i * 3]) > 0.44 && Math.abs(p[i * 3 + 2]) > 0.44) turned++;
  assert.ok(flat > 0.999, `top face flat (${flat})`);
  assert.ok(turned > 0, 'vertical bevel corners exist');
});

test('subdivision smooths a box toward a ball, creases hold edges, simple mode only splits', () => {
  const s = Poly.box(1, 1, 1).subdivide({ levels: 2 }), c = Poly.box(1, 1, 1).subdivide({ levels: 2, sharp: 30, crease: 1 }), q = Poly.box(1, 1, 1).subdivide({ levels: 1, simple: true });
  closed(s, 'smooth'); closed(c, 'creased'); closed(q, 'simple');
  assert.equal(s.F.length, 96);
  assert.ok(s.volume() < 0.5 && c.volume() > 0.99 && Math.abs(q.volume() - 1) < 1e-9, `volumes ${s.volume().toFixed(3)} ${c.volume().toFixed(3)} ${q.volume().toFixed(3)}`);
  const half = Poly.box(1, 1, 1).subdivide({ levels: 2, sharp: 30, crease: 0.5 }).volume();
  assert.ok(half > s.volume() && half < c.volume(), 'a half crease rounds a little');
});

test('inset, extrude, solidify and the deformers', () => {
  const e = Poly.box(1, 1, 1).extrude('py', 0.5); closed(e, 'extrude'); assert.ok(Math.abs(e.volume() - 1.5) < 1e-9);
  const r = Poly.box(1, 1, 1).inset('pz', 0.2).extrude('last', -0.3); closed(r, 'recess'); assert.ok(Math.abs(r.volume() - (1 - 0.36 * 0.3)) < 1e-9);
  const g = Poly.box(1, 1, 1).extrude(f => f.n.y > 0.5 || f.n.x > 0.5, 0.2); closed(g, 'region extrude of two faces');
  const so = Poly.grid(1, 1, 3, 3).solidify(0.1); closed(so, 'solidify'); assert.ok(Math.abs(so.volume() - 0.1) < 1e-6);
  const w = Poly.box(1, 2, 1).subdivide({ levels: 1, simple: true }).taper(0.5, -1, 1).twist(1, -1, 1).bend(0.5, -1, 1).jitter(0.02, 2, 3);
  closed(w, 'deformed');
  const a = Poly.box(0.5, 0.5, 0.5).array(4, new THREE.Vector3(1, 0, 0)); assert.equal(a.F.length, 24); assert.ok(Math.abs(a.bounds().max.x - 3.25) < 1e-9);
  const m = Poly.box(1, 1, 1).translate(1, 0, 0).mirror('x'); assert.ok(Math.abs(m.volume() - 2) < 1e-9, 'mirror keeps the copy outward');
  const wd = Poly.box(1, 1, 1).merge(Poly.box(1, 1, 1)).weld(1e-6); assert.equal(new Set(wd.F.flatMap(f => f.v)).size, 8);
});

test('new tools register on Poly and chain with the rest', () => {
  Poly.op('testStretch', (p, k) => p.warp(q => { q.y *= k; }));
  const p = Poly.box(1, 1, 1).testStretch(3).bevel({ width: 0.05, segments: 1 });
  closed(p, 'custom op'); assert.ok(Math.abs(p.bounds().max.y - 1.5) < 1e-9);
  delete Poly.prototype.testStretch;
});

test('bake gives finite normals and uv in metres along the u axis, and placing mirrors winding correctly', () => {
  const b = bake(Poly.box(2, 1, 1, { u: new THREE.Vector3(1, 0, 0) }).bevel({ width: 0.05, segments: 2 }).jitter(0.01, 3, 1));
  assert.ok(b.pos.every(Number.isFinite) && b.nrm.every(Number.isFinite) && b.uv.every(Number.isFinite));
  const us = b.uv.filter((_, i) => i % 2 === 0); assert.ok(Math.max(...us) - Math.min(...us) > 1.9, 'u spans the 2m length');
  const mb = new MB(); Poly.box(1, 1, 1).toMB(mb, { at: new THREE.Matrix4().makeScale(-1, 1, 1) });
  const g = mb.geo(), P = g.attributes.position.array, N = g.attributes.normal.array, I = g.index.array;
  for (let t = 0; t < I.length; t += 3) {
    const v = [0, 1, 2].map(k => new THREE.Vector3(P[I[t + k] * 3], P[I[t + k] * 3 + 1], P[I[t + k] * 3 + 2]));
    const fn = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])), nn = new THREE.Vector3(N[I[t] * 3], N[I[t] * 3 + 1], N[I[t] * 3 + 2]);
    assert.ok(fn.dot(nn) > 0, 'triangles wind toward their normals after a mirroring placement');
  }
});
