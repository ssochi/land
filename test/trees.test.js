// Tree builders: lobed broadleaf crowns, the colonization skeleton, pines and bushes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mulberry32 } from '../src/core/math.js';
import { makeOak, makeBirch, makePine, makeBush } from '../src/objects/trees.js';
import { crownLobes } from '../src/objects/crown.js';
import { colonize } from '../src/objects/colonize.js';

const MAKERS = { oak: (s, l) => makeOak(s, false, l), big: (s, l) => makeOak(s, true, l), birch: makeBirch, pine: makePine };

test('every tree kind builds finite, deterministic geometry and sheds triangles with each LOD', () => {
  for (const [kind, make] of Object.entries(MAKERS)) {
    const tris = [0, 1, 2].map(lod => {
      const g = make(4242, lod), p = g.attributes.position.array, n = g.attributes.normal.array;
      assert.ok(p.every(Number.isFinite) && n.every(Number.isFinite), `${kind} lod ${lod}: finite`);
      return g.index.count / 3;
    });
    assert.ok(tris[0] > tris[1] && tris[1] > tris[2], `${kind}: ${tris.join(' > ')}`);
    // the same tree at every level: the foliage reaches as high and as wide (a level with other lobes or tiers,
    // or cards poking out farther, would jump). Measured on percentiles of leaf-card centres plus their leafy middle
    // (the corners of the far levels' enlarged cards are mostly transparent) or, for pines, of the needle skirts
    const reach = l => {
      const g = make(4242, l), p = g.attributes.position.array, c = g.attributes.aCard.array, ys = [], rs = [];
      if (kind === 'pine') { for (let i = 0; i < c.length; i++) if (c[i] === 0 && p[i * 3 + 1] > 3) { ys.push(p[i * 3 + 1]); rs.push(Math.hypot(p[i * 3], p[i * 3 + 2])); } }
      else for (let i = 0; i + 3 < c.length; i++) if (c[i] === 1 && c[i + 3] === 1) {   // cards are four corners in a row
        const x = (p[i * 3] + p[i * 3 + 6]) / 2, y = (p[i * 3 + 1] + p[i * 3 + 7]) / 2, z = (p[i * 3 + 2] + p[i * 3 + 8]) / 2;
        const h = Math.hypot(p[i * 3 + 3] - p[i * 3], p[i * 3 + 4] - p[i * 3 + 1], p[i * 3 + 5] - p[i * 3 + 2]) * 0.35;   // the card's leafy middle
        ys.push(y + h); rs.push(Math.hypot(x, z) + h); i += 3;
      }
      const q = (a, f) => a.sort((x, y) => x - y)[Math.floor(a.length * f)];
      return { top: q(ys, 0.97), r: q(rs, 0.9) };
    };
    const r0 = reach(0);
    for (const l of [1, 2]) { const r = reach(l); assert.ok(Math.abs(r.top - r0.top) < 0.08 * r0.top && Math.abs(r.r - r0.r) < 0.12 * r0.r, `${kind} lod ${l}: top ${r.top.toFixed(2)} vs ${r0.top.toFixed(2)}, reach ${r.r.toFixed(2)} vs ${r0.r.toFixed(2)}`); }
    assert.deepEqual(Array.from(make(4242, 0).attributes.position.array.slice(0, 300)), Array.from(make(4242, 0).attributes.position.array.slice(0, 300)), `${kind}: same seed, same tree`);
  }
  const b = makeBush(3, 0);
  assert.ok(b.attributes.position.array.every(Number.isFinite));
});

test('crown lobes stay in the crown, overlap by at most about half, and leave the underside open', () => {
  const R = mulberry32(7), C = new THREE.Vector3(0, 6, 0), rx = 3, ry = 2.2;
  const lobes = crownLobes(R, C, rx, ry, 12, 1.2, 2.1);
  assert.ok(lobes.length >= 8, `${lobes.length} lobes`);
  for (const [i, L] of lobes.entries()) {
    const e = ((L.c.x - C.x) / rx) ** 2 + ((L.c.y - C.y) / ry) ** 2 + ((L.c.z - C.z) / rx) ** 2;
    assert.ok(e <= 1.0001, `lobe ${i} centre inside the envelope`);
    assert.ok(L.c.y >= C.y - ry * 0.25, `lobe ${i} not far below the equator`);
    for (const M of lobes.slice(i + 1)) assert.ok(L.c.distanceTo(M.c) >= (L.r + M.r) * 0.5 - 1e-9, 'lobes overlap by at most half');
  }
});

test('leaf cards are shaded as the crown: their normals point out of it, and the top faces the sky', () => {
  const g = makeOak(99, false, 0), p = g.attributes.position.array, n = g.attributes.normal.array, card = g.attributes.aCard.array;
  let cy = 0, cnt = 0, top = -1e9;
  for (let i = 0; i < card.length; i++) if (card[i] > 0.5) { cy += p[i * 3 + 1]; cnt++; top = Math.max(top, p[i * 3 + 1]); }
  cy /= cnt;
  let out = 0, upTop = 0, nTop = 0;
  for (let i = 0; i < card.length; i++) {
    if (card[i] < 0.5) continue;
    const d = new THREE.Vector3(p[i * 3], p[i * 3 + 1] - cy, p[i * 3 + 2]).normalize();
    out += d.dot(new THREE.Vector3(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]));
    if (p[i * 3 + 1] > top - 1) { upTop += n[i * 3 + 1]; nTop++; }
  }
  assert.ok(cnt > 1000, `${cnt} card vertices`);
  assert.ok(out / cnt > 0.6, `normals face out of the crown: mean dot ${(out / cnt).toFixed(2)}`);
  assert.ok(upTop / nTop > 0.7, `cards at the top face up: mean n.y ${(upTop / nTop).toFixed(2)}`);
});

test('colonization grows toward the attraction points and sizes branches by the pipe model', () => {
  const R = mulberry32(1), pts = [new THREE.Vector3(3, 6, 0), new THREE.Vector3(-3, 6, 0), new THREE.Vector3(0, 6, 3)];
  const trunk = [0, 1, 2, 3].map(k => ({ p: new THREE.Vector3(0, k, 0), parent: k - 1 }));
  let i = 0;
  const nodes = colonize(R, { nodes: trunk, count: pts.length, envelope: () => pts[i++ % pts.length], infl: 20, kill: 0.6, seg: 0.4, iters: 100,
    tropism: 0, jitter: 0.2, tipR: 0.02, pipe: 2.5, baseR: 0.4, minR: 0 });   // some jitter, as in the trees: two mirror-image points would cancel their pull on a tip exactly
  for (const a of pts) assert.ok(nodes.some(nd => nd.p.distanceTo(a) < 0.6), `reached ${a.toArray()}`);
  assert.ok(Math.abs(nodes[0].r - 0.4) < 1e-9, 'base radius');
  for (const nd of nodes) if (nd.ch.length > 1) {
    const sum = nd.ch.reduce((s, c) => s + Math.pow(nodes[c].r, 2.5), 0);
    assert.ok(Math.abs(Math.pow(nd.r, 2.5) - sum) < 1e-9, 'r^n = sum of children r^n at every fork');
  }
});
