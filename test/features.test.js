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
