// Lake op: flood-fill from a seed vertex up to a water level (absolute, seed + offset, or the spill height).
import { heapPush, heapPop } from '../core/heap.js';
import { DETAIL } from '../world/grid.js';
import { WATER } from '../world/fields.js';
import { WATERS } from './water.js';

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// B: blended ground heights on DETAIL vertices; rep: the op's report row (status/note/data are written)
export function fillLake(p, B, rep) {
  const n = DETAIL.n, st = DETAIL.step;
  const si = Math.round((p.x - DETAIL.min) / st), sj = Math.round((p.z - DETAIL.min) / st);
  if (si < 1 || sj < 1 || si >= n - 1 || sj >= n - 1) { rep.status = 'err'; rep.note = '种子点不在细节网格内（±160m）'; return; }
  const inR = (i, j) => Math.hypot(DETAIL.x(i) - p.x, DETAIL.x(j) - p.z) <= p.maxRadius;
  let level;
  if (p.level != null) level = p.level;
  else if (p.fill === 'spill' || p.fill == null) {
    // priority flood: raise the level until the basin first spills over the radius limit or grid edge
    const seen = new Uint8Array(n * n), heap = [[B[sj * n + si], si, sj]]; seen[sj * n + si] = 1;
    let lv = -1e9, spill = null;
    while (heap.length) {
      const [h, i, j] = heapPop(heap); lv = Math.max(lv, h);
      if (!inR(i, j) || i === 0 || j === 0 || i === n - 1 || j === n - 1) { spill = lv; break; }
      for (const [di, dj] of N4) { const a = i + di, b = j + dj, k = b * n + a; if (a < 0 || b < 0 || a >= n || b >= n || seen[k]) continue; seen[k] = 1; heapPush(heap, [B[k], a, b]); }
    }
    level = (spill != null ? spill : lv) - p.margin;
  } else level = B[sj * n + si] + Number(p.fill);
  if (level <= B[sj * n + si]) { rep.status = 'warn'; rep.note = `水位 ${level.toFixed(2)} 不高于种子地面 ${B[sj * n + si].toFixed(2)}，湖为空。换一个更低的种子点或加深盆地。`; return; }
  const mask = new Uint8Array(n * n), stack = [[si, sj]]; mask[sj * n + si] = 1;
  let cells = 0, leaked = false, minI = si, maxI = si, minJ = sj, maxJ = sj;
  while (stack.length) {
    const [i, j] = stack.pop(); cells++;
    WATER[j * n + i] = Math.max(WATER[j * n + i], level);
    minI = Math.min(minI, i); maxI = Math.max(maxI, i); minJ = Math.min(minJ, j); maxJ = Math.max(maxJ, j);
    for (const [di, dj] of N4) {
      const a = i + di, b = j + dj, k = b * n + a;
      if (a < 0 || b < 0 || a >= n || b >= n || mask[k]) continue;
      if (B[k] >= level) continue;
      if (!inR(a, b)) { leaked = true; continue; }
      mask[k] = 1; stack.push([a, b]);
    }
  }
  WATERS.lakes.push({ level, mask, minI, maxI, minJ, maxJ });
  const area = cells * st * st;
  rep.note = `水位 ${level.toFixed(2)}m · 面积 ${Math.round(area)}㎡ · 最深 ${(level - B[sj * n + si]).toFixed(1)}m` + (leaked ? ' · 触到 maxRadius 边界被截断' : '');
  if (leaked) rep.status = 'warn';
  rep.data = { level: +level.toFixed(2), area: Math.round(area), leaked };
}
