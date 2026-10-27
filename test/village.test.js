// Village generator: house models, lots on slopes, and the m.village layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from './helpers.js';
import * as THREE from 'three';
import { makeHouse, houseParams } from '../src/objects/buildings.js';
import { INST } from '../src/objects/placement.js';
import { KINDS, lodLevels } from '../src/objects/kinds.js';

test('house models: every style and front builds clean geometry, and LOD levels shed detail', () => {
  for (const style of ['hateno', 'stone', 'timber', 'hut']) for (const front of ['eave', 'gable']) {
    const counts = [0, 1, 2].map(lod => {
      const g = makeHouse(11, lod, { style, front, tower: style === 'hateno', banner: true });
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      assert.ok(p.every(Number.isFinite) && n.every(Number.isFinite), `${style}/${front} lod ${lod}: finite`);
      assert.ok(g.userData.colliders.length > 4 && g.userData.door.length === 2, `${style}/${front}: userData`);
      return p.length / 3;
    });
    assert.ok(counts[0] > counts[1] && counts[1] > counts[2], `${style}/${front}: ${counts.join(' > ')}`);
  }
  // hateno houses get a lamp by the door and smoke from the chimney
  const g = makeHouse(5, 0, { style: 'hateno', chimney: true });
  assert.equal(g.userData.lights.length, 1);
  assert.equal(g.userData.smoke.length, 1);
});

// a LOD level that changes the model's outline (a different chimney height, a dropped porch, a bigger crate)
// shows as a jump however well it cross-fades: every level must fill the same box
test('LOD levels of houses and props are the same model: same bounds at every level', () => {
  const bounds = g => { g.computeBoundingBox(); return g.boundingBox; };
  for (const style of ['hateno', 'stone', 'timber', 'hut']) for (const seed of [3, 11, 27]) {
    const P = { style, tower: style === 'hateno', banner: true, porch: style !== 'hateno' }, b0 = bounds(makeHouse(seed, 0, P));
    for (const lod of [1, 2]) {
      const b = bounds(makeHouse(seed, lod, P));
      for (const k of ['min', 'max']) assert.ok(b[k].distanceTo(b0[k]) < 0.08, `${style} #${seed} lod ${lod}: ${k} ${b[k].toArray().map(v => v.toFixed(2))} vs ${b0[k].toArray().map(v => v.toFixed(2))}`);
    }
  }
  for (const kind of Object.keys(KINDS).filter(k => KINDS[k].mat === 'building' && !k.startsWith('house') && lodLevels(k) > 1)) {
    const b0 = bounds(KINDS[kind].make(1001, 0)), size = b0.getSize(new THREE.Vector3()).length();
    for (let lod = 1; lod < lodLevels(kind); lod++) {
      const b = bounds(KINDS[kind].make(1001, lod));
      assert.ok(b.min.distanceTo(b0.min) < 0.04 * size && b.max.distanceTo(b0.max) < 0.04 * size, `${kind} lod ${lod}: bounds match`);
    }
  }
});

test('house parameters: pinned choices survive a different seed, so plan and model agree', () => {
  const P = houseParams(42, { style: 'hateno' }), { lot, door, ...keep } = P;
  const Q = houseParams(9001, keep);
  for (const k of ['style', 'front', 'width', 'depth', 'floors', 'roof', 'chimney', 'tower', 'towerSide', 'chimSide', 'banner', 'quoins', 'wash', 'doorA']) assert.deepEqual(Q[k], P[k], k);
  assert.deepEqual(Q.door, door);
});

