// River op: carve a monotonically descending bed along a path into both grids and register the river.
import * as THREE from 'three';
import { clamp, smooth } from '../core/math.js';
import { GRIDS, heightAt } from '../world/grid.js';
import { catmull, nearestOnPath } from '../world/polyline.js';
import { WATERS } from './water.js';

export function carveRiver(p) {
  const pts = catmull(p.path.map(q => new THREE.Vector2(q[0], q[1])), 1.5);
  const N = pts.length, bed = new Float32Array(N), len = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (i) len[i] = len[i - 1] + pts[i].distanceTo(pts[i - 1]);
    const t = heightAt(pts[i].x, pts[i].y) - p.depth;
    bed[i] = i ? Math.min(bed[i - 1] - p.drop * (len[i] - len[i - 1]), t) : t;
  }
  const half = p.width * 0.5, reach = half + p.bank;
  let minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9;
  pts.forEach(q => { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minZ = Math.min(minZ, q.y); maxZ = Math.max(maxZ, q.y); });
  for (const G of GRIDS) {
    const n = G.n;
    const i0 = clamp(Math.floor((minX - reach - G.min) / G.step), 0, n - 1), i1 = clamp(Math.ceil((maxX + reach - G.min) / G.step), 0, n - 1);
    const j0 = clamp(Math.floor((minZ - reach - G.min) / G.step), 0, n - 1), j1 = clamp(Math.ceil((maxZ + reach - G.min) / G.step), 0, n - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = G.x(i), z = G.x(j), q = nearestOnPath(pts, x, z);
      if (q.d > reach) continue;
      const b = bed[q.i] + (bed[Math.min(q.i + 1, N - 1)] - bed[q.i]) * q.t;
      const prof = b + (p.depth + 0.6) * smooth(half * 0.45, reach, q.d) - 0.25 * (1 - smooth(0, half * 0.6, q.d));
      const k = j * n + i;
      if (prof < G.h[k]) G.h[k] = prof;
    }
  }
  const rv = { pts, bed, len, p };
  WATERS.rivers.push(rv);
  return rv;
}

// the handle scene.js gets back from m.water.river(); `ensureWater` is passed in so points() sees surfaces
export function riverHandle(rv, ensureWater) {
  return {
    get length() { return Math.round(rv.len[rv.len.length - 1]); },
    get drop() { return +(rv.bed[0] - rv.bed[rv.bed.length - 1]).toFixed(2); },
    width: rv.p.width,
    points(spacing = 10) {
      ensureWater();
      const out = [], L = rv.len, total = L[L.length - 1]; let j = 0;
      for (let d = 0; d <= total + 1e-6; d += Math.max(0.5, spacing)) {
        while (j < L.length - 2 && L[j + 1] < d) j++;
        const f = clamp((d - L[j]) / ((L[j + 1] - L[j]) || 1), 0, 1), a = rv.pts[j], b = rv.pts[j + 1];
        const tl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        out.push([+(a.x + (b.x - a.x) * f).toFixed(2), +(a.y + (b.y - a.y) * f).toFixed(2), +(rv.surf[j] + (rv.surf[j + 1] - rv.surf[j]) * f).toFixed(2), +((b.x - a.x) / tl).toFixed(3), +((b.y - a.y) / tl).toFixed(3)]);
      }
      return out;
    }
  };
}
