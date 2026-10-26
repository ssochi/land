// Object placement: scatter/place ops, rule checks, and the instance list the renderer turns into meshes.
import { mulberry32 } from '../core/math.js';
import { fbm } from '../core/noise.js';
import { DETAIL, FAR, heightAt, slopeAt, stampGrid } from '../world/grid.js';
import { OCC, FOREST_D, FOREST_F, waterLevelAt, waterDistAt, moistureAt, sunAt, pathAt } from '../world/fields.js';
import { KINDS, kindGeo } from './kinds.js';

export const INST = {};        // 'kind|variant|lo' -> [{ x, y, z, s, r, tilt }]
const OBST = new Map();        // spatial hash (4m cells) -> [{ x, z, r }]: trunks and rocks that block later placements

export function resetPlacement() { for (const k in INST) delete INST[k]; OBST.clear(); }

const hkey = (x, z) => ((Math.floor(x / 4) + 1000) * 4096 + (Math.floor(z / 4) + 1000));
function obstAdd(x, z, r) { const k = hkey(x, z); if (!OBST.has(k)) OBST.set(k, []); OBST.get(k).push({ x, z, r }); }
export function obstHit(x, z, r) {
  const R = Math.ceil((r + 8) / 4);
  const cx = Math.floor(x / 4), cz = Math.floor(z / 4);
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
    const l = OBST.get((cx + a + 1000) * 4096 + (cz + b + 1000)); if (!l) continue;
    for (const o of l) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2) return true;
  }
  return false;
}

// move a circle of radius r at (x, z) out of every obstacle it overlaps (a few relaxation passes)
export function obstPush(x, z, r) {
  for (let it = 0; it < 3; it++) {
    let moved = false;
    const R = Math.ceil((r + 8) / 4), cx = Math.floor(x / 4), cz = Math.floor(z / 4);
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
      const l = OBST.get((cx + a + 1000) * 4096 + (cz + b + 1000)); if (!l) continue;
      for (const o of l) {
        const dx = x - o.x, dz = z - o.z, m = o.r + r, d2 = dx * dx + dz * dz;
        if (d2 >= m * m) continue;
        const d = Math.sqrt(d2) || 1e-4; x = o.x + dx / d * m; z = o.z + dz / d * m; moved = true;
      }
    }
    if (!moved) break;
  }
  return { x, z };
}

