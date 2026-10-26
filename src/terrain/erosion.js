// Erosion ops. Both write the grid's `wear` map (positive = carved, negative = deposited) for terrain shading.
import { mulberry32 } from '../core/math.js';
import { DETAIL, FAR } from '../world/grid.js';

// droplet hydraulic erosion: particles roll downhill, pick up sediment on descent, drop it when they slow
export function erode(p) {
  const G = p.grid === 'detail' ? DETAIL : FAR;
  const n = G.n, H = G.h, W = G.wear, st = G.step, rng = mulberry32(1234 + p.seed);
  const inertia = p.inertia, capF = p.capacity, minSlope = 0.01, depR = 0.3, eroR = 0.3 * p.strength, evap = 0.02, grav = 4, steps = 45;
  const R = 2, brush = [];
  let wsum = 0;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const d = Math.hypot(dx, dy); if (d <= R) { const w = 1 - d / R; brush.push([dx, dy, w]); wsum += w; } }
  brush.forEach(b => b[2] /= wsum);
  // height and gradient at a fractional cell position, in cell units
  const hc = (x, y) => {
    const i = x | 0, j = y | 0, u = x - i, v = y - j, k = j * n + i;
    const a = H[k] / st, b = H[k + 1] / st, c = H[k + n] / st, d = H[k + n + 1] / st;
    return [a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v, (b - a) * (1 - v) + (d - c) * v, (c - a) * (1 - u) + (d - b) * u];
  };
  for (let dp = 0; dp < p.droplets; dp++) {
    let x = 1 + rng() * (n - 3), y = 1 + rng() * (n - 3), dx = 0, dy = 0, sp = 1, wat = 1, sed = 0;
    for (let s = 0; s < steps; s++) {
      const ix = x | 0, iy = y | 0, u = x - ix, v = y - iy;
      const [h0, gx, gy] = hc(x, y);
      dx = dx * inertia - gx * (1 - inertia); dy = dy * inertia - gy * (1 - inertia);
      const len = Math.hypot(dx, dy); if (len < 1e-6) break;
      dx /= len; dy /= len; x += dx; y += dy;
      if (x < 1 || y < 1 || x > n - 3 || y > n - 3) break;
      const dh = hc(x, y)[0] - h0;
      const cap = Math.max(-dh * sp * wat * capF, minSlope);
      const k = iy * n + ix;
      if (sed > cap || dh > 0) {
        const amt = dh > 0 ? Math.min(dh, sed) : (sed - cap) * depR;
        sed -= amt;
        const a = amt * st;
        H[k] += a * (1 - u) * (1 - v); H[k + 1] += a * u * (1 - v); H[k + n] += a * (1 - u) * v; H[k + n + 1] += a * u * v;
        W[k] -= a * 0.5;
      } else {
        const amt = Math.min((cap - sed) * eroR, -dh);
        for (const [bx, by, bw] of brush) {
          const ii = ix + bx, jj = iy + by; if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
          const kk = jj * n + ii, e = amt * bw * st;
          H[kk] -= e; W[kk] += e;
        }
        sed += amt;
      }
      sp = Math.sqrt(Math.max(0, sp * sp + dh * grav)); wat *= 1 - evap;
    }
  }
}

// thermal erosion: material above the talus angle slides to lower neighbours
export function thermal(p) {
  const G = p.grid === 'detail' ? DETAIL : FAR, n = G.n, H = G.h, W = G.wear;
  const tal = Math.tan(p.talus * Math.PI / 180) * G.step, D = new Float32Array(n * n), nb = [-1, 1, -n, n];
  for (let it = 0; it < p.iterations; it++) {
    D.fill(0);
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
      const k = j * n + i, h = H[k];
      let tot = 0, dmax = 0;
      for (let q = 0; q < 4; q++) { const d = h - H[k + nb[q]] - tal; if (d > 0) { tot += d; if (d > dmax) dmax = d; } }
      if (tot <= 0) continue;
      const mv = p.rate * dmax * 0.5;
      for (let q = 0; q < 4; q++) { const d = h - H[k + nb[q]] - tal; if (d > 0) { const sh = mv * d / tot; D[k + nb[q]] += sh; D[k] -= sh; } }
      W[k] += mv * 0.15;
    }
    for (let k = 0; k < n * n; k++) H[k] += D[k];
  }
}
