// World generation without rendering: reset all world state, run a scene script, settle water and grass.
// Used by the editor (src/app/editor.js) and runnable headless in Node (see test/).
import { resetGrids, DETAIL, FAR } from '../world/grid.js';
import { resetFields } from '../world/fields.js';
import { world, resetWorldState } from '../world/state.js';
import { WATERS, resetWater, currentB, ensureWater } from '../water/water.js';
import { resetPlacement } from '../objects/placement.js';
import { resetGrass } from '../objects/grass.js';
import { makeAPI, sceneLine } from './api.js';

export function newSession() {
  return {
    name: '未命名', cameras: [], env: {},
    report: { ok: true, name: '', ops: [], warnings: [], errors: [], logs: [], counts: {}, water: [], timing: {} }
  };
}

export function resetWorld() {
  resetGrids(); resetFields(); resetWater(); resetPlacement(); resetGrass(); resetWorldState();
}

// runs fn(m); a thrown error ends the script and is reported with its scene.js line
export async function runScript(fn, session) {
  const report = session.report, ts = performance.now();
  try { await fn(makeAPI(session)); }
  catch (e) {
    const line = sceneLine(e && e.stack), last = report.ops[report.ops.length - 1];
    const where = line ? `第 ${line} 行` : (last && last.line ? `第 ${last.line} 行附近` : '');
    report.errors.push(`scene.js ${where}中断：${e && e.message || e}`);
  }
  report.timing.script = Math.round(performance.now() - ts);
}

// bring water fields up to date after the script and list water bodies in the report
export function settleWater(report) {
  world.waterDirty = world.waterDirty || world.waterTouched; ensureWater(); currentB();
  WATERS.lakes.forEach(L => report.water.push({ type: 'lake', level: +L.level.toFixed(2) }));
  WATERS.rivers.forEach(rv => report.water.push({ type: 'river', length: Math.round(rv.len[rv.len.length - 1]), from: +rv.surf[0].toFixed(1), to: +rv.surf[rv.surf.length - 1].toFixed(1) }));
}

export function terrainSummary() {
  const B = currentB();
  let mn = 1e9, mx = -1e9; for (const v of FAR.h) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  let dmn = 1e9, dmx = -1e9; for (const v of B) { dmn = Math.min(dmn, v); dmx = Math.max(dmx, v); }
  return { detail: { min: +dmn.toFixed(1), max: +dmx.toFixed(1), extent: `±${DETAIL.size / 2}m @${DETAIL.step.toFixed(1)}m` }, far: { min: +mn.toFixed(1), max: +mx.toFixed(1), extent: `±${FAR.size / 2}m @${FAR.step.toFixed(1)}m` } };
}
