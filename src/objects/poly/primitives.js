// Primitives (Blender's Add Mesh menu and curve objects) and 2D outline helpers. Every primitive is a closed
// solid unless said otherwise, centred as noted, with tagged faces so later steps can pick them.
import * as THREE from 'three';
import { Poly, V3, DETAIL, segsAt } from './mesh.js';

// box centred on the origin; faces tagged px nx py ny pz nz (py is the top)
Poly.make('box', (sx, sy, sz, attr = {}) => {
  const p = new Poly(), h = [sx / 2, sy / 2, sz / 2];
  for (let i = 0; i < 8; i++) p.vert([(i & 1 ? 1 : -1) * h[0], (i & 2 ? 1 : -1) * h[1], (i & 4 ? 1 : -1) * h[2]]);
  const faces = { px: [1, 3, 7, 5], nx: [0, 4, 6, 2], py: [2, 6, 7, 3], ny: [0, 1, 5, 4], pz: [4, 5, 7, 6], nz: [0, 2, 3, 1] };
  for (const [tag, v] of Object.entries(faces)) p.face(v, Object.assign({ tag }, attr));
  return p;
});

// flat grid in the xz plane, facing up, centred; nx × nz quads (an open surface: solidify it or use it as is)
Poly.make('grid', (sx, sz, nx = 1, nz = 1, attr = {}) => {
  const p = new Poly();
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) p.vert([(i / nx - 0.5) * sx, 0, (j / nz - 0.5) * sz]);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; p.face([a, a + nx + 1, a + nx + 2, a + 1], Object.assign({ tag: 'top' }, attr)); }
  return p;
});

// an outline [[x, z], …] (either winding) extruded up from y0 by h; faces tagged top, bottom, side
Poly.make('prism', (outline, h, attr = {}, y0 = 0) => {
  // with the outline's (x, z) area positive, its order winds the bottom face outward (down); the top runs the
  // other way and each side shares its bottom edge reversed. Concave outlines work too.
  const p = new Poly(), pts = area2(outline) < 0 ? outline.slice().reverse() : outline, n = pts.length;
  for (const [x, z] of pts) p.vert([x, y0, z]);
  for (const [x, z] of pts) p.vert([x, y0 + h, z]);
  p.face(pts.map((_, i) => 2 * n - 1 - i), Object.assign({ tag: 'top' }, attr));
  p.face(pts.map((_, i) => i), Object.assign({ tag: 'bottom' }, attr));
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; p.face([j, i, n + i, n + j], Object.assign({ tag: 'side' }, attr)); }
  return p;
});

// surface of revolution about y: profile [[r, y], …] from bottom to top; points on the axis (r = 0) close the
// solid with a pole; faces tagged side (and bottom / top for flat caps where the profile runs along the axis)
Poly.make('lathe', (profile, segs, attr = {}, phase = 0) => {
  segs = segsAt(segs);
  const p = new Poly(), rings = profile.map(([r, y]) => {
    if (r < 1e-6) return [p.vert([0, y, 0])];
    return Array.from({ length: segs }, (_, i) => { const a = phase + i / segs * Math.PI * 2; return p.vert([Math.cos(a) * r, y, Math.sin(a) * r]); });
  });
  for (let j = 0; j < rings.length - 1; j++) {
    const A = rings[j], B = rings[j + 1], flat = Math.abs(profile[j][1] - profile[j + 1][1]) < 1e-6, tag = flat ? (j === 0 ? 'bottom' : 'top') : 'side';
    for (let i = 0; i < segs; i++) {
      const a0 = A[A.length === 1 ? 0 : i], a1 = A[A.length === 1 ? 0 : (i + 1) % segs], b0 = B[B.length === 1 ? 0 : i], b1 = B[B.length === 1 ? 0 : (i + 1) % segs];
      const v = [a0, b0, b1, a1].filter((x, k, arr) => arr.indexOf(x) === k);
      if (v.length >= 3) p.face(v, Object.assign({ tag }, attr));
    }
  }
  if (p.volume() < 0) for (const f of p.F) f.v.reverse();   // profile given top to bottom
  return p;
});

// cylinder (or cone frustum, r2 at the top) standing on y = 0
Poly.make('cylinder', (r, h, segs = 12, attr = {}, r2 = r) => Poly.lathe([[0, 0], [r, 0], [r2, h], [0, h]], segs, attr));

