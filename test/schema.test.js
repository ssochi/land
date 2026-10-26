import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA, SIGS, CALL, validate } from '../src/runtime/schema.js';

test('every op has a signature and a call name', () => {
  for (const op in SCHEMA) { assert.ok(SIGS[op], `SIGS.${op}`); assert.ok(CALL[op], `CALL.${op}`); }
});

test('defaults are filled and deep-copied', () => {
  const a = validate({ op: 'scatter', kind: 'bush' }), b = validate({ op: 'scatter', kind: 'bush' });
  assert.equal(a.p.count, 100);
  assert.deepEqual(a.p.scale, [0.85, 1.2]);
  a.p.scale[0] = 9;
  assert.equal(b.p.scale[0], 0.85);
});

test('missing, mistyped and unknown params', () => {
  assert.match(validate({ op: 'peak', x: 0, z: 0, height: 10 }).error, /radius/);
  assert.match(validate({ op: 'noise', amp: '3' }).error, /amp/);
  assert.match(validate({ op: 'river', path: [[0, 0]] }).error, /路径/);
  assert.match(validate({ op: 'grass', center: [1] }).error, /center/);
  assert.match(validate({ op: 'nope' }).error, /未知操作/);
  assert.match(validate({ op: 'noise', amp: 3, ampp: 4 }).warn, /ampp/);
});
