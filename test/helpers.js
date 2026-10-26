// Run a scene script through the world generator in Node (no browser, no WebGL).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { newSession, resetWorld, runScript, settleWater, terrainSummary } from '../src/runtime/generate.js';
import { distributeGrass } from '../src/objects/grass.js';
import { INST } from '../src/objects/placement.js';

export const SCENE_PATH = fileURLToPath(new URL('../scene.js', import.meta.url));

// load a scene file the way index.html does: it calls the global defineScene(fn)
export function loadScene(path = SCENE_PATH) {
  let fn = null;
  globalThis.defineScene = f => { fn = f; };
  vm.runInThisContext(readFileSync(path, 'utf8'), { filename: path });
  delete globalThis.defineScene;
  return fn;
}

// generate a world from fn(m); grassDensity mirrors the editor's desktop setting
export async function generate(fn, { grassDensity = 0.6 } = {}) {
  const session = newSession(), report = session.report;
  resetWorld();
  await runScript(fn, session);
  settleWater(report);
  const counts = {};
  for (const key in INST) { const kind = key.split('|')[0]; counts[kind] = (counts[kind] || 0) + INST[key].length; }
  counts.grassBlades = distributeGrass(grassDensity).total;
  report.counts = counts;
  report.terrain = terrainSummary();
  return session;
}
