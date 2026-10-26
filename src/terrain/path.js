// Path op: a worn dirt track along a polyline. Paints the PATH field (terrain shading, grass and placement
// avoid it) and eases the ground toward a smoothed centre-line height so the track sits level across.
import * as THREE from 'three';
import { clamp, smooth } from '../core/math.js';
import { fbm } from '../core/noise.js';
import { DETAIL, GRIDS, heightAt } from '../world/grid.js';
import { PATH } from '../world/fields.js';
import { catmull, nearestOnPath } from '../world/polyline.js';

export function carvePath(p) {
  const pts = catmull(p.path.map(q => new THREE.Vector2(q[0], q[1])), 1.2), N = pts.length;
  // centre-line heights, smoothed along the track so it does not follow every bump
  const raw = pts.map(q => heightAt(q.x, q.y)), hc = new Float32Array(N);
  for (let i = 0; i < N; i++) { let s = 0, w = 0; for (let k = Math.max(0, i - 6); k <= Math.min(N - 1, i + 6); k++) { s += raw[k]; w++; } hc[i] = s / w; }
  let length = 0; for (let i = 1; i < N; i++) length += pts[i].distanceTo(pts[i - 1]);
  const half = p.width * 0.5, reach = half + 3;
  let minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9;
  pts.forEach(q => { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minZ = Math.min(minZ, q.y); maxZ = Math.max(maxZ, q.y); });
  for (const G of GRIDS) {
    const n = G.n;
    const i0 = clamp(Math.floor((minX - reach - G.min) / G.step), 0, n - 1), i1 = clamp(Math.ceil((maxX + reach - G.min) / G.step), 0, n - 1);
    const j0 = clamp(Math.floor((minZ - reach - G.min) / G.step), 0, n - 1), j1 = clamp(Math.ceil((maxZ + reach - G.min) / G.step), 0, n - 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = G.x(i), z = G.x(j), q = nearestOnPath(pts, x, z);
      if (q.d > reach) continue;
      const k = j * n + i, c = hc[q.i] + (hc[Math.min(q.i + 1, N - 1)] - hc[q.i]) * q.t;
      G.h[k] += (c - G.h[k]) * smooth(reach, half * 0.6, q.d) * p.flatten;
      if (G === DETAIL) {
        // ragged edge: the worn width wanders a little along the track
        const edge = half * (0.8 + 0.4 * fbm(x * 0.15, z * 0.15, 2, 7));
        PATH[k] = Math.max(PATH[k], smooth(edge + 0.8, edge * 0.4, q.d) * p.wear);
      }
    }
  }
  return { length: Math.round(length) };
}
