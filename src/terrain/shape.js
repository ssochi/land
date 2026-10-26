// Height-shaping terrain ops. Each takes validated params (see src/runtime/schema.js) and edits both grids.
import { smooth } from '../core/math.js';
import { fbm, ridged, billow, erodedFbm } from '../core/noise.js';
import { DETAIL, GRIDS } from '../world/grid.js';

function radialMask(m, x, z) {
  if (!m) return 1;
  const c = m.center || [0, 0], r = Math.hypot(x - c[0], z - c[1]);
  let w = smooth(m.inner != null ? m.inner : 0, m.outer != null ? m.outer : 100, r);
  return m.invert ? 1 - w : w;
}

// visit every vertex of both grids; fn returns the new height
function eachCell(fn) {
  for (const G of GRIDS) {
    const n = G.n;
    for (let j = 0; j < n; j++) { const z = G.x(j); for (let i = 0; i < n; i++) { const k = j * n + i; G.h[k] = fn(G.x(i), z, G.h[k]); } }
  }
}

export function noise(p) {
  const f = p.type === 'ridged' ? ridged : p.type === 'billow' ? billow : fbm;
  const center = p.type === 'fbm' ? 0.5 : 0;
  eachCell((x, z, h) => {
    let X = x, Z = z;
    if (p.warp) { X += (fbm(x * p.scale * 0.5, z * p.scale * 0.5, 3, p.seed + 11) - 0.5) * p.warp * 2; Z += (fbm(x * p.scale * 0.5 + 5, z * p.scale * 0.5 - 3, 3, p.seed + 12) - 0.5) * p.warp * 2; }
    return h + p.amp * (f(X * p.scale, Z * p.scale, p.octaves, p.seed) - center) * radialMask(p.mask, x, z);
  });
}

export function mountains(p) {
  eachCell((x, z, h) => {
    const r = Math.hypot(x, z), m = smooth(p.inner, p.outer, r);
    if (m <= 0) return h;
    const wx = x + (fbm(x * 0.0021, z * 0.0021, 3, p.seed + 3) - 0.5) * p.warp * 2;
    const wz = z + (fbm(x * 0.0021 + 9, z * 0.0021 - 4, 3, p.seed + 4) - 0.5) * p.warp * 2;
    let v;
    if (p.style === 'ridged') v = Math.pow(ridged(wx * p.scale, wz * p.scale, 6, p.seed), 1.35) * 1.3;
    else {
      const e0 = Math.max(0, (erodedFbm(wx * p.scale, wz * p.scale, 8, p.seed) - 0.2) / 0.44), e = e0 / (1 + 0.35 * e0) * 1.35;  // soft knee, no flat-topped mesas
      const rg = ridged(wx * p.scale * 1.8, wz * p.scale * 1.8, 4, p.seed + 5);
      v = Math.pow(e, 1.45) * 1.35 * (1 - p.ridges * 0.5 + p.ridges * rg * (0.4 + e));
    }
    return h + m * (v * p.height + p.base);
  });
}

export function peak(p) {
  eachCell((x, z, h) => {
    const d = Math.hypot(x - p.x, z - p.z) / p.radius;
    if (d >= 1) return h;
    const ang = Math.atan2(z - p.z, x - p.x);
    const rid = ridged(Math.cos(ang) * 2.2 + d * 3.1 + p.seed, Math.sin(ang) * 2.2 - d * 2.7, 4, p.seed);
    const base = Math.pow(1 - d, p.sharpness) * smooth(1, 0.85, d);
    return h + p.height * base * (1 - p.ridges * 0.5 + p.ridges * rid);
  });
}

// distance from (cx, cz) with the outline warped by up to `warp` metres of low-frequency noise
function warpedDist(x, z, cx, cz, radius, warp, seed) {
  if (!warp) return Math.hypot(x - cx, z - cz);
  const s = 1.3 / radius;
  return Math.hypot(x - cx + (fbm(x * s, z * s, 3, seed + 31) - 0.5) * warp * 2, z - cz + (fbm(x * s + 7.3, z * s - 2.9, 3, seed + 32) - 0.5) * warp * 2);
}

export function hill(p) {
  eachCell((x, z, h) => {
    const d = warpedDist(x, z, p.x, p.z, p.radius, p.warp, p.seed) / p.radius;
    let w;
    if (p.shape === 'smooth') w = d < 1 ? smooth(1, 0, d) : 0;
    else if (p.shape === 'plateau') w = smooth(1, 0.55, d);
    else w = Math.exp(-d * d * 2.2);
    return h + p.height * w;
  });
}

// mode 'cut' only lowers ground above the target (a shelf cut into a slope), 'fill' only raises ground below it
export function flatten(p) {
  eachCell((x, z, h) => {
    if ((p.mode === 'cut' && h <= p.height) || (p.mode === 'fill' && h >= p.height)) return h;
    const d = warpedDist(x, z, p.x, p.z, p.radius, p.warp, p.seed);
    const w = smooth(p.radius + p.falloff, p.radius, d) * p.strength;
    return h + (p.height - h) * w;
  });
}

// raised table-land with near-vertical walls; `ledges` steps the wall so it reads as layered rock, the top keeps
// whatever relief was underneath
export function plateau(p) {
  eachCell((x, z, h) => {
    const d = warpedDist(x, z, p.x, p.z, p.radius, p.warp, p.seed);
    let u = smooth(p.radius + p.cliff, p.radius, d);
    if (u <= 0) return h;
    if (p.ledges > 0) { const q = u * (p.ledges + 1), f = Math.floor(q); u = Math.min(1, (f + smooth(0.35, 1, q - f)) / (p.ledges + 1)); }
    return h + p.height * u;
  });
}

// quantise heights into terraces inside a radius: flat treads, steep risers (`sharpness` = riser share of a step)
export function terrace(p) {
  eachCell((x, z, h) => {
    const w = smooth(p.radius + p.falloff, p.radius, Math.hypot(x - p.x, z - p.z));
    if (w <= 0) return h;
    const q = h / p.step, f = Math.floor(q);
    return h + ((f + smooth(1 - p.sharpness, 1, q - f)) * p.step - h) * w;
  });
}

// local 5-tap blur on the DETAIL grid only
export function smoothOp(p) {
  const G = DETAIL, n = G.n, tmp = new Float32Array(G.h.length);
  for (let it = 0; it < p.iterations; it++) {
    tmp.set(G.h);
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
      const x = G.x(i), z = G.x(j);
      const w = smooth(p.radius, p.radius * 0.7, Math.hypot(x - p.x, z - p.z)) * p.strength;
      if (w <= 0) continue;
      const k = j * n + i;
      const avg = (tmp[k - 1] + tmp[k + 1] + tmp[k - n] + tmp[k + n]) * 0.2 + tmp[k] * 0.2;
      G.h[k] = tmp[k] + (avg - tmp[k]) * w;
    }
  }
}

// user brush: fn(x, z, h) -> new height; non-numeric results keep the old height. Returns the reject count.
export function apply(fn, grids) {
  let bad = 0;
  for (const G of grids) { const n = G.n; for (let j = 0; j < n; j++) { const z = G.x(j); for (let i = 0; i < n; i++) { const k = j * n + i, v = fn(G.x(i), z, G.h[k]); if (typeof v === 'number' && isFinite(v)) G.h[k] = v; else bad++; } } }
  return bad;
}
