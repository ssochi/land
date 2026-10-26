// Per-vertex scalar fields derived from the terrain (water, flow, cover, occlusion, forest) and the
// point queries built on them. Water fields are written by src/water; flow is computed lazily.
import * as THREE from 'three';
import { clamp, smooth } from '../core/math.js';
import { DETAIL, FAR, detailW, heightAt, normalAt } from './grid.js';
import { world } from './state.js';

const ND = DETAIL.n * DETAIL.n, NF = FAR.n * FAR.n;
export const WATER = new Float32Array(ND).fill(-1e9);   // water surface level, -1e9 = dry
export const WDIST = new Float32Array(ND).fill(999);    // metres to nearest water
export const OCC = new Float32Array(ND);                // canopy occlusion, darkens ground and grass
export const COVER = new Float32Array(ND);              // grass coverage, tints terrain under the blades
export const FOREST_D = new Float32Array(ND), FOREST_F = new Float32Array(NF);
export const FLOW_D = new Float32Array(ND), FLOW_F = new Float32Array(NF);

let flowVer = -1;

export function resetFields() {
  WATER.fill(-1e9); WDIST.fill(999); OCC.fill(0); COVER.fill(0); FOREST_D.fill(0); FOREST_F.fill(0);
  flowVer = -1;
}

export function waterLevelAt(x, z) {
  if (!DETAIL.inside(x, z)) return null;
  const n = DETAIL.n, i = Math.round((x - DETAIL.min) / DETAIL.step), j = Math.round((z - DETAIL.min) / DETAIL.step);
  const l = WATER[clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1)];
  return l > -1e8 ? l : null;
}

export function waterDistAt(x, z) { return DETAIL.inside(x, z) ? DETAIL.sample(x, z, WDIST) : 999; }

// multiple-flow-direction accumulation (Freeman 1991): each cell passes its area downhill, split by slope^1.1
export function computeFlow(G, out) {
  const n = G.n, N = n * n, H = G.h, acc = new Float32Array(N).fill(1), order = new Uint32Array(N);
  for (let k = 0; k < N; k++) order[k] = k;
  order.sort((a, b) => H[b] - H[a]);
  const nb = [-1, 1, -n, n, -n - 1, -n + 1, n - 1, n + 1], dd = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2], w = new Float32Array(8);
  for (let t = 0; t < N; t++) {
    const k = order[t], i = k % n, j = (k / n) | 0;
    if (i === 0 || j === 0 || i === n - 1 || j === n - 1) continue;
    const h = H[k]; let sum = 0;
    for (let q = 0; q < 8; q++) { const sl = (h - H[k + nb[q]]) / dd[q]; w[q] = sl > 0 ? Math.pow(sl, 1.1) : 0; sum += w[q]; }
    if (sum <= 0) continue;
    const a = acc[k] / sum;
    for (let q = 0; q < 8; q++) if (w[q] > 0) acc[k + nb[q]] += a * w[q];
  }
  const cell = G.step * G.step;
  for (let k = 0; k < N; k++) out[k] = clamp((Math.log10(acc[k] * cell) - 2.0) / 4.0, 0, 1);
}

export function ensureFlow() { if (flowVer === world.terrainVer) return; computeFlow(FAR, FLOW_F); computeFlow(DETAIL, FLOW_D); flowVer = world.terrainVer; }

export function flowAt(x, z) { ensureFlow(); const w = detailW(x, z), f = FAR.sample(x, z, FLOW_F); return w > 0 ? f * (1 - w) + DETAIL.sample(x, z, FLOW_D) * w : f; }

export function moistureAt(x, z) { const wd = waterDistAt(x, z); return clamp(Math.max(flowAt(x, z), 1 - smooth(0, 30, wd)) * 0.85 + 0.15 * (1 - smooth(20, 200, heightAt(x, z))), 0, 1); }

const SUN_AVG = new THREE.Vector3(-0.35, 0.75, -0.56).normalize();
export function sunAt(x, z) { return clamp(0.5 + (normalAt(x, z).dot(SUN_AVG) - SUN_AVG.y) * 2.2, 0, 1); }
