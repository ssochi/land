// Two nested height grids: DETAIL covers the walkable ±160m at 0.8m, FAR the whole ±1100m world at 3.7m.
// Every height query blends them across a BLEND-wide seam at the DETAIL border.
import * as THREE from 'three';
import { clamp, smooth } from '../core/math.js';

export class Grid {
  constructor(min, size, n) {
    this.min = min; this.size = size; this.n = n; this.step = size / (n - 1);
    this.h = new Float32Array(n * n); this.wear = new Float32Array(n * n);
  }
  x(i) { return this.min + i * this.step; }
  sample(x, z, arr) {
    arr = arr || this.h; const n = this.n;
    let fx = (x - this.min) / this.step, fz = (z - this.min) / this.step;
    fx = clamp(fx, 0, n - 1.0001); fz = clamp(fz, 0, n - 1.0001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * n + i;
    const a = arr[k], b = arr[k + 1], c = arr[k + n], d = arr[k + n + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  inside(x, z) { return x >= this.min && z >= this.min && x <= this.min + this.size && z <= this.min + this.size; }
}

export const DETAIL = new Grid(-160, 320, 401);
export const FAR = new Grid(-1100, 2200, 601);
export const GRIDS = [DETAIL, FAR];
const BLEND = 14;

export function resetGrids() { for (const G of GRIDS) { G.h.fill(0); G.wear.fill(0); } }

// weight of the DETAIL grid at (x, z): 1 inside, fading to 0 across the seam
export function detailW(x, z) {
  const d = Math.min(x - DETAIL.min, DETAIL.min + DETAIL.size - x, z - DETAIL.min, DETAIL.min + DETAIL.size - z);
  return smooth(0, BLEND, d);
}

export function heightAt(x, z) {
  const w = detailW(x, z);
  if (w <= 0) return FAR.sample(x, z);
  const d = DETAIL.sample(x, z);
  return w >= 1 ? d : FAR.sample(x, z) * (1 - w) + d * w;
}

const _nv = new THREE.Vector3();
// returns a shared vector unless `out` is given
export function normalAt(x, z, out) {
  const e = DETAIL.inside(x, z) ? 0.8 : 5;
  const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
  return (out || _nv).set(-dx, 2 * e, -dz).normalize();
}

export const slopeAt = (x, z) => 1 - normalAt(x, z).y;

// add a gaussian bump of strength k and radius r into a per-vertex field of G, capped at `cap`
export function stampGrid(G, arr, x, z, r, k, cap) {
  const n = G.n, st = G.step, R2 = r * 1.4;
  const i0 = clamp(Math.floor((x - R2 - G.min) / st), 0, n - 1), i1 = clamp(Math.ceil((x + R2 - G.min) / st), 0, n - 1);
  const j0 = clamp(Math.floor((z - R2 - G.min) / st), 0, n - 1), j1 = clamp(Math.ceil((z + R2 - G.min) / st), 0, n - 1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d = Math.hypot(G.x(i) - x, G.x(j) - z) / r;
    const kk = j * n + i; arr[kk] = Math.min(cap, arr[kk] + k * Math.exp(-d * d * 1.6));
  }
}
