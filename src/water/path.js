// Polyline helpers for river paths (points are THREE.Vector2 with .y holding world z).
import * as THREE from 'three';
import { clamp } from '../core/math.js';

// resample a control polyline into a Catmull-Rom curve with roughly `spacing` metres between points
export function catmull(P, spacing) {
  if (P.length < 3) {
    const out = [], L = P[0].distanceTo(P[1]), m = Math.max(2, Math.ceil(L / spacing));
    for (let i = 0; i <= m; i++) out.push(P[0].clone().lerp(P[1], i / m));
    return out;
  }
  const curve = new THREE.SplineCurve(P);
  const L = curve.getLength(), m = Math.max(4, Math.ceil(L / spacing));
  return curve.getSpacedPoints(m);
}

// closest point on the polyline: distance d, segment index i, and parameter t along that segment
export function nearestOnPath(pts, x, z) {
  let best = { d: 1e9, i: 0, t: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i].x, az = pts[i].y, bx = pts[i + 1].x - ax, bz = pts[i + 1].y - az;
    const L2 = bx * bx + bz * bz || 1;
    const t = clamp(((x - ax) * bx + (z - az) * bz) / L2, 0, 1);
    const d = Math.hypot(x - (ax + bx * t), z - (az + bz * t));
    if (d < best.d) best = { d, i, t };
  }
  return best;
}
