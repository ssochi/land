// Grass field. m.grass() only records the request; distributeGrass() runs once after the script, when water
// and obstacles are final, and bakes a per-vertex field on the DETAIL grid that the GPU places blades from
// (src/render/grass.js): ground height, blade density, blade height and canopy occlusion. Blades themselves
// are generated around the camera every frame, so grass costs the same wherever it grows.
import { clamp, smooth } from '../core/math.js';
import { fbm, vnoise } from '../core/noise.js';
import { DETAIL, detailW } from '../world/grid.js';
import { COVER, OCC, PATH } from '../world/fields.js';
import { ruleCheck, forEachObstacle, emptyRejectStats, topRejects } from './placement.js';
import { groundAt } from '../terrain/crag.js';

export const GRASS_OPS = [];   // [{ p, rep }] queued by m.grass()

// density stored in the field is blades/m² divided by this (at the editor's density scale): 1 = the dense
// core of a patch; the renderer turns 1 into its maximum blade density
const FULL = 58;

export function resetGrass() { GRASS_OPS.length = 0; }

// share of each DETAIL vertex cell left free by trunks, rocks and walls (2×2 samples per 0.8m cell)
function freeShare() {
  const n = DETAIL.n, st = DETAIL.step, m = 2 * n, hs = st / 2, blocked = new Uint8Array(m * m);
  forEachObstacle((x, z, r) => {
    const i0 = Math.max(0, Math.floor((x - r - DETAIL.min) / hs)), i1 = Math.min(m - 1, Math.ceil((x + r - DETAIL.min) / hs));
    const j0 = Math.max(0, Math.floor((z - r - DETAIL.min) / hs)), j1 = Math.min(m - 1, Math.ceil((z + r - DETAIL.min) / hs));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const sx = DETAIL.min + (i + 0.5) * hs - st / 2, sz = DETAIL.min + (j + 0.5) * hs - st / 2;   // sub-samples straddle each vertex
      if ((sx - x) ** 2 + (sz - z) ** 2 < r * r) blocked[j * m + i] = 1;
    }
  });
  const free = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let b = 0; for (let a = 0; a < 2; a++) for (let c = 0; c < 2; c++) { const ii = 2 * i + a, jj = 2 * j + c; if (ii < m && jj < m) b += blocked[jj * m + ii]; }
    free[j * n + i] = 1 - b / 4;
  }
  return free;
}

// returns { total, field } — field: Float32Array(n·n·4) of [ground height, density 0–1, blade height m, occlusion]
// per DETAIL vertex; total is the expected blade count at `densityScale`. Also writes COVER for terrain tinting.
export function distributeGrass(densityScale) {
  const n = DETAIL.n, st = DETAIL.step, field = new Float32Array(n * n * 4), dens = new Float32Array(n * n), tall = new Float32Array(n * n);
  let total = 0; COVER.fill(0);
  const free = GRASS_OPS.length ? freeShare() : null;
  GRASS_OPS.forEach(({ p, rep }) => {
    const [cx0, cz0] = p.center, rad = p.radius, rules = p.rules || {};
    const stats = emptyRejectStats();
    const rl = Object.assign({ slope: [0, 0.55], waterDist: [0.7, 1e9] }, rules);
    let count = 0;
    const i0 = Math.max(0, Math.floor((cx0 - rad * 1.25 - DETAIL.min) / st)), i1 = Math.min(n - 1, Math.ceil((cx0 + rad * 1.25 - DETAIL.min) / st));
    const j0 = Math.max(0, Math.floor((cz0 - rad * 1.25 - DETAIL.min) / st)), j1 = Math.min(n - 1, Math.ceil((cz0 + rad * 1.25 - DETAIL.min) / st));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = DETAIL.x(i), z = DETAIL.x(j), k = j * n + i;
      const rc0 = Math.hypot(x - cx0, z - cz0); if (rc0 > rad * 1.2 + 1) continue;
      // wobbly patch edge, dense core fading to sparse rim
      const ang = Math.atan2(z - cz0, x - cx0), edge = 0.82 + 0.36 * fbm(Math.cos(ang) * 1.6 + 3, Math.sin(ang) * 1.6 - 2, 3, 5);
      const rc = rc0 / edge;
      if (detailW(x, z) < 1) continue;
      const edgeW = smooth(rad, rad * 0.7, rc) * (1 - smooth(0.1, 0.55, PATH[k]));
      if (edgeW <= 0) continue;
      if (!ruleCheck(x, z, rl, stats)) continue;
      const patch = vnoise(x * 0.07 + 11, z * 0.07 - 4);
      const d = densityScale * p.density * (46 + (12 - 46) * smooth(4, rad, rc)) * (0.72 + 0.56 * patch) * edgeW * free[k];   // blades per m²
      if (d <= 0) continue;
      const tallN = vnoise(x * 0.09 - 3, z * 0.09 + 8);
      const h = (0.24 + tallN * 0.34) * p.height * (0.45 + 0.55 * edgeW);   // metres before per-blade and tuft variation
      tall[k] = dens[k] > 0 ? (tall[k] * dens[k] + h * d) / (dens[k] + d) : h;
      dens[k] += d;
      count += d * st * st;
    }
    total += count;
    const rej = topRejects(stats);
    rep.note = `约 ${(count / 10000).toFixed(1)} 万株` + (rej ? ` · 拒绝（网格点）：${rej}` : '');
    rep.data = { blades: Math.round(count), rejected: stats };
  });
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = DETAIL.x(i), z = DETAIL.x(j);
    field[k * 4] = groundAt(x, z);
    field[k * 4 + 1] = clamp(dens[k] / (FULL * densityScale), 0, 1);
    field[k * 4 + 2] = tall[k];
    field[k * 4 + 3] = OCC[k];
    // coverage for terrain shading, spread one vertex so the ground under patch edges is tinted too
    if (dens[k] > 0) {
      const cv = clamp(dens[k] / (14 * densityScale), 0, 1);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < n && jj < n) COVER[jj * n + ii] = Math.max(COVER[jj * n + ii], cv * (a || b ? 0.85 : 1)); }
    }
  }
  return { total: Math.round(total), field };
}
