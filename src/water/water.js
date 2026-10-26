// Water bodies (lakes, rivers) and the DETAIL-grid water fields derived from them.
// Fields are rebuilt lazily: terrain edits mark them dirty, ensureWater() recomputes on the next query.
import { clamp, smooth } from '../core/math.js';
import { DETAIL, heightAt } from '../world/grid.js';
import { WATER, WDIST, waterLevelAt, waterDistAt } from '../world/fields.js';
import { world } from '../world/state.js';
import { nearestOnPath } from './path.js';

export const WATERS = { lakes: [], rivers: [] };

let B = null, bVer = -1;

export function resetWater() { WATERS.lakes.length = 0; WATERS.rivers.length = 0; B = null; bVer = -1; }

// final (DETAIL/FAR blended) ground height at every DETAIL vertex, cached per terrain version
export function currentB() {
  if (bVer !== world.terrainVer || !B) {
    const n = DETAIL.n; B = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) B[j * n + i] = heightAt(DETAIL.x(i), DETAIL.x(j));
    bVer = world.terrainVer;
  }
  return B;
}

// level of the lake covering (x, z), or null
function lakeLevelAt(x, z) {
  const n = DETAIL.n, i = Math.round((x - DETAIL.min) / DETAIL.step), j = Math.round((z - DETAIL.min) / DETAIL.step);
  if (i < 0 || j < 0 || i >= n || j >= n) return null;
  for (const L of WATERS.lakes) if (L.mask[j * n + i]) return L.level;
  return null;
}

const MOUTH = 14;  // metres over which a river surface eases down to the lake it flows into

// river surface = bed + 72% of depth; where the river runs into a lake the surface eases down to the lake
// level and `r.end` marks the first point under the lake, so the ribbon stops instead of floating above it
function riverSurface(r) {
  const { pts, bed, len, p } = r, N = pts.length;
  r.surf = Float32Array.from(bed, b => b + p.depth * 0.72);
  r.end = N;
  for (let i = 0; i < N; i++) {
    const L = lakeLevelAt(pts[i].x, pts[i].y);
    if (L == null || L < r.surf[i] - p.depth) continue;
    r.end = i + 1;
    for (let k = i; k < N; k++) r.surf[k] = Math.min(r.surf[k], L) - 0.05;
    for (let k = i - 1; k >= 0 && len[i] - len[k] < MOUTH; k--) r.surf[k] = L + (r.surf[k] - L) * smooth(0, MOUTH, len[i] - len[k]);
    break;
  }
}

function markRivers(B) {
  const n = DETAIL.n;
  for (const r of WATERS.rivers) {
    const { pts, p } = r, N = pts.length, reach = p.width * 0.5 + p.bank;
    riverSurface(r);
    let minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9;
    pts.forEach(q => { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minZ = Math.min(minZ, q.y); maxZ = Math.max(maxZ, q.y); });
    const st = DETAIL.step;
    const i0 = clamp(Math.floor((minX - reach - DETAIL.min) / st), 0, n - 1), i1 = clamp(Math.ceil((maxX + reach - DETAIL.min) / st), 0, n - 1);
    const j0 = clamp(Math.floor((minZ - reach - DETAIL.min) / st), 0, n - 1), j1 = clamp(Math.ceil((maxZ + reach - DETAIL.min) / st), 0, n - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const q = nearestOnPath(pts, DETAIL.x(i), DETAIL.x(j)); if (q.d > reach) continue;
      const s = r.surf[q.i] + (r.surf[Math.min(q.i + 1, N - 1)] - r.surf[q.i]) * q.t, k = j * n + i;
      if (B[k] < s) WATER[k] = Math.max(WATER[k], s);
    }
  }
}

// two-pass chamfer distance transform from wet vertices
function computeWaterDist(B) {
  const n = DETAIL.n, st = DETAIL.step, D = WDIST;
  for (let k = 0; k < n * n; k++) D[k] = WATER[k] > B[k] ? 0 : 999;
  const d1 = st, d2 = st * Math.SQRT2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i; let v = D[k]; if (i) v = Math.min(v, D[k - 1] + d1); if (j) { v = Math.min(v, D[k - n] + d1); if (i) v = Math.min(v, D[k - n - 1] + d2); if (i < n - 1) v = Math.min(v, D[k - n + 1] + d2); } D[k] = v; }
  for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) { const k = j * n + i; let v = D[k]; if (i < n - 1) v = Math.min(v, D[k + 1] + d1); if (j < n - 1) { v = Math.min(v, D[k + n] + d1); if (i < n - 1) v = Math.min(v, D[k + n + 1] + d2); if (i) v = Math.min(v, D[k + n - 1] + d2); } D[k] = v; }
}

export function ensureWater() {
  if (!world.waterDirty) return;
  const b = currentB();
  WATER.fill(-1e9);
  for (const L of WATERS.lakes) { const m = L.mask; for (let k = 0; k < m.length; k++) if (m[k]) WATER[k] = Math.max(WATER[k], L.level); }
  markRivers(b); computeWaterDist(b);
  world.waterDirty = false;
}

export function waterInfo(x, z) { const l = waterLevelAt(x, z), h = heightAt(x, z); return { level: l, depth: l != null ? +Math.max(0, l - h).toFixed(2) : 0, dist: +waterDistAt(x, z).toFixed(1) }; }
