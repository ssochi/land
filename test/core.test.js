import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, smooth, clamp } from '../src/core/math.js';
import { fbm, ridged, billow, erodedFbm, vnoise } from '../src/core/noise.js';
import { heapPush, heapPop } from '../src/core/heap.js';

test('mulberry32 is deterministic and uniform-ish in [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  let sum = 0;
  for (let i = 0; i < 10000; i++) { const v = a(); assert.equal(v, b()); assert.ok(v >= 0 && v < 1); sum += v; }
  assert.ok(Math.abs(sum / 10000 - 0.5) < 0.02);
});

test('smooth and clamp', () => {
  assert.equal(smooth(0, 1, -1), 0);
  assert.equal(smooth(0, 1, 2), 1);
  assert.equal(smooth(0, 1, 0.5), 0.5);
  assert.equal(smooth(1, 0, 0.25), smooth(0, 1, 0.75));  // reversed edges fall off
  assert.equal(clamp(5, 0, 1), 1);
});

test('noise functions stay in [0, 1] and depend on seed', () => {
  for (const f of [fbm, ridged, billow, erodedFbm]) {
    for (let i = 0; i < 500; i++) {
      const x = i * 0.37 - 50, y = i * 0.11 + 3, v = f(x, y, 5, 3);
      assert.ok(v >= 0 && v <= 1, `${f.name}(${x}, ${y}) = ${v}`);
    }
    assert.notEqual(f(1.3, 2.7, 4, 1), f(1.3, 2.7, 4, 2));
  }
  assert.equal(vnoise(3, 4), vnoise(3, 4));
});

test('heap pops in ascending key order', () => {
  const h = [], R = mulberry32(7), keys = [];
  for (let i = 0; i < 200; i++) { const k = R(); keys.push(k); heapPush(h, [k, i]); }
  keys.sort((a, b) => a - b);
  for (const k of keys) assert.equal(heapPop(h)[0], k);
  assert.equal(h.length, 0);
});
