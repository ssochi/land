// The `m` object scene.js receives. Every call is validated against the schema, executed immediately,
// timed, and logged as a report row tagged with its scene.js line number.
import { mulberry32 } from '../core/math.js';
import { fbm } from '../core/noise.js';
import { DETAIL, FAR, heightAt, slopeAt, normalAt } from '../world/grid.js';
import { flowAt, moistureAt, sunAt } from '../world/fields.js';
import { world, terrainChanged } from '../world/state.js';
import { TERRAIN, apply as applyBrush } from '../terrain/index.js';
import { WATERS, currentB, ensureWater, waterInfo } from '../water/water.js';
import { carveRiver, riverHandle } from '../water/river.js';
import { fillLake } from '../water/lake.js';
import { carvePath } from '../terrain/path.js';
import { KINDS } from '../objects/kinds.js';
import { opScatter, opPlace } from '../objects/placement.js';
import { GRASS_OPS } from '../objects/grass.js';
import { buildVillage, buildHouse, fenceAlong, plantField } from '../objects/village.js';
import { CALL, validate } from './schema.js';

export class SceneError extends Error {}

// first frame of the scene script in a stack trace. The page loads it as scene.js (or tags it via sourceURL);
// a map from the start screen is loaded from its own file (scenes/village.js…), set with setSceneFile. The
// whole relative path is matched, so an engine module with the same base name (src/objects/village.js) is not.
let sceneRe = /scene\.js:(\d+):\d+/;
export function setSceneFile(file) { sceneRe = new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+):\\d+'); }
export const sceneLine = st => { const m = sceneRe.exec(st || ''); return m ? +m[1] : null; };

