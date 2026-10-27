// Deformers and duplication (Blender's Displace, Simple Deform, Array, Mirror, Weld / Merge by Distance).
import * as THREE from 'three';
import { vnoise3 } from '../../core/noise.js';
import { Poly, V3 } from './mesh.js';

const used = p => { const s = new Set(); for (const f of p.F) for (const i of f.v) s.add(i); return s; };

// move every vertex: fn(position, index) returns the new position (or edits it in place and returns nothing)
Poly.op('warp', (p, fn) => { for (const i of used(p)) { const r = fn(p.P[i], i); if (r && r.isVector3) p.P[i].copy(r); } });

// smooth noise displacement (shared vertices move together, so nothing tears): amount metres, scale per metre;
// breaks the machined look of perfect planes and straight edges
Poly.op('jitter', (p, amount, scale = 2, seed = 0) => {
  const o = seed * 7.31;
  for (const i of used(p)) {
    const q = p.P[i], x = q.x * scale, y = q.y * scale, z = q.z * scale;
    q.x += (vnoise3(x + o, y, z) - 0.5) * 2 * amount; q.y += (vnoise3(x, y + 5.2 + o, z) - 0.5) * 2 * amount; q.z += (vnoise3(x, y, z + 9.7 + o) - 0.5) * 2 * amount;
  }
});

// Simple Deform along y between y0 and y1: taper scales x and z by 1 → k; twist turns by `angle` radians; bend
// curls the y axis toward +x through `angle` radians in total
Poly.op('taper', (p, k, y0, y1) => { for (const i of used(p)) { const q = p.P[i], t = Math.min(1, Math.max(0, (q.y - y0) / (y1 - y0))), s = 1 + (k - 1) * t; q.x *= s; q.z *= s; } });
Poly.op('twist', (p, angle, y0, y1) => { for (const i of used(p)) { const q = p.P[i], t = Math.min(1, Math.max(0, (q.y - y0) / (y1 - y0))), a = angle * t, c = Math.cos(a), s = Math.sin(a), x = q.x; q.x = x * c - q.z * s; q.z = x * s + q.z * c; } });
Poly.op('bend', (p, angle, y0, y1) => {
  if (Math.abs(angle) < 1e-6) return;
  const L = y1 - y0, r = L / angle;
  for (const i of used(p)) { const q = p.P[i], t = Math.min(1, Math.max(0, (q.y - y0) / L)), a = angle * t, d = q.y - (y0 + t * L), rr = r - q.x; q.x = r - rr * Math.cos(a) + d * Math.sin(a); q.y = y0 + rr * Math.sin(a) + d * Math.cos(a); }
});

// count copies, each moved by `step` (a vector, or a Matrix4 applied once more per copy) from the one before
Poly.op('array', (p, count, step) => {
  const src = p.clone(), m = step.isMatrix4 ? step : new THREE.Matrix4().makeTranslation(step.x, step.y, step.z), acc = new THREE.Matrix4();
  for (let k = 1; k < count; k++) { acc.premultiply(m); p.merge(src.clone().transform(acc)); }
});

// mirror across the plane through the origin normal to 'x', 'y' or 'z', keeping the original; o.weld merges the
// seam (vertices within o.weld of the plane)
Poly.op('mirror', (p, axis = 'x', o = {}) => {
  const s = { x: [-1, 1, 1], y: [1, -1, 1], z: [1, 1, -1] }[axis];
  p.merge(p.clone().transform(new THREE.Matrix4().makeScale(...s)));
  if (o.weld) p.weld(o.weld);
});

// merge vertices closer than eps; faces that collapse are dropped
Poly.op('weld', (p, eps = 1e-4) => {
  const map = new Map(), grid = new Map(), cell = q => [q.x, q.y, q.z].map(x => Math.floor(x / eps));
  for (const i of used(p)) {
    const q = p.P[i], [cx, cy, cz] = cell(q);
    let hit = -1;
    for (let a = -1; a <= 1 && hit < 0; a++) for (let b = -1; b <= 1 && hit < 0; b++) for (let c = -1; c <= 1 && hit < 0; c++)
      for (const j of grid.get((cx + a) + ',' + (cy + b) + ',' + (cz + c)) || []) if (p.P[j].distanceTo(q) < eps) { hit = j; break; }
    if (hit >= 0) map.set(i, hit);
    else { const k = cx + ',' + cy + ',' + cz; (grid.get(k) || grid.set(k, []).get(k)).push(i); map.set(i, i); }
  }
  for (const f of p.F) { const v = f.v.map(i => map.get(i)); f.v = v.filter((x, k) => x !== v[(k + 1) % v.length]); }
  p.F = p.F.filter(f => f.v.length >= 3);
});

export { V3 };
