// End-to-end world generation in Node. The expected numbers are what the browser editor reports for
// the example scene; a change here means the generated world changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScene, generate } from './helpers.js';

test('example scene builds cleanly and reproduces the reference world', async () => {
  const { report, name, cameras } = await generate(loadScene());
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings, []);
  assert.equal(name, '镜湖原野');
  assert.equal(report.ops.length, 48);
  assert.equal(report.ops[0].line, 7, 'ops carry their scene.js line');
  assert.deepEqual(cameras.map(c => c.name), ['hero', 'field', 'lake', 'river', 'flowers', 'overview', 'topdown']);
  assert.deepEqual(report.water, [{ type: 'lake', level: -3.77 }, { type: 'river', length: 93, from: 18.1, to: -11.4 }]);
  assert.deepEqual(report.terrain, { detail: { min: -16.3, max: 45.8, extent: '±160m @0.8m' }, far: { min: -17.7, max: 452.2, extent: '±1100m @3.7m' } });
  assert.deepEqual(report.counts, {
    'tree.oak': 23, 'tree.big': 1, 'tree.birch': 16, 'tree.pine': 9150, bush: 70, 'rock.boulder': 24, 'rock.pebble': 163, 'rock.cliff': 45,
    'flower.daisy': 6500, 'flower.buttercup': 4200, 'flower.poppy': 800, 'flower.lupine': 1600, grassBlades: 304856
  });
});

test('errors stop the script and point at the failing line', async () => {
  const { report } = await generate(m => {
    m.terrain.noise({ amp: 5 });
    m.terrain.peak(0, 0, { height: 10 });  // radius missing
    m.terrain.noise({ amp: 5 });
  });
  assert.equal(report.ops.length, 2);
  assert.equal(report.ops[1].status, 'err');
  assert.equal(report.errors.length, 1);
  assert.match(report.errors[0], /t\.peak: 缺少必填参数 "radius"/);
});

test('calls return live results that later calls can use', async () => {
  const { report } = await generate(m => {
    m.terrain.lower(0, 0, 40, 8);
    const lake = m.water.lake(0, 0);
    m.log(lake.level < m.heightAt(60, 0) ? 'below rim' : 'above rim');
    assert.equal(m.waterAt(0, 0).dist, 0);
    const r = m.scatter('rock.boulder', { count: 5, area: m.circle(0, 0, 30) });
    assert.ok(r.positions.every(([x, z]) => m.waterAt(x, z).depth === 0), 'nothing placed under water');
  });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.logs, ['below rim']);
});