// session: { report, cameras, env, name } — mutated by the calls
export function makeAPI(session) {
  const report = session.report;
  function call(op, params, fn) {
    const r = { i: report.ops.length, op, call: CALL[op] || op, status: 'ok', note: '', ms: 0, line: sceneLine(new Error().stack) };
    report.ops.push(r);
    const v = validate(Object.assign({ op }, params));
    if (v.error) { r.status = 'err'; r.note = v.error; throw new SceneError(`${r.call}: ${v.error}`); }
    const t0 = performance.now();
    let out;
    try { out = fn(v.p, r); }
    catch (e) { if (!(e instanceof SceneError)) { r.status = 'err'; r.note = String(e && e.message || e); } throw e; }
    if (r.status === 'err') throw new SceneError(`${r.call}: ${r.note}`);
    if (v.warn) { r.status = 'warn'; r.note = v.warn + (r.note ? ' · ' + r.note : ''); }
    r.ms = Math.round(performance.now() - t0);
    if (r.status === 'warn') report.warnings.push(`${r.line ? '第 ' + r.line + ' 行 ' : ''}${r.call}: ${r.note}`);
    return out;
  }
  // terrain edits after lakes or objects exist do not propagate to them
  const late = r => {
    const w = [];
    if (WATERS.lakes.length) w.push('在建湖之后改地形，湖面不会跟随');
    if (world.objectsTouched) w.push('在放置物件之后改地形，已放下的物件不会重新贴地');
    if (w.length) { r.status = 'warn'; r.note = w.join('；'); }
  };
  const add = (r, msg) => { r.note = r.note ? r.note + ' · ' + msg : msg; };
  const terr = (op, params, after) => call(op, params, (p, r) => { late(r); TERRAIN[op](p); terrainChanged(); return after ? after(p, r) : undefined; });
  const t = {
    noise: (o = {}) => terr('noise', o),
    mountains: (o = {}) => terr('mountains', o),
    peak: (x, z, o = {}) => terr('peak', Object.assign({ x, z }, o)),
    hill: (x, z, o = {}) => terr('hill', Object.assign({ x, z }, o)),
    raise: (x, z, radius, height, shape) => terr('hill', { x, z, radius, height, shape: shape || 'gauss' }),
    lower: (x, z, radius, depth, shape) => terr('hill', { x, z, radius, height: -Math.abs(depth), shape: shape || 'smooth' }),
    flatten: (x, z, o = {}) => terr('flatten', Object.assign({ x, z }, o)),
    plateau: (x, z, o = {}) => terr('plateau', Object.assign({ x, z }, o)),
    terrace: (x, z, o = {}) => terr('terrace', Object.assign({ x, z }, o)),
    ledges: (x, z, o = {}) => terr('ledges', Object.assign({ x, z }, o)),
    smooth: (x, z, o = {}) => terr('smooth', Object.assign({ x, z }, o)),
    erode: (o = {}) => terr('erode', o, (p, r) => add(r, `${p.droplets} 滴 · ${p.grid}`)),
    thermal: (o = {}) => terr('thermal', o, (p, r) => add(r, `${p.iterations} 轮 · 安息角 ${p.talus}°`)),
    apply: (fn, o = {}) => call('apply', o, (p, r) => {
      if (typeof fn !== 'function') { r.status = 'err'; r.note = '第一个参数应为函数 (x, z, h) => 新高度'; return; }
      late(r);
      const bad = applyBrush(fn, p.grid === 'detail' ? [DETAIL] : p.grid === 'far' ? [FAR] : [DETAIL, FAR]);
      terrainChanged();
      if (bad) { r.status = 'warn'; add(r, `${bad} 个格点返回了非数字，保留原高度`); }
    })
  };
  const water = {
    river: (path, o = {}) => call('river', Object.assign({ path }, o), (p, r) => {
      late(r);
      const rv = carveRiver(p); world.terrainVer++; world.waterTouched = true; world.waterDirty = true;
      add(r, `长 ${Math.round(rv.len[rv.len.length - 1])}m · 落差 ${(rv.bed[0] - rv.bed[rv.bed.length - 1]).toFixed(1)}m`);
      return riverHandle(rv, ensureWater);
    }),
    lake: (x, z, o = {}) => call('lake', Object.assign({ x, z }, o), (p, r) => {
      world.waterTouched = true;
      fillLake(p, currentB(), r);
      world.waterDirty = true;
      return r.data ? Object.assign({ x, z }, r.data) : null;
    }),
    at: (x, z) => { ensureWater(); return waterInfo(x, z); }
  };
  const rand = (seed = 1) => { const f = mulberry32(seed * 7919 + 17); f.range = (a, b) => a + f() * (b - a); f.pick = arr => arr[Math.floor(f() * arr.length)]; f.chance = q => f() < q; return f; };
  return {
    terrain: t, water,
    path: (points, o = {}) => call('path', Object.assign({ path: points }, o), (p, r) => {
      late(r);
      const out = carvePath(p); terrainChanged();
      add(r, `长 ${out.length}m · 宽 ${p.width}m`);
      return out;
    }),
    scatter: (kind, o = {}) => call('scatter', Object.assign({ kind }, o), (p, r) => { ensureWater(); world.objectsTouched = true; return opScatter(p, r); }),
    place: (kind, x, z, o = {}) => call('place', Object.assign({ kind, x, z }, o), (p, r) => { ensureWater(); world.objectsTouched = true; return opPlace(p, r); }),
    grass: (o = {}) => call('grass', o, (p, r) => { GRASS_OPS.push({ p, rep: r }); r.note = '脚本结束后统一生成'; }),
    village: (o = {}) => call('village', o, (p, r) => { late(r); ensureWater(); world.objectsTouched = true; return buildVillage(p, r); }),
    building: (x, z, o = {}) => call('building', Object.assign({ x, z }, o), (p, r) => {
      if (p.flatten) late(r); ensureWater(); world.objectsTouched = true;
      const params = {}; for (const k of ['style', 'front', 'width', 'depth', 'floors', 'roof', 'roofShape', 'pitch', 'chimney', 'tower', 'towerShape', 'wings', 'dormers', 'pergola', 'deck', 'lean', 'sign', 'ivy', 'banner', 'porch', 'tint']) if (p[k] != null) params[k] = p[k];
      const h = buildHouse(p.x, p.z, p.rotation, params, p.seed + 1, p.flatten);
      add(r, `${h.style} · ${h.width}×${h.depth}m · ${h.floors} 层`);
      return h;
    }),
    fence: (path, o = {}) => call('fence', Object.assign({ path }, o), (p, r) => { ensureWater(); world.objectsTouched = true; const n = fenceAlong(p.path, p.style, p.gates || []); add(r, `${n} 段`); return { spans: n }; }),
    field: (o = {}) => call('field', o, (p, r) => {
      ensureWater(); world.objectsTouched = true;
      const [x, z] = p.center, [w, d] = p.size, n = plantField(x, z, w, d, p.rotation, p.crop, p.seed);
      if (p.fence) { const c = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => { const lx = a * (w / 2 + 0.8), lz = b * (d / 2 + 0.8); return [x + lx * Math.cos(p.rotation) + lz * Math.sin(p.rotation), z - lx * Math.sin(p.rotation) + lz * Math.cos(p.rotation)]; }); fenceAlong(c, p.fence, [2]); }
      add(r, `${n} 株${p.crop === 'cabbage' ? '卷心菜' : '麦子'}`);
      return { plants: n };
    }),
    env: (o = {}) => call('env', o, () => { Object.assign(session.env, o); }),
    camera: (name, o = {}) => call('camera', Object.assign({ name }, o), p => { const cams = session.cameras, i = cams.findIndex(c => c.name === p.name); if (i >= 0) cams[i] = p; else cams.push(p); }),
    name: s => { session.name = String(s); },
    log: (...a) => { report.logs.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); },
    heightAt: (x, z) => heightAt(x, z),
    slopeAt: (x, z) => slopeAt(x, z),
    normalAt: (x, z) => { const n = normalAt(x, z); return [n.x, n.y, n.z]; },
    waterAt: (x, z) => { ensureWater(); return waterInfo(x, z); },
    flowAt: (x, z) => +flowAt(x, z).toFixed(3),
    moistureAt: (x, z) => { ensureWater(); return +moistureAt(x, z).toFixed(3); },
    sunAt: (x, z) => +sunAt(x, z).toFixed(3),
    noise: (x, z, o = {}) => fbm(x * (o.scale || 0.05), z * (o.scale || 0.05), o.octaves || 3, o.seed || 0),
    random: rand,
    circle: (x, z, radius) => ({ type: 'circle', center: [x, z], radius }),
    ring: (x, z, inner, outer) => ({ type: 'ring', center: [x, z], inner, outer }),
    rect: (x0, z0, x1, z1) => ({ type: 'rect', min: [Math.min(x0, x1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(z0, z1)] }),
    polygon: pts => ({ type: 'polygon', points: pts }),
    kinds: Object.keys(KINDS),
    bounds: { detail: [DETAIL.min, DETAIL.min + DETAIL.size], far: [FAR.min, FAR.min + FAR.size] }
  };
}