// returns a sampler () => [x, z] for a scatter area; polygon misses return NaN (counted as 'area' rejects)
function areaSampler(area, R) {
  area = area || { type: 'all' };
  const t = area.type || 'all';
  if (t === 'circle') { const [cx, cz] = area.center || [0, 0]; return () => { const a = R() * 6.283, r = Math.sqrt(R()) * area.radius; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; }; }
  if (t === 'ring') { const [cx, cz] = area.center || [0, 0], i2 = area.inner ** 2, o2 = area.outer ** 2; return () => { const a = R() * 6.283, r = Math.sqrt(i2 + R() * (o2 - i2)); return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; }; }
  if (t === 'rect') return () => [area.min[0] + R() * (area.max[0] - area.min[0]), area.min[1] + R() * (area.max[1] - area.min[1])];
  if (t === 'polygon') {
    const P = area.points; let mnx = 1e9, mnz = 1e9, mxx = -1e9, mxz = -1e9; P.forEach(([x, z]) => { mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mnz = Math.min(mnz, z); mxz = Math.max(mxz, z); });
    const inside = (x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, zi] = P[i], [xj, zj] = P[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
    return () => { for (let k = 0; k < 40; k++) { const x = mnx + R() * (mxx - mnx), z = mnz + R() * (mxz - mnz); if (inside(x, z)) return [x, z]; } return [NaN, NaN]; };
  }
  return () => [DETAIL.min + R() * DETAIL.size, DETAIL.min + R() * DETAIL.size];
}

export const emptyRejectStats = () => ({ area: 0, water: 0, path: 0, height: 0, slope: 0, waterDist: 0, moisture: 0, sun: 0, canopy: 0, noise: 0, spacing: 0 });

// true if (x, z) passes every rule; otherwise increments the failing rule's counter in `stats`
export function ruleCheck(x, z, rules, stats) {
  if (!isFinite(x)) { stats.area++; return false; }
  const h = heightAt(x, z);
  const wl = waterLevelAt(x, z);
  if (wl != null && wl > h - 0.05) { stats.water++; return false; }
  if (pathAt(x, z) > 0.35) { stats.path++; return false; }
  if (rules.height && (h < rules.height[0] || h > rules.height[1])) { stats.height++; return false; }
  if (rules.slope) { const s = slopeAt(x, z); if (s < rules.slope[0] || s > rules.slope[1]) { stats.slope++; return false; } }
  if (rules.waterDist) { const d = waterDistAt(x, z); if (d < rules.waterDist[0] || d > rules.waterDist[1]) { stats.waterDist++; return false; } }
  if (rules.moisture) { const v = moistureAt(x, z); if (v < rules.moisture[0] || v > rules.moisture[1]) { stats.moisture++; return false; } }
  if (rules.sun) { const v = sunAt(x, z); if (v < rules.sun[0] || v > rules.sun[1]) { stats.sun++; return false; } }
  if (rules.canopy) { const v = DETAIL.inside(x, z) ? DETAIL.sample(x, z, OCC) / 0.8 : 0; if (v < rules.canopy[0] || v > rules.canopy[1]) { stats.canopy++; return false; } }
  if (rules.noise) { const nz = rules.noise; let v = fbm(x * (nz.scale || 0.05), z * (nz.scale || 0.05), 3, nz.seed || 0); if (nz.invert) v = 1 - v; if (v < (nz.threshold != null ? nz.threshold : 0.5)) { stats.noise++; return false; } }
  return true;
}

// "spacing 940, height 837" — the top three reject reasons, for report notes
export function topRejects(stats) {
  return Object.entries(stats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', ');
}

function addInstance(kind, x, z, s, rot, variant, R) {
  const K = KINDS[kind];
  const v = variant != null ? variant % K.variants : Math.floor(R() * K.variants);
  const lo = K.lo && !DETAIL.inside(x, z) && Math.hypot(x, z) > K.lodDist;  // full model anywhere the camera can walk
  const key = kind + '|' + v + '|' + (lo ? 1 : 0);
  (INST[key] || (INST[key] = [])).push({ x, z, y: heightAt(x, z) - K.sink * s, s, r: rot, tilt: K.tilt });
  if (K.colliders) {
    // footprint circles in model space, rotated like the instance (three.js Y rotation)
    const c = Math.cos(rot), sn = Math.sin(rot);
    for (const [lx, lz, r] of kindGeo(kind, v, lo).userData.colliders) obstAdd(x + (lx * c + lz * sn) * s, z + (-lx * sn + lz * c) * s, r * s);
  } else if (K.trunk) obstAdd(x, z, K.trunk * s);
  if (K.occ && DETAIL.inside(x, z)) stampGrid(DETAIL, OCC, x, z, K.canopy * s, K.occ, 0.8);
  if (K.forest) { stampGrid(FAR, FOREST_F, x, z, K.canopy * s * 1.7, 0.4, 1); if (DETAIL.inside(x, z)) stampGrid(DETAIL, FOREST_D, x, z, K.canopy * s * 1.5, 0.35, 1); }
}

export function opScatter(p, rep) {
  const K = KINDS[p.kind]; if (!K) { rep.status = 'err'; rep.note = '未知模型 ' + p.kind + '，可选：' + Object.keys(KINDS).join(', '); return; }
  const R = mulberry32(5000 + (p.seed || 0) * 31 + p.kind.length); let sample = areaSampler(p.area, R);
  const rules = p.rules || {}, sp = p.minSpacing != null ? p.minSpacing : K.radius;
  const stats = emptyRejectStats();
  // spacing among this op's own placements
  const local = new Map(); const lk = (x, z) => Math.floor(x / Math.max(sp, 0.5)) * 100003 + Math.floor(z / Math.max(sp, 0.5));
  const near = (x, z) => { if (!sp) return false; const cs = Math.max(sp, 0.5), cx = Math.floor(x / cs), cz = Math.floor(z / cs); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = local.get((cx + a) * 100003 + (cz + b)); if (l) for (const q of l) if ((q[0] - x) ** 2 + (q[1] - z) ** 2 < sp * sp) return true; } return false; };
  if (p.cluster) {
    // Thomas process: rule-checked parent points, children gaussian-scattered around a random parent
    const csz = Math.max(1, p.cluster.size || 6), crad = p.cluster.radius || 12, parents = [], base = sample;
    const st2 = emptyRejectStats();
    const want = Math.ceil(p.count / csz); let t2 = 0;
    while (parents.length < want && t2 < want * 80) { t2++; const [x, z] = base(); if (ruleCheck(x, z, rules, st2)) parents.push([x, z]); }
    sample = () => { if (!parents.length) return base(); const q = parents[Math.floor(R() * parents.length)], a = R() * 6.283, rr = crad * Math.sqrt(-2 * Math.log(1 - R() * 0.999)) * 0.5; return [q[0] + Math.cos(a) * rr, q[1] + Math.sin(a) * rr]; };
  }
  let placed = 0, tries = 0; const maxTries = p.count * 40, positions = [];
  while (placed < p.count && tries < maxTries) {
    tries++;
    const [x, z] = sample();
    if (!ruleCheck(x, z, rules, stats)) continue;
    if (near(x, z) || (!K.small && obstHit(x, z, K.radius * 0.5))) { stats.spacing++; continue; }
    const s = p.scale[0] + R() * (p.scale[1] - p.scale[0]);
    addInstance(p.kind, x, z, s, R() * 6.283, null, R);
    const k = lk(x, z); if (!local.has(k)) local.set(k, []); local.get(k).push([x, z]);
    if (positions.length < 20000) positions.push([+x.toFixed(2), +z.toFixed(2)]);
    placed++;
  }
  const rej = topRejects(stats);
  rep.note = `放置 ${placed}/${p.count}` + (rej ? ` · 拒绝：${rej}` : '');
  rep.data = { placed, requested: p.count, rejected: stats };
  if (placed < p.count * 0.6) { rep.status = 'warn'; rep.note += ' · 放置不足六成，放宽规则或扩大区域'; }
  return { placed, requested: p.count, rejected: stats, positions };
}

export function opPlace(p, rep) {
  const K = KINDS[p.kind]; if (!K) { rep.status = 'err'; rep.note = '未知模型 ' + p.kind; return; }
  const R = mulberry32(Math.round(p.x * 13 + p.z * 7));
  const wl = waterLevelAt(p.x, p.z), h = heightAt(p.x, p.z);
  if (wl != null && wl > h) { rep.status = 'warn'; rep.note = `落点在水下（地面 ${h.toFixed(1)}，水位 ${wl.toFixed(1)}）`; }
  addInstance(p.kind, p.x, p.z, p.scale, p.rotation != null ? p.rotation : R() * 6.283, p.variant, R);
  if (!rep.note) rep.note = `地面高度 ${h.toFixed(2)}m`;
  return { x: p.x, y: +h.toFixed(2), z: p.z };
}

// [[x, z, scale], …] of placed instances, optionally filtered by kind
export function listInstances(kind, limit) {
  const out = [];
  for (const k in INST) if (!kind || k.split('|')[0] === kind) for (const o of INST[k]) { out.push([+o.x.toFixed(1), +o.z.toFixed(1), +o.s.toFixed(2)]); if (out.length >= (limit || 200)) return out; }
  return out;
}
