// Value noise and its fractal variants. Pure functions, all seeded, all in [0, 1].

export function hash2(i, j) { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }

export function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function so(seed) { return [seed * 71.37 % 1000, seed * 113.91 % 1000]; }

export function fbm(x, y, oct, seed) { const [sx, sy] = so(seed || 0); x += sx; y += sy; let v = 0, a = 0.5, n = 0; for (let o = 0; o < oct; o++) { v += a * vnoise(x, y); n += a; x = x * 2.03 + 17.1; y = y * 2.03 + 9.2; a *= 0.5; } return v / n; }
export function ridged(x, y, oct, seed) { const [sx, sy] = so(seed || 0); x += sx; y += sy; let v = 0, a = 0.5, w = 1, n = 0; for (let o = 0; o < oct; o++) { let k = 1 - Math.abs(vnoise(x, y) * 2 - 1); k *= k; k *= w; w = Math.min(1, k * 1.7); v += a * k; n += a; x = x * 2.1 + 5.3; y = y * 2.1 - 2.7; a *= 0.5; } return v / n; }
export function billow(x, y, oct, seed) { const [sx, sy] = so(seed || 0); x += sx; y += sy; let v = 0, a = 0.5, n = 0; for (let o = 0; o < oct; o++) { v += a * Math.abs(vnoise(x, y) * 2 - 1); n += a; x = x * 2.05 + 3.3; y = y * 2.05 + 1.7; a *= 0.5; } return v / n; }

// value noise with analytic derivatives: [v, dv/dx, dv/dy]
export function vnoiseD(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), dux = 6 * fx * (1 - fx), duy = 6 * fy * (1 - fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1), k = a - b - c + d;
  return [a + (b - a) * ux + (c - a) * uy + k * ux * uy, dux * ((b - a) + k * uy), duy * ((c - a) + k * ux)];
}

// Quilez-style eroded fBm: accumulated gradient damps later octaves on steep slopes -> ridges + branching valleys
export function erodedFbm(x, y, oct, seed) {
  const [sx, sy] = so(seed || 0); x += sx; y += sy;
  let a = 0, b = 0.5, dx = 0, dy = 0, norm = 0;
  for (let o = 0; o < oct; o++) {
    const [v, nx, ny] = vnoiseD(x, y);
    dx += nx; dy += ny;
    a += b * v / (1 + dx * dx + dy * dy);
    norm += b; b *= 0.5;
    const x2 = 1.6 * x - 1.2 * y, y2 = 1.2 * x + 1.6 * y; x = x2 + 17.1; y = y2 + 9.2;
  }
  return a / norm;
}

export function vnoise3(x, y, z) { return (vnoise(x + z * 0.71, y - z * 0.37) + vnoise(y * 1.13 + 3.1, z - x * 0.6 + 7.7)) * 0.5; }
