// Grass blade distribution. m.grass() only records the request; distributeGrass() runs once after the
// script, when water and obstacles are final, and returns per-chunk instance buffers for the renderer.
import { clamp, smooth, mulberry32 } from '../core/math.js';
import { fbm, vnoise } from '../core/noise.js';
import { DETAIL, detailW, heightAt, normalAt } from '../world/grid.js';
import { COVER, OCC } from '../world/fields.js';
import { ruleCheck, obstHit, emptyRejectStats, topRejects } from './placement.js';

export const GRASS_OPS = [];   // [{ p, rep }] queued by m.grass()
export const GRASS_CHUNK = 16; // metres per instanced chunk

export function resetGrass() { GRASS_OPS.length = 0; }

// returns { total, chunks: [{ cx, cz, off, data, nor, occ, minY, maxY }] }; also writes COVER for terrain tinting
export function distributeGrass(densityScale) {
  const CH = GRASS_CHUNK, nC = Math.ceil(DETAIL.size / CH), buckets = new Array(nC * nC);
  const R = mulberry32(77);
  const n = DETAIL.n, st = DETAIL.step;
  let total = 0; COVER.fill(0);
  GRASS_OPS.forEach(({ p, rep }) => {
    const [cx0, cz0] = p.center, rad = p.radius, rules = p.rules || {};
    const stats = emptyRejectStats();
    const rl = Object.assign({ slope: [0, 0.55], waterDist: [0.7, 1e9] }, rules);
    let count = 0;
    for (let cz = Math.floor(cz0 - rad); cz < cz0 + rad; cz++) for (let cx = Math.floor(cx0 - rad); cx < cx0 + rad; cx++) {
      const rc0 = Math.hypot(cx + 0.5 - cx0, cz + 0.5 - cz0); if (rc0 > rad * 1.2 + 1) continue;
      // wobbly patch edge, dense core fading to sparse rim
      const ang = Math.atan2(cz - cz0, cx - cx0), edge = 0.82 + 0.36 * fbm(Math.cos(ang) * 1.6 + 3, Math.sin(ang) * 1.6 - 2, 3, 5);
      const rc = rc0 / edge;
      if (!DETAIL.inside(cx, cz) || detailW(cx, cz) < 1) continue;
      const patch = vnoise(cx * 0.07 + 11, cz * 0.07 - 4);
      const edgeW = smooth(rad, rad * 0.7, rc);
      const d = densityScale * p.density * (46 + (12 - 46) * smooth(4, rad, rc)) * (0.72 + 0.56 * patch) * edgeW;
      // coverage for terrain shading
      const ci = Math.round((cx + 0.5 - DETAIL.min) / st), cj = Math.round((cz + 0.5 - DETAIL.min) / st);
      const covv = clamp(d / (14 * densityScale), 0, 1);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const ii = ci + a, jj = cj + b; if (ii >= 0 && jj >= 0 && ii < n && jj < n) COVER[jj * n + ii] = Math.max(COVER[jj * n + ii], covv); }
      const num = Math.floor(d) + (R() < d % 1 ? 1 : 0);
      for (let k = 0; k < num; k++) {
        const x = cx + R(), z = cz + R();
        if (!ruleCheck(x, z, rl, stats)) continue;
        if (obstHit(x, z, 0)) { stats.spacing++; continue; }
        const ix = clamp(Math.floor((x - DETAIL.min) / CH), 0, nC - 1), iz = clamp(Math.floor((z - DETAIL.min) / CH), 0, nC - 1);
        const B = buckets[iz * nC + ix] || (buckets[iz * nC + ix] = { cx: DETAIL.min + (ix + 0.5) * CH, cz: DETAIL.min + (iz + 0.5) * CH, off: [], data: [], nor: [], occ: [], minY: 1e9, maxY: -1e9 });
        const y = heightAt(x, z) - 0.03, nn = normalAt(x, z), r = Math.hypot(x, z);
        const tall = vnoise(x * 0.09 - 3, z * 0.09 + 8);
        B.off.push(x, y, z);
        B.data.push(R() * 6.283, (0.32 + tall * 0.42 + R() * 0.2) * (1 + r * 0.003) * (0.45 + 0.55 * edgeW), 0.027 * (1 + rc * 0.03) * (0.8 + R() * 0.4), R());  // angle, height, width, random
        B.nor.push(nn.x, nn.y, nn.z);
        B.occ.push(DETAIL.sample(x, z, OCC));
        if (y < B.minY) B.minY = y; if (y > B.maxY) B.maxY = y;
        count++;
      }
    }
    total += count;
    const rej = topRejects(stats);
    rep.note = `${(count / 10000).toFixed(1)} 万株` + (rej ? ` · 拒绝：${rej}` : '');
    rep.data = { blades: count, rejected: stats };
  });
  return { total, chunks: buckets.filter(B => B && B.off.length) };
}
