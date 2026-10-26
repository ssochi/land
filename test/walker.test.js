// First-person walker physics on small synthetic worlds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generate } from './helpers.js';
import { WALK, createWalker, stepWalker, walkerView } from '../src/app/walker.js';

// advance the walker for `sec` seconds at 60 Hz; `input` may be a function of time for edge-triggered keys
function run(w, input, sec) {
  for (let t = 0; t < sec; t += 1 / 60) stepWalker(w, 1 / 60, typeof input === 'function' ? input(t) : input);
  return w;
}

test('walks and sprints at the configured speeds over flat ground', async () => {
  await generate(() => {});
  const walk = run(createWalker(0, 0), { forward: 1 }, 3), sprint = run(createWalker(0, 0), { forward: 1, sprint: true }, 3);
  assert.ok(Math.abs(walk.z + WALK.walk * 3) < 1, `walked to z=${walk.z}`);         // yaw 0 faces -z
  assert.ok(Math.abs(sprint.z + WALK.sprint * 3) < 1.5, `sprinted to z=${sprint.z}`);
  assert.ok(Math.abs(walk.x) < 1e-6 && walk.grounded);
  const strafe = run(createWalker(0, 0, { yaw: Math.PI / 2 }), { forward: 1 }, 1);  // yaw +90° faces -x
  assert.ok(strafe.x < -3 && Math.abs(strafe.z) < 1e-6, `turned walk ended at ${strafe.x}, ${strafe.z}`);
});

test('jumps to about v²/2g and lands again', async () => {
  await generate(() => {});
  const w = createWalker(0, 0);
  let peak = 0;
  for (let t = 0; t < 1.2; t += 1 / 60) { stepWalker(w, 1 / 60, { jump: t === 0 }); peak = Math.max(peak, w.y); }
  assert.ok(Math.abs(peak - WALK.jump ** 2 / (2 * WALK.gravity)) < 0.08, `peak ${peak}`);
  assert.ok(w.grounded && w.y === 0);
});

test('cliffs stop the walker; a low ledge can be jumped onto', async () => {
  await generate(m => {
    m.terrain.plateau(0, -40, { radius: 20, height: 20, cliff: 3, ledges: 0, warp: 0 });
    m.terrain.plateau(40, -40, { radius: 20, height: 1.1, cliff: 0.05, ledges: 0, warp: 0 });   // a 1.1 m step across one 0.8 m grid cell
  });
  const wall = run(createWalker(0, 0), { forward: 1 }, 6);
  assert.ok(wall.z > -21 && wall.y < 2, `stopped at the foot of the cliff (z=${wall.z}, y=${wall.y})`);
  const blocked = run(createWalker(40, 0), { forward: 1 }, 6);
  assert.ok(blocked.y < 0.1, `cannot walk up a 1.1 m ledge (y=${blocked.y})`);
  const hop = run(createWalker(40, -17.5), t => ({ forward: 1, jump: Math.abs(t - 0.2) < 1e-9 || Math.abs(t - 1 / 60 * 12) < 1e-9 }), 3);
  assert.ok(hop.y > 1, `jumped onto the ledge (y=${hop.y})`);
});

test('flies up and down, and lands when flown into the ground', async () => {
  await generate(() => {});
  const w = createWalker(0, 0);
  stepWalker(w, 1 / 60, { toggleFly: true });
  assert.ok(w.flying);
  run(w, { up: true }, 1.5);
  assert.ok(w.y > 6, `climbed to ${w.y}`);
  run(w, { forward: 1, sprint: true }, 2);
  assert.ok(w.z < -40, `fast flight reached z=${w.z}`);
  run(w, { down: true }, 4);
  assert.ok(!w.flying && w.grounded && w.y === 0, 'landed');
});

test('collides with trees and ruin walls', async () => {
  await generate(m => {
    m.place('rock.boulder', 0, -10, { scale: 1.5 });
    m.place('ruin.wall', 20, -10, { rotation: 0, variant: 0 });   // wall runs along x
  });
  const rock = run(createWalker(0, 0), { forward: 1 }, 4);
  assert.ok(rock.z > -10 + 1.2 * 1.5, `stopped in front of the boulder (z=${rock.z})`);
  const wall = run(createWalker(20, 0), { forward: 1 }, 4);
  assert.ok(wall.z > -10 + 0.6, `stopped in front of the wall (z=${wall.z})`);
  const end = run(createWalker(21.5, 0), { forward: 1 }, 4);
  assert.ok(end.z > -10 + 0.6, `wall is solid away from its centre too (z=${end.z})`);
});

test('swims in deep water with the eye just above the surface', async () => {
  let level;
  await generate(m => { m.terrain.hill(0, -30, { radius: 25, height: -6, shape: 'smooth' }); level = m.water.lake(0, -30, { fill: 3 }).level; });
  const w = run(createWalker(0, 0), { forward: 1 }, 8);
  assert.ok(w.swimming, 'swimming');
  const eye = walkerView(w).y;
  assert.ok(eye > level && eye < level + 0.6, `eye ${eye} vs water ${level}`);
});
