// Behaviour of individual scene ops on small synthetic worlds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from './helpers.js';
import { WATERS } from '../src/water/water.js';

test('plateau raises a flat top behind steep walls', async () => {
  let top, wall, outside;
  await generate(m => {
    m.terrain.plateau(0, 0, { radius: 30, height: 20, cliff: 5, ledges: 0, warp: 0 });
    top = m.heightAt(0, 0); outside = m.heightAt(60, 0); wall = m.slopeAt(32.5, 0);
  });
  assert.ok(Math.abs(top - 20) < 0.01, `top ${top}`);
  assert.ok(Math.abs(outside) < 0.01, `outside ${outside}`);
  assert.ok(wall > 0.6, `wall slope ${wall}`);
});

test('path wears a track that placement avoids, and levels the ground across it', async () => {
  let r, across;
  const { report } = await generate(m => {
    m.terrain.noise({ amp: 6, scale: 0.03, seed: 3 });
    m.path([[-40, 0], [40, 0]], { width: 4, flatten: 1 });
    across = Math.abs(m.heightAt(10, -1.5) - m.heightAt(10, 1.5));
    r = m.scatter('bush', { count: 200, area: m.rect(-40, -6, 40, 6), minSpacing: 0.5, seed: 1 });
  });
  assert.deepEqual(report.errors, []);
  assert.ok(across < 0.25, `cross-slope ${across}`);
  assert.ok(r.rejected.path > 0, 'path rejects counted');
  assert.ok(r.positions.every(([, z]) => Math.abs(z) > 1.2), 'nothing placed on the track');
});

test('canopy rule places understory only in the shade of earlier trees', async () => {
  let r;
  await generate(m => {
    m.place('tree.oak', 0, 0, { scale: 1.2 });
    r = m.scatter('fern', { count: 40, area: m.circle(0, 0, 40), rules: { canopy: [0.3, 1] }, seed: 2 });
  });
  assert.ok(r.placed > 10, `placed ${r.placed}`);
  assert.ok(r.positions.every(([x, z]) => Math.hypot(x, z) < 10), 'all ferns under the canopy');
});

test('a river flowing into a lake meets the lake surface instead of floating above it', async () => {
  let lake;
  await generate(m => {
    m.terrain.hill(0, 0, { radius: 40, height: -8, shape: 'smooth' });
    m.water.river([[90, 0], [60, 0], [30, 0], [10, 0]], { width: 4 });
    lake = m.water.lake(0, 0);
    m.waterAt(0, 0);  // settle water
  });
  const rv = WATERS.rivers[0];
  assert.ok(rv.end < rv.pts.length, 'ribbon stops where it enters the lake');
  assert.ok(rv.surf[rv.end - 1] <= lake.level, `surface ${rv.surf[rv.end - 1]} vs lake ${lake.level}`);
  for (let i = 1; i < rv.end; i++) assert.ok(rv.surf[i] <= rv.surf[i - 1] + 1e-4, 'surface never rises downstream');
});

test('grass field: dense in the open, empty in water, on paths and under rocks', async () => {
  const { distributeGrass } = await import('../src/objects/grass.js');
  const { DETAIL } = await import('../src/world/grid.js');
  await generate(m => {
    m.terrain.hill(30, 0, { radius: 14, height: -4, shape: 'smooth' });
    m.water.lake(30, 0, { fill: 2 });
    m.path([[-40, -20], [-40, 20]], { width: 3 });
    m.place('rock.boulder', 0, 20, { scale: 2 });
    m.grass({ center: [0, 0], radius: 60 });
  });
  const { field, total } = distributeGrass(0.6), n = DETAIL.n;
  const at = (x, z) => { const i = Math.round((x - DETAIL.min) / DETAIL.step), j = Math.round((z - DETAIL.min) / DETAIL.step); return field[(j * n + i) * 4 + 1]; };
  assert.ok(total > 50000, `expected blade count ${total}`);
  assert.ok(at(0, 0) > 0.4, `open meadow density ${at(0, 0)}`);
  assert.equal(at(30, 0), 0, 'no grass in the lake');
  assert.equal(at(-40, 0), 0, 'no grass on the path');
  assert.equal(at(0, 20), 0, 'no grass under the boulder');
  assert.equal(at(0, 75), 0, 'no grass outside the patch');
});

test('objects on cliffs sit on the drawn (crag-displaced) rock, not the smooth height field', async () => {
  const { groundAt } = await import('../src/terrain/crag.js');
  const { INST } = await import('../src/objects/placement.js');
  let cliff = null;
  await generate(m => {
    m.terrain.plateau(0, 0, { radius: 30, height: 25, cliff: 4, ledges: 0, warp: 0 });
    m.place('rock.boulder', 31.5, 3, { scale: 1 });
    cliff = [m.heightAt(31.5, 3)];
  });
  const g = groundAt(31.5, 3), o = Object.values(INST).flat()[0];
  assert.ok(Math.abs(g - cliff[0]) > 0.05, `crag moves the cliff surface (${g} vs ${cliff[0]})`);
  assert.ok(Math.abs(o.y + 0.25 - g) < 1e-6, `boulder rests on the drawn surface (${o.y})`);
  assert.equal(groundAt(0, 0), 25, 'flat ground is unchanged');
});