test('windows are set back in holes cut through the wall near by, and sit flush on the far model', () => {
  const P = { style: 'hateno', front: 'eave', tower: false, chimney: false, width: 8, depth: 6 };
  const glassDepth = lod => {
    const g = makeHouse(7, lod, P), p = g.attributes.position.array, k = g.attributes.aCard.array;
    let inset = 0, n = 0;
    for (let i = 0; i < k.length; i++) if (k[i] === 6 && Math.abs(p[i * 3 + 2]) > 2.5) { inset = Math.max(inset, 3 - Math.abs(p[i * 3 + 2])); n++; }   // front and back walls at z = ±3
    return { inset, n };
  };
  const near = glassDepth(0), far = glassDepth(2);
  assert.ok(near.n > 0 && near.inset > 0.2, `near: glass ${near.inset.toFixed(2)}m behind the wall`);
  assert.ok(far.inset < 0.01, `far: glass flush (${far.inset.toFixed(3)})`);
  // the stucco carries the height above the wall's foot in v (the shader wears the plaster off there)
  const g = makeHouse(7, 0, P), uv = g.attributes.aUV.array, k = g.attributes.aCard.array, p = g.attributes.position.array;
  let ok = true;
  for (let i = 0; i < k.length; i++) if (k[i] === 8 && Math.abs(p[i * 3 + 2]) > 2.99) ok = ok && Math.abs(uv[i * 2 + 1] - (p[i * 3 + 1] - 0.5)) < 1e-4;
  assert.ok(ok, 'wall v = height above the foot');
});

test('flatten cut mode only lowers ground', async () => {
  let up, down, mid;
  await generate(m => {
    m.terrain.apply((x) => x * 0.2);
    m.terrain.flatten(0, 0, { radius: 10, height: 0, falloff: 4, mode: 'cut' });
    up = m.heightAt(5, 0); down = m.heightAt(-5, 0); mid = m.heightAt(0, 0);
  });
  assert.ok(Math.abs(up) < 0.01, `uphill cut to the target: ${up}`);
  assert.ok(Math.abs(down + 1) < 0.01, `downhill left alone: ${down}`);
  assert.ok(Math.abs(mid) < 0.01, `centre: ${mid}`);
});

test('a house on a slope is cut into the hill and stands on its base', async () => {
  let h, before, after, door;
  await generate(m => {
    m.terrain.apply((x, z) => z * 0.15);
    before = m.heightAt(0, -3);
    h = m.building(0, 0, { style: 'hateno', front: 'eave', seed: 3 });
    after = m.heightAt(0, -3); door = m.heightAt(h.door[0], h.door[1]);
  });
  // the ground rises toward +z (the door side): the floor sits above the downhill (−z) ground, which is left as it was
  assert.ok(h.floor > before - 0.01, `floor ${h.floor} vs downhill ground ${before}`);
  assert.ok(after <= before + 0.01, 'downhill ground not raised');
  assert.ok(h.floor - door < 1.3, `door within a short flight of the ground (${(h.floor - door).toFixed(2)}m)`);
});

test('m.village lays out a village deterministically: houses off roads and water, apart from each other', async () => {
  const run = async () => {
    let v;
    const { report } = await generate(m => {
      m.terrain.noise({ amp: 4, scale: 0.01, seed: 2 });
      v = m.village({ center: [0, 0], radius: 50, houses: 12, seed: 7 });
    }, { grassDensity: 0.05 });
    return { v, report, counts: Object.fromEntries(Object.entries(INST).map(([k, a]) => [k, a.length])) };
  };
  const a = await run(), b = await run();
  assert.deepEqual(a.report.errors, []);
  assert.deepEqual(a.v.houses.map(h => [h.x, h.z]), b.v.houses.map(h => [h.x, h.z]), 'same seed, same village');
  assert.ok(a.v.houses.length >= 9, `houses ${a.v.houses.length}/12`);
  assert.ok(a.v.lanterns > 0 && a.v.roads.length >= 2, 'roads and lanterns');
  const hs = a.v.houses;
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) {
    const d = Math.hypot(hs[i].x - hs[j].x, hs[i].z - hs[j].z), need = (Math.min(hs[i].width, hs[i].depth) + Math.min(hs[j].width, hs[j].depth)) / 2;
    assert.ok(d > need, `houses ${i} and ${j} overlap (${d.toFixed(1)} < ${need.toFixed(1)})`);
  }
  for (const h of hs) {
    assert.ok(Array.isArray(h.street) && Math.hypot(h.door[0] - h.street[0], h.door[1] - h.street[1]) < 12, 'door faces a nearby street');
  }
  const placed = Object.entries(a.counts).filter(([k]) => k.startsWith('house|')).reduce((s, [, n]) => s + n, 0);
  assert.equal(placed, hs.length, 'one model per house record');
});