// a profile [[x, y], …] (closed outline in the plane across the path) swept along a path of points, with frames
// carried along the path (parallel transport); `up` orients the first frame. Faces tagged side, start, end.
// o.scale(t) scales the profile along the path (taper), o.closed joins the path into a loop.
Poly.make('sweep', (path, profile, attr = {}, o = {}) => {
  const p = new Poly(), n = path.length, m = profile.length, closed = !!o.closed, rings = [];
  let N = null;
  for (let k = 0; k < n; k++) {
    const a = path[closed ? (k - 1 + n) % n : Math.max(k - 1, 0)], b = path[closed ? (k + 1) % n : Math.min(k + 1, n - 1)], T = b.clone().sub(a).normalize();
    if (!N) { const up = o.up || V3(0, 1, 0); N = up.clone().sub(T.clone().multiplyScalar(up.dot(T))); if (N.lengthSq() < 1e-8) N = V3(1, 0, 0).cross(T); N.normalize(); }
    else N.sub(T.clone().multiplyScalar(N.dot(T))).normalize();
    const B = T.clone().cross(N), s = o.scale ? o.scale(k / (n - 1)) : 1;
    rings.push(profile.map(([x, y]) => p.vert(path[k].clone().addScaledVector(B, x * s).addScaledVector(N, y * s))));
  }
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const A = rings[k], C = rings[(k + 1) % n];
    for (let i = 0; i < m; i++) { const j = (i + 1) % m; p.face([A[i], A[j], C[j], C[i]], Object.assign({ tag: 'side' }, attr)); }
  }
  if (!closed && o.caps !== false) { p.face(rings[0].slice().reverse(), Object.assign({ tag: 'start' }, attr)); p.face(rings[n - 1].slice(), Object.assign({ tag: 'end' }, attr)); }
  // the profile's winding decides which way the sides face: turn the whole thing out if it came out inside out
  if (p.volume() < 0) for (const f of p.F) f.v.reverse();
  return p;
});

// icosphere of radius r (subdivided icosahedron), for blobs and pebbles
Poly.make('icosphere', (r, detail = 1, attr = {}) => {
  const g = new THREE.IcosahedronGeometry(r, Math.max(0, detail - DETAIL.level)), pos = g.attributes.position, p = new Poly(), key = new Map();
  const id = i => { const v = V3(pos.getX(i), pos.getY(i), pos.getZ(i)), k = v.toArray().map(x => x.toFixed(5)).join(); if (!key.has(k)) key.set(k, p.vert(v)); return key.get(k); };
  for (let i = 0; i < pos.count; i += 3) p.face([id(i), id(i + 1), id(i + 2)], attr);
  g.dispose();
  return p.orient();
});

// make every face wind outward from the solid's centre (for convex primitives built without care)
Poly.op('orient', p => {
  const c = V3(0, 0, 0), used = new Set(); for (const f of p.F) for (const i of f.v) used.add(i);
  for (const i of used) c.add(p.P[i]); c.divideScalar(used.size || 1);
  for (const f of p.F) if (p.newell(f).dot(p.center(f).sub(c)) < 0) f.v.reverse();
});
// signed volume (positive when faces wind outward)
Poly.prototype.volume = function () {
  let v = 0;
  for (const f of this.F) for (let i = 1; i < f.v.length - 1; i++) v += this.P[f.v[0]].dot(this.P[f.v[i]].clone().cross(this.P[f.v[i + 1]]));
  return v / 6;
};

// ── 2D outlines ──
export const area2 = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; } return a / 2; };
export const rect2 = (w, h, cx = 0, cy = 0) => [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
export const circle2 = (r, n = 16, cx = 0, cy = 0, phase = 0) => (n = segsAt(n, 4), Array.from({ length: n }, (_, i) => { const a = phase + i / n * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }));
// round the corners of a closed outline with radius r (capped at 45% of the shorter neighbouring side), segs
// points per corner; segs 1 is a chamfer
export function fillet2(pts, r, segs = 3) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const da = [a[0] - p[0], a[1] - p[1]], db = [b[0] - p[0], b[1] - p[1]], la = Math.hypot(...da), lb = Math.hypot(...db);
    const ua = [da[0] / la, da[1] / la], ub = [db[0] / lb, db[1] / lb], cosT = ua[0] * ub[0] + ua[1] * ub[1];
    const half = Math.acos(Math.max(-1, Math.min(1, cosT))) / 2;
    if (half > Math.PI / 2 - 1e-3 || r <= 0) { out.push(p); continue; }   // straight through: nothing to round
    const t = Math.min(r / Math.tan(half), 0.45 * Math.min(la, lb)), A = [p[0] + ua[0] * t, p[1] + ua[1] * t], B = [p[0] + ub[0] * t, p[1] + ub[1] * t];
    const w = Math.sin(half);   // rational quadratic weight for a circular arc between the tangent points
    for (let k = 0; k <= segs; k++) {
      const s = k / segs, b0 = (1 - s) * (1 - s), b1 = 2 * s * (1 - s) * w, b2 = s * s, d = b0 + b1 + b2;
      out.push([(b0 * A[0] + b1 * p[0] + b2 * B[0]) / d, (b0 * A[1] + b1 * p[1] + b2 * B[1]) / d]);
    }
  }
  return out;
}
