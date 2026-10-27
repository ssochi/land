// The start screen's map list: every entry points at a scene script that generates without errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { generate, loadScene } from './helpers.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let maps = [];
vm.runInNewContext(readFileSync(ROOT + 'maps.js', 'utf8'), { defineMaps: list => { maps = list; } });

test('maps.js lists unique ids, existing scene files and thumbnails', () => {
  assert.ok(maps.length >= 2, `${maps.length} maps`);
  assert.equal(new Set(maps.map(m => m.id)).size, maps.length, 'unique ids');
  for (const m of maps) {
    assert.match(m.id, /^[a-z0-9-]+$/, `id ${m.id} works in ?map=`);
    assert.ok(m.title && m.desc, `${m.id}: title and description`);
    assert.ok(existsSync(ROOT + m.file), `${m.id}: ${m.file}`);
    assert.ok(!m.thumb || existsSync(ROOT + m.thumb), `${m.id}: ${m.thumb} (node tools/thumbs.mjs ${m.id})`);
  }
});

for (const m of maps) test(`map ${m.id} (${m.file}) generates without errors and has its camera`, async () => {
  const { report, cameras } = await generate(loadScene(ROOT + m.file), { grassDensity: 0.05 });
  assert.deepEqual(report.errors, []);
  if (m.camera) assert.ok(cameras.some(c => c.name === m.camera), `camera ${m.camera}`);
});
