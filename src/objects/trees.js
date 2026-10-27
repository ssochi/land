// Trees and bushes. Broadleaf trees are a crown of leaf lobes over a skeleton grown into them by space
// colonization (crown.js); pines are stacked needle skirts. Every maker is deterministic in `seed`. lod 0 is the
// full model seen up close; higher levels drop twigs and leaf cards and finally become one shaded ball per lobe.
import * as THREE from 'three';
import { clamp, smooth, mulberry32 } from '../core/math.js';
import { vnoise } from '../core/noise.js';
import { MB, V3, addTube, addBlob, addCards, canopyColor } from './mesh-builder.js';
import { crownLobes, buildBroadleaf } from './crown.js';

// palettes (dark, mid, light) of the leaf colour; the dark end stays a saturated mid green, because the
// lighting already darkens a crown's underside and inside
const OAK = ['#4a7a32', '#76a83d', '#b3d25a'], BIRCH = ['#55853a', '#93bf4e', '#cfe07a'];
const palette = (cols, hue) => { const [dark, mid, light] = cols.map(c => new THREE.Color(c).multiplyScalar(hue)); return { dark, mid, light }; };

// big trees spread into a wide umbrella on a short, thick trunk (the lone oaks of Hyrule field) instead of a
// scaled-up ball; both kinds are a crown of lobes over a mossy, sinuous trunk (crown.js)
export function makeOak(seed, big, lod = 0) {
  const R = mulberry32(seed);
  const trunkH = big ? 3.2 + R() * 0.8 : 2.4 + R() * 0.8;
  const rx = big ? 7.4 + R() * 1.2 : 4.4 + R() * 0.7, ry = big ? 4.3 + R() * 0.6 : 3.4 + R() * 0.5, rmax = big ? 3.0 : 2.1;
  const C = V3((R() - 0.5) * 0.8, trunkH + ry * (big ? 0.95 : 1.0), (R() - 0.5) * 0.8), top = C.y + ry;
  const lobes = crownLobes(R, C, rx - rmax * 0.7, ry - rmax * 0.6, big ? 18 + Math.floor(R() * 5) : 11 + Math.floor(R() * 4), rmax * 0.55, rmax);
  const sway = P => Math.pow(clamp(P.y / top, 0, 1), 1.7) * 0.5 + 0.03 * Math.hypot(P.x, P.z) / rx;
  const bark = new THREE.Color('#968670'), barkD = new THREE.Color('#6a5a47'), moss = new THREE.Color('#8f9a5a');
  const barkFn = (t, a, P) => new THREE.Color().copy(barkD).lerp(bark, 0.35 + 0.65 * vnoise(a * 2 + seed, P.y * 1.5))
    .lerp(moss, smooth(0.45, 0.8, vnoise(a * 1.3 + seed * 0.7, P.y * 0.35)) * 0.65);   // moss in long streaks up the bark
  return buildBroadleaf(R, { trunkH, lean: V3((R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3), wobble: big ? 0.55 : 0.35, limbs: big ? 4 + Math.floor(R() * 2) : 3 + Math.floor(R() * 2), C, rx, ry, lobes, sq: 0.8,
    seg: big ? 0.5 : 0.4, baseR: big ? 0.75 : 0.45, tipR: 0.02, jitter: 0.3, tropism: 0.05, twigs: 40, leafSize: big ? 1.85 : 1.4, density: big ? 1.85 : 2.8,
    palette: palette(OAK, 0.94 + R() * 0.12), bark: barkFn, barkMinR: [0.03, 0.08, 0.15].map(v => v * (big ? 1.4 : 1)), sway, seed }, lod);
}

// birch: a tall, narrow crown of a few lobes stacked up a white trunk that runs through it
export function makeBirch(seed, lod = 0) {
  const R = mulberry32(seed);
  const H = 8 + R() * 2.2, trunkH = H * 0.4, rx = 1.9 + R() * 0.5, ry = H * 0.34, rmax = 1.3;
  const C = V3(0, trunkH + ry * 1.0, 0), top = C.y + ry;
  const lobes = crownLobes(R, C, rx - rmax * 0.6, ry - rmax * 0.6, 6 + Math.floor(R() * 3), 0.8, rmax);
  const sway = P => Math.pow(clamp(P.y / top, 0, 1), 1.4) * 0.75;
  const white = new THREE.Color('#ebe7da'), barkDark = new THREE.Color('#38332d');
  const barkFn = (t, a, P) => (vnoise(a * 1.6 + seed, P.y * 5.5) > 0.72 ? barkDark.clone() : white.clone().multiplyScalar(0.9 + vnoise(P.y * 2, a) * 0.1));
  return buildBroadleaf(R, { trunkH, lean: V3((R() - 0.5) * 0.6, 0, (R() - 0.5) * 0.6), wobble: 0.15, C, rx, ry, lobes, sq: 1.1,
    seg: 0.33, baseR: 0.21, tipR: 0.02, jitter: 0.25, tropism: -0.03, twigs: 30, leafSize: 0.95, density: 3.2,
    palette: palette(BIRCH, 0.95 + R() * 0.1), bark: barkFn, barkMinR: [0.011, 0.03, 0.07], sway, seed }, lod);
}

// lod 0: full tiers with needle cards; 1: fewer tiers, no cards; 2: a handful of coarse tiers for the far forest
export function makePine(seed, lod = 0) {
  const lo = lod > 0, far = lod > 1;
  const R = mulberry32(seed), mb = new MB();
  const H = 9 + R() * 5;
  const sway = P => Math.pow(Math.max(P.y, 0) / H, 2) * 0.4;
  const bark = new THREE.Color('#5d4433');
  addTube(mb, lo ? [V3(0, -0.3, 0), V3(0, H * 0.6, 0)] : [V3(0, -0.4, 0), V3(0, H * 0.35, 0), V3(0, H * 0.7, 0), V3(0, H * 0.97, 0)], lo ? [0.42, 0.16] : [0.4, 0.27, 0.16, 0.03], far ? 3 : lo ? 4 : 7, (t, a, P) => bark.clone().multiplyScalar(0.85 + 0.3 * vnoise(a * 2, P.y * 2)), sway);
  const tiers = far ? 5 : lo ? 7 : 10 + Math.floor(R() * 3), spikes = far ? 6 : lo ? 7 : 11;
  const dkA = new THREE.Color('#2a4628'), dkB = new THREE.Color('#47703c'), tip = new THREE.Color('#93b25a'), under = new THREE.Color('#36563a');   // BotW conifers lean yellow-green
  for (let t = 0; t < tiers; t++) {
    const u = t / (tiers - 1), y0 = H * (0.3 + 0.7 * u) + 0.4;
    // the LOD has few tiers, so its skirts hang lower and overlap: otherwise distant pines read as floating discs
    const Rr = Math.pow(1 - u, 0.95) * (2.3 + R() * 0.5) + 0.28, drop = Math.max(0.7 + Rr * 0.42, lo ? Math.min(H * 0.7 / (tiers - 1) * 1.4, 0.55 + Rr * 1.2) : 0);
    const rot = R() * 6.283, topC = new THREE.Color().copy(dkA).lerp(dkB, 0.3 + 0.7 * u);
    const off = V3((R() - 0.5) * Rr * 0.12, 0, (R() - 0.5) * Rr * 0.12);
    const T = mb.v(off.x, y0, off.z, 0, 1, 0, topC, sway(V3(0, y0, 0)));
    const U2 = mb.v(off.x, y0 - drop * 0.55, off.z, 0, 0.15, 0, under, sway(V3(0, y0 - drop * 0.55, 0)));   // short normal: the tips' outward normals dominate the blend
    const tipsU = [], notchU = [], tipsD = [], notchD = [];
    for (let sI = 0; sI < spikes; sI++) {
      const a = rot + sI / spikes * Math.PI * 2 + (R() - 0.5) * 0.25, a2 = a + Math.PI / spikes;
      const rr = Rr * (0.75 + R() * 0.45), dy = drop * (0.75 + R() * 0.5);
      const tx = off.x + Math.cos(a) * rr, tz = off.z + Math.sin(a) * rr, nx = off.x + Math.cos(a2) * rr * 0.62, nz = off.z + Math.sin(a2) * rr * 0.62;
      const tn = V3(Math.cos(a) * 0.6, 0.8, Math.sin(a) * 0.6).normalize(), nn = V3(Math.cos(a2) * 0.45, 0.89, Math.sin(a2) * 0.45).normalize();
      const tc = topC.clone().lerp(tip, 0.55 + R() * 0.3);
      tipsU.push(mb.v(tx, y0 - dy, tz, tn.x, tn.y, tn.z, tc, sway(V3(tx, y0, tz)) + 0.05));
      notchU.push(mb.v(nx, y0 - dy * 0.68, nz, nn.x, nn.y, nn.z, topC, sway(V3(nx, y0, nz))));
      tipsD.push(mb.v(tx, y0 - dy, tz, tn.x, 0.1, tn.z, under, sway(V3(tx, y0, tz)) + 0.05));   // undersides take the cone's outward normal, not a downward one: shaded by the skirt above, they still get the sky's ambient instead of going black
      notchD.push(mb.v(nx, y0 - dy * 0.68, nz, nn.x, 0.1, nn.z, under, sway(V3(nx, y0, nz))));
    }
    for (let sI = 0; sI < spikes; sI++) {
      const s2 = (sI + 1) % spikes;
      mb.tri(T, notchU[sI], tipsU[sI]); mb.tri(T, tipsU[s2], notchU[sI]);
      mb.tri(U2, tipsD[sI], notchD[sI]); mb.tri(U2, notchD[sI], tipsD[s2]);
    }
    if (!lo) {
      // needle cards lying on the skirt and sticking out past its rim
      const n = spikes * 3;
      for (let c = 0; c < n; c++) {
        const a = R() * 6.283, rad = Rr * (0.3 + 0.82 * Math.sqrt(R()));
        const P = V3(off.x + Math.cos(a) * rad, y0 - drop * (rad / Rr) * 0.8 + 0.14, off.z + Math.sin(a) * rad);
        const out = V3(Math.cos(a), -0.2 - R() * 0.3, Math.sin(a)).normalize();
        const nrm = V3(Math.cos(a) * 0.5 + (R() - 0.5) * 0.4, 0.85, Math.sin(a) * 0.5 + (R() - 0.5) * 0.4).normalize();
        const ax = nrm.clone().cross(out).normalize();
        const sz = Rr * (0.42 + R() * 0.2), base = P.clone().addScaledVector(out, -sz * 0.45);
        const k = clamp(rad / Rr, 0, 1), col = new THREE.Color().copy(topC).lerp(tip, 0.15 + 0.5 * k).multiplyScalar(0.85 + R() * 0.2);
        const ids = [[-1, 0, 0, 0], [1, 0, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]].map(([x, y, u, w]) => {
          const Q = base.clone().addScaledVector(ax, x * sz * 0.6).addScaledVector(out, y * sz * 1.2);
          return mb.v(Q.x, Q.y, Q.z, nrm.x, nrm.y, nrm.z, col, sway(Q) + 0.04 * y, 0.5 + u * 0.5, w, 1);   // needle half of the atlas
        });
        mb.tri(ids[0], ids[1], ids[2]); mb.tri(ids[0], ids[2], ids[3]);
      }
    }
  }
  return mb.geo();
}

export function makeBush(seed, lod = 0) {
  const R = mulberry32(seed), mb = new MB();
  const sway = P => Math.pow(Math.max(P.y, 0) / 1.8, 1.5) * 0.25;
  const Cc = V3(0, 0.6, 0), colorFn = canopyColor(Cc, 0.8, new THREE.Color('#2f5f2c'), new THREE.Color('#5f9636'), new THREE.Color('#a4c650'));
  const nb = 5 + Math.floor(R() * 3);
  for (let b = 0; b < nb; b++) {
    const a = R() * 6.283, rr = R() * 0.8, P0 = V3(Math.cos(a) * rr, 0.35 + R() * 0.55, Math.sin(a) * rr), br = 0.5 + R() * 0.35;
    addBlob(mb, P0, br * 0.75, 1, { ncenter: Cc, nblend: 0.7, lump: 0.3, seed: seed + b, squash: 0.85, sway, color: (P) => colorFn(P, P.clone().sub(Cc).normalize()).multiplyScalar(0.82) });
    if (!lod) addCards(mb, P0, br * 1.25, 9, { ncenter: Cc, nblend: 0.75, seed: seed + b, squash: 0.85, size: 0.9, sway, color: colorFn });
    else addBlob(mb, P0, br * 1.05, 1, { ncenter: Cc, nblend: 0.75, lump: 0.3, seed: seed + b + 50, squash: 0.85, sway, color: (P) => colorFn(P, P.clone().sub(Cc).normalize()) });
  }
  return mb.geo();
}
